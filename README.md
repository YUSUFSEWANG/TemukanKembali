# TemuBalik

Portal barang hilang dan temuan untuk kampus atau institusi. Antarmuka menggunakan React, TypeScript, dan Vite; API memakai Express, validasi Zod, dan SQLite bawaan Node.js.

## Menjalankan lokal

Gunakan Node.js 22.18 atau lebih baru. Jalankan API dan frontend di dua terminal.

Terminal pertama:

```powershell
cd server
npm install
npm run dev
```

Terminal kedua:

```powershell
cd client
npm install
npm run dev
```

Buka http://127.0.0.1:5173. Vite meneruskan permintaan `/api` dan `/uploads` ke API di port 3000.

## Akun dan organisasi

Pilih **Masuk → Daftar institusi** untuk membuat akun. Pendaftar pertama dengan nama institusi tertentu menjadi `organization_admin`; pendaftar berikutnya dengan nama yang sama bergabung sebagai `user`. Kode institusi untuk login berupa nama institusi dalam huruf kecil dengan tanda hubung, misalnya `universitas-nusantara`.

Katalog demo menggunakan tenant `kampus-demo` dan data ilustrasi. Buat institusi baru untuk mencoba dashboard pengelola dan alur laporan milik sendiri.

## Fitur MVP

- Katalog publik dengan pencarian dan filter kategori.
- Akun institusi, sesi cookie `HttpOnly`, hash kata sandi, dan pemisahan data antarorganisasi.
- Laporan barang hilang/temuan dengan foto JPG, PNG, atau WebP hingga 5 MB.
- Dashboard pengguna untuk status laporan dan klaim.
- Dashboard pengelola untuk moderasi laporan, pencocokan berbasis aturan, dan verifikasi klaim.
- QR unik untuk tiap barang temuan, halaman detail hasil pindai, dan riwayat lokasi publik yang aman.
- Riwayat perpindahan barang di dashboard pengelola serta pencatatan serah-terima yang mengubah status menjadi selesai.
- Detail verifikasi disimpan terpisah dan tidak dikirim pada respons katalog publik.

Data SQLite tersimpan di `server/data/`; foto unggahan ada di `server/uploads/`. Keduanya tidak masuk Git.

## API utama

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/items`, `POST /api/reports`, `GET /api/reports/mine`, `POST /api/claims`
- `GET /api/admin/overview`, `GET /api/admin/reports`, `GET /api/admin/matches`, `GET /api/admin/claims`
- `PATCH /api/admin/reports/:id/status`, `PATCH /api/admin/matches/:id`, `PATCH /api/admin/claims/:id/status`
- `POST /api/admin/handovers`

## Pemeriksaan

```powershell
cd server
npm test

cd ..\client
npm run build
npm run lint
```

SQLite pada Node 22 masih menampilkan peringatan bahwa API-nya eksperimental. Untuk deployment produksi, pindahkan database ke PostgreSQL, tambahkan pembatasan laju autentikasi dan undangan anggota, serta gunakan object storage untuk foto. Pengelolaan lokasi terstruktur dan staf belum termasuk MVP ini.