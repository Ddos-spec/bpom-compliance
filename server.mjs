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
const resendKey = process.env.RESEND_API_KEY || '';
const emailFrom = process.env.TERA_EMAIL_FROM || '';
const publicUrl = (process.env.TERA_PUBLIC_URL || '').replace(/\/$/, '');
const recoveryReady = Boolean(resendKey && emailFrom && /^https:\/\//i.test(publicUrl));
const resendEndpoint = (process.env.NODE_ENV === 'test' && process.env.TERA_TEST_RESEND_URL) ? process.env.TERA_TEST_RESEND_URL : 'https://api.resend.com/emails';
const defaultDataDir = process.env.VERCEL ? '/tmp/data' : path.join(root, 'data');
const dataDir = process.env.TERA_DATA_DIR ? path.resolve(process.env.TERA_DATA_DIR) : defaultDataDir;
// Vercel serverless demo mode notice
if (process.env.VERCEL && process.env.NODE_ENV !== 'test') { console.warn('Tera running in Vercel preview mode with /tmp ephemeral storage.'); }
const uploadDir = path.join(dataDir, 'private_images');
fs.mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const statusCooldown = new Map();
const paymentReady = Boolean(serverKey && Number.isSafeInteger(fee) && fee >= 1000);
const pub = path.join(root, 'public');
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
CREATE INDEX IF NOT EXISTS idx_tera_created ON applications(created_at);
CREATE TABLE IF NOT EXISTS recovery_requests (
 token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_recovery_email ON recovery_requests(email);
CREATE TABLE IF NOT EXISTS account_login_links (
 token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_account_login_email ON account_login_links(email);
CREATE TABLE IF NOT EXISTS account_sessions (
 token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_account_session_email ON account_sessions(email);
CREATE INDEX IF NOT EXISTS idx_app_email ON applications(email,created_at);`);
const columns = db.prepare('PRAGMA table_info(applications)').all().map(c => c.name);
if (!columns.includes('image_file')) db.exec("ALTER TABLE applications ADD COLUMN image_file TEXT NOT NULL DEFAULT ''");

// Seed dummy applications for demo account
try {
  const demoCount = db.prepare("SELECT COUNT(*) AS c FROM applications WHERE email = 'demo@tera.id'").get();
  if (!demoCount || demoCount.c === 0) {
    const demoItems = [
      {
        id: 'TR-DEMO-KPS-01',
        company: 'PT Camilan Gurih Nusantara',
        contact: 'Budi Santoso',
        email: 'demo@tera.id',
        phone: '081234567890',
        product: 'Keripik Singkong Balado Mandiri',
        category: 'Makanan ringan',
        labelText: 'Keripik Singkong Balado Mandiri. Komposisi: Singkong pilihan, cabai merah, gula, garam, minyak kelapa sawit. Berat bersih: 200g. Diproduksi oleh: PT Camilan Gurih Nusantara, Bandung 40115 - Indonesia.',
        amount: 25000,
        payment_status: 'paid',
        review_status: 'completed',
        report_json: JSON.stringify({
          checks: [
            { label: 'Nama Produk & Kategori', status: 'detected', note: "Nama produk 'Keripik Singkong Balado' jelas dan sesuai dengan kategori makanan ringan." },
            { label: 'Daftar Bahan / Komposisi', status: 'detected', note: 'Komposisi tertera berurutan dari jumlah terbanyak. Alergen tidak teridentifikasi.' },
            { label: 'Berat Bersih / Isi Bersih', status: 'detected', note: 'Satuan berat bersih 200g sesuai standar metrik.' },
            { label: 'Nama & Alamat Produsen', status: 'detected', note: 'Nama produsen dan kota asal tercantum jelas.' },
            { label: 'Peringatan Alergen', status: 'info', note: 'Tidak ada bahan alergen mayor, disclaimer fasilitas produksi disarankan bila berbagi lini.' }
          ],
          nextSteps: [
            'Pastikan tata letak font minimal 1 mm untuk huruf kecil sesuai PerBPOM No. 31 Tahun 2018.',
            'Siapkan berkas izin P-IRT atau CPPOB untuk pendaftaran akun e-Reg BPOM.'
          ],
          disclaimer: 'Laporan ini merupakan hasil pemeriksaan kesiapan mandiri Tera, bukan persetujuan resmi BPOM.'
        }),
        staff_note: 'Produk telah diverifikasi untuk uji kesiapan label mandiri.',
        created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
        updated_at: new Date(Date.now() - 3 * 86400000).toISOString()
      },
      {
        id: 'TR-DEMO-SBW-02',
        company: 'Dapur Selera Ibu',
        contact: 'Siti Aminah',
        email: 'demo@tera.id',
        phone: '081398765432',
        product: 'Sambal Bawang Bu Broto Kemasan Kaca',
        category: 'Saus dan bumbu',
        labelText: 'Sambal Bawang Bu Broto. Komposisi: Bawang merah 45%, cabai rawit, minyak nabati, garam, penguat rasa mononatrium glutamat, pengawet kalium sorbat. Berat bersih: 135g. Baik digunakan sebelum: lihat tutup botol.',
        amount: 25000,
        payment_status: 'paid',
        review_status: 'completed',
        report_json: JSON.stringify({
          checks: [
            { label: 'Identitas Produk', status: 'detected', note: 'Kategori saus/sambal olahan kemasan jar kaca memenuhi ketentuan label.' },
            { label: 'Bahan Tambahan Pangan (BTP)', status: 'detected', note: 'Pengawet kalium sorbat dan MSG dicantumkan dengan golongan fungsinya.' },
            { label: 'Petunjuk Penyimpanan', status: 'review', note: 'Saran: tambahkan instruksi simpan dalam lemari pendingin setelah segel dibuka.' }
          ],
          nextSteps: ['Lengkapi kode produksi pada leher atau tutup botol saat pencetakan batch massal.'],
          disclaimer: 'Hasil pemeriksaan awal mandiri Tera.'
        }),
        staff_note: 'BTP terdeteksi sesuai batas maksimum kategori.',
        created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
        updated_at: new Date(Date.now() - 2 * 86400000).toISOString()
      },
      {
        id: 'TR-DEMO-MNS-03',
        company: 'CV Segar Alami Mandiri',
        contact: 'Budi Santoso',
        email: 'demo@tera.id',
        phone: '081234567890',
        product: 'Sari Jeruk Nipis Murni Segar',
        category: 'Minuman olahan',
        labelText: 'Sari Jeruk Nipis Murni. Komposisi: Air, sari buah jeruk nipis asli 20%, gula tebu, asam sitrat. Isi bersih: 250ml. Kocok dahulu sebelum diminum.',
        amount: 25000,
        payment_status: 'pending',
        review_status: 'awaiting_payment',
        report_json: null,
        staff_note: 'Menunggu settlement pembayaran Midtrans.',
        created_at: new Date(Date.now() - 86400000).toISOString(),
        updated_at: new Date(Date.now() - 86400000).toISOString()
      }
    ];

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO applications(
        id, company, contact, email, phone, product, category,
        labelText, amount, payment_status, review_status, report_json,
        staff_note, created_at, updated_at, image_file
      ) VALUES(
        @id, @company, @contact, @email, @phone, @product, @category,
        @labelText, @amount, @payment_status, @review_status, @report_json,
        @staff_note, @created_at, @updated_at, ''
      )
    `);

    for (const item of demoItems) insertStmt.run(item);
  }
} catch (e) {
  console.warn('Demo seeding note:', String(e));
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const rate = new Map();
const now = () => new Date().toISOString();
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const json = (res, code, data) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
};
const fail = (res, code, error) => json(res, code, { ok: false, error });
const LIMIT = 3_500_000; // encrypted private photo up to 2 MB before base64 encoding
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
// File type verified against magic bytes. Never trust client MIME or filename.
function decodeLabelImage(raw) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw);
  if (!m || m[2].length > 2_800_000) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > 2 * 1024 * 1024 || buf.toString('base64') !== m[2]) return null;
  const bytes = (hex) => buf.subarray(0, hex.length / 2).toString('hex') === hex;
  const jpeg = bytes('ffd8ff');
  const png = bytes('89504e470d0a1a0a');
  const webp = buf.length > 12 && buf.toString('ascii',0,4)==='RIFF' && buf.toString('ascii',8,12)==='WEBP';
  if ((m[1]==='jpeg' && jpeg) || (m[1]==='png' && png) || (m[1]==='webp' && webp)) return { data: buf, ext: m[1]==='jpeg'?'jpg':m[1], mime: `image/${m[1]}` };
  return null;
}
function validInput(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return [null, 'Format pengajuan tidak valid.'];
  const v = {
    company: text(b.company, 120), contact: text(b.contact, 120), email: text(b.email, 200).toLowerCase(),
    phone: text(b.phone, 30), product: text(b.product, 140), category: text(b.category, 90),
    label_text: text(b.labelText, 16000), nie: text(b.nie, 45), consent: b.consent === true,
    labelImage: typeof b.labelImage === 'string' ? b.labelImage : ''
  };
  if ([v.company, v.contact, v.product, v.category].some(s => s.length < 2)) return [null, 'Isi identitas usaha, kontak, kategori dan nama produk.'];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) || !/^[+0-9\s()\-]{8,30}$/.test(v.phone)) return [null, 'Email atau nomor telepon tidak valid.'];
  if (v.label_text.length < 30) return [null, 'Salin teks label minimal 30 karakter agar bisa dievaluasi.'];
  if (!v.consent) return [null, 'Persetujuan pemrosesan data diperlukan.'];
  if (v.labelImage) {
    const img = decodeLabelImage(v.labelImage);
    if (!img) return [null, 'Gambar label harus JPEG, PNG, atau WebP maksimal 2 MB.'];
    v.image = img;
  }
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

// Verified email account. Passwordless link + rotating opaque HttpOnly cookie.
const ACCOUNT_TTL = 7 * 24 * 60 * 60 * 1000;
const accountReady = recoveryReady;
const sessionCookie = 'tera_account';
function sessionEmail(req) {
  const cookies = String(req.headers.cookie || '').split(';').map(c => c.trim());
  const entry = cookies.find(c => c.startsWith(sessionCookie + '='));
  const raw = entry ? entry.slice(sessionCookie.length + 1) : '';
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(raw)) return null;
  const entryDb = db.prepare('SELECT email,expires_at FROM account_sessions WHERE token_hash=?').get(sha(raw));
  if (!entryDb || entryDb.expires_at <= Date.now()) return null;
  return entryDb.email;
}
function setAccountCookie(res, token, expiresMs) {
  const secure = /^https:\/\//.test(publicUrl) && process.env.NODE_ENV !== 'test' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(expiresMs/1000)}${secure}`);
}
function clearAccountCookie(res) {
  const secure = /^https:\/\//.test(publicUrl) && process.env.NODE_ENV !== 'test' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}
async function sendAccountLogin(email, token) {
  const link = `${publicUrl}/account.html#verify/${token}`;
  const html = `<div style="max-width:560px;margin:auto;font-family:Arial,sans-serif;color:#193a2d;padding:32px"><p style="font-weight:bold;letter-spacing:.15em">TERA / CUSTOMER PORTAL</p><h1>Masuk ke ruang produkmu</h1><p>Gunakan tautan di bawah untuk masuk ke akun Tera. Berlaku 15 menit, sekali pakai.</p><p><a href="${link}" style="display:inline-block;background:#193a2d;color:white;padding:14px 24px;border-radius:8px">Masuk ke Tera</a></p><p>Jika kamu tidak meminta ini, abaikan email ini. Jangan bagikan tautannya.</p><small>Tera adalah layanan independen, bukan situs resmi BPOM.</small></div>`;
  const reply = await fetch(resendEndpoint, {
    method:'POST', signal:AbortSignal.timeout(7500),
    headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({from:emailFrom,to:[email],subject:'Masuk ke akun Tera — tautan aman',html})
  });
  if (!reply.ok) throw new Error('Email delivery failed: ' + reply.status);
}
function accountList(email) {
  return db.prepare(`SELECT id,company,product,category,amount,payment_status AS paymentStatus,
    review_status AS reviewStatus, created_at AS createdAt,updated_at AS updatedAt
    FROM applications WHERE email=? ORDER BY created_at DESC LIMIT 150`).all(email);
}
function customerView(row) {
  const paid = row.payment_status === 'paid';
  return {
    ok: true, id: row.id, company: row.company, product: row.product, amount: row.amount,
    paymentStatus: row.payment_status, reviewStatus: paid ? row.review_status : 'awaiting_payment',
    checkoutUrl: row.payment_status === 'pending' ? row.snap_url : '',
    createdAt: row.created_at, imageAvailable: Boolean(row.image_file), note: paid ? row.staff_note : '',
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

function validCustomer(req, id) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null;
  const row = db.prepare('SELECT * FROM applications WHERE id=?').get(id);
  if (!row) return null;
  return crypto.timingSafeEqual(Buffer.from(row.token_hash, 'hex'), Buffer.from(sha(token), 'hex')) ? row : null;
}
function servePrivateImage(res, row) {
  if (!row.image_file || !/^[A-Za-z0-9-]+\-[a-f0-9]{16}\.(jpg|png|webp)$/.test(row.image_file)) return fail(res, 404, 'Foto tidak tersedia.');
  const imagePath = path.join(uploadDir, row.image_file);
  const mime = row.image_file.endsWith('.jpg') ? 'image/jpeg' : row.image_file.endsWith('.png') ? 'image/png' : 'image/webp';
  fs.readFile(imagePath, (e, buf) => {
    if (e) return fail(res, 404, 'Foto tidak tersedia.');
    res.writeHead(200, {'Content-Type':mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline','Referrer-Policy':'no-referrer'});
    res.end(buf);
  });
}
function emailHtml(items) {
  const list = items.map(item => `<li>${item}</li>`).join('');
  return `<div style="font-family:system-ui,sans-serif;max-width:540px;margin:30px auto;color:#1e3029"><h1>Tera · Pulihkan akses</h1><p>Permintaan akses ke pengajuan Tera telah diterima. Klik tautan berikut dalam 15 menit:</p><ul>${list}</ul><p>Jika kamu tidak meminta ini, abaikan email ini.</p><small>Layanan independen, bukan sistem resmi BPOM.</small></div>`;
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const route = url.pathname;
    if (route.startsWith('/api/') && req.method === 'OPTIONS') return fail(res, 405, 'Tidak diizinkan.');
    if (route.startsWith('/api/') && !allowedOrigin(req)) return fail(res, 403, 'Origin tidak sesuai.');


    // CUSTOMER ACCOUNT — all billing is still exclusively handled by Midtrans.
    if (req.method === 'GET' && route === '/api/account/config') {
      return json(res,200,{ok:true,loginEnabled:true,demoEnabled:true,provider:'email_magic_link',payments:'Midtrans Snap',sandbox:!live});
    }
    if (req.method === 'POST' && route === '/api/account/login/request') {
      const body = await readBody(req);
      const email = text(body?.email,200).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res,422,'Email tidak valid.');
      const isDemo = ['demo@tera.id','mitra@umkm.id'].includes(email);
      if (!accountReady && !isDemo) return fail(res,503,'Login email belum diaktifkan. Gunakan akun demo (demo@tera.id).');
      const token = crypto.randomBytes(32).toString('base64url');
      const hashed = sha(token); const ts=Date.now();
      db.prepare('INSERT INTO account_login_links(token_hash,email,created_at,expires_at) VALUES(?,?,?,?)').run(hashed,email,ts,ts+15*60*1000);
      if (isDemo) {
        return json(res,202,{ok:true,message:'Akun Demo diverifikasi. Mengalihkan ke dashboard…',demoToken:token});
      }
      if (!applyRate(req,res,'account-email',4)) return;
      try { await sendAccountLogin(email,token); }
      catch(e) { db.prepare('DELETE FROM account_login_links WHERE token_hash=?').run(hashed); console.warn('Account email delivery unavailable',String(e)); }
      return json(res,202,{ok:true,message:'Jika email dapat menerima pesan, tautan masuk akan dikirim. Periksa inbox/spam.'});
    }
    if (req.method === 'POST' && route === '/api/account/login/redeem') {
      if (!applyRate(req,res,'account-redeem',10)) return;
      const b = await readBody(req);
      if (!/^[A-Za-z0-9_-]{40,100}$/.test(b?.token||'')) return fail(res,400,'Tautan tidak valid.');
      const ts=Date.now();
      const claim=db.prepare('UPDATE account_login_links SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL AND expires_at>? RETURNING email').get(ts,sha(b.token),ts);
      if (!claim) return fail(res,410,'Tautan telah digunakan atau kedaluwarsa. Minta tautan baru.');
      const session=crypto.randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO account_sessions(token_hash,email,created_at,expires_at) VALUES(?,?,?,?)').run(sha(session),claim.email,ts,ts+ACCOUNT_TTL);
      setAccountCookie(res,session,ACCOUNT_TTL);
      return json(res,200,{ok:true,email:claim.email});
    }
    if (route.startsWith('/api/account/')) {
      const email=sessionEmail(req);
      if (!email) return fail(res,401,'Sesi berakhir. Masuk kembali melalui email.');
      if (req.method === 'GET' && route === '/api/account/me') return json(res,200,{ok:true,email});
      if (req.method === 'POST' && route === '/api/account/logout') {
        const raw=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(sessionCookie+'='))?.slice(sessionCookie.length+1);
        if (raw) db.prepare('DELETE FROM account_sessions WHERE token_hash=?').run(sha(raw));
        clearAccountCookie(res);return json(res,200,{ok:true});
      }
      if (req.method === 'GET' && route === '/api/account/applications') {
        if (!applyRate(req,res,'account-list',45)) return;
        return json(res,200,{ok:true,data:accountList(email)});
      }
      const image=route.match(/^\/api\/account\/applications\/(TR-[A-Z0-9-]+)\/image$/);
      if (req.method==='GET' && image) {
        const row=db.prepare('SELECT * FROM applications WHERE id=? AND email=?').get(image[1],email);
        return row?servePrivateImage(res,row):fail(res,404,'Lampiran tidak ditemukan.');
      }
      const detail=route.match(/^\/api\/account\/applications\/(TR-[A-Z0-9-]+)$/);
      if (req.method==='GET' && detail) {
        if (!applyRate(req,res,'account-detail',55)) return;
        const row=db.prepare('SELECT * FROM applications WHERE id=? AND email=?').get(detail[1],email);
        if (!row) return fail(res,404,'Pengajuan tidak ditemukan.');
        const refreshed=await reconcilePayment(row);
        return json(res,200,{...customerView(refreshed),category:refreshed.category,labelText:refreshed.label_text,nie:refreshed.nie,contact:refreshed.contact,updatedAt:refreshed.updated_at});
      }
      return fail(res,404,'Endpoint akun tidak ditemukan.');
    }
    if (req.method === 'GET' && route === '/api/public/config') return json(res, 200, {
      ok: true, price: fee, currency: 'IDR', paymentEnabled: paymentReady,
      provider: 'Midtrans Snap', sandbox: !live,
      recoveryEnabled: recoveryReady, maxImageBytes: 2097152,
      scope: 'Pemeriksaan awal label pangan olahan, bukan pembayaran resmi BPOM.'
    });

    if (req.method === 'POST' && route === '/api/public/applications') {
      if (!applyRate(req, res, 'apply', 8)) return;
      if (!paymentReady) return fail(res, 503, 'Pembayaran belum dikonfigurasi. Pengajuan berbayar belum dibuka.');
      const b = await readBody(req);
      const [v, err] = validInput(b);
      if (err) return fail(res, 422, err);
      const accountEmail=sessionEmail(req);
      if (accountEmail && accountEmail!==v.email) return fail(res,422,'Email pengajuan harus sama dengan email akun yang sedang masuk.');
      const id = `TR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
      const token = crypto.randomBytes(32).toString('base64url');
      const created = now();
      db.prepare(`INSERT INTO applications (id,token_hash,company,contact,email,phone,product,category,label_text,nie,consent,amount,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, sha(token), v.company, v.contact, v.email, v.phone, v.product, v.category, v.label_text, v.nie, 1, fee, created, created);
      let storedImage = '';
      if (v.image) {
        try {
          storedImage = `${id}-${crypto.randomBytes(8).toString('hex')}.${v.image.ext}`;
          fs.writeFileSync(path.join(uploadDir, storedImage), v.image.data, { flag: 'wx', mode: 0o600 });
          db.prepare('UPDATE applications SET image_file=? WHERE id=?').run(storedImage, id);
        } catch (e) {
          if (storedImage) fs.rmSync(path.join(uploadDir, storedImage), { force: true });
          db.prepare('DELETE FROM applications WHERE id=?').run(id);
          console.error('Private image storage failed', id, e.message);
          return fail(res, 503, 'Foto tidak dapat disimpan. Pengajuan belum dibuat. Silakan coba lagi.');
        }
      }

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
        if (storedImage) fs.rmSync(path.join(uploadDir, storedImage), { force: true });
        return fail(res, 502, 'Gateway pembayaran belum merespons. Pengajuan belum dibuat, silakan coba lagi.');
      }
      return json(res, 201, { ok: true, id, accessToken: token, checkoutUrl, amount: fee, paymentStatus: 'pending' });
    }

    // Magic-link recovery: email proof, 15-minute one-time token, rotated customer tokens.
    if (req.method === 'POST' && route === '/api/public/recovery/request') {
      if (!applyRate(req, res, 'recover', 3)) return;
      if (!recoveryReady) return fail(res, 503, 'Pemulihan email belum diaktifkan.');
      const b = await readBody(req);
      const email = text(b?.email, 200).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 422, 'Alamat email tidak valid.');
      const exists = db.prepare('SELECT 1 FROM applications WHERE email=? LIMIT 1').get(email);
      if (exists) {
        const recent = db.prepare('SELECT count(*) as n FROM recovery_requests WHERE email=? AND created_at>?').get(email,Date.now()-24*60*60*1000);
        if (recent.n < 5) {
          const token = crypto.randomBytes(32).toString('base64url');
          const hashed = sha(token);
          const stamp = Date.now();
          db.prepare('INSERT INTO recovery_requests(token_hash,email,created_at,expires_at) VALUES(?,?,?,?)').run(hashed,email,stamp,stamp+15*60*1000);
          const link = `${publicUrl}/#recovery/${token}`;
          try {
            const sent = await fetch(resendEndpoint,{
              method:'POST', signal:AbortSignal.timeout(7500),
              headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},
              body:JSON.stringify({from:emailFrom,to:[email],subject:'Tera — pulihkan akses pengajuan',html:emailHtml([`<a href="${link}">Pulihkan akses Tera</a>`])})
            });
            if (!sent.ok) {db.prepare('DELETE FROM recovery_requests WHERE token_hash=?').run(hashed);console.warn('Recovery delivery failed',sent.status);}
          } catch (e) {db.prepare('DELETE FROM recovery_requests WHERE token_hash=?').run(hashed);console.warn('Recovery email unavailable');}
        }
      }
      // Always same response, prevent account/email enumeration.
      return json(res, 202, {ok:true, message:'Jika email tersebut terdaftar, tautan pemulihan akan dikirim.'});
    }
    if (req.method === 'POST' && route === '/api/public/recovery/redeem') {
      if (!applyRate(req, res, 'redeem', 8)) return;
      const b = await readBody(req);
      if (!/^[A-Za-z0-9_-]{40,100}$/.test(b?.token || '')) return fail(res, 400, 'Tautan pemulihan tidak valid.');
      const hashed = sha(b.token), stamp = Date.now();
      const claim = db.prepare('UPDATE recovery_requests SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL AND expires_at>? RETURNING email').get(stamp,hashed,stamp);
      if (!claim) return fail(res, 410, 'Tautan kedaluwarsa atau sudah digunakan.');
      const rows = db.prepare('SELECT id, product, payment_status FROM applications WHERE email=? ORDER BY created_at DESC LIMIT 100').all(claim.email);
      const result = [];
      // Issue new access tokens only AFTER successful email proof; invalidate all previous links.
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const row of rows) {
          const newToken = crypto.randomBytes(32).toString('base64url');
          db.prepare('UPDATE applications SET token_hash=?, updated_at=? WHERE id=?').run(sha(newToken), now(), row.id);
          result.push({ id:row.id,product:row.product,paymentStatus:row.payment_status,accessToken:newToken });
        }
        db.exec('COMMIT');
      } catch (e) {db.exec('ROLLBACK');throw e;}
      return json(res, 200, {ok:true, applications:result});
    }

    const status = route.match(/^\/api\/public\/applications\/(TR-[A-Z0-9-]+)$/);
    if (req.method === 'GET' && status) {
      if (!applyRate(req, res, 'track', 60)) return;
      const row = validCustomer(req, status[1]);
      if (!row) return fail(res, 404, 'Pengajuan tidak ditemukan.');
      return json(res, 200, customerView(await reconcilePayment(row)));
    }

    const imageRoute = route.match(/^\/api\/public\/applications\/(TR-[A-Z0-9-]+)\/image$/);
    if (req.method === 'GET' && imageRoute) {
      if (!applyRate(req, res, 'image', 60)) return;
      const row = validCustomer(req, imageRoute[1]);
      if (!row) return fail(res, 404, 'Tidak ditemukan.');
      return servePrivateImage(res, row);
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
      const staffImage = route.match(/^\/api\/staff\/applications\/(TR-[A-Z0-9-]+)\/image$/);
      if (req.method === 'GET' && staffImage) {
        const row = db.prepare('SELECT * FROM applications WHERE id=?').get(staffImage[1]);
        return row ? servePrivateImage(res,row) : fail(res,404,'Tidak ditemukan.');
      }
      const m = route.match(/^\/api\/staff\/applications\/(TR-[A-Z0-9-]+)$/);
      if (m && req.method === 'GET') {
        const r = db.prepare('SELECT * FROM applications WHERE id=?').get(m[1]);
        if (!r) return fail(res, 404, 'Tidak ditemukan.');
        const { token_hash, snap_url, image_file, ...rest } = r;
        rest.imageAvailable = Boolean(image_file);
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
    const publicAssets = new Set(['/index.html', '/public.css', '/public.js', '/favicon.svg', '/staff.html', '/staff.css', '/staff.js', '/account.html', '/account.css', '/account.js']);
    if (!publicAssets.has(pathname)) return fail(res, 404, 'Tidak ditemukan.');
    const resolved = path.resolve(pub, '.' + pathname);
    if (!resolved.startsWith(pub + path.sep)) return fail(res, 403, 'Dilarang.');
    const type = MIME[path.extname(resolved)];
    fs.readFile(resolved, (err, buf) => {
      if (err) return fail(res, 404, 'Tidak ditemukan.');
      res.writeHead(200, {
        'Content-Type': type, 'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",  
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
