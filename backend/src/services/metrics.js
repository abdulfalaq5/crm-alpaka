/** Basic metrics untuk Admin Dashboard (tambahan.md poin 6): agregat langsung, tanpa data warehouse terpisah. */
const { pool } = require('../db/pool');

async function overview() {
  const [members, points, redeem, tiers, vouchers] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status_akun = 'aktif')::int AS aktif FROM members`),
    pool.query(
      `SELECT COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'masuk'), 0)::int
             - COALESCE(SUM(jumlah) FILTER (WHERE jenis IN ('terpakai', 'koreksi')), 0)::int AS beredar
         FROM points_ledger`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'selesai')::int AS selesai FROM redeems`
    ),
    pool.query(
      `SELECT t.nama, COUNT(m.id)::int AS jumlah_member FROM tiers t LEFT JOIN members m ON m.current_tier_id = t.id GROUP BY t.id, t.nama, t.urutan ORDER BY t.urutan`
    ),
    pool.query(`SELECT status, COUNT(*)::int AS jumlah FROM vouchers GROUP BY status`),
  ]);
  const { rows: topReward } = await pool.query(
    `SELECT w.nama, COUNT(*)::int AS jumlah FROM redeems d JOIN rewards w ON w.id = d.reward_id
      WHERE d.status = 'selesai' GROUP BY w.id, w.nama ORDER BY jumlah DESC LIMIT 5`
  );
  return {
    member_total: members.rows[0].total,
    member_aktif: members.rows[0].aktif,
    poin_beredar: points.rows[0].beredar,
    redemption_rate: redeem.rows[0].total ? Math.round((redeem.rows[0].selesai / redeem.rows[0].total) * 100) : 0,
    top_reward: topReward,
    tier: tiers.rows,
    voucher: Object.fromEntries(vouchers.rows.map((r) => [r.status, r.jumlah])),
  };
}

/** Pertumbuhan tier per bulan (naik/turun tier) — untuk grafik growth tier per periode. */
async function tierGrowth(months = 6) {
  const { rows } = await pool.query(
    `SELECT to_char(created_at, 'YYYY-MM') AS bulan, t.nama AS tier, COUNT(*)::int AS jumlah
       FROM member_tier_history h JOIN tiers t ON t.id = h.ke_tier_id
      WHERE h.created_at >= now() - ($1 || ' months')::interval
      GROUP BY 1, t.id, t.nama, t.urutan ORDER BY 1, t.urutan`,
    [months]
  );
  return rows;
}

module.exports = { overview, tierGrowth };
