# Sistem Loyalty Alpaka — Fase 1

Member mengunggah struk/invoice, admin me-review, poin masuk ke saldo, poin ditukar dengan reward (semi-manual).
Rencana lengkap: [BACKEND.md](BACKEND.md) dan [FRONTEND.md](FRONTEND.md).

| Bagian | Teknologi | Port (default, dari `.env`) |
|---|---|---|
| Backend REST API | Node.js, Express, PostgreSQL (`pg`) | `BACKEND_PORT=9721` |
| Frontend | React, Ant Design, Vite | `FRONTEND_PORT=9722` |

## Fitur

- **Member Portal** — registrasi & login, upload struk (JPG/PNG/PDF), riwayat & detail struk, pengajuan ulang struk yang ditolak, dashboard saldo poin (total / ditahan / tersedia) + mutasi poin, **tier & progress**, redeem reward (filter tier & stok), **voucher** (kode, masa berlaku, countdown, salin kode, cek kode, riwayat), notifikasi in-app, profil (+ preferensi kanal notifikasi).
- **Admin Panel** (`/admin`) — dashboard metrik, antrean & review struk (setujui / tolak / **koreksi keputusan** + alasan), antrean & review redeem, pengaturan auto-approve, pengaturan program (konversi poin, masa klaim, batas file, channel, **aturan poin per channel**), manajemen reward (+ stok, tier minimum, masa berlaku, gambar), **manajemen tier**, **manajemen voucher** (generate manual & batch, filter, perpanjang masa berlaku, void, export CSV, jalankan pembersihan expiry/reservasi), manajemen member (aktif/nonaktif, **penyesuaian poin manual**), kelola admin (**RBAC**: super_admin/approver/viewer), export CSV, log audit (read-only).
- **Integrasi More by Morello** (`/api/integrations/more/*`) — webhook transaksi → poin otomatis, validasi & konfirmasi voucher saat checkout. Autentikasi API key, idempotent, tercatat di log integrasi. Lihat [Integrasi More by Morello](#integrasi-more-by-morello).
- **Aturan yang ditegakkan di server** — RBAC member/admin (3 peran), validasi otomatis (kelengkapan, duplikat, tanggal, nominal), poin idempotent (unique constraint), perubahan saldo dalam transaksi atomik dengan row lock, log audit immutable (trigger database), file bukti tidak publik (hanya pemilik & admin), rate limit + penguncian akun setelah 5 kali gagal login, sesi berakhir otomatis bila tidak aktif dan dicabut seketika saat nonaktif/ganti password.

## Dokumentasi API (Swagger)

Setelah backend berjalan buka **http://localhost:9721/api/docs** (juga lewat frontend: http://localhost:9722/api/docs). Spesifikasi mentah OpenAPI 3: `/api/docs.json`.

1. Panggil `POST /auth/login` (member) atau `POST /auth/admin/login` (admin) → salin `token`.
2. Klik **Authorize**, tempel token (tanpa kata "Bearer"), lalu coba endpoint lewat **Try it out**.

- Spesifikasi ada di `backend/src/docs/openapi.js` (55 endpoint, dikelompokkan per Member/Admin). Bila menambah/mengubah route, perbarui file itu — `npm test` akan gagal bila ada route yang belum terdokumentasi atau dokumentasi yang sudah usang.
- Default **aktif di development, nonaktif di production**. Ubah dengan `SWAGGER_ENABLED=true|false` di `.env`.

## Menjalankan

Prasyarat: Node.js 20+ dan PostgreSQL.

```bash
cp .env.example .env        # lalu isi DB_*, JWT_SECRET, ADMIN_*  (port juga diatur di sini)

cd backend  && npm install && npm start      # tabel & data awal dibuat otomatis saat start
cd frontend && npm install && npm run dev    # buka http://localhost:9722
```

- Saat start, backend menerapkan migrasi yang belum berjalan (`backend/src/db/migrations/*.sql`, tercatat di tabel `schema_migrations`) lalu menjalankan seeder data referensi (`backend/src/db/seeders/`). Keduanya idempotent dan tidak menimpa pengaturan yang sudah diubah admin.
- Frontend memproksikan `/api` ke backend (`BACKEND_PORT`), jadi tidak ada konfigurasi CORS tambahan saat development.
- **Halaman putih di browser setelah `npm install`/upgrade?** Dev server yang masih berjalan memakai versi lama. Hentikan lalu jalankan ulang `npm run dev`, dan hard-refresh browser (Ctrl+Shift+R).
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

- `cd backend && npm test` — unit test logika (poin, saldo, validasi, auto-approve) + kecocokan dokumentasi Swagger dengan route. Tidak butuh database.
- **Jalankan tes e2e HANYA di stack sementara**, tidak pernah di sistem utama (9721/9722): tes membuat, menyetujui, dan menolak data. Skrip menolak berjalan tanpa target eksplisit dan menolak port sistem utama.

  ```bash
  # 1) database & backend sementara (port 9731), email nonaktif agar inbox tidak terbanjiri
  createdb db_crm_alpaka_test
  cd backend && export MAIL_HOST= LOGIN_RATE_LIMIT=1000 RATE_LIMIT_PER_MIN=5000 DB_NAME=db_crm_alpaka_test UPLOAD_DIR=uploads_test LOG_DIR=logs_test BACKEND_PORT=9731
  npm run db:setup && npm run seed:demo && npm start &

  # 2) E2E API (~115 skenario). Untuk tes API pakai database KOSONG (tanpa seed:demo)
  API_URL=http://localhost:9731 node tests/e2e/api.e2e.mjs

  # 3) E2E UI (~55 langkah di Chrome headless: member, admin, layar HP 375 px)
  cd ../frontend && BACKEND_PORT=9731 FRONTEND_PORT=9732 npm run dev &
  npm i --no-save playwright-core
  APP_URL=http://localhost:9732 node tests/e2e/ui.e2e.mjs
  ```
  Setelah selesai: hentikan proses uji, `dropdb db_crm_alpaka_test`, hapus `backend/uploads_test` dan `backend/logs_test`.

## Tier, Voucher & RBAC

- **Tier** dievaluasi otomatis dari **total poin lifetime** (poin masuk dikurangi koreksi — **tidak** berkurang saat redeem) setiap kali poin bertambah. Default: Bronze (0) / Silver (100) / Gold (300) / Platinum (800), poin dan nama dapat diubah admin di menu **Tier**. Riwayat naik/turun tercatat di `member_tier_history`.
- **Voucher** diterbitkan otomatis (kode `ALP-XXXXXXXX`) saat admin menyetujui redeem, dengan masa berlaku per reward (`berlaku_hari`, default 30 hari). Status: `active` → `reserved` (saat validasi checkout) → `used` / kembali `active` (reservasi lewat waktu) / `expired` / `void` (dibatalkan admin). Reservasi dan voucher kedaluwarsa dibersihkan otomatis setiap `MAINTENANCE_INTERVAL_MINUTES` menit (default 10).
- **Voucher dari halaman Voucher (menu admin `/admin/voucher`)** — generate manual untuk member (satu atau sekaligus sampai 25 kode, masa berlaku opsional, catatan opsional). Voucher manual tetap terikat ke satu redeem `sumber='manual'` supaya laporan redemption tetap 1:1, dan **poin member dipotong saat generate** (entri `hold` + `terpakai`). Void mengembalikan poin tersebut sebagai entri `kembalian`; void voucher yang berasal dari redeem biasa hanya mencabut kode. **Perpanjang** menambah masa berlaku (alasan wajib) dan hanya untuk voucher `active`. Tabel mendukung filter status (bisa beberapa sekaligus), sumber, rentang tanggal terbit, dan pencarian kode/nama member/nama reward; filter yang sama berlaku untuk **Export CSV**, dan tombol **Jalankan Pembersihan** menjalankan expiry + pelepasan reservasi di luar jadwal scheduler.
- **Halaman Voucher member (`/voucher`)** hanya read-only: kartu voucher aktif dengan sisa hari berlaku, tombol salin kode, form cek kode, riwayat, dan ringkasan. Penukaran voucher tetap lewat checkout More by Morello (status `reserved`/`used` hanya boleh diubah dari integrasi), dan kode milik member lain dijawab 404 yang sama dengan kode tidak ada supaya keberadaan kode tidak bocor.
- **Katalog reward untuk customer** — halaman Redeem menampilkan reward yang sedang tersedia (gambar, deskripsi, poin, syarat tier, sisa stok, masa tampil) dengan tombol tukar yang otomatis nonaktif bila poin kurang atau tier belum memenuhi, disertai alasannya. Klik kartu untuk membuka detail reward (syarat & masa berlaku voucher setelah redeem). Reward stok habis atau di luar masa tampil tidak lagi tampil; reward eksklusif tier tetap tampil dengan keterangan.
- **RBAC admin** — `super_admin` (semua akses termasuk pengaturan & kelola admin), `approver` (operasional: review struk/redeem, kelola reward/voucher/member, tanpa akses pengaturan sistem), `viewer` (hanya baca). Admin baru dari menu **Kelola Admin** default `viewer`; atur perannya dari halaman yang sama. Server menegakkan lewat `middleware/adminRole.js`; UI menyembunyikan aksi yang tidak berhak, tapi tidak menggantikan penegakan server.
- **Penyesuaian poin manual** (menu **Member** → Sesuaikan Poin) mencatat ke `point_adjustments` + `points_ledger` dan ikut memicu evaluasi ulang tier. Pengurangan ditolak bila melebihi saldo tersedia.

## Integrasi More by Morello

Implementasi **default** (tambahan.md poin 4 & 5) agar sistem langsung dapat menerima transaksi tanpa menunggu kontrak API resmi dari tim More — sesuaikan payload di `backend/src/routes/integrations.js` begitu spesifikasi mereka dikonfirmasi.

- **Aktivasi:** isi `MORE_API_KEY` di `.env` (kosong = seluruh endpoint `/api/integrations/more/*` menolak dengan 403). Autentikasi lewat header `X-Api-Key`, dibandingkan dengan `timingSafeEqual`.
- **`POST /api/integrations/more/transaction`** — transaksi selesai di More langsung dicatat sebagai struk `disetujui` (tanpa antre review, tanpa file bukti) dan poin diberikan otomatis. `external_id` dipakai sebagai idempotency key: request dengan `external_id` yang sama tidak diproses dua kali (aman terhadap retry webhook). Member dicari lewat `email`/`no_hp`; **member yang belum terdaftar ditolak secara default** (422 `MEMBER_NOT_FOUND`) — OI terbuka, ubah lewat `MORE_AUTO_REGISTER` bila Client memutuskan auto-register.
- **`POST /api/integrations/more/voucher/validate`** — memvalidasi kode voucher saat checkout dan mereservasinya (`MORE_VOUCHER_RESERVE_MINUTES` menit, default 15) agar tidak terpakai dua kali.
- **`POST /api/integrations/more/voucher/redeem`** — dipanggil setelah checkout sukses untuk menandai voucher `used`. Bila checkout gagal, jangan panggil endpoint ini — reservasi otomatis lepas kembali setelah waktu reservasi habis.
- Semua request (berhasil maupun gagal) tercatat di tabel `integration_logs`, dapat dilihat admin di menu **Log Audit** → API `/admin/integration-logs`, untuk audit & troubleshooting.
- Detail lengkap tiap endpoint (payload, response, kode error) ada di Swagger (`/api/docs`, tag **Integrasi More**).

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

- **Migrasi baru:** tambahkan file `backend/src/db/migrations/00N_nama.sql` (urut nomor). Jangan mengubah file yang sudah diterapkan. Terakhir: `005_voucher_manual.sql` (sumber/dibuat_oleh/catatan voucher & redeem) dan `006_ledger_kembalian.sql` (jenis ledger `kembalian` untuk pengembalian poin saat voucher manual di-void).
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
| `vouchers` | terbit dari redeem yang disetujui (kode `ALP-…`) |
| `rewards` | 7 (1 nonaktif) |
| `redeems` | 12 — 4 menunggu, 5 selesai (dengan kode voucher), 1 ditolak, 2 dibatalkan |
| `notifications` | 45 (yang terbaru belum dibaca, agar badge lonceng terisi) |
| `audit_logs` | 99 (keputusan admin, aksi sistem, perubahan pengaturan) |
| `password_resets` | 2 (satu terpakai, satu kedaluwarsa) |
| `auto_approve_criteria`, `app_settings`, `point_rules` | terisi, tercatat diubah oleh admin |

Kasus yang bisa ditunjukkan: struk ditolak lalu diajukan ulang dan disetujui, duplikat nomor transaksi, melewati masa klaim, tanggal di masa depan, poin ditahan (hold), redeem di semua status, generate voucher manual (+ potong poin), perpanjang masa berlaku, void + kembalian poin, serta alur reservasi/pakai kode di checkout More.

### Akun dari seeder (email & kata sandi)

> Hanya untuk development/demo. **Ganti semua kata sandi ini (dan jangan jalankan `seed:demo`) di production.**

**Admin** — login di `/admin/login` (http://localhost:9722/admin/login)

| Nama | Email | Kata sandi | Dibuat oleh |
|---|---|---|---|
| Administrator Alpaka | `admin@alpaka.local` | `Admin-Alpaka-2026` | seeder dasar `03_admin` — nilai dari `ADMIN_EMAIL` / `ADMIN_PASSWORD` di `.env` (bila `.env` diubah sebelum seeding pertama, pakai nilai di `.env`) |
| Reviewer Alpaka | `reviewer@alpaka.local` | `Demo-Alpaka-2026` | `seed:demo` |

**Member** — login di `/masuk` (http://localhost:9722/masuk). Kata sandi semua member demo: `Demo-Alpaka-2026`

| Nama | Login (email / no. HP) | Kata sandi | Keterangan |
|---|---|---|---|
| Member Demo | `demo@alpaka.local` | `Demo-Alpaka-2026` | Akun utama untuk presentasi: riwayat terlengkap. Saldo: total 275, ditahan 60, tersedia 215 |
| Sari Wulandari | `sari.wulandari@example.com` | `Demo-Alpaka-2026` | |
| Budi Santoso | `budi.santoso@example.com` | `Demo-Alpaka-2026` | |
| Dewi Lestari | `6281234500004` (no. HP, tanpa email) | `Demo-Alpaka-2026` | Login pakai nomor HP; format `0812...` atau `+62812...` juga diterima |
| Rian Pratama | `rian.pratama@example.com` | `Demo-Alpaka-2026` | Poin 250 sedang ditahan untuk redeem |
| Maya Anggraini | `maya.anggraini@example.com` | `Demo-Alpaka-2026` | |
| Agus Setiawan | `agus.setiawan@example.com` | `Demo-Alpaka-2026` | |
| Nina Kusuma | `nina.kusuma@example.com` | `Demo-Alpaka-2026` | Member baru |

Akun member baru dapat dibuat lewat halaman registrasi (`/daftar`); admin baru lewat menu **Kelola Admin**.

### Catatan penting saat demo

- **Auto-approve aktif:** seeder demo mengaktifkan auto-approve untuk channel **E-commerce** dengan nominal **≤ Rp500.000**. Struk yang memenuhi kriteria itu langsung disetujui. Untuk menunjukkan antrean review manual, unggah struk dengan channel **Retail**, atau matikan di menu *Pengaturan Auto-Approve*.
- **Menjalankan ulang seeder:** seeder tidak menimpa data yang sudah ada (dilewati bila `demo@alpaka.local` sudah ada). Untuk mengulang dari awal, buat ulang database lalu jalankan `npm run db:setup && npm run seed:demo`. Data tidak bisa di-reset lewat SQL karena audit log sengaja tidak dapat dihapus.
- **File bukti demo** tersimpan di `backend/uploads/`; bila folder itu dihapus, preview struk demo tidak akan tampil.
