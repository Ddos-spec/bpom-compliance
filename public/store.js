// Hybrid Store Layer: High-Performance in-memory + LocalStorage cache + SQLite backend sync.
// Mendukung mode offline penuh (klien murni) dan mode tersinkronisasi server (SQLite WAL).
import { SAMPLE } from './data.js';
import * as api from './api.js';

const KEY = 'tera.v2';
const blank = () => ({ added: [], stages: {}, notes: {}, log: {}, images: {}, labels: {}, signatures: {} });
let db;
try { db = { ...blank(), ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { db = blank(); }
let serverRecordsCache = null;

const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
  catch { return false; } // kuota penuh
};

export const now = () => new Date().toISOString();

export async function syncWithServer() {
  try {
    const list = await api.fetchRecords();
    if (Array.isArray(list) && list.length > 0) {
      serverRecordsCache = list;
      return true;
    }
  } catch (e) {
    console.warn('Sync with server failed, fallback to local storage:', e);
  }
  return false;
}

export function records() {
  const base = serverRecordsCache && serverRecordsCache.length > 0 ? serverRecordsCache : SAMPLE;
  const baseIds = new Set(base.map(r => r.id));
  const newAdded = (db.added || []).filter(r => !baseIds.has(r.id));
  const all = [...newAdded, ...base];

  return all.map((r) => ({
    ...r,
    stage: db.stages[r.id] || r.stage,
    label: db.labels[r.id] ?? r.label,
    note: db.notes[r.id] ?? r.note ?? '',
    image: db.images[r.id] || r.image || '',
    signature: db.signatures?.[r.id] || r.signature || null,
    log: db.log[r.id] || r.log || [{ t: r.checked + 'T08:00:00.000Z', text: 'Berkas masuk, pemeriksaan otomatis dijalankan' }],
  }));
}

export const byId = (id) => records().find((r) => r.id === id);

export function addLog(id, text, officerName = 'Petugas') {
  const cur = db.log[id] || (byId(id)?.log || [{ t: (byId(id)?.checked || now().slice(0, 10)) + 'T08:00:00.000Z', text: 'Berkas masuk, pemeriksaan otomatis dijalankan' }]);
  db.log[id] = [...cur, { t: now(), text, officer: officerName }];
}

export function setStage(id, stage, text, officerName = 'Petugas') {
  db.stages[id] = stage;
  addLog(id, text, officerName);
  save();

  // Optimistic sync to server
  api.patchRecord(id, { stage, reason: text, officerName }).then((updated) => {
    if (updated && serverRecordsCache) {
      const idx = serverRecordsCache.findIndex((x) => x.id === id);
      if (idx !== -1) serverRecordsCache[idx] = updated;
    }
  }).catch(() => {});

  return true;
}

export function setNote(id, note) {
  db.notes[id] = note;
  save();

  api.patchRecord(id, { note }).then((updated) => {
    if (updated && serverRecordsCache) {
      const idx = serverRecordsCache.findIndex((x) => x.id === id);
      if (idx !== -1) serverRecordsCache[idx] = updated;
    }
  }).catch(() => {});

  return true;
}

export function setLabel(id, text, officerName = 'Petugas') {
  db.labels[id] = text;
  addLog(id, 'Teks label diubah, pemeriksaan diulang', officerName);
  save();

  api.patchRecord(id, { label: text, officerName }).then((updated) => {
    if (updated && serverRecordsCache) {
      const idx = serverRecordsCache.findIndex((x) => x.id === id);
      if (idx !== -1) serverRecordsCache[idx] = updated;
    }
  }).catch(() => {});

  return true;
}

export function saveSignature(id, sig) {
  if (!db.signatures) db.signatures = {};
  db.signatures[id] = sig;
  if (serverRecordsCache) {
    const idx = serverRecordsCache.findIndex((x) => x.id === id);
    if (idx !== -1) serverRecordsCache[idx].signature = sig;
  }
  return save();
}

export function getSignature(id) {
  return db.signatures?.[id] || byId(id)?.signature || null;
}

export function addRecord(rec, image) {
  if (!db.added) db.added = [];
  db.added.unshift(rec);
  if (image) db.images[rec.id] = image;
  addLog(rec.id, 'Berkas dibuat, pemeriksaan otomatis dijalankan');
  save();

  // Immediately update server cache in memory so synchronous navigation finds the record
  if (serverRecordsCache) {
    serverRecordsCache.unshift({
      ...rec,
      image: image || '',
      signature: null,
      log: [{ t: now(), text: 'Berkas dibuat, pemeriksaan otomatis dijalankan' }]
    });
  }

  // Async sync to SQLite server
  api.createRecord({
    ...rec,
    imageBase64: image || null
  }).then((created) => {
    if (created && serverRecordsCache) {
      const idx = serverRecordsCache.findIndex(x => x.id === rec.id);
      if (idx !== -1) serverRecordsCache[idx] = created;
    }
  }).catch(() => {});

  return true;
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

export function resetAll() {
  db = blank();
  localStorage.removeItem(KEY);
  serverRecordsCache = null;
  api.resetServerDb().catch(() => {});
}

export const usage = () => {
  try { return Math.round((localStorage.getItem(KEY) || '').length / 1024); }
  catch { return 0; }
};
