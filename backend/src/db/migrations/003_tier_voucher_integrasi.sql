-- 003: Tier & Progress, Reward Catalog lanjutan, Voucher Management, Integrasi More by Morello,
-- RBAC admin, aturan poin per channel. Lihat tambahan.md untuk latar belakang fitur.

-- ---------------------------------------------------------------- 1. Tier & Progress
CREATE TABLE IF NOT EXISTS tiers (
  id          BIGSERIAL PRIMARY KEY,
  nama        VARCHAR(60) NOT NULL,
  urutan      INT NOT NULL UNIQUE,
  min_poin    INT NOT NULL DEFAULT 0 CHECK (min_poin >= 0),
  benefit     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE members ADD COLUMN IF NOT EXISTS current_tier_id BIGINT REFERENCES tiers (id);

-- Riwayat perubahan tier (naik/turun), termasuk penyebabnya, untuk audit trail (poin 1: dependency evaluasi ulang).
CREATE TABLE IF NOT EXISTS member_tier_history (
  id          BIGSERIAL PRIMARY KEY,
  member_id   BIGINT NOT NULL REFERENCES members (id),
  dari_tier_id BIGINT REFERENCES tiers (id),
  ke_tier_id  BIGINT REFERENCES tiers (id),
  sebab       VARCHAR(20) NOT NULL DEFAULT 'otomatis' CHECK (sebab IN ('otomatis', 'manual')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_tier_history_member_idx ON member_tier_history (member_id, created_at DESC);

-- ---------------------------------------------------------------- 2. Reward Catalog lanjutan
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS stok INT CHECK (stok IS NULL OR stok >= 0); -- NULL = tanpa batas
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS tier_minimum_id BIGINT REFERENCES tiers (id);
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS valid_from DATE;
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS valid_until DATE;
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS berlaku_hari INT NOT NULL DEFAULT 30 CHECK (berlaku_hari > 0); -- masa berlaku voucher setelah diterbitkan

-- ---------------------------------------------------------------- 3. Voucher Management
CREATE TABLE IF NOT EXISTS vouchers (
  id                 BIGSERIAL PRIMARY KEY,
  kode               VARCHAR(24) NOT NULL,
  member_id          BIGINT NOT NULL REFERENCES members (id),
  reward_id          BIGINT NOT NULL REFERENCES rewards (id),
  redeem_id          BIGINT NOT NULL REFERENCES redeems (id),
  status             VARCHAR(10) NOT NULL CHECK (status IN ('active', 'reserved', 'used', 'expired', 'void')),
  issued_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ NOT NULL,
  reserved_at        TIMESTAMPTZ,
  reserved_until     TIMESTAMPTZ,
  reserved_order_id  VARCHAR(80),
  used_at            TIMESTAMPTZ,
  used_order_id      VARCHAR(80),
  voided_at          TIMESTAMPTZ,
  void_reason        TEXT,
  voided_oleh        BIGINT REFERENCES admins (id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vouchers_kode_uq ON vouchers (kode);
CREATE UNIQUE INDEX IF NOT EXISTS vouchers_redeem_uq ON vouchers (redeem_id); -- satu voucher per redeem
CREATE INDEX IF NOT EXISTS vouchers_member_idx ON vouchers (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vouchers_status_idx ON vouchers (status);

-- ---------------------------------------------------------------- 4/5. Integrasi More by Morello
-- Log setiap request masuk/keluar integrasi untuk audit & troubleshooting (poin 4).
CREATE TABLE IF NOT EXISTS integration_logs (
  id           BIGSERIAL PRIMARY KEY,
  integrasi    VARCHAR(30) NOT NULL DEFAULT 'more',
  arah         VARCHAR(10) NOT NULL CHECK (arah IN ('masuk', 'keluar')),
  endpoint     VARCHAR(80) NOT NULL,
  request_id   VARCHAR(120),
  status_kode  INT,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  hasil        JSONB NOT NULL DEFAULT '{}'::jsonb,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Idempotency: request_id (external_id transaksi / kode voucher+aksi) yang sama tidak diproses dua kali.
CREATE UNIQUE INDEX IF NOT EXISTS integration_logs_idem_uq ON integration_logs (integrasi, endpoint, request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS integration_logs_created_idx ON integration_logs (created_at DESC);

-- Aturan konversi poin per channel (opsional): bila ada baris untuk sebuah channel, dipakai menggantikan
-- aturan global (point_rules) untuk struk/transaksi channel tersebut (Admin Dashboard poin 6).
CREATE TABLE IF NOT EXISTS channel_point_rules (
  channel           VARCHAR(60) PRIMARY KEY,
  rupiah_per_poin   INT NOT NULL CHECK (rupiah_per_poin > 0),
  pembulatan        VARCHAR(10) NOT NULL DEFAULT 'bawah' CHECK (pembulatan IN ('bawah', 'atas', 'terdekat')),
  minimal_transaksi NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (minimal_transaksi >= 0),
  diubah_oleh       BIGINT REFERENCES admins (id),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- 6. RBAC admin + penyesuaian audit poin
ALTER TABLE admins ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'super_admin'
  CHECK (role IN ('super_admin', 'approver', 'viewer'));

-- Referensi 'manual' (penyesuaian poin oleh admin) ditambahkan ke daftar referensi_tipe yang valid.
ALTER TABLE points_ledger DROP CONSTRAINT IF EXISTS points_ledger_jenis_check;
ALTER TABLE points_ledger ADD CONSTRAINT points_ledger_jenis_check
  CHECK (jenis IN ('masuk', 'hold', 'terpakai', 'lepas', 'koreksi'));
ALTER TABLE points_ledger DROP CONSTRAINT IF EXISTS points_ledger_referensi_tipe_check;
ALTER TABLE points_ledger ADD CONSTRAINT points_ledger_referensi_tipe_check
  CHECK (referensi_tipe IN ('receipt', 'redeem', 'koreksi', 'manual'));

-- Penyesuaian poin manual oleh admin (RDM/Admin Dashboard poin 6: "manual adjustment poin").
CREATE TABLE IF NOT EXISTS point_adjustments (
  id          BIGSERIAL PRIMARY KEY,
  member_id   BIGINT NOT NULL REFERENCES members (id),
  jumlah      INT NOT NULL, -- boleh negatif (pengurangan)
  alasan      TEXT NOT NULL,
  dibuat_oleh BIGINT NOT NULL REFERENCES admins (id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Struk dari integrasi otomatis (bukan upload manual member) tidak perlu file bukti.
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS sumber VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (sumber IN ('manual', 'integrasi'));
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS external_id VARCHAR(120);
