const { pool, withTransaction } = require('../db/pool');
const { audit } = require('./audit');
const { notify } = require('./notifications');
const { getBalance, lockMember, addEntry } = require('./points');
const { notFound, conflict, unprocessable } = require('../utils/http');

const COLS = `
  d.id, d.member_id, d.reward_id, w.nama AS reward_nama, d.jumlah_poin, d.status,
  d.alasan_penolakan, d.detail_pemberian, d.waktu_keputusan, d.created_at`;

/** Ajukan redeem: saldo tersedia dicek, lalu poin di-hold dalam satu transaksi atomik (RDM-01..03, BR-09). */
async function createRedeem({ memberId, rewardId }) {
  const id = await withTransaction(async (client) => {
    // Kunci baris member: dua redeem bersamaan diproses berurutan sehingga tidak menembus saldo (RDM-06).
    await lockMember(client, memberId);

    const { rows: rw } = await client.query('SELECT * FROM rewards WHERE id = $1 AND aktif = TRUE', [rewardId]);
    if (!rw.length) throw notFound('Reward tidak ditemukan atau tidak aktif');
    const reward = rw[0];

    const saldo = await getBalance(client, memberId);
    if (saldo.tersedia < reward.poin_dibutuhkan) {
      throw unprocessable(
        `Saldo poin tidak mencukupi. Dibutuhkan ${reward.poin_dibutuhkan} poin, tersedia ${saldo.tersedia} poin.`,
        { reward_id: 'Saldo poin tidak mencukupi' }
      );
    }

    const { rows } = await client.query(
      `INSERT INTO redeems (member_id, reward_id, jumlah_poin, status)
       VALUES ($1, $2, $3, 'menunggu_persetujuan') RETURNING id`,
      [memberId, reward.id, reward.poin_dibutuhkan]
    );
    const redeemId = rows[0].id;
    await addEntry(client, {
      memberId, jenis: 'hold', jumlah: reward.poin_dibutuhkan, referensiTipe: 'redeem', referensiId: redeemId,
    });
    await audit(client, {
      pelakuTipe: 'member', pelakuId: memberId, aksi: 'redeem.ajukan', objekTipe: 'redeem', objekId: redeemId,
      detail: { reward: reward.nama, poin: reward.poin_dibutuhkan },
    });
    await notify(client, {
      memberId, jenis: 'redeem_diajukan', referensiTipe: 'redeem', referensiId: redeemId,
      isi: `Pengajuan redeem "${reward.nama}" diterima. ${reward.poin_dibutuhkan} poin ditahan sampai diproses admin.`,
    });
    return redeemId;
  });
  return getRedeem(id, { memberId });
}

async function getRedeem(id, { memberId = null, admin = false } = {}) {
  const params = [id];
  let where = 'd.id = $1';
  if (memberId) {
    params.push(memberId);
    where += ' AND d.member_id = $2';
  }
  const extra = admin ? ', m.nama AS member_nama, m.email AS member_email, m.no_hp AS member_no_hp, a.nama AS diputuskan_oleh_nama' : '';
  const { rows } = await pool.query(
    `SELECT ${COLS}${extra}
       FROM redeems d JOIN rewards w ON w.id = d.reward_id JOIN members m ON m.id = d.member_id
       LEFT JOIN admins a ON a.id = d.diputuskan_oleh
      WHERE ${where}`,
    params
  );
  if (!rows.length) throw notFound('Redeem tidak ditemukan');
  return rows[0];
}

async function listRedeems({ memberId = null, status = null, q = null, pagination }) {
  const params = [];
  const where = [];
  if (memberId) { params.push(memberId); where.push(`d.member_id = $${params.length}`); }
  if (status) { params.push(status); where.push(`d.status = $${params.length}`); }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(m.nama ILIKE $${params.length} OR m.email ILIKE $${params.length} OR w.nama ILIKE $${params.length})`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = 'FROM redeems d JOIN rewards w ON w.id = d.reward_id JOIN members m ON m.id = d.member_id';

  const { rows: count } = await pool.query(`SELECT COUNT(*)::int AS total ${from} ${clause}`, params);
  const { rows } = await pool.query(
    `SELECT ${COLS}, m.nama AS member_nama, m.email AS member_email ${from} ${clause}
      ORDER BY CASE WHEN d.status = 'menunggu_persetujuan' THEN 0 ELSE 1 END,
               CASE WHEN d.status = 'menunggu_persetujuan' THEN d.created_at END ASC,
               d.created_at DESC
      LIMIT ${pagination.limit} OFFSET ${pagination.offset}`,
    params
  );
  return { data: rows, meta: { page: pagination.page, limit: pagination.limit, total: count[0].total } };
}

async function queueSummary() {
  const { rows } = await pool.query('SELECT status, COUNT(*)::int AS jumlah FROM redeems GROUP BY status');
  const summary = { menunggu_persetujuan: 0, selesai: 0, ditolak: 0, dibatalkan: 0 };
  for (const r of rows) summary[r.status] = r.jumlah;
  return summary;
}

/**
 * Ubah status redeem yang masih `menunggu_persetujuan` (satu-satunya status yang boleh diproses).
 * `selesai`   → hold menjadi terpakai (poin resmi terpotong)
 * `ditolak` / `dibatalkan` → hold dilepas (poin kembali ke saldo tersedia)
 */
async function transition({ id, to, actor, memberId = null, alasan = null, detail = null }) {
  await withTransaction(async (client) => {
    const params = [id, to, actor.tipe === 'admin' ? actor.id : null, alasan, detail];
    let sql = `UPDATE redeems
                  SET status = $2, diputuskan_oleh = $3, alasan_penolakan = $4, detail_pemberian = $5,
                      waktu_keputusan = now()
                WHERE id = $1 AND status = 'menunggu_persetujuan'`;
    if (memberId) {
      params.push(memberId);
      sql += ` AND member_id = $${params.length}`;
    }
    const { rows } = await client.query(`${sql} RETURNING *`, params);
    if (!rows.length) {
      const { rows: exists } = await client.query(
        `SELECT status FROM redeems WHERE id = $1${memberId ? ' AND member_id = $2' : ''}`,
        memberId ? [id, memberId] : [id]
      );
      if (!exists.length) throw notFound('Redeem tidak ditemukan');
      throw conflict('Redeem sudah diproses dan tidak dapat diubah lagi.', 'ALREADY_DECIDED');
    }
    const redeem = rows[0];

    await addEntry(client, {
      memberId: redeem.member_id,
      jenis: to === 'selesai' ? 'terpakai' : 'lepas',
      jumlah: redeem.jumlah_poin,
      referensiTipe: 'redeem',
      referensiId: id,
    });

    const { rows: rw } = await client.query('SELECT nama FROM rewards WHERE id = $1', [redeem.reward_id]);
    const reward = rw[0].nama;
    const aksi = { selesai: 'redeem.setujui', ditolak: 'redeem.tolak', dibatalkan: 'redeem.batalkan' }[to];
    await audit(client, {
      pelakuTipe: actor.tipe, pelakuId: actor.id, aksi, objekTipe: 'redeem', objekId: id,
      detail: { reward, poin: redeem.jumlah_poin, ...(alasan ? { alasan } : {}) },
    });

    if (to === 'selesai') {
      await notify(client, {
        memberId: redeem.member_id, jenis: 'redeem_disetujui', referensiTipe: 'redeem', referensiId: id,
        isi: `Redeem "${reward}" disetujui.${detail ? ` Detail: ${detail}` : ''}`,
      });
    } else if (to === 'ditolak') {
      await notify(client, {
        memberId: redeem.member_id, jenis: 'redeem_ditolak', referensiTipe: 'redeem', referensiId: id,
        isi: `Redeem "${reward}" ditolak. Alasan: ${alasan}. ${redeem.jumlah_poin} poin dikembalikan ke saldo tersedia.`,
      });
    }
  });
  return getRedeem(id, actor.tipe === 'admin' ? { admin: true } : { memberId });
}

const approveRedeem = ({ id, adminId, detail }) =>
  transition({ id, to: 'selesai', actor: { tipe: 'admin', id: adminId }, detail });

const rejectRedeem = ({ id, adminId, alasan }) => {
  if (!alasan) throw unprocessable('Alasan penolakan wajib diisi.', { alasan: 'Alasan wajib diisi' });
  return transition({ id, to: 'ditolak', actor: { tipe: 'admin', id: adminId }, alasan });
};

const cancelRedeem = ({ id, memberId }) =>
  transition({ id, to: 'dibatalkan', actor: { tipe: 'member', id: memberId }, memberId });

module.exports = {
  createRedeem, getRedeem, listRedeems, queueSummary, approveRedeem, rejectRedeem, cancelRedeem,
};
