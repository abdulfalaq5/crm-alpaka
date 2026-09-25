-- 005: Voucher management lanjutan (tambahan.md poin 3) — generate manual oleh admin, perpanjangan masa
-- berlaku, dan laporan redemption. Voucher manual tetap terikat ke satu redeem (status 'selesai',
-- sumber 'manual') supaya transaksi poin dan voucher selalu 1:1 dan tidak merusak laporan redeem.

-- Asal voucher: 'redeem' = terbit otomatis saat admin menyetujui redeem member, 'manual' = terbit karena
-- admin membuat voucher dari halaman Voucher (mis. kompensasi/custom tanpa pengajuan member).
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS sumber VARCHAR(12) NOT NULL DEFAULT 'redeem'
  CHECK (sumber IN ('redeem', 'manual'));
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS dibuat_oleh BIGINT REFERENCES admins (id);
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS catatan TEXT;

-- Redeem yang dibuat admin (sumber 'manual') dibedakan dari pengajuan member, agar poin yang dipotong
-- manual bisa ditelusuri di riwayat redeem member maupun laporan.
ALTER TABLE redeems ADD COLUMN IF NOT EXISTS sumber VARCHAR(12) NOT NULL DEFAULT 'member'
  CHECK (sumber IN ('member', 'manual'));

-- Index untuk scheduler auto-expire (hanya voucher aktif) dan filter halaman voucher.
CREATE INDEX IF NOT EXISTS vouchers_expiry_idx ON vouchers (expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS vouchers_sumber_idx ON vouchers (sumber, created_at DESC);
CREATE INDEX IF NOT EXISTS redeems_sumber_idx ON redeems (sumber, created_at DESC);
