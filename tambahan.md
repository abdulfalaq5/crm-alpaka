# Proposal Fitur – Alpaka Loyalty System (Fase 1 Tambahan)

Berikut breakdown teknis untuk 7 fitur yang diminta client, disusun supaya bisa langsung jadi acuan development (sesuai arsitektur yang sudah dipakai di project ini).

## 1. Tier + Progress
**Tujuan:** Member tahu posisi tier-nya dan seberapa jauh lagi ke tier berikutnya.

**Scope:**
- Master data tier (nama, minimum poin/omzet, benefit, urutan level)
- Kalkulasi tier otomatis berdasarkan akumulasi poin/transaksi dalam periode tertentu (perlu didefinisikan: lifetime atau rolling per tahun)
- Endpoint progress: poin saat ini vs threshold tier berikutnya, ditampilkan di member dashboard

**Kebutuhan teknis:**
- Tabel `tiers` (id, nama, min_point, benefit_desc, urutan)
- Tabel `member_tier_history` untuk tracking perubahan tier (audit trail, kapan naik/turun)
- Job/trigger untuk re-evaluasi tier tiap kali poin bertambah (bisa via event setelah approval poin)

**Dependency:** butuh sistem poin sudah jalan (sudah ada dari fase upload struk)

---

## 2. Reward Catalog
**Tujuan:** Customer bisa lihat reward yang bisa ditukar sebelum melakukan redeem.

**Scope:**
- List reward aktif dengan poin required, stok/kuota (kalau ada limit), status (aktif/nonaktif/habis)
- Filter berdasarkan tier (opsional — reward eksklusif tier tertentu)
- Detail reward (deskripsi, syarat, expiry setelah redeem)

**Kebutuhan teknis:**
- Tabel `rewards` (id, nama, deskripsi, point_cost, stok, tier_minimum, status, valid_from, valid_until)
- Endpoint publik/member: `GET /rewards` dan `GET /rewards/:id`

**Dependency:** reward catalog jadi basis untuk voucher management (poin 3) — reward bisa berupa voucher

---

## 3. Voucher Management
**Tujuan:** Generate, tracking status, expiry, dan redemption voucher.

**Scope:**
- Generate voucher (kode unik) saat redeem reward di-approve
- Status voucher: `issued` → `active` → `used`/`expired`
- Expiry otomatis (job scheduler cek voucher lewat masa berlaku)
- History redemption per member

**Kebutuhan teknis:**
- Tabel `vouchers` (id, kode, member_id, reward_id, status, issued_at, expired_at, used_at)
- Generator kode voucher yang unik & tidak predictable (misal prefix + random alfanumerik)
- Endpoint admin: generate manual, cek status, void voucher
- Endpoint member: lihat voucher aktif/history
- Scheduled job (cron) untuk auto-expire

**Dependency:** terhubung langsung ke poin 5 (voucher dipakai di checkout More)

---

## 4. More by Morello Integration (Transaksi → Poin Otomatis)
**Tujuan:** Transaksi Alpaka di platform More otomatis menghasilkan poin, tanpa upload struk manual.

**Scope:**
- Integrasi API/webhook dari sistem More ke sistem loyalty saat transaksi selesai (paid/completed)
- Mapping transaksi ke member (butuh identifier yang sama, misal email/no HP/member ID)
- Kalkulasi poin otomatis sesuai rules yang berlaku (perlu koordinasi point rules dari admin dashboard)
- Handling untuk member yang belum terdaftar di loyalty (auto-register vs reject dan minta registrasi dulu)

**Kebutuhan teknis:**
- Endpoint webhook receiver: `POST /integrations/more/transaction`
- Autentikasi antar sistem (API key/secret atau mutual auth)
- Idempotency handling (mencegah transaksi yang sama diproses dua kali)
- Log integrasi untuk audit & troubleshooting

**Catatan penting:** ini butuh koordinasi teknis dengan tim More by Morello — perlu dipastikan format payload, event trigger, dan SLA delivery webhook dari sisi mereka. bikin default dulu saj untuk suport sistem ini

---

## 5. Voucher Integration (Redeem di Checkout More)
**Tujuan:** Voucher dari loyalty bisa langsung dipakai sebagai diskon saat checkout di More by Morello.

**Scope:**
- Endpoint validasi voucher yang bisa dipanggil sistem More saat checkout
- Response: valid/invalid, nominal/persentase diskon, sisa masa berlaku
- Mark voucher jadi `used` setelah transaksi checkout berhasil (bukan saat validasi awal, untuk menghindari voucher ter-lock kalau checkout gagal)

**Kebutuhan teknis:**
- Endpoint: `POST /integrations/more/voucher/validate` dan `POST /integrations/more/voucher/redeem`
- State management voucher: `reserved` (saat validasi) → `used` (setelah checkout sukses) → auto-release kalau checkout gagal/timeout
- Sinkronisasi dua arah dengan sistem More (perlu API dari sisi More juga untuk konfirmasi transaksi berhasil)

**Dependency:** butuh poin 3 & 4 selesai duluan (voucher & integrasi dasar dengan More)

---

## 6. Admin Dashboard (sistem ini sudah ada, lengkapi yang belum ada fiturnya)
**Tujuan:** Satu tempat untuk kelola seluruh operasional loyalty program.

**Scope modul:**
- **Member management** — list, detail, histori poin & tier, manual adjustment poin
- **Invoice/struk management** — review & approval struk manual (existing flow)
- **Point rules** — CRUD aturan konversi (misal Rp X = Y poin), bisa beda rule per channel
- **Reward management** — CRUD reward, atur stok & tier requirement
- **Voucher management** — monitoring status, void manual, laporan redemption
- **Basic metrics** — total member aktif, total poin beredar, redemption rate, top reward, growth tier per periode

**Kebutuhan teknis:**
- RBAC untuk admin (role: super admin, approver, viewer — sesuaikan kebutuhan client)
- Dashboard metrics bisa pakai query aggregat langsung dulu, tidak perlu data warehouse terpisah di fase ini
- Export data (CSV) untuk laporan ke client jadi nilai tambah kalau ada waktu

---

**Catatan urutan pengerjaan yang disarankan:**
Tier & Progress → Reward Catalog → Voucher Management → Admin Dashboard (paralel dari awal) → Integrasi More (poin otomatis) → Integrasi voucher checkout.