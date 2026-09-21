const express = require('express');
const bcrypt = require('bcryptjs');
const Joi = require('joi');
const { pool } = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { getBalance } = require('../services/points');
const { getSettings, getPointRule } = require('../services/settings');
const receipts = require('../services/receipts');
const redeems = require('../services/redeems');
const { receiptUpload, filePath } = require('../services/files');
const { signToken } = require('../middleware/auth');
const mailer = require('../services/mailer');
const whatsapp = require('../services/whatsapp');
const { imageUrl } = require('../services/rewardImages');
const { validate } = require('../utils/validate');
const { asyncHandler, parsePagination, notFound, unprocessable, conflict } = require('../utils/http');
const { contact, readContact, password } = require('./auth');

const router = express.Router();
router.use(['/member', '/receipts', '/rewards', '/redeem'], authenticate('member'));

// ---- Konfigurasi program untuk form (member & admin) ----
router.get(
  '/config',
  authenticate(),
  asyncHandler(async (req, res) => {
    const { terms_text: _terms, ...s } = await getSettings(pool);
    res.json({
      ...s,
      point_rule: await getPointRule(pool),
      notification_channels: { in_app: true, email: mailer.enabled(), whatsapp: whatsapp.enabled() },
    });
  })
);

// ---- Struk (UPL) ----
const receiptSchema = Joi.object({
  channel: Joi.string().trim().max(60).required().messages({ 'any.required': 'Channel wajib dipilih', 'string.empty': 'Channel wajib dipilih' }),
  nomor_transaksi: Joi.string().trim().max(80).required().messages({ 'any.required': 'Nomor transaksi wajib diisi', 'string.empty': 'Nomor transaksi wajib diisi' }),
  tanggal_transaksi: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .custom((value, helpers) => {
      const d = new Date(`${value}T00:00:00Z`);
      return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? helpers.error('any.invalid') : value;
    })
    .required()
    .messages({
      'any.required': 'Tanggal transaksi wajib diisi',
      'string.empty': 'Tanggal transaksi wajib diisi',
      'string.pattern.base': 'Format tanggal tidak valid',
      'any.invalid': 'Tanggal transaksi tidak valid',
    }),
  nominal: Joi.number().max(9999999999999).required().messages({ 'any.required': 'Nominal wajib diisi', 'number.base': 'Nominal harus berupa angka' }),
}).options({ presence: 'required' });

const parseReceiptBody = (body) => validate(receiptSchema, body);

router.post(
  '/receipts',
  receiptUpload,
  asyncHandler(async (req, res) => {
    const receipt = await receipts.submitReceipt({ memberId: req.user.id, input: parseReceiptBody(req.body), files: req.files });
    res.status(201).json({ data: receipt });
  })
);

const listOwnReceipts = asyncHandler(async (req, res) => {
  res.json(
    await receipts.listReceipts({
      memberId: req.user.id,
      filters: { status: req.query.status },
      pagination: parsePagination(req.query),
    })
  );
});
router.get('/receipts', listOwnReceipts);
router.get('/member/receipts', listOwnReceipts);

router.get(
  '/receipts/:id',
  asyncHandler(async (req, res) => {
    res.json({ data: await receipts.getReceipt(req.params.id, { memberId: req.user.id }) });
  })
);

router.post(
  '/receipts/:id/resubmit',
  receiptUpload,
  asyncHandler(async (req, res) => {
    const receipt = await receipts.submitReceipt({
      memberId: req.user.id, input: parseReceiptBody(req.body), files: req.files, resubmitOf: req.params.id,
    });
    res.status(201).json({ data: receipt });
  })
);

/** Kirim file bukti; akses dibatasi pemilik dan admin (NFR-02). */
async function sendReceiptFile(req, res, memberId) {
  const params = [req.params.fileId, req.params.id];
  let sql = `SELECT f.* FROM receipt_files f JOIN receipts r ON r.id = f.receipt_id WHERE f.id = $1 AND r.id = $2`;
  if (memberId) {
    params.push(memberId);
    sql += ' AND r.member_id = $3';
  }
  const { rows } = await pool.query(sql, params);
  if (!rows.length) throw notFound('File tidak ditemukan');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.type(rows[0].mime).sendFile(filePath(rows[0].nama_file));
}
router.get('/receipts/:id/files/:fileId', asyncHandler((req, res) => sendReceiptFile(req, res, req.user.id)));

// ---- Poin & dashboard (PNT, DSH) ----
router.get('/member/points', asyncHandler(async (req, res) => res.json({ data: await getBalance(pool, req.user.id) })));

router.get(
  '/member/points/mutations',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req.query);
    const { rows: count } = await pool.query('SELECT COUNT(*)::int AS total FROM points_ledger WHERE member_id = $1', [req.user.id]);
    const { rows } = await pool.query(
      `SELECT l.id, l.jenis, l.jumlah, l.referensi_tipe, l.referensi_id, l.created_at,
              CASE l.referensi_tipe WHEN 'receipt' THEN r.nomor_transaksi WHEN 'koreksi' THEN rk.nomor_transaksi ELSE w.nama END AS keterangan
         FROM points_ledger l
         LEFT JOIN receipts r ON l.referensi_tipe = 'receipt' AND r.id = l.referensi_id
         LEFT JOIN receipt_corrections c ON l.referensi_tipe = 'koreksi' AND c.id = l.referensi_id
         LEFT JOIN receipts rk ON rk.id = c.receipt_id
         LEFT JOIN redeems d ON l.referensi_tipe = 'redeem' AND d.id = l.referensi_id
         LEFT JOIN rewards w ON w.id = d.reward_id
        WHERE l.member_id = $1
        ORDER BY l.created_at DESC, l.id DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    res.json({ data: rows, meta: { page, limit, total: count[0].total } });
  })
);

router.get(
  '/member/dashboard',
  asyncHandler(async (req, res) => {
    const recent = { page: 1, limit: 5, offset: 0 };
    const [points, latestReceipts, latestRedeems, unread] = await Promise.all([
      getBalance(pool, req.user.id),
      receipts.listReceipts({ memberId: req.user.id, pagination: recent }),
      redeems.listRedeems({ memberId: req.user.id, pagination: recent }),
      pool.query("SELECT COUNT(*)::int AS n FROM notifications WHERE member_id = $1 AND kanal = 'in_app' AND dibaca_at IS NULL", [req.user.id]),
    ]);
    res.json({
      data: { points, struk_terbaru: latestReceipts.data, redeem_terbaru: latestRedeems.data, notifikasi_belum_dibaca: unread.rows[0].n },
    });
  })
);

// ---- Reward & redeem (RDM) ----
router.get(
  '/rewards',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT id, nama, deskripsi, poin_dibutuhkan, gambar_file FROM rewards WHERE aktif = TRUE ORDER BY poin_dibutuhkan, id'
    );
    res.json({ data: rows.map(({ gambar_file, ...r }) => ({ ...r, gambar_url: imageUrl({ ...r, gambar_file }) })) });
  })
);

router.post(
  '/redeem',
  asyncHandler(async (req, res) => {
    const v = validate(Joi.object({ reward_id: Joi.number().integer().positive().required().messages({ 'any.required': 'Reward wajib dipilih' }) }), req.body);
    res.status(201).json({ data: await redeems.createRedeem({ memberId: req.user.id, rewardId: v.reward_id }) });
  })
);

router.post(
  '/redeem/:id/cancel',
  asyncHandler(async (req, res) => {
    res.json({ data: await redeems.cancelRedeem({ id: req.params.id, memberId: req.user.id }) });
  })
);

router.get(
  '/member/redeems',
  asyncHandler(async (req, res) => {
    res.json(await redeems.listRedeems({ memberId: req.user.id, status: req.query.status, pagination: parsePagination(req.query) }));
  })
);

router.get(
  '/member/redeems/:id',
  asyncHandler(async (req, res) => res.json({ data: await redeems.getRedeem(req.params.id, { memberId: req.user.id }) }))
);

// ---- Notifikasi (NTF) ----
router.get(
  '/member/notifications',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req.query);
    const { rows: count } = await pool.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE dibaca_at IS NULL)::int AS belum_dibaca
         FROM notifications WHERE member_id = $1 AND kanal = 'in_app'`,
      [req.user.id]
    );
    const { rows } = await pool.query(
      `SELECT id, jenis_kejadian, isi, kanal, referensi_tipe, referensi_id, dibaca_at, created_at
         FROM notifications WHERE member_id = $1 AND kanal = 'in_app' ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    res.json({ data: rows, meta: { page, limit, total: count[0].total, belum_dibaca: count[0].belum_dibaca } });
  })
);

router.post(
  '/member/notifications/read',
  asyncHandler(async (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
    await pool.query(
      `UPDATE notifications SET dibaca_at = now()
        WHERE member_id = $1 AND kanal = 'in_app' AND dibaca_at IS NULL AND ($2::bigint[] IS NULL OR id = ANY($2))`,
      [req.user.id, ids]
    );
    res.json({ message: 'ok' });
  })
);

// ---- Profil (REG-07) ----
router.patch(
  '/member/profile',
  asyncHandler(async (req, res) => {
    const v = validate(Joi.object({ nama: Joi.string().trim().min(2).max(120).required(), ...contact }), req.body);
    const { email, no_hp } = readContact(v);
    try {
      const { rows } = await pool.query(
        `UPDATE members SET nama = $2, email = $3, no_hp = $4, updated_at = now()
          WHERE id = $1 RETURNING id, nama, email, no_hp, notif_email, notif_whatsapp`,
        [req.user.id, v.nama, email, no_hp]
      );
      res.json({ user: { ...rows[0], role: 'member' } });
    } catch (err) {
      if (err.code === '23505') throw conflict('Email atau nomor HP sudah dipakai akun lain.', 'IDENTIFIER_EXISTS');
      throw err;
    }
  })
);

router.post(
  '/member/password',
  asyncHandler(async (req, res) => {
    const v = validate(
      Joi.object({ password_lama: Joi.string().max(200).required(), password_baru: password }),
      req.body
    );
    const { rows } = await pool.query('SELECT password_hash FROM members WHERE id = $1', [req.user.id]);
    if (!(await bcrypt.compare(v.password_lama, rows[0].password_hash))) {
      throw unprocessable('Kata sandi lama salah', { password_lama: 'Kata sandi lama salah' });
    }
    // Semua sesi lama dicabut (mis. perangkat lain); sesi ini mendapat token baru.
    await pool.query('UPDATE members SET password_hash = $2, sesi_valid_sejak = now(), updated_at = now() WHERE id = $1', [
      req.user.id, await bcrypt.hash(v.password_baru, 10),
    ]);
    res.json({ message: 'Kata sandi berhasil diubah', token: signToken(req.user.id, 'member') });
  })
);

// ---- Preferensi notifikasi (OI-08): in-app selalu aktif; email/WhatsApp dapat dimatikan ----
router.patch(
  '/member/notification-prefs',
  asyncHandler(async (req, res) => {
    const v = validate(Joi.object({ notif_email: Joi.boolean().required(), notif_whatsapp: Joi.boolean().required() }), req.body);
    const { rows } = await pool.query(
      'UPDATE members SET notif_email = $2, notif_whatsapp = $3, updated_at = now() WHERE id = $1 RETURNING notif_email, notif_whatsapp',
      [req.user.id, v.notif_email, v.notif_whatsapp]
    );
    res.json({ data: rows[0] });
  })
);

module.exports = { router, sendReceiptFile };
