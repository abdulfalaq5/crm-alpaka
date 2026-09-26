/** Basic metrics untuk Admin Dashboard (tambahan.md poin 6): agregat langsung, tanpa data warehouse terpisah. */
const { pool } = require('../db/pool');

const HARI = 30;

/**
 * Ringkasan satu domain untuk kartu dashboard admin.
 * Semua angka diambil dari tabel terkait (bukan dihitung ulang dari aplikasi), termasuk filter 30 hari terakhir.
 */
async function overview() {
  const [members, memberBaru, points, poinBulan, redeem, tiers, vouchers, struk, rewards, pointRule, channelRules, topReward] =
    await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status_akun = 'aktif')::int AS aktif FROM members`),
      pool.query(`SELECT COUNT(*)::int AS jumlah FROM members WHERE created_at >= now() - ($1 || ' days')::interval`, [HARI]),
      pool.query(
        `SELECT COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'masuk'), 0)::int
               - COALESCE(SUM(jumlah) FILTER (WHERE jenis IN ('terpakai', 'koreksi')), 0)::int AS beredar
           FROM points_ledger`
      ),
      pool.query(
        `SELECT COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'masuk'), 0)::int AS masuk,
                COALESCE(SUM(jumlah) FILTER (WHERE jenis IN ('terpakai', 'koreksi')), 0)::int AS keluar
           FROM points_ledger WHERE created_at >= now() - ($1 || ' days')::interval`,
        [HARI]
      ),
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'selesai')::int AS selesai FROM redeems`),
      pool.query(
        `SELECT t.nama, COUNT(m.id)::int AS jumlah_member FROM tiers t LEFT JOIN members m ON m.current_tier_id = t.id GROUP BY t.id, t.nama, t.urutan ORDER BY t.urutan`
      ),
      pool.query(
        `SELECT status, COUNT(*)::int AS jumlah FROM vouchers GROUP BY status`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'menunggu_review')::int AS menunggu_review,
                COUNT(*) FILTER (WHERE status = 'disetujui')::int AS disetujui,
                COUNT(*) FILTER (WHERE status = 'ditolak')::int AS ditolak,
                COUNT(*) FILTER (WHERE status = 'disetujui' AND created_at >= now() - ($1 || ' days')::interval)::int AS disetujui_bulan,
                COUNT(*) FILTER (WHERE status = 'ditolak' AND created_at >= now() - ($1 || ' days')::interval)::int AS ditolak_bulan
           FROM receipts`,
        [HARI]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE aktif)::int AS aktif,
                COUNT(*) FILTER (WHERE stok = 0)::int AS stok_habis,
                COUNT(*) FILTER (WHERE stok IS NULL)::int AS tanpa_batas,
                COUNT(*) FILTER (WHERE tier_minimum_id IS NOT NULL)::int AS tier_khusus,
                MIN(valid_until)::date AS berlaku_sampai
           FROM rewards`
      ),
      pool.query(`SELECT rupiah_per_poin, pembulatan, minimal_transaksi FROM point_rules WHERE id = 1`),
      pool.query(`SELECT COUNT(*)::int AS jumlah FROM channel_point_rules`),
      pool.query(
        `SELECT w.nama, COUNT(*)::int AS jumlah FROM redeems d JOIN rewards w ON w.id = d.reward_id
          WHERE d.status = 'selesai' GROUP BY w.id, w.nama ORDER BY jumlah DESC LIMIT 5`
      ),
    ]);

  const voucher = { active: 0, reserved: 0, used: 0, expired: 0, void: 0 };
  for (const r of vouchers.rows) voucher[r.status] = r.jumlah;
  const s = struk.rows[0];
  const w = rewards.rows[0];
  const rule = pointRule.rows[0];

  return {
    // Metrik dasar
    member_total: members.rows[0].total,
    member_aktif: members.rows[0].aktif,
    poin_beredar: points.rows[0].beredar,
    redemption_rate: redeem.rows[0].total ? Math.round((redeem.rows[0].selesai / redeem.rows[0].total) * 100) : 0,
    // Ringkasan per domain (kartu dashboard)
    member: {
      total: members.rows[0].total,
      aktif: members.rows[0].aktif,
      nonaktif: members.rows[0].total - members.rows[0].aktif,
      baru_bulan: memberBaru.rows[0].jumlah,
      tier: tiers.rows,
    },
    struk: {
      total: s.total,
      menunggu_review: s.menunggu_review,
      disetujui: s.disetujui,
      ditolak: s.ditolak,
      disetujui_bulan: s.disetujui_bulan,
      ditolak_bulan: s.ditolak_bulan,
    },
    point_rule: {
      rupiah_per_poin: rule ? Number(rule.rupiah_per_poin) : null,
      pembulatan: rule ? rule.pembulatan : null,
      minimal_transaksi: rule ? Number(rule.minimal_transaksi) : null,
      channel: channelRules.rows[0].jumlah,
    },
    poin_bulan: { masuk: poinBulan.rows[0].masuk, keluar: poinBulan.rows[0].keluar },
    reward: {
      total: w.total,
      aktif: w.aktif,
      stok_habis: w.stok_habis,
      tanpa_batas: w.tanpa_batas,
      tier_khusus: w.tier_khusus,
      berlaku_sampai: w.berlaku_sampai,
    },
    voucher,
    top_reward: topReward.rows,
    tier: tiers.rows,
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
