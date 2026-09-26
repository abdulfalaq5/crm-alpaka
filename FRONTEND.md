# Rencana Pengembangan Frontend — Sistem Loyalty Alpaka (Fase 1)

Referensi: *Dokumen Kebutuhan Sistem Loyalty Alpaka — Fase 1* (No. 21/REQ/09/2026, v1.0, ditandatangani).
Referensi visual: [morebymorello.com/collections/alpaka](https://www.morebymorello.com/collections/alpaka)

Ada dua antarmuka terpisah: **Member Portal** (customer-facing) dan **Admin Panel** (internal tim Alpaka).

---

## 0. Design System (Referensi morebymorello.com/collections/alpaka)

> Catatan: warna & font di bawah adalah interpretasi dari gaya visual halaman referensi (deskripsi resmi produk Alpaka: *"minimal and made for urban life, but also durable and versatile"* — nuansa monokrom, galeri produk bersih, banyak whitespace). Situs Shopify tidak mengekspos hex/font secara terbuka lewat teks halaman, jadi sebelum implementasi final, **cek langsung lewat browser inspector** di halaman referensi atau minta brand guideline resmi dari Client untuk kepastian hex code & nama font.

### Palet Warna (usulan, berbasis gaya minimal/monokrom brand)

| Token | Hex (usulan) | Penggunaan |
|---|---|---|
| `--color-bg` | `#FAF9F7` | Latar belakang utama (off-white, bukan putih polos) |
| `--color-surface` | `#FFFFFF` | Card, panel, form |
| `--color-text-primary` | `#171717` | Teks utama (hitam pekat, bukan `#000` polos) |
| `--color-text-secondary` | `#6B6B68` | Teks sekunder/label |
| `--color-border` | `#E4E1DC` | Garis pembatas tipis, divider |
| `--color-accent` | `#171717` | Tombol utama/CTA (monokrom, bukan warna-warni) |
| `--color-accent-contrast` | `#FFFFFF` | Teks di atas tombol accent |
| `--color-success` | `#3F7A56` | Status disetujui/poin masuk |
| `--color-warning` | `#B8862E` | Status menunggu review |
| `--color-danger` | `#B23B3B` | Status ditolak |

### Tipografi

- Font utama: sans-serif grotesque modern — gunakan **Inter** atau **Helvetica Neue** sebagai fallback web-safe (`font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;`), konsisten dengan gaya bersih/minimal brand outdoor-urban.
- Judul (H1/H2): ukuran besar, letter-spacing sedikit rapat, weight 600–700, huruf kapital untuk label section (mis. "REGISTRASI", "RIWAYAT STRUK") — gaya khas e-commerce premium minimal.
- Body text: weight 400, ukuran nyaman dibaca (16px dasar), line-height longgar (1.5–1.6) untuk kesan lapang.

### Prinsip Layout

- Banyak whitespace, elemen tidak berdesak-desakan.
- Border tipis (`1px solid var(--color-border)`) sebagai pemisah, hindari shadow tebal/berlebihan.
- Sudut elemen (card, button, input) sedikit membulat (`border-radius: 4–6px`), bukan pill/rounded penuh — kesan clean, bukan playful.
- Status ditampilkan sebagai badge teks kecil berwarna (success/warning/danger), bukan ikon besar mencolok.
- Gambar produk/bukti struk ditampilkan besar dan jelas, mirip galeri produk di situs referensi.

Implementasikan token di atas sebagai CSS variables di root, agar mudah disesuaikan begitu Client memberi brand guideline resmi.

---

## Bagian A — Member Portal

### A0. Setup

1. Setup project frontend, pasang design token (Bagian 0) sebagai CSS variables global.
2. Buat layout dasar: header (logo Alpaka, nav minimal: Dashboard, Upload Struk, Redeem, Notifikasi, Profil), footer sederhana.
3. Pastikan layout responsif dari awal (mobile-first), karena target device meliputi ponsel & desktop (NFR-08, DSH-05).

### A1. Registrasi & Login (REG)

1. Halaman **Register**: form email/no. HP + data dasar, checkbox persetujuan syarat program (REG-08, OI-15), tombol submit primary (warna `--color-accent`).
2. Tampilkan pesan error inline saat identifier sudah terdaftar → arahkan ke halaman login (sesuai diagram 3.1 dokumen).
3. Halaman **Login**: form identifier + password, link "lupa password" (REG-07), pesan error saat kredensial salah, indikator pembatasan percobaan.
4. Setelah login sukses → redirect ke Dashboard Member.
5. Simpan token/sesi di storage yang aman sisi client, hapus otomatis saat sesi berakhir (selaras dengan REG-05 di backend). Checkbox "ingat saya" memilih `localStorage` (default) atau `sessionStorage`; pergantian hanya saat login, token yang disegarkan tidak memindahkan store.
6. Peringatan "Sesi akan berakhir" (`SessionGuard`): jendela peringatan = 20% masa token, dibatasi 15–120 detik, sehingga `SESSION_IDLE_MINUTES` yang kecil tidak membuat dialog muncul terus-menerus. Aktivitas klik/ketik yang tidak memicu permintaan API akan memperpanjang sesi diam-diam (maks. sekali per 5 menit, header `X-Keepalive`); polling notifikasi memakai `X-Background` sehingga tidak prolong sesi.

### A2. Upload Struk/Invoice (UPL)

1. Halaman **Upload Struk**: form pilih channel (retail/e-commerce) (UPL-01), input nomor transaksi, tanggal, nominal (UPL-03), area upload file (drag-drop + pilih file) dengan preview gambar/ikon PDF.
2. Validasi di sisi client sebelum submit: format file, ukuran maksimal, jumlah file (selaras UPL-04/OI-07) — tampilkan pesan jelas jika tidak sesuai.
3. Setelah submit, tampilkan konfirmasi & arahkan ke halaman status/riwayat.
4. Halaman **Riwayat Struk** (list): tiap item menampilkan tanggal, channel, nominal, status (badge warna sesuai token), poin diperoleh jika ada (DSH-02).
5. Halaman **Detail Struk**: tampilkan data lengkap, file bukti (preview), status, dan alasan penolakan bila ditolak (UPL-07, DSH-04).
6. Jika status `ditolak`, tampilkan tombol **"Ajukan Ulang"** yang membuka form upload dengan data/bukti baru (UPL-07, OI-11).

### A3. Dashboard Member (DSH)

1. Halaman **Dashboard** sebagai landing setelah login: tampilkan saldo poin dalam 3 angka — Total, Ditahan (Hold), Tersedia (DSH-01, PNT-04).
2. Ringkasan aktivitas terbaru (beberapa struk/redeem terakhir) dengan link ke halaman riwayat lengkap.
3. (Disarankan) Tab/halaman **Mutasi Poin** menampilkan histori masuk/hold/terpakai/lepas/koreksi/kembalian secara kronologis (DSH-06).
4. Pastikan seluruh angka dan status konsisten dengan data dari backend (jangan hitung ulang di frontend).
5. Widget **Voucher Aktif** di dashboard: jumlah voucher aktif + kode terbaru (reward & tanggal berlaku) dengan link ke halaman Voucher. Data dari `voucher_aktif` pada `GET /member/dashboard`; disembunyikan saat tidak ada voucher aktif.
6. Tampilan dashboard mengikuti referensi desain editorial "More Rewards Hub" (`morello-member-hub`): sapaan + pil tier, hero banner + kartu poin gelap, panel tier & dompet voucher, "Kurasi untukmu" (3 reward pertama dari `GET /rewards`), dan "Aktivitas terbaru". Satu aksi = satu baris: mutasi `terpakai` digabung dengan `hold` redeem yang sama agar poin keluar tidak terhitung dua kali secara visual.
7. Font halaman memakai Figtree (`@fontsource/figtree`) agar sesuai tipografi desain; kanvas dashboard lebih lebar (`max-width: 1320px`) dan halaman member lain tetap memakai container standar.

### A4. Redeem Poin (RDM)

1. Halaman **Redeem**: tampilkan daftar reward aktif (nama, poin dibutuhkan) dalam bentuk card/list, mengikuti gaya galeri produk referensi (gambar besar, judul jelas, info poin di bawahnya). Tanda pendukung: syarat tier, sisa stok (dengan penanda "menipis" bila ≤ 3), dan masa tampil `Berlaku s/d ...`.
2. Saat memilih reward, tampilkan konfirmasi jumlah poin yang akan di-hold sebelum submit final.
3. Nonaktifkan/disable tombol redeem untuk reward yang poin dibutuhkannya melebihi saldo tersedia member, dengan keterangan jelas.
4. Setelah pengajuan berhasil, tampilkan status **"Menunggu Persetujuan"** dan info bahwa poin sudah di-hold.
5. Halaman **Riwayat Redeem**: list status (Menunggu Persetujuan/Disetujui/Ditolak/Dibatalkan), detail reward diberikan (kode/catatan) jika sudah selesai (RDM-05, DSH-03).
6. (Disarankan) Tombol **Batalkan** pada pengajuan yang masih "Menunggu Persetujuan" (RDM-08, OI-10).
7. Klik nama/gambar reward membuka **drawer detail** (`GET /rewards/:id`): deskripsi lengkap, syarat tier, ketersediaan, masa tampil, masa berlaku voucher setelah redeem, dan alasan terkunci bila tidak bisa ditukar. Katalog dimuat ulang otomatis setiap kali redeem/batal agar angka stok selalu mutakhir.

### A5. Halaman Voucher Member (VCH — tambahan.md poin 3)

1. **Read-only**: halaman **Voucher** menampilkan kartu voucher aktif (kode, reward, sisa hari berlaku) dan riwayat (terpakai/kedaluwarsa/dibatalkan) dengan filter status. Member **tidak** punya aksi tukar/pakai — penukaran tetap lewat checkout More by Morello supaya status `reserved`/`used` hanya bisa berubah dari sisi integrasi.
2. Tombol **salin kode** di tiap voucher aktif, plus countdown "kedaluwarsa dalam N hari" (label "kedaluwarsa besok"/"hari ini" untuk yang mendekati batas).
3. Form **Cek Kode Voucher**: member mengetik kode untuk memastikan vouchernya masih valid; hasil menampilkan kode, reward, status, dan tanggal berlaku. Kode milik member lain atau tidak ada menghasilkan pesan yang sama (satu pesan "tidak ditemukan atau bukan milik Anda") — jangan bedakan di UI karena itu membocorkan keberadaan kode.
4. Kartu ringkasan (total/aktif/terpakai/kedaluwarsa) memakai `meta.ringkasan` dari backend, bukan dihitung ulang di frontend.

### A6. Notifikasi (NTF)

1. Ikon lonceng notifikasi di header dengan badge jumlah belum dibaca.
2. Halaman/dropdown daftar notifikasi: status baru & alasan (jika ditolak) untuk tiap kejadian (struk disetujui/ditolak, redeem diajukan/disetujui/ditolak) (NTF-01, NTF-02, NTF-04).

---

## Bagian B — Admin Panel

### B0. Setup

1. Buat entry point terpisah untuk admin (`/admin/...`), dengan tema visual sama (token Bagian 0) tapi layout khas dashboard: sidebar navigasi (Antrean Struk, Antrean Redeem, Pengaturan Auto-Approve, Reward, Log Audit).
2. Halaman **Login Admin** terpisah dari login member (REG-06).

### B1. Antrean & Review Struk (ADM)

1. Halaman **Antrean Struk**: tabel/list dengan filter (status, channel, tanggal) dan pencarian, plus ringkasan jumlah per status di bagian atas (ADM-01).
2. Halaman **Detail Struk**: tampilkan file bukti (preview besar, bisa zoom), data transaksi, hasil validasi otomatis (termasuk penanda duplikat bila ada), dan data member terkait (ADM-02).
3. Tombol **Setujui** dan **Tolak** — saat Tolak, wajibkan admin mengisi alasan sebelum submit (ADM-03, validasi form wajib).
4. Setelah keputusan diambil, halaman detail berubah jadi read-only (selaras ADM-06).

### B2. Pengaturan Auto-Approve (ADM)

1. Halaman **Pengaturan Auto-Approve**: form untuk mengatur kriteria (channel, batas nominal, dll.) dan toggle aktif/nonaktif (ADM-04, OI-05).
2. Tampilkan status kriteria saat ini dengan jelas, karena ini mempengaruhi banyak struk otomatis.

### B3. Antrean & Review Redeem (RDM)

1. Halaman **Antrean Redeem**: mirip pola antrean struk — list dengan status "Menunggu Persetujuan", filter dasar.
2. Halaman **Detail Redeem**: info member, reward yang diajukan, jumlah poin di-hold.
3. Tombol **Setujui**: setelah disetujui, tampilkan form untuk mencatat detail pemberian reward/voucher (kode/catatan) (RDM-05).
4. Tombol **Tolak**: wajib isi alasan (sama seperti review struk).

### B4. Manajemen Reward (RDM, disarankan)

1. Halaman CRUD sederhana untuk daftar reward: nama, poin dibutuhkan, status aktif/nonaktif (RDM-07, OI-09).

### B5. Manajemen Voucher (VCH — tambahan.md poin 3 & 6)

1. Kartu statistik di atas tabel: total, aktif, terpakai, kedaluwarsa, dibatalkan, dan yang akan habis ≤ 7 hari.
2. **Generate Voucher** (butuh role tulis): pilih member (cari nama/email), pilih reward, jumlah (1–25), masa berlaku (opsional — kosongkan untuk memakai default reward), dan catatan. Setelah sukses tampilkan daftar kode yang bisa disalin.
3. Filter & pencarian tabel: status, sumber (manual/redeem), rentang tanggal terbit, dan pencarian kode/nama member/nama reward. Filter yang sama dipakai saat export CSV.
4. Aksi per baris: **Perpanjang** (jumlah hari + alasan wajib) dan **Void** (alasan wajib, dengan konfirmasi yang menjelaskan akibatnya). Keduanya hanya tampil bila voucher masih `active`, dan status lain `reserved`/`used`/`expired`/`void` menjelaskan kenapa aksi tidak tersedia.
5. **Jalankan pembersihan** (expiry + pelepasan reservasi) tanpa perlu menunggu interval scheduler, untuk kasus yang perlu diperbaiki saat itu juga.
6. Drawer **detail voucher**: kode, member, reward, poin, sumber, masa berlaku, jejak redeem, siapa yang menerbitkan, catatan, dan alasan void bila ada.
7. Tombol **Export CSV** mengikuti filter yang sedang aktif.
8. Aksi tulis disembunyikan untuk `viewer` (tetap ditegakkan server lewat `middleware/adminRole.js`).

### B6. Log Audit (disarankan)

1. Halaman list log: pelaku, aksi, objek, waktu — read-only, tanpa opsi edit/hapus dari UI (ADM-05, BR-12, NFR-06).

### B7. Dashboard Admin (tambahan.md poin 6)

1. Satu layar ringkasan dengan **metrik dasar** (member aktif, poin beredar, struk menunggu review, redemption rate) di strip atas.
2. Satu kartu per domain, semuanya dari `GET /admin/metrics` (tanpa perhitungan ulang di frontend):
   - **Member** — total/aktif/nonaktif/daftar 30 hari + sebaran tier (bar).
   - **Invoice (struk)** — total struk, menunggu review, disetujui, ditolak, plus keputusan 30 hari terakhir.
   - **Point rules** — rupiah per poin, pembulatan, minimal transaksi, jumlah aturan channel.
   - **Reward** — total, aktif, stok habis, khusus tier, masa berlaku terdekat.
   - **Voucher** — jumlah per status (active/reserved/used/expired/void).
   - **Performa** — reward terlaris (redeem selesai) + poin keluar 30 hari.
3. Setiap kartu punya tautan ke halaman pengelolaan terkait (`/admin/member`, `/admin/struk`, `/admin/pengaturan`, `/admin/reward`, `/admin/voucher`, `/admin/redeem`) dan tombol export CSV (member/struk/redeem).
4. Gaya mengikuti language visual Dashboard member (panel putih, kicker uppercase, sudut tajam); halaman `/admin` memakai container lebar, halaman admin lain tetap 1200 px.

---

## Komponen UI Bersama (dipakai di Member Portal & Admin Panel)

- **Status Badge** — komponen kecil dengan warna sesuai token (success/warning/danger) untuk semua status struk & redeem.
- **File Preview** — komponen untuk menampilkan gambar/PDF bukti struk, dipakai di halaman detail struk member maupun admin.
- **Empty State** — tampilan sopan saat belum ada data (belum ada struk/redeem/notifikasi), sesuai gaya minimal referensi (ilustrasi/teks sederhana, bukan ramai).
- **Form Validation Message** — gaya pesan error konsisten di semua form (register, upload, review admin).

---

## Urutan Pengerjaan yang Disarankan

1. Design system & layout dasar (Bagian 0, A0, B0)
2. Member: Registrasi & Login (A1)
3. Member: Upload Struk + Riwayat (A2)
4. Admin: Antrean & Review Struk + Pengaturan Auto-Approve (B1, B2) — agar alur struk bisa diuji end-to-end lebih awal
5. Member: Dashboard saldo poin (A3)
6. Member: Redeem (A4) + Admin: Antrean & Review Redeem (B3)
7. Voucher: Manajemen Voucher admin (B5) + halaman Voucher member (A5)
8. Notifikasi in-app (A6)
9. Manajemen Reward & Log Audit (B4, B6) — opsional/disarankan
10. Review responsif menyeluruh (mobile & desktop) dan uji sesuai **Bagian 9 (Kriteria Penerimaan/UAT)** dokumen requirement.

## Hal yang Perlu Dikonfirmasi Sebelum Desain Final

- Logo, warna, dan font resmi Alpaka (brand guideline) — palet di Bagian 0 masih usulan berbasis pengamatan visual, bukan hex/font resmi dari Client.
- OI-08 (kanal notifikasi) — mempengaruhi apakah perlu halaman pengaturan preferensi notifikasi di sisi member.
- ~~OI-09 (bentuk reward)~~ — sudah diputuskan: reward memakai **gambar per reward** (JPG/PNG/WebP, maks 2 MB, diunggah admin) dengan inisial sebagai cadangan bila gambar kosong.
