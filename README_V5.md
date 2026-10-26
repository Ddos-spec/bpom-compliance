# TERA V5 — Customer Hub + Midtrans-only Payments

**Basis repo:** `Ddos-spec/bpom-compliance` branch `master`, commit `26a179fbb6a159076233d84d9ef46eea3b2ef06e` (26 Oktober 2026).

## Isi dan cakupan
- `/account.html`: customer portal baru — passwordless email magic link, verified-email ownership, dashboard multi-produk, pencarian/filter, transaksi, detail laporan, lampiran privat, langkah perbaikan, cetak.
- Landing tetap editorial, tetapi tombol **Dashboard pelanggan** kini langsung menuju customer portal; email pengajuan otomatis mengikuti sesi yang terverifikasi.
- `server.mjs`: migrasi tabel login links/sessions yang kompatibel dengan SQLite yang sudah ada, sesi cookie opaque HttpOnly SameSite=Lax, tautan login berlaku 15 menit dan hanya sekali, logout yang mencabut sesi; endpoint data akun dibatasi menurut email yang telah dibuktikan kepemilikannya.
- Pembayaran **tetap hanya melalui Midtrans Snap**, tanpa payment gateway tambahan. Midtrans webhook dan Status API adalah sumber status pembayaran; browser callback bukan bukti lunas.
- Proteksi: pemisahan data antar pelanggan, gambar hanya melalui endpoint terautentikasi, laporan terkunci sebelum lunas, verifikasi transaksi dari server, pembatasan rate dan validasi origin.

## Persyaratan operasional
- Node.js >=22.5 dengan `node:sqlite`; Node.js 24 disarankan untuk deployment.
- Penyimpanan **persisten** (`TERA_DATA_DIR` pada disk VPS/volume Docker), HTTPS, backup berkala.
- Midtrans MAP **Sandbox Server Key** untuk pengujian. Set `MIDTRANS_SERVER_KEY`, `MIDTRANS_IS_PRODUCTION=false`, `SERVICE_FEE_IDR` pada `.env`.
- Konfigurasikan URL notifikasi Midtrans di MAP ke `https://domain-kamu/api/payments/midtrans/notification`. Domain publik harus punya sertifikat HTTPS; jangan gunakan URL HTTP/IP mentah.
- Untuk login pengguna: `RESEND_API_KEY`, `TERA_EMAIL_FROM` (domain pengirim terverifikasi) dan `TERA_PUBLIC_URL=https://domain-kamu`. Resend hanya email; bukan gateway pembayaran.
- Semua metode pembayaran pelanggan (VA/transfer, QRIS, GoPay, kartu, dll.) mengikuti metode yang **aktif** pada merchant Midtrans, tidak diimplementasikan melalui provider terpisah.
- `TERA_ADMIN_KEY` tetap dipakai untuk portal staf V4; jangan disimpan di frontend.
- **Vercel serverless + SQLite /tmp bukan penyimpanan persisten.** V5 gagal start di lingkungan Vercel langsung agar tidak kehilangan data. Deploy backend ke VPS/container persisten melalui Caddy + Docker Compose yang sudah ada dari V4.

## Implementasi
1. Pastikan repo lokal memakai branch `master` dan sudah berisi V4 (`git log -1 --oneline`). Backup `.env` dan data SQLite terlebih dahulu.
2. Ekstrak ZIP, jalankan `scripts/APPLY_V5.ps1 -RepoPath "D:\\repo\\bpom-compliance"` dari direktori hasil ekstraksi (PowerShell). Installer membuat backup file yang ditimpa dan tidak menyentuh `.env` atau `data/`.
3. Review perubahan dan jalankan `npm test` serta `python tests/account_ui_isolated.py` (membutuhkan Playwright+Chromium, hanya simulasi API).
4. Tambahkan variabel email di `.env`; jangan menaruh kredensial di commit Git atau ZIP; deploy backend dengan TLS ke storage persisten.
5. Uji end-to-end di **Midtrans Sandbox merchant sesungguhnya**: sukses/settlement, pending, kedaluwarsa, cancel/deny, refund, duplicate webhook, lost webhook dan mobile checkout. Setelah lolos, baru gunakan Server Key live.
6. Uji email magic link dari domain produksi dan audit keamanan aplikasi + kebijakan privasi sebelum mengizinkan pembayaran nyata.

## Endpoint akun baru
| Metode | Route | Autentikasi |
|---|---|---|
| GET | `/api/account/config` | Publik |
| POST | `/api/account/login/request` | Publik, email magic link |
| POST | `/api/account/login/redeem` | Token email satu kali |
| GET | `/api/account/me` | Cookie sesi |
| GET | `/api/account/applications` | Cookie sesi + filter email |
| GET | `/api/account/applications/:id` | Cookie sesi + pemilik |
| GET | `/api/account/applications/:id/image` | Cookie sesi + pemilik |
| POST | `/api/account/logout` | Cookie sesi |

Layanan **bukan** platform pemerintah/BPOM, bukan penerbit izin edar dan tidak menjamin kelulusan pendaftaran. Harga Rp25.000 di `.env.example` hanya placeholder pilot. OCR dari gambar dan validasi regulasi per kategori **belum** tersedia, tetap memerlukan implementasi dan legal review.
