// Contoh katalog reward (OI-09) agar halaman redeem tidak kosong; admin dapat mengubahnya kapan saja.
async function run(db) {
  const { rows } = await db.query('SELECT 1 FROM rewards LIMIT 1');
  if (rows.length) return 'dilewati (reward sudah ada)';
  await db.query(
    `INSERT INTO rewards (nama, deskripsi, poin_dibutuhkan) VALUES
       ('Voucher Belanja Rp50.000', 'Voucher belanja untuk pembelian produk Alpaka.', 50),
       ('Voucher Belanja Rp100.000', 'Voucher belanja untuk pembelian produk Alpaka.', 100)`
  );
  return '2 reward contoh';
}

module.exports = { run };
