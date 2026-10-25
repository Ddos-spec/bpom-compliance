# TERA V3 — Audit & QA evidence
Tanggal audit: 26 Oktober 2026 · Ruang lingkup: `TERA_PUBLIC_PAID_REDESIGN_V2.zip` → V3

## Keputusan

**Lolos untuk demonstrasi dan pengujian pilot terkontrol, BUKAN siap go-live komersial.**

Audit ini memeriksa kode aktual paket V2, lalu memperbaiki masalah yang bisa direproduksi. Tidak ada klaim integrasi gateway produksi atau legal clearance.

## Perubahan hasil audit

1. **Pembayaran pending tanpa webhook:** GET privat sekarang melakukan pengecekan server-to-server ke Midtrans Status API dengan jeda minimal 15 detik tiap pengajuan; hanya data dari Midtrans dengan ID dan nominal cocok yang diproses. API resmi dirujuk di https://docs.midtrans.com/reference/get-transaction-status.
2. **Replay webhook setelah refund:** status `refunded` tidak bisa dipulihkan menjadi `paid` hanya oleh notifikasi settlement lama. Untuk pengembalian dana/reversal yang sah diperlukan penanganan operator yang didokumentasikan.
3. **Checkout creation gagal:** database tidak lagi menyisakan order baru yang belum punya token yang sudah diserahkan kepada pengguna.
4. **Alur setelah bayar gagal:** dashboard menampilkan CTA **Buat pengajuan baru** ketika transaksi gagal/kedaluwarsa.
5. **Validasi:** payload `null`, array, dan format nominal tak wajar ditolak; tarif layanan tetap dihitung di server.
6. **Konten/branding:** hapus simbol merek terdaftar ® (belum ada bukti sertifikat merek), perjelas bahwa analisis adalah checklist **otomatis berbasis teks**, bukan audit ahli, serta tambahkan favicon vektor.
7. **Tes npm:** `npm test` benar-benar menjalankan tes API standard dan kasus batas (edge cases); tidak lagi mengarahkan `e2e` ke file uji lama yang tidak tersedia di ZIP.

## Evidence pengujian

| Tes | Hasil | Ruang lingkup |
| --- | --- | --- |
| `npm test` (smoke) | PASS | Konfigurasi, pembuatan order, otorisasi token, webhook palsu, laporan terkunci, settlement valid, akses staf, API lama ditutup |
| `npm test` (edge) | PASS | Payload invalid, nominal tidak dapat ditimpa, status API merekonsiliasi webhook hilang, refund tidak dibuka ulang, order gagal tidak tertinggal |
| `python tests/ui_isolated.py` | PASS | Chromium headless: desktop 1440px, mobile 390px, small 320px |
| UI navigasi | PASS | Landing → formulir → step 2 → dashboard mock → refresh; menu mobile terbuka/tertutup |
| UI validasi dasar | PASS | Front-end field input, konten teks di-*escape* sebelum render pada kasus simulasi |
| UI overflow & runtime | PASS | Tidak ada horizontal page overflow / pageerror pada ukuran yang diuji |
| Status gateway sandbox langsung | BELUM DIUJI | Perlu akun sandbox Midtrans sesungguhnya |
| Browser → server aktual dalam lingkungan audit | TERBATAS | Chromium memblokir navigasi localhost; tes UI memakai dokumen lokal dengan API mock dan tes API memakai server HTTP aktual secara terpisah |
| Audit legal komprehensif seluruh kategori pangan | BELUM DIUJI | Wajib review peraturan BPOM terkini/ahli label pangan, termasuk aturan spesifik produk |
| Hardening produksi / penetration test | BELUM DIUJI | Wajib sebelum menerima transaksi/data pelanggan |

## Persyaratan sebelum go-live

- Konfigurasi Midtrans sandbox, jalankan pembayaran end-to-end beserta status callback dan refund nyata (sandbox), lalu putuskan merchant production key secara aman.
- Domain HTTPS, kebijakan privasi, syarat layanan, aturan retensi data, refund policy, notifikasi transaksi, dan dukungan pelanggan.
- Pemulihan tautan privat melalui autentikasi email/akun (sekarang **tidak tersedia**; simpan tautan privat).
- Fitur unggah gambar label dan OCR/analisis foto (sekarang **belum tersedia**; pemeriksaan hanya teks yang diketik).
- Audit rule engine: bukan verifikasi resmi nomor NIE, bukan jaminan izin edar, belum memetakan semua kewajiban khusus jenis pangan/halal/kemasan/klaim.
- Backup dan restore teruji untuk database persisten, storage terenkripsi sesuai kebutuhan, rotasi token, proteksi abuse lintas instance, monitoring, pengujian aksesibilitas menyeluruh.
- Dashboard akun multi-produk dan staf skala besar (pilot ini hanya pelacakan **per pengajuan** dengan token serta API staf minimal).

### Sumber resmi yang ditinjau

- JDIH BPOM PerBPOM 6 Tahun 2024, perubahan kedua atas PerBPOM 31 Tahun 2018: https://jdih.pom.go.id/view/slide/1560/6/2024/312351bff07989769097660a56395065
- JDIH BPOM PerBPOM 20 Tahun 2021: https://jdih.pom.go.id/view/slide/1287/20/2021/13e006ba71389e9b4a839cc60699d356
- Midtrans Status API: https://docs.midtrans.com/reference/get-transaction-status

Catatan: pemeriksaan atas relevansi referensi regulasi **tidak berarti** semua aturan pengambilan keputusan dalam `public/rules.js` sudah diverifikasi.
