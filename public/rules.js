// Mesin Dual-AI Simulation Engine (Dipakai di browser & server)
// Meniru pipeline industri:
//   AI 1: Semantic Extractor (Membedah teks label mentah menjadi Entitas Terstruktur)
//   AI 2: Regulatory Auditor (Mencocokkan entitas ke PerBPOM 31/2018, 20/2021, 1/2022 + Generate Berita Acara & Pesan WA)

const hit = (re, t) => {
  const m = re.exec(t || '');
  return m ? { index: m.index, text: m[0] } : null;
};

const ALLERGEN_LIST = [
  { name: 'Kedelai', re: /\b(kedelai|tempe|tahu|soya|soy)\b/i },
  { name: 'Gandum / Gluten', re: /\b(terigu|gandum|gluten|barley|oat)\b/i },
  { name: 'Telur', re: /\b(telur|egg|albumin)\b/i },
  { name: 'Susu', re: /\b(susu|milk|keju|cheese|mentega|butter|whey|kasein)\b/i },
  { name: 'Kacang Tanah', re: /\b(kacang tanah|peanut)\b/i },
  { name: 'Ikan & Hasil Laut', re: /\b(ikan|roa|teri|udang|kepiting|cumi|seafood)\b/i },
];

const BTP_LIST = [
  { name: 'Pengembang', re: /\b(pengembang|baking powder|soda kue|natrium bikarbonat)\b/i },
  { name: 'Pemanis Buatan', re: /\b(aspartam|sukralosa|sakarin|asesulfam|sorbitol)\b/i },
  { name: 'Pengawet', re: /\b(natrium benzoat|kalium sorbat|sulfit|propionat)\b/i },
  { name: 'Pewarna', re: /\b(pewarna|tartrazin|karamel|kurkumin|eritrosin|cl\s*\d+)\b/i },
];

export const ITEMS = [
  {
    id: 'nama', label: 'Nama produk', pasal: 'Pasal 5 ayat (1) huruf a',
    test: (t, f, ext) => (ext.nama_produk && ext.nama_produk.length > 2)
      ? { status: 'ok', evidence: ext.nama_produk }
      : { status: 'miss', note: 'Nama produk tidak terdefinisi.' },
  },
  {
    id: 'bahan', label: 'Daftar bahan / komposisi', pasal: 'Pasal 5 ayat (1) huruf b',
    test: (t, f, ext) => ext.komposisi.length > 0
      ? { status: 'ok', evidence: ext.komposisi_raw, items: ext.komposisi }
      : { status: 'miss', note: 'Daftar bahan tidak ditemukan pada label.' },
  },
  {
    id: 'berat', label: 'Berat bersih / isi bersih', pasal: 'Pasal 5 ayat (1) huruf c',
    test: (t, f, ext) => ext.berat_bersih.nilai
      ? { status: 'ok', evidence: `${ext.berat_bersih.nilai} ${ext.berat_bersih.satuan}` }
      : { status: 'miss', note: 'Keterangan kuantitas/bobot bersih tidak dicantumkan.' },
  },
  {
    id: 'produsen', label: 'Nama dan alamat produsen/distributor', pasal: 'Pasal 5 ayat (1) huruf d',
    test: (t, f, ext) => {
      if (ext.produsen.nama && ext.produsen.kota) return { status: 'ok', evidence: `${ext.produsen.nama}, ${ext.produsen.kota}` };
      if (ext.produsen.nama) return { status: 'review', note: 'Nama usaha tertera, tapi alamat kota/kabupaten belum lengkap.', evidence: ext.produsen.nama };
      return { status: 'miss', note: 'Legalitas produsen & domisili produksi tidak ditemukan.' };
    },
  },
  {
    id: 'halal', label: 'Keterangan halal', pasal: 'Pasal 5 ayat (1) huruf e & UU JPH',
    test: (t, f, ext) => ext.halal.tercantum
      ? { status: 'ok', evidence: ext.halal.detail }
      : { status: 'miss', note: 'Keterangan halal tidak tercantum (Wajib dipenuhi sesuai penahapan kewajiban halal BPJPH).' },
  },
  {
    id: 'produksi', label: 'Tanggal dan kode produksi', pasal: 'Pasal 5 ayat (1) huruf f',
    test: (t, f, ext) => ext.kode_produksi
      ? { status: 'ok', evidence: ext.kode_produksi }
      : { status: 'miss', note: 'Nomor batch/kode produksi untuk ketertelusuran produk tidak ditemukan.' },
  },
  {
    id: 'kedaluwarsa', label: 'Keterangan kedaluwarsa', pasal: 'Pasal 5 ayat (1) huruf g',
    test: (t, f, ext) => ext.kedaluwarsa
      ? { status: 'ok', evidence: ext.kedaluwarsa }
      : { status: 'miss', note: 'Batas aman konsumsi (Best Before / Expired Date) tidak tercantum.' },
  },
  {
    id: 'nie', label: 'Nomor Izin Edar (MD / ML)', pasal: 'Pasal 5 ayat (1) huruf h',
    test: (t, f, ext) => {
      if (ext.nie.tipe === 'MD' || ext.nie.tipe === 'ML') return { status: 'ok', evidence: `${ext.nie.tipe} ${ext.nie.nomor}` };
      if (ext.nie.tipe === 'P-IRT') return { status: 'review', note: 'Tertera nomor P-IRT. Pastikan kategori risiko pangan sesuai dengan kriteria SPP-IRT DINKES vs BPOM MD.', evidence: ext.nie.nomor };
      return { status: 'miss', note: 'Nomor Izin Edar BPOM (MD/ML) tidak ditemukan.' };
    },
  },
  {
    id: 'asal', label: 'Keterangan asal usul bahan tertentu', pasal: 'Pasal 5 ayat (1) huruf i',
    test: (t, f, ext) => ext.bahan_khusus.length > 0
      ? { status: 'ok', evidence: ext.bahan_khusus.join(', ') }
      : { status: 'na', note: 'Hanya diwajibkan jika menggunakan bahan bersumber babi, gelatin hewan tertentu, atau alkohol.' },
  },
];

// AI 1: Semantic Entity Extractor
export function extractEntities(rawText, form = {}) {
  const t = rawText || '';
  
  // 1. Ekstraksi Komposisi
  let komposisi_raw = '';
  let komposisi = [];
  const compMatch = /(?:komposisi|daftar bahan|bahan-bahan|ingredients)\s*:\s*([^.\n]+)/i.exec(t);
  if (compMatch) {
    komposisi_raw = compMatch[0];
    komposisi = compMatch[1].split(/[,;]/).map(s => s.trim()).filter(s => s.length > 1);
  }

  // Deteksi Alergen & BTP
  const alergen_terdeteksi = [];
  ALLERGEN_LIST.forEach(a => {
    if (a.re.test(t)) alergen_terdeteksi.push(a.name);
  });

  const btp_terdeteksi = [];
  BTP_LIST.forEach(b => {
    if (b.re.test(t)) btp_terdeteksi.push(b.name);
  });

  // 2. Ekstraksi Bobot Bersih
  const beratMatch = /((?:berat|isi)\s*bersih|net\s*(?:wt|weight)?\.?)\s*:?\s*(\d+(?:[.,]\d+)?)\s*(mg|g|gr|gram|kg|ml|l|liter)\b/i.exec(t);
  const berat_bersih = beratMatch ? { nilai: beratMatch[2], satuan: beratMatch[3] } : { nilai: null, satuan: null };

  // 3. Ekstraksi Produsen
  const whoMatch = /(?:diproduksi oleh|produksi oleh|produced by|diimpor oleh|diproduksi\s*:)\s*([^,\n]+)/i.exec(t);
  const whereMatch = /(?:jl\.|jalan|kec\.|kecamatan|kab\.|kabupaten|kota|desa)[^.\n]+/i.exec(t);
  const produsen = {
    nama: (whoMatch ? whoMatch[1].trim() : form.owner) || null,
    alamat: whereMatch ? whereMatch[0].trim() : null,
    kota: /kota\s+([A-Za-z\s]+)|kabupaten\s+([A-Za-z\s]+)|jakarta|bogor|depok|tangerang|bekasi/i.exec(t)?.[0] || null
  };

  // 4. Ekstraksi Legalitas (NIE)
  const nieMatch = /\b(MD|ML)\s?-?\s?(\d{9,15})\b/i.exec(`${form.nie || ''} ${t}`);
  const pirtMatch = /P-?IRT\s*:?\s*(\d+)/i.exec(`${form.nie || ''} ${t}`);
  const nie = nieMatch 
    ? { tipe: nieMatch[1].toUpperCase(), nomor: nieMatch[2] }
    : pirtMatch ? { tipe: 'P-IRT', nomor: pirtMatch[1] } : { tipe: null, nomor: null };

  // 5. Ekstraksi Halal
  const halalMatch = /(halal|bpjph|non[- ]?halal|mengandung babi)/i.exec(t);
  const halal = {
    tercantum: Boolean(halalMatch),
    detail: halalMatch ? halalMatch[0] : null
  };

  // 6. Ekstraksi Tanggal & Batch
  const batchMatch = /(?:kode produksi|lot|batch|prod\.?\s*date)\s*:?\s*([A-Za-z0-9-]+)/i.exec(t);
  const expMatch = /(?:kedaluwarsa|kadaluarsa|baik digunakan sebelum|best before|exp(?:ired)?)\s*:?\s*([^.\n]+)/i.exec(t);

  // 7. Ekstraksi Klaim Pemasaran
  const klaim = [];
  const medHit = hit(/(menyembuhkan|mengobati|anti\s?kanker|obat\b|atasi [^\n,.]+)/i, t);
  if (medHit) {
    klaim.push({ jenis: 'Klaim Pengobatan / Medis (DILARANG)', teks: medHit.text, index: medHit.index, risiko: 'Kritis' });
  }
  const gizHit = hit(/(tanpa pengawet|bebas pengawet|100%\s*alami|tinggi serat|rendah gula)/i, t);
  if (gizHit) {
    klaim.push({ jenis: 'Klaim Komposisi / Gizi (Perlu Bukti)', teks: gizHit.text, index: gizHit.index, risiko: 'Perhatian' });
  }

  // Bahan khusus (babi/alkohol)
  const bahan_khusus = [];
  if (/(babi|lard|pork)/i.test(t)) bahan_khusus.push('Babi / Turunan Babi');
  if (/(alkohol|etanol|khimar)/i.test(t)) bahan_khusus.push('Kandungan Alkohol');

  return {
    nama_produk: form.name || (/^([A-Z0-9\s]{4,})/m.exec(t)?.[1]?.trim()) || 'Produk Tanpa Nama',
    komposisi,
    komposisi_raw,
    alergen_terdeteksi,
    btp_terdeteksi,
    berat_bersih,
    produsen,
    nie,
    halal,
    kode_produksi: batchMatch ? batchMatch[0] : null,
    kedaluwarsa: expMatch ? expMatch[0] : null,
    klaim,
    bahan_khusus
  };
}

// AI 2: Regulatory Auditor & Report Generator
export function runRules(text, form = {}) {
  const t = text || '';
  const extracted = extractEntities(t, form);

  // Evaluasi 9 Pasal Wajib
  const items = ITEMS.map((it) => {
    const r = it.test(t, form, extracted);
    const evidence = r.evidence || '';
    let index = null;
    if (evidence && t) {
      const idx = t.toLowerCase().indexOf(evidence.toLowerCase());
      if (idx !== -1) index = idx;
    }
    return {
      id: it.id,
      label: it.label,
      pasal: it.pasal,
      status: r.status,
      note: r.note || '',
      evidence,
      index,
      items: r.items || null
    };
  });

  const miss = items.filter((i) => i.status === 'miss').length;
  const review = items.filter((i) => i.status === 'review').length + extracted.klaim.length;

  const verdict = miss > 0
    ? { key: 'perbaikan', text: 'Perlu Perbaikan Label', detail: `${miss} dari 9 keterangan wajib belum terpenuhi` }
    : review > 0
      ? { key: 'tinjau', text: 'Perlu Verifikasi Lanjutan', detail: `${review} aspek membutuhkan konfirmasi fisik & uji lab` }
      : { key: 'lengkap', text: 'Lengkap Administratif', detail: 'Semua 9 keterangan wajib teridentifikasi pada label' };

  // Generate Berita Acara Pengawasan Disperindag
  const nomorBA = `BA-WAS/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`;
  const tanggalHariIni = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  
  const beritaAcara = {
    nomor: nomorBA,
    tanggal: tanggalHariIni,
    instansi: 'DINAS PERINDUSTRIAN DAN PERDAGANGAN',
    unit: 'Bidang Standardisasi, Pengawasan, dan Perlindungan Konsumen',
    subjek: `Hasil Pengawasan Label Kemasan Pangan Olahan: ${extracted.nama_produk}`,
    pelaku_usaha: extracted.produsen.nama || form.owner || 'Pelaku Usaha Terkait',
    temuan: items.filter(i => i.status === 'miss' || i.status === 'review').map(i => `${i.label} (${i.pasal}): ${i.note}`),
    pelanggaran_klaim: extracted.klaim.map(k => `[${k.risiko}] ${k.jenis} pada frasa "${k.teks}"`),
    dasar_hukum: [
      'Undang-Undang No. 18 Tahun 2012 tentang Pangan',
      'Peraturan BPOM No. 31 Tahun 2018 jo No. 20 Tahun 2021 tentang Label Pangan Olahan',
      'Peraturan BPOM No. 1 Tahun 2022 tentang Pedoman Klaim pada Label dan Iklan Pangan Olahan'
    ],
    rekomendasi: miss > 0 
      ? 'Diberikan Surat Peringatan & Pendampingan Perbaikan Desain Kemasan dalam tenggat 14 hari kerja sebelum izin edar dapat diproses lebih lanjut.'
      : 'Desain label memenuhi syarat dasar administrasi kemasan. Dapat direkomendasikan untuk registrasi akun izin edar BPOM.'
  };

  return {
    extracted,
    items,
    claims: extracted.klaim,
    verdict,
    miss,
    review,
    beritaAcara
  };
}
