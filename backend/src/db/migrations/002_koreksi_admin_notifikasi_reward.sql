-- 002: koreksi keputusan (OI-12), pencabutan sesi, preferensi notifikasi (OI-08), gambar reward (OI-09).

-- Sesi yang diterbitkan sebelum waktu ini dianggap tidak valid (ganti password / reset / nonaktif).
ALTER TABLE members ADD COLUMN IF NOT EXISTS sesi_valid_sejak TIMESTAMPTZ;
ALTER TABLE admins  ADD COLUMN IF NOT EXISTS sesi_valid_sejak TIMESTAMPTZ;

-- Preferensi kanal notifikasi tambahan per member (in-app selalu aktif).
ALTER TABLE members ADD COLUMN IF NOT EXISTS notif_email    BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS notif_whatsapp BOOLEAN NOT NULL DEFAULT TRUE;

-- Gambar opsional per reward (disimpan di UPLOAD_DIR/rewards).
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS gambar_file VARCHAR(80);
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS gambar_mime VARCHAR(30);

-- Riwayat koreksi keputusan struk oleh admin (menyetujui yang tadinya ditolak, atau sebaliknya).
CREATE TABLE IF NOT EXISTS receipt_corrections (
  id              BIGSERIAL PRIMARY KEY,
  receipt_id      BIGINT NOT NULL REFERENCES receipts (id),
  dari_status     VARCHAR(20) NOT NULL,
  ke_status       VARCHAR(20) NOT NULL,
  alasan          TEXT NOT NULL,
  poin_delta      INT NOT NULL DEFAULT 0,
  dikoreksi_oleh  BIGINT NOT NULL REFERENCES admins (id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT receipt_corrections_status_chk CHECK (dari_status <> ke_status)
);
CREATE INDEX IF NOT EXISTS receipt_corrections_receipt_idx ON receipt_corrections (receipt_id, created_at);

-- Ledger: jenis 'koreksi' (pembalikan poin masuk) dan referensi ke koreksi.
ALTER TABLE points_ledger DROP CONSTRAINT IF EXISTS points_ledger_jenis_check;
ALTER TABLE points_ledger ADD CONSTRAINT points_ledger_jenis_check
  CHECK (jenis IN ('masuk', 'hold', 'terpakai', 'lepas', 'koreksi'));
ALTER TABLE points_ledger DROP CONSTRAINT IF EXISTS points_ledger_referensi_tipe_check;
ALTER TABLE points_ledger ADD CONSTRAINT points_ledger_referensi_tipe_check
  CHECK (referensi_tipe IN ('receipt', 'redeem', 'koreksi'));
