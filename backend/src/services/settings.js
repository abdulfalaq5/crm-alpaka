// Pengaturan program yang dapat diubah admin tanpa ubah kode (OI-03, OI-04, OI-06, OI-07).
async function getSettings(db) {
  const { rows } = await db.query('SELECT key, value FROM app_settings');
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  return settings;
}

async function getPointRule(db) {
  const { rows } = await db.query('SELECT * FROM point_rules WHERE id = 1');
  const r = rows[0];
  return {
    rupiah_per_poin: r.rupiah_per_poin,
    pembulatan: r.pembulatan,
    minimal_transaksi: Number(r.minimal_transaksi),
  };
}

module.exports = { getSettings, getPointRule };
