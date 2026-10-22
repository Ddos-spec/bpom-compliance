// Server Tera Disperindag Tangerang Selatan
// Native Node.js 24 + node:sqlite WAL persistence + OpenRouter AI + Cek BPOM Registry
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRules } from './public/rules.js';
import {
  initDb,
  getAllRecords,
  getRecordById,
  insertRecord,
  updateRecordStage,
  updateRecordNote,
  updateRecordLabel,
  signBeritaAcara,
  verifyBpomNie,
  resetAllData
} from './server_db.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(root, 'public');
const imagesDir = path.join(root, 'data', 'images');

// Initialize database on startup
initDb();

// .env sederhana
try {
  for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* .env opsional */ }

const KEY = process.env.OPENROUTER_API_KEY || '';
const MODEL = process.env.OPENROUTER_MODEL || '';
const PORT = Number(process.env.PORT || 4173);
const aiReady = Boolean(KEY && MODEL);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const SYSTEM = `Kamu asisten pemeriksa label pangan olahan untuk petugas pengawasan di Indonesia.
Tugasmu: tinjau teks label dan hasil pemeriksaan aturan, lalu temukan hal yang TIDAK tertangkap aturan: klaim menyesatkan, klaim kesehatan, daftar bahan yang janggal, ketidakkonsistenan.
ATURAN KERAS: jangan mengarang nomor pasal atau isi peraturan. Kutip hanya kalimat yang ada di label. Jika ragu, katakan perlu verifikasi manusia. Balas HANYA JSON:
{"ringkasan":"...","temuan":[{"judul":"...","tingkat":"tinjau|masalah","kutipan":"kalimat persis dari label","penjelasan":"..."}]}`;

async function askModel({ labelText, imageDataUrl, rules, name }) {
  const content = [{ type: 'text', text: `Produk: ${name}\n\nTeks label:\n${labelText || '(tidak ada teks, lihat gambar)'}\n\nHasil aturan:\n${JSON.stringify(rules.items.map(({ label, status, note }) => ({ label, status, note })))}` }];
  if (imageDataUrl) content.push({ type: 'image_url', image_url: { url: imageDataUrl } });
  const ctl = AbortSignal.timeout(45000);
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', signal: ctl,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content }] }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '{}';
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    return { ringkasan: clean, temuan: [] };
  }
}

function readBody(req, limit = 12_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('Payload terlalu besar')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const send = (res, code, obj) => {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS'
  });
  res.end(JSON.stringify(obj));
};

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname.replace(/\/+/g, '/');

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS'
      });
      return res.end();
    }

    // 1. Status endpoint
    if (req.method === 'GET' && pathname === '/api/status') {
      return send(res, 200, {
        ai: aiReady,
        model: aiReady ? MODEL : null,
        db: true,
        engine: 'node:sqlite (WAL)',
        app: 'Tera Disperindag Tangsel v2.4'
      });
    }

    // 2. NIE verification endpoint
    if (req.method === 'GET' && pathname === '/api/nie') {
      const q = url.searchParams.get('q') || '';
      const result = verifyBpomNie(q);
      return send(res, 200, result);
    }

    // 3. Records collection endpoint (GET all / POST create)
    if (pathname === '/api/records') {
      if (req.method === 'GET') {
        const records = getAllRecords();
        return send(res, 200, { ok: true, data: records });
      }
      if (req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        if (!body.id || !body.name) {
          return send(res, 400, { error: 'ID dan Nama Produk wajib diisi' });
        }
        const created = insertRecord(body);
        return send(res, 201, { ok: true, data: created });
      }
    }

    // 4. Digital signature for Berita Acara
    const signMatch = pathname.match(/^\/api\/records\/([^/]+)\/sign$/);
    if (signMatch && req.method === 'POST') {
      const recordId = decodeURIComponent(signMatch[1]);
      const body = JSON.parse(await readBody(req) || '{}');
      const officer = body.officer || {
        name: body.name || 'Petugas Disperindag',
        nip: body.nip || '-',
        role: body.role || 'Auditor Hukum'
      };
      try {
        const sig = signBeritaAcara(recordId, officer);
        return send(res, 200, { ok: true, signature: sig });
      } catch (err) {
        return send(res, 404, { error: err.message });
      }
    }

    // 5. Single record endpoint (GET / PATCH)
    const recordMatch = pathname.match(/^\/api\/records\/([^/]+)$/);
    if (recordMatch) {
      const recordId = decodeURIComponent(recordMatch[1]);
      if (req.method === 'GET') {
        const rec = getRecordById(recordId);
        if (!rec) return send(res, 404, { error: 'Berkas tidak ditemukan' });
        return send(res, 200, { ok: true, data: rec });
      }
      if (req.method === 'PATCH') {
        const body = JSON.parse(await readBody(req) || '{}');
        if (body.stage) {
          updateRecordStage(recordId, body.stage, body.reason, body.officerName || 'Petugas');
        }
        if (body.note !== undefined) {
          updateRecordNote(recordId, body.note);
        }
        if (body.label !== undefined) {
          updateRecordLabel(recordId, body.label, body.officerName || 'Petugas');
        }
        const updated = getRecordById(recordId);
        if (!updated) return send(res, 404, { error: 'Berkas tidak ditemukan' });
        return send(res, 200, { ok: true, data: updated });
      }
    }

    // 6. Reset database endpoint
    if (req.method === 'POST' && pathname === '/api/reset') {
      resetAllData();
      return send(res, 200, { ok: true, message: 'Database SQLite berhasil di-reset ke data awal.' });
    }

    // 7. Served images endpoint
    const imgMatch = pathname.match(/^\/api\/images\/([a-zA-Z0-9_\-\.]+)$/);
    if (imgMatch && req.method === 'GET') {
      const filename = imgMatch[1];
      const filePath = path.normalize(path.join(imagesDir, filename));
      if (!filePath.startsWith(imagesDir)) {
        res.writeHead(403);
        return res.end('Forbidden');
      }
      return fs.readFile(filePath, (err, buf) => {
        if (err) { res.writeHead(404); return res.end('Image Not Found'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(buf);
      });
    }

    // 8. AI analyze endpoint
    if (req.method === 'POST' && pathname === '/api/analyze') {
      const b = JSON.parse(await readBody(req) || '{}');
      const form = { name: String(b.name || ''), nie: String(b.nie || '') };
      const labelText = String(b.labelText || '').slice(0, 20000);
      const rules = runRules(labelText, form);
      let ai = null, aiError = null;
      if (aiReady && (labelText || b.imageDataUrl)) {
        try { ai = await askModel({ labelText, imageDataUrl: b.imageDataUrl, rules, name: form.name }); }
        catch (e) { aiError = e.message; }
      }
      return send(res, 200, { rules, ai, aiError, mode: ai ? 'rules+ai' : 'rules' });
    }

    // 9. Static files handler (no path traversal)
    let p = decodeURIComponent(pathname);
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(pub, p));
    if (!file.startsWith(pub)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}).listen(PORT, () => console.log(`Tera berjalan di http://localhost:${PORT}  (AI: ${aiReady ? MODEL : 'nonaktif, hanya aturan'} | DB: node:sqlite WAL)`));
