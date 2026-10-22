// Server kecil tanpa dependensi: file statis + /api/analyze (OpenRouter, kunci tetap di server).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRules } from './public/rules.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(root, 'public');

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

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

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
  return JSON.parse(raw.replace(/^```json\s*|```$/g, ''));
}

function readBody(req, limit = 8_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('Payload terlalu besar')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/api/status') return send(res, 200, { ai: aiReady, model: aiReady ? MODEL : null });
    if (req.method === 'GET' && url.pathname === '/api/nie') return send(res, 200, { available: false, error: 'Pengecekan BPOM belum tersambung' });
    if (req.method === 'POST' && url.pathname === '/api/analyze') {
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
    // statis, tanpa path traversal
    let p = decodeURIComponent(url.pathname); if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(pub, p));
    if (!file.startsWith(pub)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  } catch (e) { send(res, 500, { error: e.message }); }
}).listen(PORT, () => console.log(`Tera berjalan di http://localhost:${PORT}  (AI: ${aiReady ? MODEL : 'nonaktif, hanya aturan'})`));
