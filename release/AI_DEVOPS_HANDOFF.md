# Handoff untuk AI Developer — Deployment (Poin 1, tanggung jawab owner)

**Status:** DELEGATED. Patch V6 tidak melakukan provisioning VPS, mengubah DNS, memasang sertifikat, atau membuka akses ke server. Ini adalah instruksi implementasi untuk AI/developer owner.

**Referensi:** `Ddos-spec/bpom-compliance`, branch `master`, basis commit `5a8620eb0bdb69d08447c4a2736025f8c4873169`; patch V6 menambahkan revisi label, bukti transaksi, dan gerbang demo statis.

## Tujuan produk dan batasan

Tera merupakan layanan independen pemeriksaan awal informasi label pangan olahan. Bukan portal BPOM, bukan penerimaan PNBP, dan tidak dapat menjamin izin edar. **Hanya Midtrans** untuk checkout dan semua status pembayaran. Resend digunakan **hanya untuk email login/pemulihan**.

## Pengaturan deployment yang menjadi tugas owner/AI (bukan diubah patch ini)

1. Pastikan Node.js 24 LTS pada runtime kontainer/VM, storage persisten `TERA_DATA_DIR`, foto privat dan SQLite WAL; aktifkan backup konsisten serta uji restore. Jangan simpan SQLite, foto, login, dan transaksi pada `/tmp` Vercel ephemeral.
2. Siapkan hostname HTTPS dan reverse proxy ke Node pada port lokal. Validasi bahwa reverse proxy meneruskan `Host`, TLS, dan origin dengan benar. Pastikan CSP tidak memblokir domain yang diperlukan. Gunakan konfigurasi Docker Compose + Caddy yang sudah ada hanya setelah audit.
3. Simpan `MIDTRANS_SERVER_KEY` (sandbox dahulu), `MIDTRANS_IS_PRODUCTION=false`, `SERVICE_FEE_IDR`, `TERA_ADMIN_KEY`, `TERA_PUBLIC_URL`, `RESEND_API_KEY`, `TERA_EMAIL_FROM`, `TERA_DOMAIN` sebagai server secrets. Jangan pernah commit atau menampilkan secret di UI/log. Jangan menempelkan kunci ke chat. Nilai `SERVICE_FEE_IDR=25000` hanya contoh pilot; keputusan tarif adalah urusan pemilik bisnis.
4. Di Midtrans MAP, set **Payment Notification URL** ke `https://DOMAIN/api/payments/midtrans/notification`. Jalankan UAT sandbox: pending, settlement/capture accept, deny, expire, refund, notifikasi berulang, notifikasi terlambat, koneksi terputus, dua order bersamaan. Gateway tetap satu: Midtrans Snap. Server key hanya dipakai backend.
5. Setup email Resend dengan sender domain terverifikasi, SPF/DKIM dan HTTPS public URL; uji magic link sekali pakai, kedaluwarsa 15 menit, logout, dua akun pelanggan dan pemulihan.
6. Pastikan tidak ada HTTP internal route lewat internet publik tanpa TLS (V4 sempat mempunyai `vercel.json` proxy `http://IP:4173`; sekarang telah dinetralkan, jangan memulihkannya). Jika perlu frontend Vercel dan API VPS, gunakan rewrite hanya ke `https://` backend yang terverifikasi dan cek cookie SameSite, Host/origin, serta CSRF sesuai arsitektur final.
7. Pisahkan staging dan production: DB, merchant keys, email sender, hostname, backup, serta log; jangan membuat test data berstatus `paid` di database production.
8. Pasang observability dan alert untuk HTTP 5xx, kegagalan Midtrans webhook, waktu antrean, volume pembatalan, storage penuh, dan backup gagal.

## Acceptance gate — AI wajib membuktikan, bukan mengklaim

- [ ] Staging mempunyai HTTPS valid dan storage persisten; restart container **tidak menghapus** aplikasi, sesi, gambar atau order.
- [ ] Midtrans sandbox real merchant: bayar → signed webhook → `paid` → laporan unlock; status dipastikan server-side.
- [ ] Bayar gagal/expire/refund: laporan tetap terkunci atau dibatasi sesuai kebijakan; tanda terima menampilkan status `refunded` bila relevan.
- [ ] Resend real: tautan email sekali pakai berjalan di domain target; akun A tidak dapat membuka pengajuan B.
- [ ] Backup terjadwal dan restore diuji di container bersih; checksum diverifikasi.
- [ ] Tidak ada contoh transaksi/dummy dalam database produksi; demo menggunakan `/demo.html` read-only.
- [ ] Jalankan `npm test` dan QA browser 320,390,1440 px secara end-to-end ke staging sebenarnya, bukan API mocks saja.
- [ ] Terapkan Terms/Privacy yang direview konsultan hukum serta penanganan permintaan hapus data, sebelum menerima uang pelanggan.

### Perilaku aman sementara

Jika `VERCEL` aktif dan `NODE_ENV` bukan `test`, V6 menonaktifkan API pembayaran dan login, tetapi tetap melayani landing/demo. Ini adalah *fail-closed preview*, **bukan** solusi backend berbayar di Vercel.

## Referensi resmi

- Midtrans HTTP notifications & signature: https://docs.midtrans.com/docs/https-notification-webhooks
- Midtrans payment setup: https://docs.midtrans.com/docs/payment-settings
- Midtrans Snap transaction backend: https://docs.midtrans.com/reference/backend-integration
- BPOM label perubahan kedua: https://jdih.pom.go.id/view/slide/1560/6/2024/312351bff07989769097660a56395065
- PerBPOM 10/2026 Informasi Nilai Gizi: https://jdih.pom.go.id/view/slide/1758/10/2026/61123c2bc92cc2338473e0a567eadc33
- PerBPOM 23/2023 Registrasi Pangan Olahan: https://jdih.pom.go.id/view/slide/1518/23/2023/b568bfdc3aedc88f544af9584858c96d
