# TERA V6 — Progress dan risk register (27 Oktober 2026)

**Repo sumber:** `Ddos-spec/bpom-compliance`, `master` @ `5a8620eb0bdb69d08447c4a2736025f8c4873169`.

| Area | Sebelum V6 (master V5) | Dalam patch V6 | Verification |
|---|---|---|---|
| Backend/deployment VPS | Belum terverifikasi persisten | **DELEGATED** ke AI owner, instruksi lengkap di `AI_DEVOPS_HANDOFF.md`; tidak diprovision | Perlu staging + real UAT |
| Public demo | Kode master mengandung seeded fake paid record dan bypass magic link untuk email tertentu; seeding berisiko dan tampak gagal terhadap skema V5 | Demo statis read-only `/demo.html`; login magic link tetap butuh email nyata; no fake paid DB | Code review + API regersi |
| Vercel ephemeral | Master console.warn, kemungkinan menerima transaksi dengan data sementara | Fail closed (payment + login disabled), public landing tetap terlihat | Test preview configuration |
| Revisi label | Hanya staf ubah status + catatan | Pelanggan kirim teks revisi jika diminta; staf accept/reject; jejak versi dan laporan baru setelah accept | Test V6 |
| Multi-tenant access | Email verified cookie | Semua revisi, bukti transaksi, gambar tetap scoped email | Test V6 |
| Bukti bayar | Tabel riwayat dan status | Bukti transaksi downloadable HTML hanya untuk status paid/refunded; **bukan faktur pajak** | Test V6 |
| Payment gateway | Midtrans Snap, webhook SHA-512, GET Status | Tidak menambah gateway atau mekanisme mark-as-paid dari UI | Regresi V3–V5 + V6 |
| BPOM rules | Heuristic 9 aspek label | Tidak dinaikkan menjadi audit resmi; disediakan referensi regulasi dan backlog legal review | Butuh ahli, bukan test otomatis |

## Yang tidak diklaim selesai

- Midtrans sandbox yang benar-benar terhubung ke merchant; status API dan webhook hanya diuji melalui mock lokal.
- Resend sender domain verified dan email sungguhan.
- OCR/AI vision foto label; foto tetap attachment, teks label diketik pelanggan.
- Penentuan kewajiban produk per kategori, termasuk penahapan halal, informasi nilai gizi PerBPOM 10/2026, dan ketentuan registrasi PerBPOM 23/2023.
- Faktur pajak/PPN, pencatatan akuntansi lengkap, pengembalian dana terotomasi, SLA legal, kebijakan privacy dan persetujuan retensi, pentest independen.
- Refund initiation API: aplikasi mencatat status refund dari Midtrans; tidak mengeksekusi refund sendiri.

## Urutan implementasi lanjutan

1. **Owner's AI — P0**: proses `AI_DEVOPS_HANDOFF.md` sampai acceptance gate terpenuhi; jangan klaim sukses dari build `READY` Vercel saja.
2. **Operator — P0**: isi layanan Midtrans sandbox dan Resend ke secrets backend, jalankan UAT secara real, pastikan domain email terverifikasi.
3. **Legal/compliance — P0**: review PerBPOM kategori produk dan kebijakan privasi/Terms dengan kompetensi relevan sebelum menerima customer berbayar.
4. **Engineering — P1**: OCR yang terukur, review per kategori pangan, kategori wajib informasi nilai gizi, serta versioned rules dengan sumber hukum spesifik.
5. **Product — P1**: tetapkan kebijakan berapa kali revisi yang termasuk biaya, SLA, refund/komplain dan bukti bayar vs faktur pajak.

**Rilis:** V6 adalah *code-ready prototype untuk pilot terkontrol*, **belum production-ready**.
