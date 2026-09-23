// Pengaturan program yang dapat diubah admin tanpa ubah kode (OI-03, OI-04, OI-06, OI-07).
async function getSettings(db) {
  const { rows } = await db.query('SELECT key, value FROM app_settings');
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  return settings;
}

async function getPointRule(db, channel = null) {
  if (channel) {
    const { rows: over } = await db.query('SELECT * FROM channel_point_rules WHERE channel = $1', [channel]);
    if (over.length) {
      const r = over[0];
      return { rupiah_per_poin: r.rupiah_per_poin, pembulatan: r.pembulatan, minimal_transaksi: Number(r.minimal_transaksi), channel };
    }
  }
  const { rows } = await db.query('SELECT * FROM point_rules WHERE id = 1');
  const r = rows[0];
  return { rupiah_per_poin: r.rupiah_per_poin, pembulatan: r.pembulatan, minimal_transaksi: Number(r.minimal_transaksi), channel: null };
}

async function listChannelPointRules(db) {
  const { rows } = await db.query('SELECT * FROM channel_point_rules ORDER BY channel');
  return rows.map((r) => ({ channel: r.channel, rupiah_per_poin: r.rupiah_per_poin, pembulatan: r.pembulatan, minimal_transaksi: Number(r.minimal_transaksi), updated_at: r.updated_at }));
}

module.exports = { getSettings, getPointRule, listChannelPointRules };
