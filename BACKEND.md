# Rencana Pengembangan Backend — Sistem Loyalty Alpaka (Fase 1)

Referensi: *Dokumen Kebutuhan Sistem Loyalty Alpaka — Fase 1* (No. 21/REQ/09/2026, v1.0, ditandatangani).
Kode kebutuhan (REG-xx, UPL-xx, dst.), aturan bisnis (BR-xx), dan item terbuka (OI-xx) mengacu langsung ke dokumen tersebut agar mudah ditelusuri saat development & UAT.

---

## 0. Setup Awal

1. Inisialisasi project backend (REST API) + struktur folder standar (handler/controller, service, repository, model).
2. Setup koneksi database relasional.
3. Buat skema database awal berdasarkan entitas di Bagian 7 dokumen requirement:
   - `members` (id, nama, email, no_hp, password_hash, status_akun, created_at)
   - `admins` (id, nama, email, password_hash, status)
   - `receipts` / struk (id, member_id, channel, nomor_transaksi, tanggal_transaksi, nominal, file_url, status, hasil_validasi, mode_persetujuan, alasan_penolakan, diputuskan_oleh, waktu_keputusan)
   - `auto_approve_criteria` (id, kriteria, aktif, diubah_oleh, updated_at)
   - `points_ledger` (id, member_id, jenis[masuk/hold/terpakai/lepas/koreksi/kembalian], jumlah, referensi_tipe, referensi_id, created_at)
   - `rewards` (id, nama, poin_dibutuhkan, aktif)
   - `redeems` (id, member_id, reward_id, jumlah_poin, status, alasan_penolakan, detail_pemberian, diputuskan_oleh, waktu_keputusan)
   - `notifications` (id, member_id, jenis_kejadian, isi, kanal, status_kirim, created_at)
   - `audit_logs` (id, pelaku_tipe, pelaku_id, aksi, objek_tipe, objek_id, created_at)
4. Setup middleware dasar: HTTPS enforcement, CORS, logging, rate limiter global.
5. Setup autentikasi (JWT atau session) sebagai dasar untuk seluruh modul berikutnya.

**Item terbuka yang perlu dikonfirmasi sebelum lanjut ke Modul 1:** OI-01 (metode autentikasi), OI-13 (jumlah admin & hak akses).

---

## 1. Modul Registrasi & Login (REG)

1. Buat endpoint `POST /auth/register` — terima email/no. HP + data dasar (REG-01).
2. Validasi format email/no. HP dan cek keunikan identifier lintas channel sebelum simpan (REG-02, REG-03).
3. Hash password sebelum disimpan (REG-05); jangan pernah simpan plaintext.
4. Buat endpoint `POST /auth/login` — verifikasi kredensial, terapkan pembatasan jumlah percobaan gagal (REG-04, REG-05).
5. Buat sesi/token dengan waktu kedaluwarsa otomatis saat tidak aktif (REG-05).
6. Buat endpoint terpisah `POST /auth/admin/login` dengan role `admin`, terpisah dari akun member (REG-06).
7. (Disarankan) Buat endpoint pemulihan akses (`POST /auth/forgot-password`, `POST /auth/reset-password`) dan endpoint update profil dasar (REG-07).
8. Tambahkan field persetujuan syarat program saat registrasi, simpan timestamp persetujuan (REG-08, OI-15).
9. Buat middleware otorisasi berbasis role (member vs admin) yang diterapkan di **server**, bukan hanya di frontend (NFR-03).

**Item terbuka:** OI-01 (kata sandi vs OTP), OI-15 (teks kebijakan privasi disediakan Client).

---

## 2. Modul Upload Struk/Invoice (UPL)

1. Buat endpoint `POST /receipts` (multipart) — terima channel, nomor transaksi, tanggal, nominal, dan file bukti (UPL-01, UPL-02, UPL-03).
2. Validasi format file (JPG/PNG/PDF), ukuran maksimal, dan jumlah file per pengajuan; tolak dengan pesan jelas jika tidak sesuai (UPL-04, OI-07).
3. Simpan file dengan nama yang di-generate ulang (bukan nama asli upload) di storage yang hanya bisa diakses pemilik & admin (UPL-05, NFR-02).
4. Set status awal struk (`menunggu_review` sementara, sebelum masuk proses validasi di Modul 3).
5. Buat endpoint `GET /receipts` (list milik member sendiri, dengan status) dan `GET /receipts/:id` (detail) (UPL-06).
6. Sertakan `alasan_penolakan` pada response detail jika status ditolak (UPL-07).
7. Buat endpoint `POST /receipts/:id/resubmit` untuk pengajuan ulang dengan data/bukti baru, mengacu ke struk lama yang ditolak (UPL-07, OI-11, BR-02).

**Item terbuka:** OI-02 (data diisi manual vs OCR/integrasi — Fase 1 = diisi manual), OI-03 (daftar channel resmi), OI-07 (format/ukuran/jumlah file final).

---

## 3. Modul Validasi Transaksi (VAL)

Jalankan sebagai service terpisah yang dipanggil otomatis setelah upload (Modul 2), sebelum status masuk ke antrean admin.

1. Cek kelengkapan data wajib: channel, nomor transaksi, tanggal, nominal (VAL-01).
2. Cek duplikasi: kombinasi `channel + nomor_transaksi` yang sudah berstatus `menunggu_review` atau `disetujui` (dari member manapun) ditolak sebagai duplikat (VAL-02, BR-02). Struk yang pernah `ditolak` boleh diajukan ulang.
3. Cek tanggal transaksi: tidak boleh di masa depan, dan harus dalam batas masa klaim yang dikonfigurasi (VAL-03, OI-06, BR-05).
4. Cek nominal: harus lebih dari nol dan memenuhi batas minimal jika ada (VAL-04, BR-05).
5. Simpan hasil validasi (termasuk penanda duplikat/alasan otomatis) agar bisa dilihat admin saat review (VAL-05).
6. Jika validasi gagal di langkah manapun → set status `ditolak` otomatis dengan alasan tersimpan (wajib tampil ke member, BR-08). Jika lolos semua → lanjut ke Modul 4 (cek auto-approve).

**Item terbuka:** OI-06 (batas hari masa klaim, saat ini placeholder `[___]` hari).

---

## 4. Modul Approval Admin — Struk (ADM)

1. Buat endpoint `GET /admin/receipts` dengan filter (status, channel, tanggal) dan pencarian, plus ringkasan jumlah antrean (ADM-01).
2. Buat endpoint `GET /admin/receipts/:id` — tampilkan file bukti, data transaksi, hasil validasi, dan data member terkait (ADM-02).
3. Sebelum masuk antrean manual, jalankan pengecekan kriteria auto-approve (channel, batas nominal, dsb.) yang dapat dikonfigurasi admin dan diaktifkan/nonaktifkan (ADM-04, OI-05, BR-07). Jika terpenuhi → status langsung `disetujui` otomatis (skip ke Modul 5); jika tidak → status `menunggu_review`.
4. Buat endpoint `POST /admin/receipts/:id/approve` dan `POST /admin/receipts/:id/reject` — alasan **wajib diisi** saat menolak (ADM-03, BR-08).
5. Setelah keputusan dibuat, kunci struk agar tidak bisa diubah lagi dari endpoint approve/reject biasa; siapkan mekanisme koreksi terpisah jika disepakati (ADM-06, OI-12).
6. Catat setiap keputusan (siapa, kapan, keputusan, alasan) ke `audit_logs`, dan pastikan log ini **tidak bisa dihapus/diubah** dari API manapun (ADM-05, BR-12, NFR-06).
7. Setelah `disetujui` (otomatis maupun manual) → trigger pencatatan poin di Modul 5 (idempotent, hanya sekali per struk — lihat PNT-05, BR-03).

**Item terbuka:** OI-05 (kriteria auto-approve final), OI-12 (mekanisme koreksi keputusan keliru).

---

## 5. Modul Poin — Versi Sederhana (PNT)

1. Saat struk berstatus `disetujui`, buat entri `points_ledger` jenis `masuk` sesuai aturan konversi poin yang **dapat dikonfigurasi tanpa ubah kode** (PNT-01, PNT-02, OI-04) — misal tabel `point_rules` (rupiah per poin, pembulatan, minimal transaksi).
2. Pastikan proses pencatatan poin **idempotent**: gunakan constraint unik (mis. `unique(referensi_tipe, referensi_id, jenis='masuk')`) agar klik approve berulang tidak menggandakan poin (PNT-05, BR-03).
3. Hitung saldo dari ledger, jangan simpan sebagai satu angka statis yang gampang tidak sinkron:
   - `total` = jumlah semua `masuk` − `terpakai`
   - `tersedia` = `total` − `ditahan (hold aktif)`
   - `ditahan` = jumlah `hold` yang belum di-`lepas`/`terpakai`
4. Buat endpoint `GET /member/points` — kembalikan total, ditahan, tersedia (PNT-04).
5. Pastikan perubahan poin dieksekusi dalam transaksi database atomik untuk mencegah saldo negatif akibat request bersamaan (NFR-05, BR-09).
6. Kedaluwarsa poin & tier **tidak dikerjakan** di Fase 1 (PNT-06, batasan eksplisit).

**Item terbuka:** OI-04 (aturan konversi poin final).

---

## 6. Modul Redeem Poin Semi-Manual (RDM)

1. Buat model `rewards` sederhana (nama, poin_dibutuhkan, aktif) dan endpoint `GET /rewards` untuk ditampilkan ke member (RDM-07, OI-09).
2. Buat endpoint `POST /redeem` — validasi saldo **tersedia** mencukupi sebelum diproses (RDM-01, BR-09).
3. Jika mencukupi: buat entri `points_ledger` jenis `hold` sejumlah poin redeem, set status `redeems` menjadi `menunggu_persetujuan` (RDM-02, RDM-03). Jalankan dalam transaksi atomik agar dua request redeem bersamaan tidak menembus saldo (RDM-06, BR-09).
4. Jika saldo tidak cukup: tolak dengan pesan jelas, tanpa membuat entri hold (langkah 2 dokumen Bagian 3.4).
5. Buat endpoint `GET /admin/redeems` (antrean) dan `GET /admin/redeems/:id` (detail).
6. Buat endpoint `POST /admin/redeems/:id/approve`:
   - Ubah entri `hold` menjadi `terpakai` (poin resmi terpotong).
   - Simpan detail pemberian reward/voucher (kode, catatan) agar bisa dilihat member (RDM-05).
   - Set status `redeems` → `selesai` (RDM-04, BR-10, BR-11).
7. Buat endpoint `POST /admin/redeems/:id/reject` (alasan wajib):
   - Buat entri `points_ledger` jenis `lepas` yang menetralkan hold (poin kembali ke saldo tersedia).
   - Set status → `ditolak` (RDM-04, BR-10).
8. (Disarankan) Buat endpoint `POST /redeem/:id/cancel` bagi member untuk membatalkan pengajuan yang **belum diproses admin** — sama seperti reject, lepas hold, status → `dibatalkan` (RDM-08, OI-10).
9. Catat semua keputusan approve/reject/cancel ke `audit_logs` (konsisten dengan Modul 4).

**Item terbuka:** OI-09 (bentuk reward & cara pemberian), OI-10 (boleh dibatalkan atau tidak).

---

## 6B. Modul Voucher Management (VCH — tambahan.md poin 3 & 6)

Layanan: `backend/src/services/vouchers.js`. Semua operasi tulis membungkus baris member (`SELECT … FOR UPDATE`) dan baris voucher di dalam transaksi atomik agar request bersamaan tidak membalik status atau	do membakar saldo (NFR-05, BR-09).

1. **Terbit saat approve** — kode `ALP-XXXXXXXX` (prefix tetap + 8 karakter acak dari alphabet tanpa karakter ambigu), `vouchers.sumber = 'redeem'`, masa berlaku dari `rewards.berlaku_hari` (default 30 hari).
2. **Generate manual oleh admin** — `POST /admin/vouchers` (`member_id`, `reward_id`, `jumlah` 1–25, `berlaku_hari` opsional, `catatan` opsional). Voucher manual tetap terikat ke satu redeem (`sumber = 'manual'`, status `selesai`) supaya transaksi poin dan laporan 1:1 — bukan voucher "melayang" tanpa jejak. Pemeriksaan: member aktif, reward ada, saldo **tersedia** cukup, dan stok cukup (bila reward dibatasi).
3. **Potong poin saat generate manual** — dua entri `points_ledger` dalam transaksi yang sama: `hold` lalu `terpakai`. Kedua entri saling meniadakan di `hitungSaldo` (`ditahan = hold − lepas − terpakai`), jadi saldo "ditahan" tetap benar dan tidak pernah negatif karena entri `terpakai` yang tidak punya pasangan `hold`.
4. **Status** — `active` → `reserved` (validasi checkout) → `used` / kembali `active` (reservasi lewat) / `expired` / `void`. Kolom `status` menyimpan status transisi; `status_efektif` dihitung saat baca (`efektifStatus`) supaya voucher yang lewat tanggal langsung tampil `expired` di UI dan laporan meski scheduler belum jalan.
5. **Perpanjang masa berlaku** — `POST /admin/vouchers/:id/extend` (`tambah_hari` 1–365 + `alasan` wajib). Hanya voucher `active`; status lain → 409 `ALREADY_FINAL`. Tercatat di `audit_logs` bersama nilai lama & baru.
6. **Void** — `POST /admin/vouchers/:id/void` (`alasan` wajib). Voucher dari redeem biasa (`sumber = 'redeem'`) hanya pencabutan kode, poin redemption tidak disentuh. Voucher manual additionally: redeem-nya jadi `dibatalkan` dan poin dikembalikan sebagai entri **`kembalian`** (bukan `koreksi` yang justru mengurangi total, dan bukan `masuk` yang akan ikut menaikkan Lifetime Points/tier). Voucher `reserved` boleh di-void (kode bocor saat di keranjang) dan reservasinya dilepas sekalian supaya order di More tidak menggantung.
7. **Laporan & filter** — `GET /admin/vouchers` dengan `status` (satu nilai atau daftar dipisah koma), `sumber`, `q` (kode/nama/email member/nama reward), `from`/`to` (inklusif sampai akhir hari tersebut), plus `meta.ringkasan` untuk kartu statistik. `GET /admin/export/vouchers.csv` memakai filter yang sama dan menulis **status efektif**.
8. **Membersihkan sendiri** — `POST /admin/vouchers/maintenance` untuk menjalankan expiry & pelepasan reservasi saat itu juga; endpoint yang sama dijalankan otomatis oleh scheduler tiap `MAINTENANCE_INTERVAL_MINUTES` (default 10).
9. **Sisi member (baca saja)** — `GET /member/vouchers` (kartu voucher aktif + riwayat, `status` menerima daftar dipisah koma) dan `GET /member/vouchers/cek?kode=…` untuk mengecek kode milik member yang sedang login. Kode milik member lain dijawab 404 `VOUCHER_NOT_FOUND` (identik dengan kode tidak ada) supaya keberadaan kode tidak bocor. Endpoint integrasi More tetap satu-satunya penanda `reserved`/`used` — member tidak bisa menukar vouchernya sendiri.

---

## 7. Modul Notifikasi (NTF)

1. Buat service/event listener yang dipicu otomatis saat status berubah pada 5 kejadian berikut (NTF-01):
   - Struk disetujui
   - Struk ditolak (otomatis maupun admin)
   - Redeem diajukan
   - Redeem disetujui/selesai
   - Redeem ditolak
2. Setiap notifikasi memuat status baru dan alasan (jika ada penolakan) (NTF-02).
3. Simpan setiap notifikasi ke tabel `notifications` (kanal in-app selalu aktif) — kanal tambahan (email/WhatsApp/SMS) hanya dikirim jika akun/API layanan pihak ketiga tersedia dan dikonfigurasi (NTF-03, OI-08). Desain service notifikasi dengan pola *provider terpisah* (in-app, email, WA) agar kanal baru mudah ditambahkan tanpa mengubah logic inti.
4. Buat endpoint `GET /member/notifications` untuk riwayat notifikasi di dalam sistem (NTF-04, disarankan).
5. Catatan biaya: biaya penggunaan layanan notifikasi pihak ketiga (mis. WhatsApp API) **bukan tanggungan Developer** (NTF-05) — pastikan sistem tetap berfungsi normal (notifikasi in-app) walau kanal eksternal belum/tidak diaktifkan Client.

**Item terbuka:** OI-08 (kanal notifikasi final & penyedia layanan).

---

## 8. Endpoint Pendukung Dashboard Member (DSH)

1. `GET /member/dashboard` — ringkasan saldo poin (total/ditahan/tersedia).
2. `GET /member/receipts` — riwayat upload struk (tanggal, channel, nominal, status, poin diperoleh) (DSH-02).
3. `GET /member/redeems` — riwayat redeem beserta status (DSH-03).
4. `GET /member/points/mutations` — mutasi poin dari `points_ledger` (masuk/hold/terpakai/lepas/koreksi/kembalian) untuk ditampilkan sebagai riwayat detail (DSH-06, disarankan).
5. Pastikan setiap response mendukung detail on-demand (bukan hanya ringkasan) agar frontend bisa menampilkan detail item riwayat termasuk alasan penolakan (DSH-04).
6. `GET /member/vouchers` — kartu voucher aktif + riwayat, dengan `meta.ringkasan` (total/aktif/dipesan/terpakai/kedaluwarsa/dibatalkan/akan kedaluwarsa ≤ 7 hari). Ringkasan menghitung **hanya** voucher member tersebut — query yang sama dipakai admin dipanggil dengan `memberId` agar data global tidak bocor.
7. `GET /member/vouchers/cek?kode=…` — cek kode voucher milik sendiri.

---

## Non-Fungsional yang Wajib Diterapkan di Level Backend

| Kebutuhan | Implementasi |
|---|---|
| NFR-01 Keamanan akses | HTTPS wajib, hash password, sesi otomatis berakhir, rate limit login |
| NFR-02 Keamanan file | Validasi tipe/ukuran, rename file saat simpan, akses file dibatasi pemilik + admin |
| NFR-03 Hak akses | RBAC ditegakkan di middleware server, bukan hanya UI |
| NFR-05 Integritas data | Semua perubahan poin dalam transaksi atomik (DB transaction + row lock/constraint) |
| NFR-06 Audit | `audit_logs` immutable, tidak ada endpoint update/delete untuk log |
| NFR-09 Cadangan data | Jadwalkan backup berkala sesuai hosting yang dipilih (OI-14) |

---

## Urutan Pengerjaan yang Disarankan

1. Setup project + skema database (Bagian 0)
2. Modul 1 — Registrasi & Login
3. Modul 2 + 3 — Upload Struk & Validasi (satu alur)
4. Modul 4 — Approval Admin Struk
5. Modul 5 — Poin (ledger)
6. Modul 6 — Redeem (hold → approve/reject)
7. Modul 7 — Notifikasi
8. Modul 8 — Endpoint dashboard
9. Testing menyeluruh mengacu ke **Bagian 9 (Kriteria Penerimaan/UAT)** dokumen requirement sebelum serah terima.

## Item Terbuka (OI) yang Perlu Dikonfirmasi Sebelum Fitur Terkait Final-Dikembangkan

OI-01, OI-02, OI-03, OI-04, OI-05, OI-06, OI-07, OI-08, OI-09, OI-10, OI-11, OI-12, OI-13, OI-14, OI-15 — lihat Bagian 10 dokumen requirement untuk daftar lengkap dan usulan sementara. Modul yang bergantung pada tiap item ditandai di atas.
