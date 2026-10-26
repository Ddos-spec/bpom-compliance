# TERA V6 — Customer Revision & Midtrans Receipt + AI DevOps Handoff

**Basis:** `Ddos-spec/bpom-compliance` → `master` @ `5a8620eb0bdb69d08447c4a2736025f8c4873169` (26 Oktober 2026).

**Fokus:** sesuai permintaan owner, **poin 1 deployment VPS dilepas dari implementasi saya** dan diserahkan ke AI owner melalui `release/AI_DEVOPS_HANDOFF.md`. Patch ini bukan deployment, tidak melakukan mutasi DNS, kredensial merchant, server, atau GitHub.

## Perubahan yang benar-benar dibuat

- Dashboard user: formulir revisi label bila dan hanya bila staff menandai `revision_requested` dan pembayaran `paid`. Versi usulan tersimpan terpisah dari teks final sampai staf menerima atau menolak.
- Dashboard staf: melihat usulan teks revisi, menerima/menolak dengan catatan (alasan wajib jika ditolak), lalu status dan hasil pemeriksaan otomatis diperbarui bila diterima. Tidak ada keputusan resmi BPOM yang diterbitkan.
- Riwayat versi revisi dapat dilihat pelanggan dan staf.
- Bukti transaksi layanan Tera yang bisa diunduh sebagai HTML siap cetak, diambil dari record transaksi server untuk `paid` atau `refunded`. Dokumen ini **bukan faktur pajak, PNBP atau bukti izin edar BPOM**.
- **Midtrans tetap satu-satunya payment gateway**; backend memverifikasi signature SHA-512 dan dapat reconcile status melalui Status API. Tidak ada gateway lain atau bypass `mark as paid`.
- Kontribusi master terbaru yang bermasalah (token login demo dapat diterima tanpa email proof; dummy status paid tersimpan atau dicoba disimpan dalam database) tidak dipertahankan. Sebagai gantinya, `/demo.html` menampilkan simulasi **read-only** tanpa DB, checkout atau data pengguna.
- Pada deployment serverless Vercel berpenyimpanan sementara, endpoint login/checkout menolak permintaan dan landing/demo tetap ditampilkan. Backend produksi persisten tetap pekerjaan AI owner.

## Implementasi patch

1. Backup repo dan data kamu sendiri. Pastikan `master` berada pada commit yang diverifikasi di atas.
2. Ekstrak ZIP, lalu dari direktori ekstrak jalankan:

```powershell
.\scripts\APPLY_V6.ps1 -RepoPath "D:\repo\bpom-compliance"
```

3. Installer akan backup setiap target sebelum overlay. Ia **tidak** menghapus/menimpa `.env`, `data/`, database, `Dockerfile`, `Caddyfile`, `docker-compose.yml`, atau `vercel.json`, serta **tidak** mem-push commit atau deploy.
4. Setelah pemasangan:

```bash
npm test
python tests/account_ui_isolated.py
python tests/ui_v4_isolated.py
python tests/v6_ui_isolated.py
```

5. Minta AI owner menuntaskan checklist pada `release/AI_DEVOPS_HANDOFF.md` (tugas terpisah). Uji UAT di staging dengan kredensial Midtrans sandbox dan email nyata sebelum memproses pelanggan.

## Endpoint V6

- `POST /api/account/applications/:id/revisions` — sesi email terverifikasi, pemilik ID, harus `paid` dan `revision_requested`; satu revisi tertunda.
- `GET /api/account/applications/:id/receipt` — sesi email terverifikasi dan `paid`/`refunded`; JSON sumber bukti transaksi.
- `PATCH /api/staff/applications/:id/revisions/:revisionId` — bearer admin, harus `paid`, keputusan `accept`/`reject`, idempotensi terhadap keputusan yang sudah tercatat.
- `GET /api/account/applications/:id` / `GET /api/staff/applications/:id` — ditambah `revisions` array dengan ownership.

## Status verifikasi

- `npm test`: 6 kelompok regresi HTTP termasuk V6 (gateway Midtrans **mock**, email **mock**), **PASS**.
- Playwright Chromium terisolasi: account V5 di 320,390,1440px; staff V4 di 320,390,1440px; V6 revision/receipt di 320,390,1440px **PASS**, tanpa horizontal overflow atau page error.
- **Tidak dites:** merchant Midtrans sandbox sungguhan, email Resend asli, real-domain end-to-end, security pentest, full audit WCAG, legal signoff, database upgrade/restore di VPS asli.

## Kebijakan layanan masih harus ditetapkan

Tera belum menerapkan batas harga per revisi, SLA, pajak, otomatisasi refund, dan jaminan legal. Staf hanya dapat meminta revisi pada pengajuan yang sudah dibayar dan laporan dihasilkan kembali **sebagai pemeriksaan awal otomatis**, bukan penilaian hukum atau keputusan izin edar.

**Untuk progres terstruktur lihat** `release/PROGRESS_V5_TO_V6.md`. **Untuk deployment milik AI owner lihat** `release/AI_DEVOPS_HANDOFF.md`.

Untuk menyerahkan poin 1 ke AI coding, tempel isi `release/AI_IMPLEMENTER_PROMPT.md` ke AI kamu; petunjuk teknis lengkap ada pada `release/AI_DEVOPS_HANDOFF.md`.
