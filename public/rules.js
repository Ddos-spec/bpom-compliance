// Mesin aturan deterministik (tanpa AI). Dipakai di browser dan di server.
// Dasar: keterangan wajib label pangan olahan, Peraturan BPOM 31/2018 Pasal 5 ayat (1),
// diubah dengan Peraturan BPOM 20/2021. Nomor pasal berasal dari hasil pencarian web,
// BELUM dicocokkan dengan naskah resmi: petugas wajib memverifikasi sebelum dipakai resmi.

const hit = (re, t) => {
  const m = re.exec(t || '');
  return m ? { index: m.index, text: m[0] } : null;
};

const NIE_RE = /\b(?:MD|ML)\s?-?\s?\d{9,15}\b/i;
const PIRT_RE = /P-?IRT/i;

export const ITEMS = [
  {
    id: 'nama', label: 'Nama produk', pasal: 'Pasal 5 ayat (1)',
    test: (t, f) => (f.name && f.name.trim().length > 2)
      ? { status: 'ok', evidence: f.name.trim() }
      : { status: 'miss', note: 'Nama produk belum diisi.' },
  },
  {
    id: 'bahan', label: 'Daftar bahan', pasal: 'Pasal 5 ayat (1)',
    test: (t) => {
      const h = hit(/(komposisi|daftar bahan|bahan-bahan|bahan\s*:|ingredients)/i, t);
      return h ? { status: 'ok', ...h } : { status: 'miss', note: 'Tidak ada daftar bahan atau komposisi.' };
    },
  },
  {
    id: 'berat', label: 'Berat bersih / isi bersih', pasal: 'Pasal 5 ayat (1)',
    test: (t) => {
      const h = hit(/((berat|isi)\s*bersih|net\s*(wt|weight)?\.?)\s*:?\s*\d+([.,]\d+)?\s*(mg|g|gr|gram|kg|ml|l|liter)\b/i, t);
      return h ? { status: 'ok', ...h } : { status: 'miss', note: 'Berat atau isi bersih tidak tercantum bersama satuannya.' };
    },
  },
  {
    id: 'produsen', label: 'Nama dan alamat produsen', pasal: 'Pasal 5 ayat (1)',
    test: (t) => {
      const who = hit(/(diproduksi oleh|produksi oleh|produced by|diimpor oleh|diproduksi\s*:)/i, t);
      const where = hit(/(jl\.|jalan|kec\.|kecamatan|kab\.|kabupaten|kota\s+\w+|desa|rt\s*\d+)/i, t);
      if (who && where) return { status: 'ok', ...who };
      if (who) return { status: 'miss', note: 'Nama produsen ada, alamat tidak lengkap.', ...who };
      return { status: 'miss', note: 'Nama dan alamat produsen tidak ditemukan.' };
    },
  },
  {
    id: 'halal', label: 'Keterangan halal', pasal: 'Pasal 5 ayat (1)',
    test: (t) => {
      const h = hit(/(halal|bpjph|non[- ]?halal|mengandung babi)/i, t);
      return h ? { status: 'ok', ...h }
        : { status: 'miss', note: 'Tidak ada keterangan halal. Wajib bagi produk yang dipersyaratkan; petugas menentukan apakah produk ini termasuk.' };
    },
  },
  {
    id: 'produksi', label: 'Tanggal dan kode produksi', pasal: 'Pasal 5 ayat (1)',
    test: (t) => {
      const h = hit(/(kode produksi|tanggal produksi|tgl\.?\s*produksi|prod\.?\s*date|\blot\b|\bbatch\b)/i, t);
      return h ? { status: 'ok', ...h } : { status: 'miss', note: 'Tanggal atau kode produksi tidak ditemukan.' };
    },
  },
  {
    id: 'kedaluwarsa', label: 'Keterangan kedaluwarsa', pasal: 'Pasal 5 ayat (1)',
    test: (t) => {
      const h = hit(/(kedaluwarsa|kadaluarsa|baik digunakan sebelum|best before|\bexp(ired)?\b)/i, t);
      return h ? { status: 'ok', ...h } : { status: 'miss', note: 'Tanggal kedaluwarsa tidak ditemukan.' };
    },
  },
  {
    id: 'nie', label: 'Nomor izin edar', pasal: 'Pasal 5 ayat (1)',
    test: (t, f) => {
      const src = `${f.nie || ''} ${t || ''}`;
      const h = hit(NIE_RE, src);
      if (h) return { status: 'ok', text: h.text.replace(/\s+/g, ' '), index: (t || '').search(NIE_RE) };
      if (hit(PIRT_RE, src)) return { status: 'review', note: 'Tercantum P-IRT, bukan MD/ML. Cek jenis izin dan kesesuaiannya dengan jenis produk.', ...hit(PIRT_RE, t) };
      return { status: 'miss', note: 'Nomor izin edar (MD atau ML) tidak ditemukan. Yang diperiksa hanya format, bukan keaslian nomor.' };
    },
  },
  {
    id: 'asal', label: 'Asal usul bahan tertentu', pasal: 'Pasal 5 ayat (1)',
    test: (t) => {
      const h = hit(/(mengandung babi|bahan dari babi|lard|alkohol|etanol)/i, t);
      return h ? { status: 'ok', ...h } : { status: 'na', note: 'Berlaku hanya bila ada bahan dari sumber tertentu. Tidak bisa dinilai otomatis.' };
    },
  },
];

const CLAIMS = [
  { re: /(menyembuhkan|mengobati|anti\s?kanker|obat\b|atasi (diabetes|asam urat|kolesterol)|asam lambung)/i, note: 'Klaim terapi atau penyakit. Perlu ditinjau terhadap ketentuan klaim pada label pangan olahan.' },
  { re: /(tanpa pengawet|bebas pengawet|100%\s*alami|tinggi serat|rendah gula|bebas gula|tanpa gula)/i, note: 'Klaim komposisi atau gizi. Perlu dibuktikan dengan daftar bahan dan syarat klaim.' },
];

export function runRules(text, form = {}) {
  const t = text || '';
  const items = ITEMS.map((it) => {
    const r = it.test(t, form);
    return { id: it.id, label: it.label, pasal: it.pasal, status: r.status, note: r.note || '', evidence: r.text || r.evidence || '', index: Number.isInteger(r.index) && r.index >= 0 ? r.index : null };
  });
  const claims = CLAIMS.map((c) => {
    const h = hit(c.re, t);
    return h ? { text: h.text, index: h.index, note: c.note } : null;
  }).filter(Boolean);

  const miss = items.filter((i) => i.status === 'miss').length;
  const review = items.filter((i) => i.status === 'review').length + claims.length;
  const verdict = miss > 0
    ? { key: 'perbaikan', text: 'Perlu perbaikan', detail: `${miss} keterangan wajib tidak ditemukan` }
    : review > 0
      ? { key: 'tinjau', text: 'Perlu ditinjau petugas', detail: `${review} hal perlu penilaian manusia` }
      : { key: 'lengkap', text: 'Lengkap pada pemeriksaan awal', detail: 'Semua keterangan wajib ditemukan' };
  return { items, claims, verdict, miss, review };
}
