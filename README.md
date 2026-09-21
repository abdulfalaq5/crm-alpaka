# Sistem Loyalty Alpaka — Fase 1

Member mengunggah struk/invoice, admin me-review, poin masuk ke saldo, poin ditukar dengan reward (semi-manual).
Rencana lengkap: [BACKEND.md](BACKEND.md) dan [FRONTEND.md](FRONTEND.md).

| Bagian | Teknologi | Port (default, dari `.env`) |
|---|---|---|
| Backend REST API | Node.js, Express, PostgreSQL (`pg`) | `BACKEND_PORT=9721` |
| Frontend | React, Ant Design, Vite | `FRONTEND_PORT=9722` |

## Fitur

- **Member Portal** — registrasi & login, upload struk (JPG/PNG/PDF), riwayat & detail struk, pengajuan ulang struk yang ditolak, dashboard saldo poin (total / ditahan / tersedia) + mutasi poin, redeem reward, notifikasi in-app, profil.
- **Admin Panel** (`/admin`) — antrean & review struk (setujui / tolak + alasan), antrean & review redeem (catat detail pemberian), pengaturan auto-approve, pengaturan program (konversi poin, masa klaim, batas file, channel), manajemen reward, log audit (read-only).
- **Aturan yang ditegakkan di server** — RBAC member/admin, validasi otomatis (kelengkapan, duplikat, tanggal, nominal), poin idempotent (unique constraint), perubahan saldo dalam transaksi atomik dengan row lock, log audit immutable (trigger database), file bukti tidak publik (hanya pemilik & admin), rate limit + penguncian akun setelah 5 kali gagal login, sesi berakhir otomatis bila tidak aktif.

## Menjalankan

Prasyarat: Node.js 20+ dan PostgreSQL.

```bash
cp .env.example .env        # lalu isi DB_*, JWT_SECRET, ADMIN_*  (port juga diatur di sini)

cd backend  && npm install && npm start      # tabel & data awal dibuat otomatis saat start
cd frontend && npm install && npm run dev    # buka http://localhost:9722
```

- Saat start, backend menerapkan migrasi yang belum berjalan (`backend/src/db/migrations/*.sql`, tercatat di tabel `schema_migrations`) lalu menjalankan seeder data referensi (`backend/src/db/seeders/`). Keduanya idempotent dan tidak menimpa pengaturan yang sudah diubah admin.
- Frontend memproksikan `/api` ke backend (`BACKEND_PORT`), jadi tidak ada konfigurasi CORS tambahan saat development.
- **Catatan `.env`:** karakter `#` di nilai tanpa tanda kutip dianggap komentar. Beri tanda kutip bila password mengandung `#`.

## Perintah

```bash
cd backend  && npm test          # unit test logika poin, validasi, auto-approve
cd backend  && npm run migrate   # terapkan migrasi saja
cd backend  && npm run seed      # seeder data referensi (pengaturan, auto-approve, admin awal, contoh reward)
cd backend  && npm run db:setup  # migrate + seed
cd backend  && npm run seed:demo # + data demo: demo@alpaka.local / Demo-Alpaka-2026 (jangan di production)
cd frontend && npm run build     # build produksi ke frontend/dist
```

## Pengujian

- `cd backend && npm test` — unit test logika (poin, validasi, auto-approve). Tidak butuh database.
- **E2E API** (`backend/tests/e2e/api.e2e.mjs`, ±65 skenario: registrasi, RBAC, validasi, duplikat, approve paralel, redeem paralel, saldo, notifikasi, audit). Jalankan di **database sementara**, bukan database yang berisi data Anda:
  ```bash
  createdb db_crm_alpaka_test
  cd backend && DB_NAME=db_crm_alpaka_test BACKEND_PORT=9731 MAIL_HOST= UPLOAD_DIR=uploads_test npm start &
  API_URL=http://localhost:9731 node tests/e2e/api.e2e.mjs
  ```
- **E2E UI** (`frontend/tests/e2e/ui.e2e.mjs`, ±40 langkah di Chrome headless: member, admin, mobile). Butuh `playwright-core` (`npm i --no-save playwright-core`), backend sementara yang sudah `npm run seed:demo`, dan frontend yang diarahkan ke backend itu (`BACKEND_PORT=9731 FRONTEND_PORT=9732 npm run dev`), lalu `APP_URL=http://localhost:9732 node tests/e2e/ui.e2e.mjs`.

## Catatan operasional

- **Email notifikasi (SMTP):** diatur lewat `MAIL_*` di `.env`. Untuk development dipakai **Mailtrap Sandbox** (`sandbox.smtp.mailtrap.io:2525`): email hanya masuk ke inbox sandbox dan tidak pernah sampai ke penerima asli. Kosongkan `MAIL_HOST` untuk mematikan email (notifikasi in-app tetap jalan).
  - Dikirim ke member yang punya email untuk 5 kejadian: struk disetujui/ditolak dan redeem diajukan/disetujui/ditolak. Juga dipakai untuk tautan **lupa password**.
  - Email dikirim setelah transaksi database berhasil (commit), lalu statusnya (`menunggu` → `terkirim`/`gagal`) dicatat di tabel `notifications` dengan kanal `email`. Kegagalan SMTP tidak membatalkan proses bisnis.
  - Mailtrap sandbox membatasi ±1 email/detik, jadi email dikirim berurutan dengan jeda 1,1 detik (`MAIL_INTERVAL_MS`). Akun tanpa email tidak dikirimi email; tautan reset password di development juga dicatat di log server (`[reset-password] ...`).
  - Di production, ganti `MAIL_*` dengan SMTP sebenarnya dan set `APP_URL` ke URL frontend publik. Kanal WhatsApp/SMS dapat ditambahkan di `backend/src/services/notifications.js`.
- **Auto-approve** nonaktif secara default; semua struk masuk antrean manual sampai admin mengaktifkannya.
- **Nilai default item terbuka** (dapat diubah admin di *Pengaturan Program*): masa klaim 30 hari (OI-06), file maks 5 MB × 3 file (OI-07), channel `Retail` & `E-commerce` (OI-03), 1 poin per Rp10.000 dibulatkan ke bawah (OI-04).
- **Production:** set `NODE_ENV=production`, `JWT_SECRET` ≥ 32 karakter, `FORCE_HTTPS=true` di belakang reverse proxy HTTPS, dan jadwalkan backup PostgreSQL + folder `backend/uploads` (NFR-09).

## Migrasi & seeder

- **Migrasi baru:** tambahkan file `backend/src/db/migrations/002_nama.sql` (urut nomor). Jangan mengubah file yang sudah diterapkan.
- **Seeder:** `01_settings` (aturan poin + pengaturan program), `02_auto_approve`, `03_admin` (dari `ADMIN_*` di `.env`), `04_rewards`; `demo_data` (8 member, ±35 struk, redeem, notifikasi, audit, file bukti — semua tabel) hanya jalan dengan `--demo`.

## Data demo untuk presentasi

`npm run seed:demo` (di `backend/`) mengisi **semua tabel** dengan data contoh yang saling konsisten. Seeder ini **tidak boleh dijalankan di production**.

| Tabel | Isi data demo |
|---|---|
| `admins` | 2 (admin dari `.env` + Reviewer Alpaka) |
| `members` | 8 (ada yang hanya email, ada yang hanya no. HP) |
| `receipts` | 35 — 21 disetujui (8 di antaranya auto-approve), 8 menunggu review, 6 ditolak |
| `receipt_files` | 36 file bukti nyata (27 PDF, 9 PNG) di `backend/uploads/` |
| `points_ledger` | 41 entri (masuk, hold, terpakai, lepas) |
| `rewards` | 7 (1 nonaktif) |
| `redeems` | 12 — 4 menunggu, 5 selesai (dengan kode voucher), 1 ditolak, 2 dibatalkan |
| `notifications` | 45 (yang terbaru belum dibaca, agar badge lonceng terisi) |
| `audit_logs` | 99 (keputusan admin, aksi sistem, perubahan pengaturan) |
| `password_resets` | 2 (satu terpakai, satu kedaluwarsa) |
| `auto_approve_criteria`, `app_settings`, `point_rules` | terisi, tercatat diubah oleh admin |

Kasus yang bisa ditunjukkan: struk ditolak lalu diajukan ulang dan disetujui, duplikat nomor transaksi, melewati masa klaim, tanggal di masa depan, poin ditahan (hold), serta redeem di semua status.

### Akun demo

Kata sandi semua akun demo: `Demo-Alpaka-2026`.

| Peran | Login |
|---|---|
| Member (riwayat terlengkap) | `demo@alpaka.local` — saldo: total 275, ditahan 60, tersedia 215 |
| Member lain | `sari.wulandari@example.com`, `budi.santoso@example.com`, `rian.pratama@example.com`, `maya.anggraini@example.com`, `agus.setiawan@example.com`, `nina.kusuma@example.com` |
| Member dengan no. HP saja | `6281234500004` (Dewi) |
| Admin | `admin@alpaka.local` (kata sandi dari `ADMIN_PASSWORD` di `.env`) atau `reviewer@alpaka.local` / `Demo-Alpaka-2026`, login di `/admin/login` |

### Catatan penting saat demo

- **Auto-approve aktif:** seeder demo mengaktifkan auto-approve untuk channel **E-commerce** dengan nominal **≤ Rp500.000**. Struk yang memenuhi kriteria itu langsung disetujui. Untuk menunjukkan antrean review manual, unggah struk dengan channel **Retail**, atau matikan di menu *Pengaturan Auto-Approve*.
- **Menjalankan ulang seeder:** seeder tidak menimpa data yang sudah ada (dilewati bila `demo@alpaka.local` sudah ada). Untuk mengulang dari awal, buat ulang database lalu jalankan `npm run db:setup && npm run seed:demo`. Data tidak bisa di-reset lewat SQL karena audit log sengaja tidak dapat dihapus.
- **File bukti demo** tersimpan di `backend/uploads/`; bila folder itu dihapus, preview struk demo tidak akan tampil.
