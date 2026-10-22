// Adapter API. Mencoba backend dulu; bila tidak ada, jatuh ke mesin lokal.
// Kontrak (dipertahankan saat backend Rust menggantikan server.mjs):
//   GET  /api/status            -> { ai: bool, model: string|null }
//   POST /api/analyze           -> { rules, ai, aiError, mode }
//   GET  /api/nie?q=MD123...    -> { found: bool, product?, owner?, valid_until?, source }
import { runRules } from './rules.js';

const j = async (url, opt) => {
  const r = await fetch(url, opt);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};

export const status = () => j('/api/status').catch(() => ({ ai: false, model: null, offline: true }));

export async function analyze(payload) {
  try {
    return await j('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch {
    // Tanpa server: mesin aturan tetap jalan di browser.
    return { rules: runRules(payload.labelText, payload), ai: null, aiError: null, mode: 'lokal' };
  }
}

export function nieFormat(nie) {
  const s = String(nie || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const m = /^(MD|ML)\s?-?\s?(\d{9,15})$/.exec(s);
  if (!s) return { state: 'kosong', text: 'Nomor belum diisi.' };
  if (!m) return { state: 'salah', text: 'Format tidak sesuai pola MD/ML diikuti angka.' };
  return { state: 'sesuai', text: `Format sesuai pola ${m[1] === 'MD' ? 'MD (produk dalam negeri)' : 'ML (produk impor)'}.`, normalized: `${m[1]} ${m[2]}` };
}

// Cek ke BPOM: butuh backend. Tanpa backend dijawab jujur "belum tersedia".
export async function lookupNie(nie) {
  try { const o = await j(`/api/nie?q=${encodeURIComponent(nie)}`); return o.available === false ? { ok: false } : { ok: true, ...o }; }
  catch { return { ok: false }; }
}

// REST endpoints untuk records & digital signatures
export async function fetchRecords() {
  try {
    const res = await j('/api/records');
    return res?.data || null;
  } catch {
    return null;
  }
}

export async function fetchRecord(id) {
  try {
    const res = await j(`/api/records/${encodeURIComponent(id)}`);
    return res?.data || null;
  } catch {
    return null;
  }
}

export async function createRecord(payload) {
  try {
    const res = await j('/api/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res?.data || null;
  } catch {
    return null;
  }
}

export async function patchRecord(id, updates) {
  try {
    const res = await j(`/api/records/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    return res?.data || null;
  } catch {
    return null;
  }
}

export async function signRecord(id, officer) {
  try {
    const res = await j(`/api/records/${encodeURIComponent(id)}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ officer })
    });
    return res?.signature || null;
  } catch {
    return null;
  }
}

export async function resetServerDb() {
  try {
    const res = await j('/api/reset', { method: 'POST' });
    return res?.ok || false;
  } catch {
    return false;
  }
}

// Perkecil foto ke ~1000px sisi terpanjang agar muat di localStorage / dikirim ke AI.
export function shrinkImage(file, max = 1000, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('File bukan gambar yang bisa dibuka.')); };
    img.src = url;
  });
}

export function remedyMessage(rec, res) {
  const miss = res.items.filter((i) => i.status === 'miss');
  const rev = [
    ...res.items.filter((i) => i.status === 'review').map((i) => `${i.label} (${i.note || 'perlu ditinjau'})`),
    ...(res.claims || []).map((c) => `Klaim "${c.teks || c.text}" (${c.jenis || 'perlu penyesuaian'})`)
  ];
  const lines = [`Yth. ${rec.owner}, berikut hasil pemeriksaan label produk "${rec.name}":`, ''];
  if (miss.length) {
    lines.push('Perlu dilengkapi / diperbaiki pada kemasan:');
    miss.forEach((i) => lines.push(`- ${i.label}: ${i.note || 'tidak ditemukan pada label'}`));
    lines.push('');
  }
  if (rev.length) {
    lines.push('Catatan pengawasan & verifikasi dinas:');
    rev.forEach((t) => lines.push(`- ${t}`));
    lines.push('');
  }
  if (!miss.length && !rev.length) {
    lines.push('Seluruh 9 keterangan wajib ditemukan pada pemeriksaan awal.');
  } else {
    lines.push('Mohon lakukan penyesuaian desain label sesuai ketentuan PerBPOM No. 31/2018 jo No. 20/2021, lalu kirimkan revisi kemasan untuk validasi lanjutan.');
  }
  lines.push('', 'Bidang Standardisasi & Pengawasan', 'Dinas Perindustrian dan Perdagangan');
  return lines.join('\n');
}
