-- Skema Sistem Loyalty Alpaka (Fase 1). Idempotent: aman dijalankan berulang kali.

CREATE TABLE IF NOT EXISTS members (
  id               BIGSERIAL PRIMARY KEY,
  nama             VARCHAR(120) NOT NULL,
  email            VARCHAR(160),
  no_hp            VARCHAR(20),
  password_hash    TEXT NOT NULL,
  status_akun      VARCHAR(20) NOT NULL DEFAULT 'aktif' CHECK (status_akun IN ('aktif', 'nonaktif')),
  setuju_syarat_at TIMESTAMPTZ NOT NULL,
  gagal_login      INT NOT NULL DEFAULT 0,
  terkunci_sampai  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT members_kontak_chk CHECK (email IS NOT NULL OR no_hp IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS members_email_uq ON members (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS members_no_hp_uq ON members (no_hp) WHERE no_hp IS NOT NULL;

CREATE TABLE IF NOT EXISTS admins (
  id              BIGSERIAL PRIMARY KEY,
  nama            VARCHAR(120) NOT NULL,
  email           VARCHAR(160) NOT NULL,
  password_hash   TEXT NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'nonaktif')),
  gagal_login     INT NOT NULL DEFAULT 0,
  terkunci_sampai TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS admins_email_uq ON admins (lower(email));

CREATE TABLE IF NOT EXISTS password_resets (
  id         BIGSERIAL PRIMARY KEY,
  member_id  BIGINT NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_resets_token_idx ON password_resets (token_hash);

CREATE TABLE IF NOT EXISTS receipts (
  id                BIGSERIAL PRIMARY KEY,
  member_id         BIGINT NOT NULL REFERENCES members (id),
  channel           VARCHAR(60) NOT NULL,
  nomor_transaksi   VARCHAR(80) NOT NULL,
  tanggal_transaksi DATE NOT NULL,
  nominal           NUMERIC(14, 2) NOT NULL,
  status            VARCHAR(20) NOT NULL CHECK (status IN ('menunggu_review', 'disetujui', 'ditolak')),
  hasil_validasi    JSONB NOT NULL DEFAULT '{}'::jsonb,
  mode_persetujuan  VARCHAR(10) CHECK (mode_persetujuan IN ('otomatis', 'manual')),
  alasan_penolakan  TEXT,
  diputuskan_oleh   BIGINT REFERENCES admins (id),
  waktu_keputusan   TIMESTAMPTZ,
  resubmit_of       BIGINT REFERENCES receipts (id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS receipts_member_idx ON receipts (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS receipts_status_idx ON receipts (status, created_at);
-- Duplikasi (VAL-02, BR-02): channel + nomor transaksi yang masih menunggu/disetujui tidak boleh diajukan lagi.
-- Constraint di level database agar aman terhadap request bersamaan.
CREATE UNIQUE INDEX IF NOT EXISTS receipts_duplikat_uq
  ON receipts (lower(channel), lower(nomor_transaksi))
  WHERE status IN ('menunggu_review', 'disetujui');

CREATE TABLE IF NOT EXISTS receipt_files (
  id         BIGSERIAL PRIMARY KEY,
  receipt_id BIGINT NOT NULL REFERENCES receipts (id) ON DELETE CASCADE,
  nama_asli  VARCHAR(255) NOT NULL,
  nama_file  VARCHAR(80) NOT NULL,
  mime       VARCHAR(60) NOT NULL,
  ukuran     INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS receipt_files_receipt_idx ON receipt_files (receipt_id);

CREATE TABLE IF NOT EXISTS auto_approve_criteria (
  id          BIGSERIAL PRIMARY KEY,
  kode        VARCHAR(40) NOT NULL UNIQUE,
  kriteria    VARCHAR(160) NOT NULL,
  nilai       JSONB NOT NULL DEFAULT '{}'::jsonb,
  aktif       BOOLEAN NOT NULL DEFAULT FALSE,
  diubah_oleh BIGINT REFERENCES admins (id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS point_rules (
  id                INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  rupiah_per_poin   INT NOT NULL DEFAULT 10000 CHECK (rupiah_per_poin > 0),
  pembulatan        VARCHAR(10) NOT NULL DEFAULT 'bawah' CHECK (pembulatan IN ('bawah', 'atas', 'terdekat')),
  minimal_transaksi NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (minimal_transaksi >= 0),
  diubah_oleh       BIGINT REFERENCES admins (id),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key         VARCHAR(60) PRIMARY KEY,
  value       JSONB NOT NULL,
  diubah_oleh BIGINT REFERENCES admins (id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS points_ledger (
  id              BIGSERIAL PRIMARY KEY,
  member_id       BIGINT NOT NULL REFERENCES members (id),
  jenis           VARCHAR(10) NOT NULL CHECK (jenis IN ('masuk', 'hold', 'terpakai', 'lepas')),
  jumlah          INT NOT NULL CHECK (jumlah > 0),
  referensi_tipe  VARCHAR(20) NOT NULL CHECK (referensi_tipe IN ('receipt', 'redeem')),
  referensi_id    BIGINT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS points_ledger_member_idx ON points_ledger (member_id, created_at DESC);
-- Idempoten (PNT-05, BR-03): satu jenis entri per referensi, sehingga approve berulang tidak menggandakan poin.
CREATE UNIQUE INDEX IF NOT EXISTS points_ledger_ref_uq ON points_ledger (referensi_tipe, referensi_id, jenis);

CREATE TABLE IF NOT EXISTS rewards (
  id             BIGSERIAL PRIMARY KEY,
  nama           VARCHAR(120) NOT NULL,
  deskripsi      TEXT,
  poin_dibutuhkan INT NOT NULL CHECK (poin_dibutuhkan > 0),
  aktif          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS redeems (
  id               BIGSERIAL PRIMARY KEY,
  member_id        BIGINT NOT NULL REFERENCES members (id),
  reward_id        BIGINT NOT NULL REFERENCES rewards (id),
  jumlah_poin      INT NOT NULL CHECK (jumlah_poin > 0),
  status           VARCHAR(25) NOT NULL CHECK (status IN ('menunggu_persetujuan', 'selesai', 'ditolak', 'dibatalkan')),
  alasan_penolakan TEXT,
  detail_pemberian TEXT,
  diputuskan_oleh  BIGINT REFERENCES admins (id),
  waktu_keputusan  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS redeems_member_idx ON redeems (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS redeems_status_idx ON redeems (status, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id             BIGSERIAL PRIMARY KEY,
  member_id      BIGINT NOT NULL REFERENCES members (id),
  jenis_kejadian VARCHAR(30) NOT NULL,
  isi            TEXT NOT NULL,
  kanal          VARCHAR(20) NOT NULL DEFAULT 'in_app',
  status_kirim   VARCHAR(20) NOT NULL DEFAULT 'terkirim',
  referensi_tipe VARCHAR(20),
  referensi_id   BIGINT,
  dibaca_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_member_idx ON notifications (member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  pelaku_tipe VARCHAR(10) NOT NULL CHECK (pelaku_tipe IN ('admin', 'member', 'sistem')),
  pelaku_id  BIGINT,
  aksi       VARCHAR(50) NOT NULL,
  objek_tipe VARCHAR(20) NOT NULL,
  objek_id   BIGINT,
  detail     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC);

-- Log audit tidak boleh diubah/dihapus dari mana pun (ADM-05, BR-12, NFR-06).
CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs bersifat immutable (tidak boleh diubah atau dihapus)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_no_change ON audit_logs;
CREATE TRIGGER audit_logs_no_change
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

DROP TRIGGER IF EXISTS audit_logs_no_truncate ON audit_logs;
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_immutable();
