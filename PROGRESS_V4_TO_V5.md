# PROGRES PENGEMBANGAN TERA — 26 OKTOBER 2026

**Repo audit:** `Ddos-spec/bpom-compliance`, `master` @ `26a179f`.

| Sub-sistem | Sebelumnya (V4) | Setelah Patch V5 | Kondisi verifikasi |
|---|---|---|---|
| Landing page | Editorial public landing sudah ada | Dipertahankan, CTA dashboard diarahkan ke `/account.html` | UI V4 dipertahankan; tes regresi API lulus |
| Dashboard per pengajuan | 1 private link per produk | Tetap tersedia untuk kompatibilitas | Regresi V4 lulus |
| **Akun pelanggan** | Tidak ada | Email magic link, session cookie, logout | Tes API V5 lulus |
| **Dashboard multi-produk** | Tidak ada | Seluruh pengajuan berdasarkan email terverifikasi, overview, filter/cari | Tes browser V5 lulus (API simulasi) |
| **Halaman transaksi** | Hanya transaksi per pengajuan | Riwayat semua pesanan dan statusnya | Tes browser V5 lulus (API simulasi) |
| **Detail pengajuan** | Per-link pribadi | Detail terkonsolidasi, checklist, catatan, cetak dan lampiran privat | Tes API/Browser lulus |
| **Payment gateway** | Midtrans Snap | **Tetap eksklusif Midtrans**, integrasi reusable pada seluruh produk | Tes Midtrans mock + webhook signature lulus; merchant UAT belum |
| Pembatasan data | Token per aplikasi | Email verified session + ownership per aplikasi + token lama tetap didukung | Tes cross-account 401/404 lulus |
| Logout | Tidak ada | Invalidation session | Tes API lulus |
| Deployment | VPS persisten tersedia, Vercel `/tmp` juga sempat dipakai | Vercel /tmp ditolak untuk API berbayar agar tidak hilang data | Validasi kode; uji staging VPS belum |
| Desain responsive | Landing & portal status | Login/overview/produk/transaksi/detail/panduan 1440,390,320px | Chromium terisolasi, no overflow/error JS |

### Tes sungguhan vs belum

- **PASS otomatis:** `npm test` (V4 smoke, edge, mega + V5 account), HTML dan JavaScript checker, Playwright pada Chromium terisolasi untuk 3 ukuran layar. Data visual dashboard = fixture test, bukan pelanggan sungguhan.
- **BELUM DILAKUKAN:** pembayaran live atau sandbox merchant Midtrans yang terhubung ke key nyata; email Resend live/domain verified; load/performance test besar; pentest independen; aksesibilitas WCAG full audit; live deployment domain/VPS; kajian kepatuhan hukum pangan olahan per kategori; OCR vision AI.

### Langkah terakhir sebelum go-live berbayar
1. Deploy ke persistent VPS + HTTPS, backup/restore diuji.
2. Konfigurasi Merchant Midtrans sandbox dan Resend verified sender.
3. UAT nyata checkout–webhook–dashboard–email, sukses dan gagal.
4. Legal review peraturan dan keamanan data; kebijakan privasi/retensi.
5. Aktifkan Midtrans production hanya setelah kelima poin di atas dinyatakan lolos.

**Status rilis:** V5 customer portal MVP, **siap untuk staging/pilot**, **belum siap go-live komersial tanpa konfigurasi layanan dan UAT nyata**.
