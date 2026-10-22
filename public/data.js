// DATA CONTOH. Semua nama usaha, alamat, dan nomor izin di bawah ini fiktif.
// Ganti dengan data nyata sebelum dipakai. Tahap: 'keputusan' | 'perbaikan' | 'selesai'.
const addr = (usaha, jl, kec, kota) => `Diproduksi oleh: ${usaha}\n${jl}, Kec. ${kec}, ${kota}`;

export const SAMPLE = [
  {
    id: 'P-0412', name: 'Keripik Tempe Renyah Original', owner: 'UD Warsih Jaya', checked: '2026-10-22', stage: 'keputusan', nie: 'MD 267812345601',
    label: `KERIPIK TEMPE RENYAH ORIGINAL\nKomposisi: tempe (kedelai), tepung beras, tepung tapioka, bawang putih, ketumbar, garam, minyak kelapa sawit.\nBerat bersih: 150 g\n${addr('UD Warsih Jaya', 'Jl. Melati No. 12', 'Pamulang', 'Kota Tangerang Selatan')}\nHalal (logo BPJPH)\nKode produksi: 2410A\nBaik digunakan sebelum: 12 Januari 2027\nMD 267812345601`,
  },
  {
    id: 'P-0413', name: 'Sambal Roa Pedas Manis', owner: 'Dapur Bu Lilis', checked: '2026-10-22', stage: 'keputusan', nie: 'MD 267812345602',
    label: `SAMBAL ROA PEDAS MANIS\nKomposisi: ikan roa, cabai merah, bawang merah, bawang putih, gula, garam, minyak goreng.\nIsi bersih: 200 g\n${addr('Dapur Bu Lilis', 'Jl. Kenanga No. 7', 'Serpong', 'Kota Tangerang Selatan')}\nKode produksi: SR-2210\nMD 267812345602`,
  },
  {
    id: 'P-0414', name: 'Sirup Jahe Merah', owner: 'CV Rempah Nusantara', checked: '2026-10-21', stage: 'keputusan', nie: '',
    label: `SIRUP JAHE MERAH\nMenyembuhkan asam lambung dan menghangatkan badan. Tanpa pengawet, 100% alami.\nKomposisi: jahe merah, gula pasir, air, serai.\nIsi bersih: 330 ml\nDiproduksi oleh: CV Rempah Nusantara, Jl. Raya Ciputat No. 45, Kec. Ciputat, Kota Tangerang Selatan\nHalal\nTanggal produksi: 20 Okt 2026\nKedaluwarsa: 20 Apr 2027`,
  },
  {
    id: 'P-0415', name: 'Kopi Bubuk Robusta', owner: 'Kopi Kampung Seruni', checked: '2026-10-21', stage: 'selesai', nie: 'MD 267812345604',
    label: `KOPI BUBUK ROBUSTA\nKomposisi: biji kopi robusta sangrai.\nBerat bersih: 200 g\n${addr('Kopi Kampung Seruni', 'Jl. Seruni No. 3', 'Setu', 'Kota Tangerang Selatan')}\nHalal BPJPH\nKode produksi: KR-1021\nBest before: 21 Oktober 2027\nMD 267812345604`,
  },
  {
    id: 'P-0416', name: 'Abon Sapi', owner: 'Abon Pak Darto', checked: '2026-10-20', stage: 'perbaikan', nie: 'MD 267812345605',
    label: `ABON SAPI\nKomposisi: daging sapi, gula merah, bawang putih, ketumbar, garam.\nDiproduksi oleh Abon Pak Darto\nHalal\nKode produksi: AS-2009\nKedaluwarsa: 20 Maret 2027\nMD 267812345605`,
  },
  {
    id: 'P-0417', name: 'Dodol Betawi', owner: 'Dodol Mpok Nur', checked: '2026-10-20', stage: 'keputusan', nie: 'MD 267812345606',
    label: `DODOL BETAWI\nTanpa pengawet.\nKomposisi: tepung ketan, gula merah, santan kelapa, garam.\nBerat bersih: 250 g\n${addr('Dodol Mpok Nur', 'Jl. Betawi Raya No. 21', 'Pondok Aren', 'Kota Tangerang Selatan')}\nHalal BPJPH\nKode produksi: DB-2010\nBaik digunakan sebelum: 20 Februari 2027\nMD 267812345606`,
  },
  {
    id: 'P-0418', name: 'Brownies Kukus Cokelat', owner: 'Rumah Kue Anisa', checked: '2026-10-19', stage: 'perbaikan', nie: 'MD 267812345607',
    label: `BROWNIES KUKUS COKELAT\nKomposisi: tepung terigu, telur, gula, mentega, cokelat bubuk, pengembang.\nBerat bersih: 400 g\n${addr('Rumah Kue Anisa', 'Jl. Anggrek No. 9', 'Pamulang', 'Kota Tangerang Selatan')}\nHalal\nKedaluwarsa: 3 hari setelah produksi\nMD 267812345607`,
  },
  {
    id: 'P-0419', name: 'Bumbu Pecel Instan', owner: 'Warung Sari Rasa', checked: '2026-10-19', stage: 'selesai', nie: 'MD 267812345608',
    label: `BUMBU PECEL INSTAN\nKomposisi: kacang tanah, cabai, gula merah, kencur, daun jeruk, garam.\nBerat bersih: 250 g\n${addr('Warung Sari Rasa', 'Jl. Teratai No. 15', 'Ciputat Timur', 'Kota Tangerang Selatan')}\nHalal BPJPH\nKode produksi: BP-1019\nKedaluwarsa: 19 Juli 2027\nMD 267812345608`,
  },
];
