# QA Report — TERA V6

Basis `master 5a8620e` dibangun dari patch V4+V5 terverifikasi sebelumnya, lalu dicocokkan dengan kode master terbaru. Perbedaan master V5 penting: demo seed dengan `paid` dummy dan bypass email verifikasi; keduanya diganti dengan demo statis tanpa database. `server.mjs` V6 sengaja menolak checkout/login pada Vercel ephemeral sampai AI owner menyediakan backend persisten.

## Tes yang dijalankan

| Kategori | Perintah | Hasil |
|---|---|---|
| Dasar | `node --check server.mjs`, `node --check public/account.js`, `node --check public/staff.js` | PASS |
| API V3 / payment | `node tests/smoke.mjs` | PASS |
| Edge Midtrans | `node tests/edge.mjs` | PASS |
| V4 upload & recovery | `node tests/mega.mjs` | PASS |
| V5 customer session | `node tests/account.mjs` | PASS |
| V6 revisions & receipt | `node tests/v6.mjs` | PASS |
| V6 ephemeral preview gate | `node tests/v6_preview.mjs` | PASS |
| Customer browser | `python tests/account_ui_isolated.py` | PASS, 1440/390/320px |
| Staff browser | `python tests/ui_v4_isolated.py` | PASS, 1440/390/320px |
| V6 interactions browser | `python tests/v6_ui_isolated.py` | PASS, 1440/390/320px |

### Batasan test

Tes browser memakai halaman JS/CSS aktual dan API simulasi; bukan interaksi dengan Midtrans atau mail provider sungguhan. Tes API memakai provider lokal mock termasuk signed webhook, bukan akun merchant sandbox live. Belum ada hasil tes real VPS atau volume persisten, sehingga status rilis hanya pilot/staging code-ready.

### Risiko residual

1. Regulasi BPOM: mesin aturan sembilan aspek heuristik, belum memutuskan kepatuhan per kategori. Kewajiban gizi menurut PerBPOM 10/2026 dan registrasi PerBPOM 23/2023 belum dimplementasikan sebagai rule terverifikasi.
2. Review komersial: teks revisi tidak memiliki batas jumlah atau biaya tambahan; harga Rp25.000 saat ini hanya contoh pilot. Tetapkan Terms of Service sebelum transaksi asli.
3. Receipt V6 bukan faktur pajak/NPWP/PPN, dan tidak menyediakan automated refund API. Status `refunded` ditampilkan secara jujur jika notifikasi Midtrans telah mengubahnya.
4. Demo dibuat read-only; jika database lama sempat menyimpan `TR-DEMO-*` lakukan audit backup dan penghapusan data contoh secara terkendali, bukan auto-delete data produksi.
5. Operasional keamanan: kebijakan retensi/hapus data, cookie domain final, anti-bot berlapis, backup restore, monitoring alert, email delivery dan payments production belum diaudit independen.
