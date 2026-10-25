# Tera Public — Label Readiness SaaS (Audit V3)

**Status:** siap untuk demo/pilot internal terkontrol; **belum boleh disebut siap produksi komersial**. Paket ini merevisi dan **menggantikan** `TERA_PUBLIC_PAID_REDESIGN_V2.zip` serta versi MVP sebelumnya. Tidak perlu memasang ZIP lama dahulu.

Tera adalah layanan independen berbayar bagi usaha pangan olahan untuk **memeriksa kesiapan awal teks label** sebelum menempuh mekanisme registrasi BPOM yang sesuai. Tidak ada hubungan resmi dengan BPOM/Disperindag, tidak termasuk pembayaran PNBP, bukan layanan pendaftaran BPOM, dan tidak menjamin izin edar. Harga Rp25.000 adalah **contoh pilot**, bukan tarif resmi atau keputusan bisnis final.

## UI/UX

- Landing page publik berkonsep editorial packaging (tanpa foto AI, tanpa angka testimonial/analitik fiktif).
- Demo checklist interaktif, langkah penggunaan, fitur, harga dinamis dari backend, dan FAQ.
- Form dua tahap: informasi usaha, produk dan teks label, persetujuan data, checkout via Midtrans Snap (server-side).
- Dashboard privat per pengajuan: status pembayaran, timeline, checklist otomatis, langkah berikutnya, cetak laporan, salin tautan, dan refresh.
- Layout teruji pada lebar 1440, 390 dan 320 px melalui Chromium terisolasi; screenshot terbaru ada di `design-preview/*-v3.png`.
- **Belum ada** unggah foto dan OCR, akun pelanggan multi-produk, pemulihan akses melalui email, atau checkout produksi yang diuji.

## Jalankan

Runtime Node.js **>=22.5**, direkomendasikan 24 LTS. Database lokal SQLite butuh direktori persisten. Ini **bukan** server statis / serverless tanpa volume persisten.

```bash
cp .env.example .env
# isi konfigurasi yang sesuai di file .env
npm start
# buka http://localhost:4173
```

`.env.example` menyediakan `PORT`, `SERVICE_FEE_IDR`, `MIDTRANS_SERVER_KEY`, `MIDTRANS_IS_PRODUCTION`, `TERA_ADMIN_KEY`, `TERA_DATA_DIR`.

Jika `MIDTRANS_SERVER_KEY` kosong, pengajuan berbayar **dinonaktifkan** dan landing tetap dapat dibuka. Mulai dengan **akun Midtrans sandbox**. Setelah webhook disetel ke `https://domain-anda/api/payments/midtrans/notification`, lakukan UAT pembayaran sandbox; jangan beralih ke production key sebelum semua skenario lulus.

Kode mengarahkan payment status query ke Midtrans Status API pada sandbox/production sesuai konfigurasi, dengan cache cooldown 15 detik per pengajuan. Kode hanya menganggap transaksi lunas jika verifikasi Status API atau notifikasi bersignature berhasil dan nominalnya sesuai.

## Test

```bash
npm test                            # API smoke + edge; menggunakan simulasi payment lokal
python tests/ui_isolated.py         # opsional: playwright Python + Chromium terpasang
```

Tes browser memakai markup/JavaScript aktual dan **mock API**, bukan pembayaran asli, sebab lingkungan audit memblokir navigasi Chromium ke localhost. Tidak ada klaim end-to-end lintas browser ke server produksi. Lihat `QA_REPORT.md` untuk bukti dan yang masih gagal dipenuhi.

## Endpoint

| Method | Endpoint | Akses |
| --- | --- | --- |
| GET | `/api/public/config` | Publik; tarif dan status gateway |
| POST | `/api/public/applications` | Publik; registrasi & checkout Midtrans |
| GET | `/api/public/applications/:id` | Harus `Authorization: Bearer <accessToken>` |
| POST | `/api/payments/midtrans/notification` | Midtrans; cek SHA512 notification signature |
| GET | `/api/staff/applications` | Staf; `Authorization: Bearer <TERA_ADMIN_KEY>` |
| GET/PATCH | `/api/staff/applications/:id` | Staf; autentikasi sama |

API staf belum dashboard staf publik. Admin key harus acak >=24 karakter. Data pelanggan berada di `data/tera_public.db` atau path `TERA_DATA_DIR`; folder database produksi **tidak** dikemas di ZIP.

## Integrasi ke repo lama

Repo sumber: https://github.com/Ddos-spec/bpom-compliance

1. Buat branch cadangan dari repo lama, lalu extract **isi folder** `tera-redesign-audit-v3/` ke **root repo** (bukan nested).
2. Pastikan `server.mjs`, `public/index.html`, `public/public.js`, `public/public.css`, `public/rules.js`, `public/favicon.svg`, `package.json`, `.env.example` ikut menggantikan/menambah berkas yang semestinya.
3. Lakukan `npm test`; konfigurasikan `.env`, volume persisten, HTTPS, dan merchant sandbox.
4. Aplikasi lama di repo mungkin menyimpan file demo petugas, tetapi server V3 hanya menyajikan aset publik whitelist. Jangan gunakan endpoint petugas lama di lingkungan produksi.
5. Jangan menimpa database pelanggan lama tanpa migrasi, backup, dan uji restore.

**Penting:** tidak ada perubahan otomatis ke GitHub. Paket ini disiapkan sebagai ZIP patch terpisah.
