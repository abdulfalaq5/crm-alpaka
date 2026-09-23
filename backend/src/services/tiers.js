/**
 * Tier & Progress (tambahan.md poin 1). Evaluasi berbasis TOTAL POIN LIFETIME (jumlah poin `masuk`
 * dikurangi `koreksi`, TIDAK dikurangi poin yang sudah dipakai redeem) — dipilih sebagai default karena
 * cara ini paling umum untuk program loyalty dan tidak menghukum member yang rajin menukar poin.
 * OI terbuka: apakah Client ingin basis ini atau basis rolling per tahun — ganti di evaluateTier() saja.
 */
const { audit } = require('./audit');

/** Total poin lifetime (masuk − koreksi), TERPISAH dari saldo tersedia (points.js). */
async function lifetimePoints(db, memberId) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'masuk'), 0)::int
           - COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'koreksi'), 0)::int AS total
       FROM points_ledger WHERE member_id = $1`,
    [memberId]
  );
  return rows[0].total;
}

async function listTiers(db) {
  const { rows } = await db.query('SELECT * FROM tiers ORDER BY urutan');
  return rows;
}

/** Tier tertinggi yang syaratnya terpenuhi oleh `poin`, dari daftar tier terurut menaik. Null bila belum ada tier. */
function tierForPoints(tiers, poin) {
  let current = null;
  for (const t of tiers) {
    if (poin >= t.min_poin) current = t;
  }
  return current;
}

/** Progress ke tier berikutnya: poin saat ini vs threshold. */
function progress(tiers, poin) {
  const current = tierForPoints(tiers, poin);
  const idx = current ? tiers.findIndex((t) => t.id === current.id) : -1;
  const next = tiers[idx + 1] || null;
  return {
    tier_saat_ini: current,
    tier_berikutnya: next,
    poin_saat_ini: poin,
    poin_dibutuhkan: next ? Math.max(next.min_poin - poin, 0) : 0,
    persen: next ? Math.min(100, Math.round(((poin - (current?.min_poin || 0)) / (next.min_poin - (current?.min_poin || 0))) * 100)) : 100,
  };
}

/**
 * Evaluasi ulang tier member setelah poin bertambah (dipanggil dari points.awardForReceipt).
 * Naik/turun tier tercatat ke member_tier_history untuk audit trail.
 */
async function reevaluate(client, memberId) {
  const [tiers, poin] = await Promise.all([listTiers(client), lifetimePoints(client, memberId)]);
  if (!tiers.length) return null;
  const next = tierForPoints(tiers, poin);
  const { rows } = await client.query('SELECT current_tier_id FROM members WHERE id = $1 FOR UPDATE', [memberId]);
  const currentId = rows[0].current_tier_id;
  const nextId = next?.id || null;
  if (currentId === nextId) return next;

  await client.query('UPDATE members SET current_tier_id = $2 WHERE id = $1', [memberId, nextId]);
  await client.query(
    'INSERT INTO member_tier_history (member_id, dari_tier_id, ke_tier_id, sebab) VALUES ($1, $2, $3, $4)',
    [memberId, currentId, nextId, 'otomatis']
  );
  await audit(client, {
    pelakuTipe: 'sistem', aksi: 'tier.naik_turun', objekTipe: 'member', objekId: memberId,
    detail: { dari: currentId, ke: nextId, poin },
  });
  return next;
}

module.exports = { listTiers, lifetimePoints, tierForPoints, progress, reevaluate };
