# Tera: pemeriksaan label pangan olahan

Alat bantu petugas Disperindag dan UMKM untuk memeriksa label produk terhadap 9 keterangan wajib
(Peraturan BPOM 31/2018 Pasal 5 ayat 1, diubah 20/2021). Frontend tanpa dependensi npm.

## Jalankan
```
node server.mjs          # http://localhost:4173   (atau: npm start)
```
Mode AI (OpenRouter): salin `.env.example` jadi `.env`, isi `OPENROUTER_API_KEY` dan `OPENROUTER_MODEL`.
Tanpa itu aplikasi tetap jalan memakai mesin aturan saja. Frontend juga tetap jalan tanpa server sama sekali.

## Verifikasi end-to-end (jalur untuk AI maupun manusia)
```
node server.mjs &        # server harus hidup
node e2e/run.cjs         # atau: npm run e2e
```
Menjalankan 54 pemeriksaan di Chromium (desktop 1440 dan mobile 390): antrean, cari, urut, detail, edit teks,
NIE, catatan, perubahan tahap, form baru, upload foto, ekspor/reset, drawer mobile, error console, overflow.
Screenshot tiap layar tersimpan di `.e2e/shots/*.png` supaya hasil visualnya bisa dilihat langsung.
Pemeriksaan desain: `node _refs/taste-skill/skills/taste-skill/scripts/inspect.mjs --app http://localhost:4173/`.
Playwright dipakai dari `D:\code\.system_tools\browser_runner` (tidak di-install ulang di proyek ini).

## Arsitektur
- `public/rules.js`: mesin aturan deterministik, dipakai browser dan server.
- `public/api.js`: adapter. Coba backend dulu, jatuh ke mesin lokal bila tidak ada. Kontrak API ada di kepala file.
- `public/store.js`: penyimpanan sementara di `localStorage`. Diganti DB saat backend jadi.
- `server.mjs`: server sementara (statik + `/api/analyze` ke OpenRouter). Kunci hanya di server.

## Rencana backend Rust (belum dikerjakan)
axum + tokio, `rusqlite` (bundled) untuk data, `reqwest` (rustls) ke OpenRouter, file statis disajikan dari binary yang sama.
Satu binary statis, target RAM puluhan MB. Kontrak API sama dengan `public/api.js`, jadi frontend tidak diubah.
Build wajib lewat GitHub Actions (musl, release), bukan di laptop. Cek nomor izin edar: port logika `suryast/indonesia-civic-stack`.

## Belum selesai / harus diganti
- `public/data.js`: SEMUA data contoh fiktif (usaha, alamat, nomor MD).
- Nomor izin edar baru dicek formatnya, belum ke BPOM (`/api/nie` belum ada).
- Nomor pasal belum dicocokkan dengan naskah resmi pom.go.id.
- AI OpenRouter belum pernah diuji (belum ada API key dan model).
- Belum ada: login, DB di server, OCR tanpa AI, kosmetik/obat tradisional.
