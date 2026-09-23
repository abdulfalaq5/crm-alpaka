/**
 * Voucher Management (tambahan.md poin 3) + Voucher Integration checkout More (poin 5).
 * Lifecycle: active → reserved (saat validasi checkout) → used (checkout sukses) / kembali ke active
 * (reservasi lewat waktu / checkout gagal) / expired (lewat expires_at) / void (dibatalkan admin).
 */
const crypto = require('crypto');
const { pool, withTransaction } = require('../db/pool');
const { config } = require('../config');
const { audit } = require('./audit');
const { notFound, conflict, AppError } = require('../utils/http');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa karakter mirip (0/O, 1/I) agar mudah dibaca

function generateCode() {
  let code = 'ALP-';
  for (let i = 0; i < 8; i++) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return code;
}

/** Terbitkan voucher untuk redeem yang baru disetujui. Dipanggil dari services/redeems.js dalam transaksi yang sama. */
async function issueForRedeem(client, { redeemId, memberId, reward }) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { rows } = await client.query(
        `INSERT INTO vouchers (kode, member_id, reward_id, redeem_id, status, expires_at)
         VALUES ($1, $2, $3, $4, 'active', now() + ($5 || ' days')::interval) RETURNING *`,
        [generateCode(), memberId, reward.id, redeemId, reward.berlaku_hari]
      );
      return rows[0];
    } catch (err) {
      if (err.code !== '23505') throw err; // kode bentrok (sangat jarang): coba lagi dengan kode baru
    }
  }
  throw new Error('Gagal membuat kode voucher unik setelah beberapa percobaan');
}

const COLS = `v.id, v.kode, v.member_id, v.reward_id, w.nama AS reward_nama, v.redeem_id, v.status,
  v.issued_at, v.expires_at, v.reserved_at, v.reserved_until, v.reserved_order_id,
  v.used_at, v.used_order_id, v.voided_at, v.void_reason`;

async function listVouchers({ memberId = null, status = null, q = null, pagination }) {
  const params = [];
  const where = [];
  if (memberId) { params.push(memberId); where.push(`v.member_id = $${params.length}`); }
  if (status) { params.push(status); where.push(`v.status = $${params.length}`); }
  if (q) { params.push(`%${q}%`); where.push(`(v.kode ILIKE $${params.length} OR m.nama ILIKE $${params.length} OR m.email ILIKE $${params.length})`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = 'FROM vouchers v JOIN rewards w ON w.id = v.reward_id JOIN members m ON m.id = v.member_id';
  const { rows: count } = await pool.query(`SELECT COUNT(*)::int AS total ${from} ${clause}`, params);
  const { rows } = await pool.query(
    `SELECT ${COLS}, m.nama AS member_nama, m.email AS member_email ${from} ${clause}
      ORDER BY v.created_at DESC LIMIT ${pagination.limit} OFFSET ${pagination.offset}`,
    params
  );
  return { data: rows, meta: { page: pagination.page, limit: pagination.limit, total: count[0].total } };
}

/** Void voucher secara manual oleh admin (belum dipakai). */
async function voidVoucher({ id, adminId, alasan }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE vouchers SET status = 'void', voided_at = now(), voided_oleh = $2, void_reason = $3
        WHERE id = $1 AND status IN ('active', 'reserved') RETURNING *`,
      [id, adminId, alasan]
    );
    if (!rows.length) {
      const exists = await client.query('SELECT status FROM vouchers WHERE id = $1', [id]);
      if (!exists.rows.length) throw notFound('Voucher tidak ditemukan');
      throw conflict('Voucher sudah dipakai/void/kedaluwarsa, tidak dapat di-void.', 'ALREADY_FINAL');
    }
    await audit(client, { pelakuTipe: 'admin', pelakuId: adminId, aksi: 'voucher.void', objekTipe: 'voucher', objekId: id, detail: { alasan } });
    return rows[0];
  });
}

/** Voucher lewat expires_at atau reservasi lewat reserved_until dikembalikan otomatis — dipanggil scheduler. */
async function runMaintenance() {
  const expired = await pool.query(`UPDATE vouchers SET status = 'expired' WHERE status = 'active' AND expires_at < now() RETURNING id`);
  const released = await pool.query(
    `UPDATE vouchers SET status = 'active', reserved_at = NULL, reserved_until = NULL, reserved_order_id = NULL
      WHERE status = 'reserved' AND reserved_until < now() RETURNING id`
  );
  return { expired: expired.rowCount, released: released.rowCount };
}

// ---- Dipanggil sistem More (integrations/more.js) ----

async function findActiveByCode(client, kode) {
  const { rows } = await client.query(
    `SELECT v.*, r.nama AS reward_nama, r.poin_dibutuhkan FROM vouchers v JOIN rewards r ON r.id = v.reward_id WHERE v.kode = $1 FOR UPDATE`,
    [kode]
  );
  return rows[0] || null;
}

/** Validasi voucher saat checkout: reservasi sementara agar tidak dipakai dua kali (poin 5). */
async function reserveForCheckout({ kode, orderId }) {
  return withTransaction(async (client) => {
    const v = await findActiveByCode(client, kode);
    if (!v) throw new AppError(404, 'Kode voucher tidak ditemukan', 'VOUCHER_NOT_FOUND');
    if (v.status === 'reserved' && v.reserved_order_id === orderId) return v; // idempotent: order sama, panggilan ulang
    if (v.status === 'expired' || (v.status === 'active' && new Date(v.expires_at) < new Date())) {
      await client.query("UPDATE vouchers SET status = 'expired' WHERE id = $1", [v.id]);
      throw new AppError(409, 'Voucher sudah kedaluwarsa', 'VOUCHER_EXPIRED');
    }
    if (v.status !== 'active') throw new AppError(409, `Voucher berstatus ${v.status}, tidak dapat dipakai`, 'VOUCHER_NOT_ACTIVE');
    const { rows } = await client.query(
      `UPDATE vouchers SET status = 'reserved', reserved_at = now(), reserved_until = now() + ($2 || ' minutes')::interval,
              reserved_order_id = $3 WHERE id = $1 RETURNING *`,
      [v.id, config.more.voucherReserveMinutes, orderId]
    );
    return { ...rows[0], reward_nama: v.reward_nama, poin_dibutuhkan: v.poin_dibutuhkan };
  });
}

/** Konfirmasi voucher terpakai setelah checkout sukses (poin 5). */
async function confirmUsed({ kode, orderId }) {
  return withTransaction(async (client) => {
    const v = await findActiveByCode(client, kode);
    if (!v) throw new AppError(404, 'Kode voucher tidak ditemukan', 'VOUCHER_NOT_FOUND');
    if (v.status === 'used' && v.used_order_id === orderId) return v; // idempotent
    if (v.status !== 'reserved' || v.reserved_order_id !== orderId) {
      throw new AppError(409, 'Voucher belum divalidasi untuk order ini, atau reservasi sudah lewat waktu', 'RESERVATION_MISMATCH');
    }
    const { rows } = await client.query(
      `UPDATE vouchers SET status = 'used', used_at = now(), used_order_id = $2 WHERE id = $1 RETURNING *`,
      [v.id, orderId]
    );
    return rows[0];
  });
}

module.exports = { generateCode, issueForRedeem, listVouchers, voidVoucher, runMaintenance, reserveForCheckout, confirmUsed };
