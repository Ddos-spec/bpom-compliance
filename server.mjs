/**
 * Tera Public Paid Intake — independent public gateway.
 * No government dashboard, synthetic BPOM registry or public collection endpoint.
 * Runtime: Node 22.5+ (node:sqlite). Persistent volume required in production.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { runRules } from './public/rules.js';

const root = path.dirname(fileURLToPath(import.meta.url));
try {
  for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch { /* optional .env */ }

const PORT = Number(process.env.PORT || 4173);
const fee = Number(process.env.SERVICE_FEE_IDR || 25000);
const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
const live = process.env.MIDTRANS_IS_PRODUCTION === 'true';
const midtransEndpoint = (process.env.NODE_ENV === 'test' && process.env.MIDTRANS_SNAP_URL)
  ? process.env.MIDTRANS_SNAP_URL
  : (live ? 'https://app.midtrans.com/snap/v1/transactions' : 'https://app.sandbox.midtrans.com/snap/v1/transactions');
const statusEndpoint = (process.env.NODE_ENV === 'test' && process.env.MIDTRANS_STATUS_URL)
  ? process.env.MIDTRANS_STATUS_URL
  : (live ? 'https://api.midtrans.com/v2/' : 'https://api.sandbox.midtrans.com/v2/');
const adminKey = process.env.TERA_ADMIN_KEY || '';
const statusCooldown = new Map();
const paymentReady = Boolean(serverKey && Number.isSafeInteger(fee) && fee >= 1000);
const pub = path.join(root, 'public');
const dataDir = process.env.TERA_DATA_DIR ? path.resolve(process.env.TERA_DATA_DIR) : path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(path.join(dataDir, 'tera_public.db'));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS applications (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, company TEXT NOT NULL,
 contact TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
 product TEXT NOT NULL, category TEXT NOT NULL, label_text TEXT NOT NULL,
 nie TEXT NOT NULL DEFAULT '', consent INTEGER NOT NULL, amount INTEGER NOT NULL,
 payment_status TEXT NOT NULL DEFAULT 'pending',
 review_status TEXT NOT NULL DEFAULT 'awaiting_payment',
 snap_url TEXT NOT NULL DEFAULT '', report_json TEXT,
 staff_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tera_created ON applications(created_at);`);

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const rate = new Map();
const now = () => new Date().toISOString();
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const json = (res, code, data) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
};
const fail = (res, code, error) => json(res, code, { ok: false, error });
const LIMIT = 40_000;
function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (x) => {
      n += x.length;
      if (n > LIMIT) { reject(Object.assign(new Error('Isi formulir terlalu besar.'), { status: 413 })); req.destroy(); }
      else chunks.push(x);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('JSON tidak valid.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
function text(x, max) { return typeof x === 'string' ? x.trim().slice(0, max) : ''; }
function validInput(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return [null, 'Format pengajuan tidak valid.'];
  const v = {
    company: text(b.company, 120), contact: text(b.contact, 120), email: text(b.email, 200).toLowerCase(),
    phone: text(b.phone, 30), product: text(b.product, 140), category: text(b.category, 90),
    label_text: text(b.labelText, 16000), nie: text(b.nie, 45), consent: b.consent === true
  };
  if ([v.company, v.contact, v.product, v.category].some(s => s.length < 2)) return [null, 'Isi identitas usaha, kontak, kategori dan nama produk.'];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) || !/^[+0-9\s()\-]{8,30}$/.test(v.phone)) return [null, 'Email atau nomor telepon tidak valid.'];
  if (v.label_text.length < 30) return [null, 'Salin teks label minimal 30 karakter agar bisa dievaluasi.'];
  if (!v.consent) return [null, 'Persetujuan pemrosesan data diperlukan.'];
  return [v, null];
}
function applyRate(req, res, scope, limit) {
  const ip = req.socket.remoteAddress || 'unknown';
  const key = `${scope}:${ip}`;
  const t = Date.now();
  const r = rate.get(key);
  if (!r || t - r.start > 60_000) rate.set(key, { start: t, count: 1 });
  else if (++r.count > limit) { fail(res, 429, 'Terlalu banyak permintaan. Coba beberapa saat lagi.'); return false; }
  if (rate.size > 5000) for (const [k, v] of rate) if (t - v.start > 60_000) rate.delete(k);
  return true;
}
function allowedOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true; // non-browser clients and Midtrans webhook have no Origin
  try { const u = new URL(o); return u.host === req.headers.host && (u.protocol === 'http:' || u.protocol === 'https:'); }
  catch { return false; }
}
function customerView(row) {
  const paid = row.payment_status === 'paid';
  return {
    ok: true, id: row.id, company: row.company, product: row.product, amount: row.amount,
    paymentStatus: row.payment_status, reviewStatus: paid ? row.review_status : 'awaiting_payment',
    checkoutUrl: row.payment_status === 'pending' ? row.snap_url : '',
    createdAt: row.created_at, note: paid ? row.staff_note : '',
    report: paid && row.report_json ? JSON.parse(row.report_json) : null
  };
}
function reportFor(row) {
  const raw = runRules(row.label_text, { name: row.product, owner: row.company, nie: row.nie });
  // Regulator approval is NEVER inferred from this heuristic checklist.
  // No official Berita Acara or enforcement recommendation is retained.
  const checks = raw.items.map(it => ({
    id: it.id, label: it.label,
    status: it.id === 'nie' && !row.nie ? 'info' : (it.id === 'halal' && it.status !== 'ok' ? 'conditional' : (it.id === 'nama' && !row.label_text.toLowerCase().includes(row.product.toLowerCase()) ? 'review' : (it.id === 'nie' && row.nie && !row.label_text.toLowerCase().replace(/\s/g, '').includes(row.nie.toLowerCase().replace(/\s/g, '')) ? 'review' : (it.status === 'ok' ? 'detected' : it.status === 'na' ? 'conditional' : 'review')))),
    note: it.id === 'nie' && !row.nie
      ? 'Untuk pengajuan izin edar baru, nomor MD/ML memang belum tersedia. Ikuti jalur registrasi resmi sesuai kategori.'
      : it.id === 'halal' && it.status !== 'ok'
        ? 'Kewajiban label halal dapat bergantung jenis produk dan penahapan ketentuan. Konfirmasi persyaratan yang berlaku.'
      : it.id === 'nama' && !row.label_text.toLowerCase().includes(row.product.toLowerCase())
        ? 'Nama produk yang kamu isi belum terdeteksi secara persis pada teks label.'
      : it.id === 'nie' && row.nie && !row.label_text.toLowerCase().replace(/\s/g, '').includes(row.nie.toLowerCase().replace(/\s/g, ''))
        ? 'Nomor MD/ML yang diisi belum terlihat pada teks label. Validitasnya belum diperiksa di basis data resmi.'
      : (it.status === 'ok' ? 'Indikasi keterangan ditemukan pada teks, bukan validasi legal.' : (it.note || 'Periksa kecocokan dengan ketentuan yang berlaku.'))
  }));
  return {
    kind: 'preliminary_label_readiness', title: 'Pemeriksaan awal kesiapan label',
    disclaimer: 'Hasil otomatis berbasis teks dan aturan heuristik; bukan penetapan kepatuhan, sertifikat, rekomendasi pemerintah atau izin edar BPOM.',
    regulation: 'PerBPOM 31/2018 jo. 20/2021 jo. 6/2024. Periksa juga aturan lain yang berlaku sesuai produk.',
    checks, claims: raw.claims.map(c => ({ claim: c.teks, issue: 'Klaim perlu pembuktian atau kajian lebih lanjut.' })),
    nextSteps: ['Perbaiki dan cek kembali seluruh keterangan yang ditandai.', 'Pastikan kategori dan jalur registrasi pangan olahan yang berlaku.', 'Daftarkan secara mandiri melalui sistem resmi BPOM jika persyaratan terpenuhi.'],
    generatedAt: now()
  };
}
function markPaid(row) {
  if (row.payment_status === 'paid') return;
  const report = reportFor(row);
  db.prepare("UPDATE applications SET payment_status='paid', review_status='report_ready', report_json=?, updated_at=? WHERE id=?")
    .run(JSON.stringify(report), now(), row.id);
}
function isStaff(req) {
  if (!adminKey || adminKey.length < 24) return false;
  const v = req.headers.authorization || '';
  const supplied = v.startsWith('Bearer ') ? v.slice(7) : '';
  const a = Buffer.from(supplied), b = Buffer.from(adminKey);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function midtransSignature(data) {
  return crypto.createHash('sha512').update(String(data.order_id) + String(data.status_code) + String(data.gross_amount) + serverKey).digest('hex');
}
function sameSignature(received, expected) {
  if (!/^[a-f0-9]{128}$/i.test(received || '')) return false;
  const a = Buffer.from(received.toLowerCase(), 'hex');
  const b = Buffer.from(expected.toLowerCase(), 'hex');
  return crypto.timingSafeEqual(a, b);
}
function paymentChange(row, body) {
  if (!body || String(body.order_id) !== row.id || !/^\d+(?:\.\d{1,2})?$/.test(String(body.gross_amount ?? '')) || Number(body.gross_amount) !== row.amount || (body.currency && body.currency !== 'IDR')) return false;
  // A refund/chargeback is terminal for this pilot. A delayed or replayed old
  // settlement notification must never unlock the report after a refund.
  if (row.payment_status === 'refunded' && !['refund', 'partial_refund', 'chargeback'].includes(body.transaction_status)) return true;
  if (body.transaction_status === 'settlement' || (body.transaction_status === 'capture' && body.fraud_status === 'accept')) {
    if (String(body.status_code) !== '200') return false;
    markPaid(row);
  } else if (['refund', 'partial_refund', 'chargeback'].includes(body.transaction_status)) {
    db.prepare("UPDATE applications SET payment_status='refunded', review_status='on_hold', updated_at=? WHERE id=?").run(now(), row.id);
  } else if (row.payment_status !== 'paid' && ['deny', 'expire', 'cancel', 'failure'].includes(body.transaction_status)) {
    db.prepare("UPDATE applications SET payment_status='failed', updated_at=? WHERE id=?").run(now(), row.id);
  }
  return true;
}

// Authoritative status re-check: recovers from delayed/lost Midtrans webhooks.
// Only the backend calls the payment provider, and no provider credentials reach JS.
async function reconcilePayment(row) {
  if (!serverKey || (process.env.NODE_ENV === 'test' && !process.env.MIDTRANS_STATUS_URL) || !['pending', 'failed'].includes(row.payment_status)) return row;
  const time = Date.now();
  if (time - (statusCooldown.get(row.id) || 0) < 15000) return row;
  statusCooldown.set(row.id, time);
  if (statusCooldown.size > 2000) statusCooldown.clear();
  try {
    const auth = Buffer.from(serverKey + ':').toString('base64');
    const resp = await fetch(`${statusEndpoint}${encodeURIComponent(row.id)}/status`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(4500)
    });
    if (!resp.ok) return row; // 404 can mean Snap transaction not finalized yet.
    const payload = await resp.json();
    if (String(payload.status_code) === '200' && paymentChange(row, payload)) {
      return db.prepare('SELECT * FROM applications WHERE id=?').get(row.id) || row;
    }
  } catch (e) {
    console.warn('Midtrans status check unavailable:', String(e?.message || e));
  }
  return row;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const route = url.pathname;
    if (route.startsWith('/api/') && req.method === 'OPTIONS') return fail(res, 405, 'Tidak diizinkan.');
    if (route.startsWith('/api/') && !allowedOrigin(req)) return fail(res, 403, 'Origin tidak sesuai.');

    if (req.method === 'GET' && route === '/api/public/config') return json(res, 200, {
      ok: true, price: fee, currency: 'IDR', paymentEnabled: paymentReady,
      provider: 'Midtrans Snap', sandbox: !live,
      scope: 'Pemeriksaan awal label pangan olahan, bukan pembayaran resmi BPOM.'
    });

    if (req.method === 'POST' && route === '/api/public/applications') {
      if (!applyRate(req, res, 'apply', 8)) return;
      if (!paymentReady) return fail(res, 503, 'Pembayaran belum dikonfigurasi. Pengajuan berbayar belum dibuka.');
      const b = await readBody(req);
      const [v, err] = validInput(b);
      if (err) return fail(res, 422, err);
      const id = `TR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
      const token = crypto.randomBytes(32).toString('base64url');
      const created = now();
      db.prepare(`INSERT INTO applications (id,token_hash,company,contact,email,phone,product,category,label_text,nie,consent,amount,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, sha(token), v.company, v.contact, v.email, v.phone, v.product, v.category, v.label_text, v.nie, 1, fee, created, created);

      // Amount is always generated on the server. No fake/manual 'mark as paid'.
      const basic = Buffer.from(serverKey + ':').toString('base64');
      let checkoutUrl = '';
      try {
        const reply = await fetch(midtransEndpoint, {
          method: 'POST', signal: AbortSignal.timeout(12000),
          headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            transaction_details: { order_id: id, gross_amount: fee },
            customer_details: { first_name: v.contact, email: v.email, phone: v.phone },
            item_details: [{ id: 'TERA-LABEL-REVIEW', price: fee, quantity: 1, name: 'Pemeriksaan Awal Label Pangan' }],
            callbacks: {}
          })
        });
        if (!reply.ok) throw new Error(`Midtrans status ${reply.status}`);
        const obj = await reply.json();
        if (!obj.redirect_url || !/^https:\/\/(app\.)?(sandbox\.)?midtrans\.com\//.test(obj.redirect_url) && process.env.NODE_ENV !== 'test') {
          throw new Error('URL checkout tidak valid');
        }
        checkoutUrl = obj.redirect_url;
        db.prepare('UPDATE applications SET snap_url=?, updated_at=? WHERE id=?').run(checkoutUrl, now(), id);
      } catch (e) {
        console.error('Checkout creation failed', id, String(e));
        // Never accumulate inaccessible unpaid applications when gateway creation fails.
        db.prepare("DELETE FROM applications WHERE id=? AND payment_status='pending' AND snap_url=''").run(id);
        return fail(res, 502, 'Gateway pembayaran belum merespons. Pengajuan belum dibuat, silakan coba lagi.');
      }
      return json(res, 201, { ok: true, id, accessToken: token, checkoutUrl, amount: fee, paymentStatus: 'pending' });
    }

    const status = route.match(/^\/api\/public\/applications\/(TR-[A-Z0-9-]+)$/);
    if (req.method === 'GET' && status) {
      if (!applyRate(req, res, 'track', 60)) return;
      const token = (req.headers.authorization || '').replace(/^Bearer /, '');
      if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return fail(res, 401, 'Token pelacakan tidak valid.');
      const row = db.prepare('SELECT * FROM applications WHERE id=?').get(status[1]);
      if (!row || !crypto.timingSafeEqual(Buffer.from(row.token_hash, 'hex'), Buffer.from(sha(token), 'hex'))) return fail(res, 404, 'Pengajuan tidak ditemukan.');
      return json(res, 200, customerView(await reconcilePayment(row)));
    }

    if (req.method === 'POST' && route === '/api/payments/midtrans/notification') {
      if (!serverKey) return fail(res, 503, 'Pembayaran belum aktif.');
      const b = await readBody(req);
      const row = db.prepare('SELECT * FROM applications WHERE id=?').get(String(b.order_id || ''));
      if (!row || !sameSignature(b.signature_key, midtransSignature(b))) return fail(res, 403, 'Signature tidak valid.');
      if (!paymentChange(row, b)) return fail(res, 422, 'Detail transaksi tidak cocok.');
      return json(res, 200, { ok: true });
    }

    if (route.startsWith('/api/staff/')) {
      if (!applyRate(req, res, 'staff', 40)) return;
      if (!isStaff(req)) return fail(res, 401, 'Akses petugas tidak valid.');
      if (req.method === 'GET' && route === '/api/staff/applications') {
        const rows = db.prepare('SELECT id, company, contact, email, phone, product, category, amount, payment_status, review_status, created_at FROM applications ORDER BY created_at DESC LIMIT 100').all();
        return json(res, 200, { ok: true, data: rows });
      }
      const m = route.match(/^\/api\/staff\/applications\/(TR-[A-Z0-9-]+)$/);
      if (m && req.method === 'GET') {
        const r = db.prepare('SELECT * FROM applications WHERE id=?').get(m[1]);
        if (!r) return fail(res, 404, 'Tidak ditemukan.');
        const { token_hash, snap_url, ...rest } = r;
        return json(res, 200, { ok: true, data: rest });
      }
      if (m && req.method === 'PATCH') {
        const b = await readBody(req);
        const row = db.prepare('SELECT payment_status FROM applications WHERE id=?').get(m[1]);
        if (!row) return fail(res, 404, 'Tidak ditemukan.');
        if (row.payment_status !== 'paid') return fail(res, 409, 'Tidak boleh memproses sebelum pembayaran terverifikasi.');
        const allowed = ['report_ready', 'in_review', 'revision_requested', 'completed'];
        if (!allowed.includes(b.reviewStatus)) return fail(res, 422, 'Status tindak lanjut tidak valid.');
        db.prepare('UPDATE applications SET review_status=?, staff_note=?, updated_at=? WHERE id=?')
          .run(b.reviewStatus, text(b.note, 1600), now(), m[1]);
        return json(res, 200, { ok: true });
      }
      return fail(res, 404, 'Endpoint tidak ditemukan.');
    }

    if (route.startsWith('/api/')) return fail(res, 404, 'Endpoint tidak ditemukan.');
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Metode tidak didukung.');
    let pathname;
    try { pathname = decodeURIComponent(route); } catch { return fail(res, 400, 'Path tidak valid.'); }
    if (pathname === '/') pathname = '/index.html';
    // Restrict public assets: old role-based dashboard JS and its demo users
    // still exist in repository but must NOT be exposed by the public server.
    const publicAssets = new Set(['/index.html', '/public.css', '/public.js', '/favicon.svg']);
    if (!publicAssets.has(pathname)) return fail(res, 404, 'Tidak ditemukan.');
    const resolved = path.resolve(pub, '.' + pathname);
    if (!resolved.startsWith(pub + path.sep)) return fail(res, 403, 'Dilarang.');
    const type = MIME[path.extname(resolved)];
    fs.readFile(resolved, (err, buf) => {
      if (err) return fail(res, 404, 'Tidak ditemukan.');
      res.writeHead(200, {
        'Content-Type': type, 'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'", 
        'Cache-Control': type.includes('html') ? 'no-store' : 'public, max-age=3600'
      });
      if (req.method === 'HEAD') res.end(); else res.end(buf);
    });
  } catch (e) {
    console.error('Server error:', e.message);
    if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'Terjadi gangguan layanan.');
  }
});
server.listen(PORT, () => console.log(`Tera public listening on :${PORT} | payments: ${paymentReady ? (live ? 'LIVE' : 'SANDBOX') : 'DISABLED'}`));
