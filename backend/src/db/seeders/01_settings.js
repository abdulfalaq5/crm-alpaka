// Pengaturan program awal (OI-03, OI-04, OI-06, OI-07) — semuanya dapat diubah admin dari panel.
const DEFAULT_SETTINGS = {
  claim_window_days: 30, // OI-06: batas masa klaim (hari)
  min_nominal: 0,
  max_file_size_mb: 5, // OI-07
  max_files: 3, // OI-07
  channels: ['Retail', 'E-commerce'], // OI-03
};

async function run(db) {
  await db.query('INSERT INTO point_rules (id) VALUES (1) ON CONFLICT DO NOTHING'); // 1 poin per Rp10.000, bulatkan ke bawah (OI-04)
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.query('INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [
      key,
      JSON.stringify(value),
    ]);
  }
  return 'aturan poin + pengaturan program';
}

module.exports = { run };
