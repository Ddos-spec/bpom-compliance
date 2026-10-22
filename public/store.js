// Penyimpanan sisi klien. Nanti diganti API backend (Rust) dengan kontrak yang sama.
import { SAMPLE } from './data.js';

const KEY = 'tera.v2';
const blank = () => ({ added: [], stages: {}, notes: {}, log: {}, images: {}, labels: {} });
let db;
try { db = { ...blank(), ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { db = blank(); }

const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
  catch { return false; } // kuota penuh
};

export const now = () => new Date().toISOString();

export function records() {
  return [...db.added, ...SAMPLE].map((r) => ({
    ...r,
    stage: db.stages[r.id] || r.stage,
    label: db.labels[r.id] ?? r.label,
    note: db.notes[r.id] || '',
    image: db.images[r.id] || r.image || '',
    log: db.log[r.id] || [{ t: r.checked + 'T08:00:00.000Z', text: 'Berkas masuk, pemeriksaan otomatis dijalankan' }],
  }));
}
export const byId = (id) => records().find((r) => r.id === id);

export function addLog(id, text) {
  const cur = db.log[id] || [{ t: (byId(id)?.checked || now().slice(0, 10)) + 'T08:00:00.000Z', text: 'Berkas masuk, pemeriksaan otomatis dijalankan' }];
  db.log[id] = [...cur, { t: now(), text }];
}
export function setStage(id, stage, text) { db.stages[id] = stage; addLog(id, text); return save(); }
export function setNote(id, note) { db.notes[id] = note; return save(); }
export function setLabel(id, text) { db.labels[id] = text; addLog(id, 'Teks label diubah, pemeriksaan diulang'); return save(); }
export function addRecord(rec, image) {
  db.added.unshift(rec);
  if (image) db.images[rec.id] = image;
  addLog(rec.id, 'Berkas dibuat, pemeriksaan otomatis dijalankan');
  return save();
}
export function nextId() {
  const nums = records().map((r) => Number(r.id.replace(/\D/g, '')) || 0);
  return `P-${String(Math.max(0, ...nums) + 1).padStart(4, '0')}`;
}
export const exportJson = () => JSON.stringify({ version: 2, exportedAt: now(), data: db }, null, 2);
export function importJson(text) {
  const o = JSON.parse(text);
  if (!o || typeof o !== 'object' || !o.data || !Array.isArray(o.data.added)) throw new Error('Format file bukan ekspor Tera.');
  db = { ...blank(), ...o.data };
  return save();
}
export function resetAll() { db = blank(); localStorage.removeItem(KEY); }
export const usage = () => { try { return Math.round((localStorage.getItem(KEY) || '').length / 1024); } catch { return 0; } };
