const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const { config } = require('../config');
const { pool, withTransaction } = require('../db/pool');
const { authenticate, signToken } = require('../middleware/auth');
const { audit } = require('../services/audit');
const mailer = require('../services/mailer');
const { validate } = require('../utils/validate');
const { normalizePhone } = require('../utils/phone');
const { asyncHandler, AppError, unauthorized, conflict, unprocessable } = require('../utils/http');

const router = express.Router();

// Pembatasan percobaan login per IP (REG-04); pembatasan per akun ada di loginAccount().
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' } },
});

const password = Joi.string().min(8).max(72).required().messages({
  'string.min': 'Kata sandi minimal 8 karakter',
  'string.max': 'Kata sandi maksimal 72 karakter',
  'any.required': 'Kata sandi wajib diisi',
});

const contact = {
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(160).allow('', null).messages({ 'string.email': 'Format email tidak valid' }),
  no_hp: Joi.string().trim().max(20).allow('', null),
};

/** Ambil & normalisasi kontak; minimal salah satu (email / no. HP) wajib ada (REG-01..03). */
function readContact(v) {
  const email = v.email || null;
  let no_hp = null;
  if (v.no_hp) {
    no_hp = normalizePhone(v.no_hp);
    if (!no_hp) throw unprocessable('Format nomor HP tidak valid', { no_hp: 'Format nomor HP tidak valid' });
  }
  if (!email && !no_hp) {
    throw unprocessable('Isi email atau nomor HP', { email: 'Isi email atau nomor HP' });
  }
  return { email, no_hp };
}

const publicMember = (m) => ({ id: m.id, nama: m.nama, email: m.email, no_hp: m.no_hp, role: 'member' });

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const v = validate(
      Joi.object({
        nama: Joi.string().trim().min(2).max(120).required().messages({ 'any.required': 'Nama wajib diisi', 'string.empty': 'Nama wajib diisi' }),
        ...contact,
        password,
        setuju_syarat: Joi.boolean().valid(true).required().messages({
          'any.only': 'Anda harus menyetujui syarat & kebijakan privasi program',
          'any.required': 'Anda harus menyetujui syarat & kebijakan privasi program',
        }),
      }),
      req.body
    );
    const { email, no_hp } = readContact(v);
    const hash = await bcrypt.hash(v.password, 10);

    try {
      const member = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO members (nama, email, no_hp, password_hash, setuju_syarat_at)
           VALUES ($1, $2, $3, $4, now()) RETURNING id, nama, email, no_hp`,
          [v.nama, email, no_hp, hash]
        );
        await audit(client, { pelakuTipe: 'member', pelakuId: rows[0].id, aksi: 'member.registrasi', objekTipe: 'member', objekId: rows[0].id });
        return rows[0];
      });
      res.status(201).json({ token: signToken(member.id, 'member'), user: publicMember(member) });
    } catch (err) {
      if (err.code === '23505') {
        throw conflict('Email atau nomor HP sudah terdaftar. Silakan masuk.', 'IDENTIFIER_EXISTS');
      }
      throw err;
    }
  })
);

const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

/** Verifikasi kredensial + kunci sementara setelah beberapa kali gagal (REG-04, REG-05). */
async function loginAccount({ table, statusCol, where, param, plain, role }) {
  const { rows } = await pool.query(
    `SELECT id, nama, email, ${table === 'members' ? 'no_hp,' : ''} password_hash, ${statusCol} AS status,
            gagal_login, terkunci_sampai FROM ${table} WHERE ${where}`,
    [param]
  );
  const account = rows[0];
  const invalid = unauthorized('Email/nomor HP atau kata sandi salah');

  if (account && account.terkunci_sampai && new Date(account.terkunci_sampai) > new Date()) {
    throw new AppError(429, 'Akun dikunci sementara karena terlalu banyak percobaan gagal. Coba lagi nanti.', 'ACCOUNT_LOCKED');
  }
  const ok = await bcrypt.compare(plain, account ? account.password_hash : DUMMY_HASH);
  if (!account || !ok) {
    if (account) {
      const attempts = account.gagal_login + 1;
      const lock = attempts >= config.maxLoginAttempts;
      await pool.query(
        `UPDATE ${table} SET gagal_login = $2, terkunci_sampai = $3 WHERE id = $1`,
        [account.id, lock ? 0 : attempts, lock ? new Date(Date.now() + config.lockMinutes * 60000) : null]
      );
    }
    throw invalid;
  }
  if (account.status !== 'aktif') throw new AppError(403, 'Akun tidak aktif', 'ACCOUNT_INACTIVE');

  await pool.query(`UPDATE ${table} SET gagal_login = 0, terkunci_sampai = NULL WHERE id = $1`, [account.id]);
  return { token: signToken(account.id, role), user: { id: account.id, nama: account.nama, email: account.email, no_hp: account.no_hp || null, role } };
}

const loginSchema = Joi.object({
  identifier: Joi.string().trim().max(160).required().messages({ 'any.required': 'Email atau nomor HP wajib diisi', 'string.empty': 'Email atau nomor HP wajib diisi' }),
  password: Joi.string().max(200).required().messages({ 'any.required': 'Kata sandi wajib diisi', 'string.empty': 'Kata sandi wajib diisi' }),
});

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const v = validate(loginSchema, req.body);
    const byEmail = v.identifier.includes('@');
    const param = byEmail ? v.identifier.toLowerCase() : normalizePhone(v.identifier) || v.identifier;
    res.json(
      await loginAccount({
        table: 'members', statusCol: 'status_akun', role: 'member', plain: v.password, param,
        where: byEmail ? 'lower(email) = $1' : 'no_hp = $1',
      })
    );
  })
);

// Login admin terpisah dari member (REG-06).
router.post(
  '/admin/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const v = validate(loginSchema, req.body);
    res.json(
      await loginAccount({
        table: 'admins', statusCol: 'status', role: 'admin', plain: v.password,
        param: v.identifier.toLowerCase(), where: 'lower(email) = $1',
      })
    );
  })
);

router.get(
  '/me',
  authenticate(),
  asyncHandler(async (req, res) => {
    const table = req.user.role === 'admin' ? 'admins' : 'members';
    const cols = req.user.role === 'admin' ? 'id, nama, email' : 'id, nama, email, no_hp, notif_email, notif_whatsapp';
    const { rows } = await pool.query(`SELECT ${cols} FROM ${table} WHERE id = $1`, [req.user.id]);
    res.json({ user: { ...rows[0], role: req.user.role } });
  })
);

// Pemulihan akses (REG-07): tautan dikirim lewat email bila SMTP dikonfigurasi (dev: juga dicatat di log server).
router.post(
  '/forgot-password',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const v = validate(Joi.object({ identifier: Joi.string().trim().max(160).required() }), req.body);
    const byEmail = v.identifier.includes('@');
    const { rows } = await pool.query(
      `SELECT id, nama, email FROM members WHERE ${byEmail ? 'lower(email) = $1' : 'no_hp = $1'}`,
      [byEmail ? v.identifier.toLowerCase() : normalizePhone(v.identifier) || v.identifier]
    );
    if (rows.length) {
      const token = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      await pool.query(
        `INSERT INTO password_resets (member_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')`,
        [rows[0].id, hash]
      );
      const link = `${config.appUrl}/reset-password?token=${token}`;
      if (mailer.enabled() && rows[0].email) {
        mailer
          .sendMail({
            to: rows[0].email,
            subject: '[Alpaka] Atur ulang kata sandi',
            title: 'Atur ulang kata sandi',
            body: `Halo ${rows[0].nama}, kami menerima permintaan mengatur ulang kata sandi akun Alpaka Anda. Tautan berlaku 1 jam. Abaikan email ini bila Anda tidak memintanya.`,
            link,
            linkLabel: 'Atur ulang kata sandi',
          })
          .catch((err) => console.error(`[reset-password] gagal kirim email: ${err.message}`));
      }
      // Di development tautan juga dicatat di log server (akun tanpa email / email belum dikonfigurasi).
      if (!config.isProd) console.log(`[reset-password] member #${rows[0].id}: ${link}`);
    }
    // Respons sama baik akun ada maupun tidak, agar tidak membocorkan data akun.
    res.json({ message: 'Jika akun terdaftar, instruksi pemulihan akan dikirim.' });
  })
);

router.post(
  '/reset-password',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const v = validate(Joi.object({ token: Joi.string().hex().length(64).required(), password }), req.body);
    const hash = crypto.createHash('sha256').update(v.token).digest('hex');
    const newHash = await bcrypt.hash(v.password, 10);
    await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE password_resets SET used_at = now()
          WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING member_id`,
        [hash]
      );
      if (!rows.length) throw unprocessable('Tautan pemulihan tidak valid atau sudah kedaluwarsa');
      await client.query(
        'UPDATE members SET password_hash = $2, gagal_login = 0, terkunci_sampai = NULL, sesi_valid_sejak = now(), updated_at = now() WHERE id = $1',
        [rows[0].member_id, newHash]
      );
      await audit(client, { pelakuTipe: 'member', pelakuId: rows[0].member_id, aksi: 'member.reset_password', objekTipe: 'member', objekId: rows[0].member_id });
    });
    res.json({ message: 'Kata sandi berhasil diubah. Silakan masuk.' });
  })
);

module.exports = { router, contact, readContact, password };
