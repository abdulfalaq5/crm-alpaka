// Master data tier (tambahan.md poin 1) — default 4 tingkat berbasis poin lifetime. Threshold dapat
// diubah admin lewat panel Tier; seeder tidak menimpa data yang sudah ada.
const { withTransaction } = require('../pool');
const tiersService = require('../../services/tiers');

async function run(db) {
  const { rows } = await db.query('SELECT 1 FROM tiers LIMIT 1');
  if (rows.length) return 'dilewati (tier sudah ada)';
  await db.query(
    `INSERT INTO tiers (nama, urutan, min_poin, benefit) VALUES
       ('Bronze', 1, 0, 'Tier awal setiap member baru.'),
       ('Silver', 2, 100, 'Prioritas notifikasi promo.'),
       ('Gold', 3, 300, 'Akses reward eksklusif Gold.'),
       ('Platinum', 4, 800, 'Akses reward eksklusif Platinum + prioritas layanan.')`
  );
  // Backfill: member yang sudah punya histori poin sebelum tier ada langsung ditempatkan di tier yang sesuai.
  const { rows: members } = await db.query('SELECT id FROM members');
  await withTransaction(async (client) => {
    for (const m of members) await tiersService.reevaluate(client, m.id);
  });
  return `4 tier default (Bronze/Silver/Gold/Platinum), ${members.length} member di-backfill`;
}

module.exports = { run };
