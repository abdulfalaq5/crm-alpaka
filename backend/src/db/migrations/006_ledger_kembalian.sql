-- 006: Jenis ledger 'kembalian' (kembalikan poin dari voucher manual yang di-void).
--
-- Void voucher manual harus mengembalikan poin yang sebelumnya dipotong saat generate. Jenis ledger yang
-- ada tidak bisa dipakai: 'masuk' dihitung sebagai poin ditemukan (Lifetime Points/tier ikut naik, salah),
-- sedangkan 'koreksi' justru mengurangi total. Jadi pengembalian butuh jenis sendiri yang menambah total
-- dan TIDAK menambah Lifetime Points, sehingga tier member tidak naik karena kompensasi.
ALTER TABLE points_ledger DROP CONSTRAINT IF EXISTS points_ledger_jenis_check;
ALTER TABLE points_ledger ADD CONSTRAINT points_ledger_jenis_check
  CHECK (jenis IN ('masuk', 'hold', 'terpakai', 'lepas', 'koreksi', 'kembalian'));
