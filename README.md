# Tera: pemeriksaan label pangan olahan

Alat bantu petugas Disperindag dan UMKM untuk memeriksa label produk terhadap 9 keterangan wajib
(Peraturan BPOM 31/2018 Pasal 5 ayat 1, diubah 20/2021). Tanpa dependensi npm.

## Jalankan
```
node server.mjs          # http://localhost:4173
```
Mode AI (OpenRouter): salin `.env.example` jadi `.env`, isi `OPENROUTER_API_KEY` dan `OPENROUTER_MODEL`.
Tanpa itu aplikasi tetap jalan memakai mesin aturan saja. Kunci hanya dipakai di server.

## Cara kerja
- `public/rules.js`: mesin aturan deterministik (ada atau tidaknya keterangan di teks). Dipakai browser dan server.
- `server.mjs` `/api/analyze`: aturan dulu, lalu (bila AI aktif) LLM meninjau klaim dan hal yang lolos aturan. LLM dilarang mengarang pasal.
- Keputusan akhir tetap di petugas. Tidak ada tombol "otomatis lolos".

## Belum selesai / harus diganti
- `public/data.js`: SEMUA data contoh fiktif (usaha, alamat, nomor MD).
- Nomor izin edar baru dicek formatnya, belum ke cekbpom (kandidat: `suryast/indonesia-civic-stack`, MIT).
- Nomor pasal belum dicocokkan dengan naskah resmi pom.go.id.
- Belum ada: login, penyimpanan server (sekarang `localStorage`), OCR foto tanpa AI, kosmetik/obat tradisional.
- Model OpenRouter belum diuji (belum ada API key).

## Desain
Sheet `framed-sheet` dari taste-skill (`DESIGN_SHEET.md`). Diperiksa dengan `inspect.mjs --app` di 1440/768/390: 0 FAIL, 0 WARN.
