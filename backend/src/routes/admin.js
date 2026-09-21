const express = require('express');
const Joi = require('joi');
const { pool, withTransaction } = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { audit } = require('../services/audit');
const receipts = require('../services/receipts');
const redeems = require('../services/redeems');
const { validate } = require('../utils/validate');
const { asyncHandler, parsePagination, notFound } = require('../utils/http');
const { sendReceiptFile } = require('./member');
const bcrypt = require('bcryptjs');
const { correctReceipt } = require('../services/corrections');
const { rewardImageUpload, saveRewardImage, removeRewardImage, imageUrl } = require('../services/rewardImages');
const { conflict } = require('../utils/http');

const router = express.Router();
router.use(authenticate('admin'));

const meta = ({ data, meta: m }, extra = {}) => ({ data, meta: { ...m, ...extra } });

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    res.json({ data: { struk: await receipts.queueSummary(), redeem: await redeems.queueSummary() } });
  })
);

// ---- Antrean & review struk (ADM-01..03, ADM-06) ----
router.get(
  '/receipts',
  asyncHandler(async (req, res) => {
    const { status, channel, from, to, q } = req.query;
    const result = await receipts.listReceipts({ filters: { status, channel, from, to, q }, pagination: parsePagination(req.query) });
    res.json(meta(result, { ringkasan: await receipts.queueSummary() }));
  })
);

router.get('/receipts/:id', asyncHandler(async (req, res) => res.json({ data: await receipts.getReceipt(req.params.id, { admin: true }) })));
router.get('/receipts/:id/files/:fileId', asyncHandler((req, res) => sendReceiptFile(req, res, null)));

router.post(
  '/receipts/:id/approve',
  asyncHandler(async (req, res) => {
    res.json({ data: await receipts.decideReceipt({ id: req.params.id, adminId: req.user.id, approve: true }) });
  })
);

router.post(
  '/receipts/:id/reject',
  asyncHandler(async (req, res) => {
    const v = validate(Joi.object({ alasan: Joi.string().trim().min(3).max(500).required().messages({ 'any.required': 'Alasan penolakan wajib diisi', 'string.empty': 'Alasan penolakan wajib diisi', 'string.min': 'Alasan penolakan terlalu pendek' }) }), req.body);
    res.json({ data: await receipts.decideReceipt({ id: req.params.id, adminId: req.user.id, approve: false, alasan: v.alasan }) });
  })
);

router.post(
  '/receipts/:id/correct',
  asyncHandler(async (req, res) => {
    const v = validate(Joi.object({ alasan: Joi.string().trim().min(3).max(500).required().messages({ 'any.required': 'Alasan koreksi wajib diisi', 'string.empty': 'Alasan koreksi wajib diisi', 'string.min': 'Alasan koreksi terlalu pendek' }) }), req.body);
    res.json({ data: await correctReceipt({ id: req.params.id, adminId: req.user.id, alasan: v.alasan }) });
  })
);

// ---- Antrean & review redeem (RDM) ----
router.get(
  '/redeems',
  asyncHandler(async (req, res) => {
    const result = await redeems.listRedeems({ status: req.query.status, q: req.query.q, pagination: parsePagination(req.query) });
    res.json(meta(result, { ringkasan: await redeems.queueSummary() }));
  })
);
router.get('/redeems/:id', asyncHandler(async (req, res) => res.json({ data: await redeems.getRedeem(req.params.id, { admin: true }) })));

router.post(
  '/redeems/:id/approve',
  asyncHandler(async (req, res) => {
    const v = validate(Joi.object({ detail_pemberian: Joi.string().trim().max(1000).allow('', null) }), req.body);
    res.json({ data: await redeems.approveRedeem({ id: req.params.id, adminId: req.user.id, detail: v.detail_pemberian || null }) });
  })
);

router.post(
  '/redeems/:id/reject',
  asyncHandler(async (req, res) => {
    const v = validate(Joi.object({ alasan: Joi.string().trim().min(3).max(500).required().messages({ 'any.required': 'Alasan penolakan wajib diisi', 'string.empty': 'Alasan penolakan wajib diisi', 'string.min': 'Alasan penolakan terlalu pendek' }) }), req.body);
    res.json({ data: await redeems.rejectRedeem({ id: req.params.id, adminId: req.user.id, alasan: v.alasan }) });
  })
);

// ---- Pengaturan auto-approve (ADM-04) ----
router.get(
  '/auto-approve',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.kode, c.kriteria, c.nilai, c.aktif, c.updated_at, a.nama AS diubah_oleh_nama
         FROM auto_approve_criteria c LEFT JOIN admins a ON a.id = c.diubah_oleh ORDER BY c.id`
    );
    res.json({ data: rows });
  })
);

const autoApproveSchema = Joi.object({
  channel: Joi.object({ aktif: Joi.boolean().required(), channels: Joi.array().items(Joi.string().trim().max(60)).max(50).required() }).required(),
  batas_nominal: Joi.object({ aktif: Joi.boolean().required(), maks: Joi.number().positive().max(9999999999999).required() }).required(),
});

router.put(
  '/auto-approve',
  asyncHandler(async (req, res) => {
    const v = validate(autoApproveSchema, req.body);
    await withTransaction(async (client) => {
      const next = {
        channel: { aktif: v.channel.aktif, nilai: { channels: v.channel.channels } },
        batas_nominal: { aktif: v.batas_nominal.aktif, nilai: { maks: v.batas_nominal.maks } },
      };
      for (const [kode, c] of Object.entries(next)) {
        await client.query(
          'UPDATE auto_approve_criteria SET aktif = $2, nilai = $3, diubah_oleh = $4, updated_at = now() WHERE kode = $1',
          [kode, c.aktif, JSON.stringify(c.nilai), req.user.id]
        );
      }
      await audit(client, { pelakuTipe: 'admin', pelakuId: req.user.id, aksi: 'pengaturan.auto_approve', objekTipe: 'pengaturan', detail: next });
    });
    const { rows } = await pool.query('SELECT id, kode, kriteria, nilai, aktif, updated_at FROM auto_approve_criteria ORDER BY id');
    res.json({ data: rows });
  })
);

// ---- Pengaturan program: aturan poin, masa klaim, batas file, channel (OI-03/04/06/07) ----
const settingsSchema = Joi.object({
  point_rule: Joi.object({
    rupiah_per_poin: Joi.number().integer().min(1).max(1000000000).required(),
    pembulatan: Joi.string().valid('bawah', 'atas', 'terdekat').required(),
    minimal_transaksi: Joi.number().min(0).max(9999999999999).required(),
  }).required(),
  claim_window_days: Joi.number().integer().min(1).max(3650).required(),
  min_nominal: Joi.number().min(0).max(9999999999999).required(),
  max_file_size_mb: Joi.number().integer().min(1).max(20).required(),
  max_files: Joi.number().integer().min(1).max(10).required(),
  channels: Joi.array().items(Joi.string().trim().min(1).max(60)).min(1).max(50).unique().required(),
  terms_text: Joi.string().allow('').max(20000), // opsional: bila tidak dikirim, teks yang ada tidak diubah
});

router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const { getSettings, getPointRule } = require('../services/settings');
    res.json({ data: { ...(await getSettings(pool)), point_rule: await getPointRule(pool) } });
  })
);

router.put(
  '/settings',
  asyncHandler(async (req, res) => {
    const v = validate(settingsSchema, req.body);
    const { point_rule: rule, ...rest } = v;
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE point_rules SET rupiah_per_poin = $1, pembulatan = $2, minimal_transaksi = $3,
                diubah_oleh = $4, updated_at = now() WHERE id = 1`,
        [rule.rupiah_per_poin, rule.pembulatan, rule.minimal_transaksi, req.user.id]
      );
      for (const [key, value] of Object.entries(rest)) {
        await client.query(
          `INSERT INTO app_settings (key, value, diubah_oleh) VALUES ($1, $2, $3)
           ON CONFLICT (key) DO UPDATE SET value = $2, diubah_oleh = $3, updated_at = now()`,
          [key, JSON.stringify(value), req.user.id]
        );
      }
      await audit(client, { pelakuTipe: 'admin', pelakuId: req.user.id, aksi: 'pengaturan.program', objekTipe: 'pengaturan', detail: v });
    });
    const { getSettings, getPointRule } = require('../services/settings');
    res.json({ data: { ...(await getSettings(pool)), point_rule: await getPointRule(pool) } });
  })
);

// ---- Manajemen reward (RDM-07) ----
const rewardSchema = Joi.object({
  nama: Joi.string().trim().min(2).max(120).required().messages({ 'any.required': 'Nama reward wajib diisi', 'string.empty': 'Nama reward wajib diisi' }),
  deskripsi: Joi.string().trim().max(500).allow('', null),
  poin_dibutuhkan: Joi.number().integer().min(1).max(100000000).required().messages({ 'any.required': 'Poin wajib diisi', 'number.base': 'Poin harus berupa angka' }),
  aktif: Joi.boolean().default(true),
});

const withImage = ({ gambar_file, gambar_mime, ...r }) => ({ ...r, gambar_url: imageUrl({ ...r, gambar_file }) });

router.get('/rewards', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM rewards ORDER BY aktif DESC, poin_dibutuhkan, id');
  res.json({ data: rows.map(withImage) });
}));

router.post('/rewards', asyncHandler(async (req, res) => {
  const v = validate(rewardSchema, req.body);
  const row = await withTransaction(async (client) => {
    const { rows } = await client.query(
      'INSERT INTO rewards (nama, deskripsi, poin_dibutuhkan, aktif) VALUES ($1, $2, $3, $4) RETURNING *',
      [v.nama, v.deskripsi || null, v.poin_dibutuhkan, v.aktif]
    );
    await audit(client, { pelakuTipe: 'admin', pelakuId: req.user.id, aksi: 'reward.buat', objekTipe: 'reward', objekId: rows[0].id, detail: v });
    return rows[0];
  });
  res.status(201).json({ data: withImage(row) });
}));

router.put('/rewards/:id', asyncHandler(async (req, res) => {
  const v = validate(rewardSchema, req.body);
  const row = await withTransaction(async (client) => {
    const { rows } = await client.query(
      'UPDATE rewards SET nama = $2, deskripsi = $3, poin_dibutuhkan = $4, aktif = $5 WHERE id = $1 RETURNING *',
      [req.params.id, v.nama, v.deskripsi || null, v.poin_dibutuhkan, v.aktif]
    );
    if (!rows.length) throw notFound('Reward tidak ditemukan');
    await audit(client, { pelakuTipe: 'admin', pelakuId: req.user.id, aksi: 'reward.ubah', objekTipe: 'reward', objekId: rows[0].id, detail: v });
    return rows[0];
  });
  res.json({ data: withImage(row) });
}));

// Gambar reward (OI-09): unggah/ganti dan hapus.
router.post('/rewards/:id/image', rewardImageUpload, asyncHandler(async (req, res) => {
  const { rows: cur } = await pool.query('SELECT gambar_file FROM rewards WHERE id = $1', [req.params.id]);
  if (!cur.length) throw notFound('Reward tidak ditemukan');
  const saved = await saveRewardImage(req.file);
  const { rows } = await pool.query('UPDATE rewards SET gambar_file = $2, gambar_mime = $3 WHERE id = $1 RETURNING *', [req.params.id, saved.name, saved.mime]);
  await removeRewardImage(cur[0].gambar_file);
  await audit(pool, { pelakuTipe: 'admin', pelakuId: req.user.id, aksi: 'reward.gambar', objekTipe: 'reward', objekId: rows[0].id });
  res.json({ data: withImage(rows[0]) });
}));

router.delete('/rewards/:id/image', asyncHandler(async (req, res) => {
  const { rows: cur } = await pool.query('SELECT gambar_file FROM rewards WHERE id = $1', [req.params.id]);
  if (!cur.length) throw notFound('Reward tidak ditemukan');
  await pool.query('UPDATE rewards SET gambar_file = NULL, gambar_mime = NULL WHERE id = $1', [req.params.id]);
  await removeRewardImage(cur[0].gambar_file);
  res.json({ message: 'ok' });
}));

// ---- Manajemen admin (OI-13): semua admin berhak akses penuh; tidak ada peran bertingkat di Fase 1 ----
router.get('/admins', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT id, nama, email, status, created_at FROM admins ORDER BY id');
  res.json({ data: rows });
}));

const passwordRule = Joi.string().min(8).max(72).messages({ 'string.min': 'Kata sandi minimal 8 karakter', 'string.max': 'Kata sandi maksimal 72 karakter' });

router.post('/admins', asyncHandler(async (req, res) => {
  const v = validate(Joi.object({
    nama: Joi.string().trim().min(2).max(120).required().messages({ 'any.required': 'Nama wajib diisi', 'string.empty': 'Nama wajib diisi' }),
    email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(160).required().messages({ 'any.required': 'Email wajib diisi', 'string.email': 'Format email tidak valid', 'string.empty': 'Email wajib diisi' }),
    password: passwordRule.required().messages({ 'any.required': 'Kata sandi wajib diisi' }),
  }), req.body);
  try {
    const row = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'INSERT INTO admins (nama, email, password_hash) VALUES ($1, $2, $3) RETURNING id, nama, email, status, created_at',
        [v.nama, v.email, await bcrypt.hash(v.password, 10)]
      );
      await audit(client, { pelakuTipe: 'admin', pelakuId: req.user.id, aksi: 'admin.buat', objekTipe: 'admin', objekId: rows[0].id, detail: { email: v.email } });
      return rows[0];
    });
    res.status(201).json({ data: row });
  } catch (err) {
    if (err.code === '23505') throw conflict('Email admin sudah terdaftar.', 'IDENTIFIER_EXISTS');
    throw err;
  }
}));

router.patch('/admins/:id', asyncHandler(async (req, res) => {
  const v = validate(Joi.object({ status: Joi.string().valid('aktif', 'nonaktif'), password: passwordRule }).or('status', 'password'), req.body);
  const row = await withTransaction(async (client) => {
    const { rows: cur } = await client.query('SELECT id, status FROM admins WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!cur.length) throw notFound('Admin tidak ditemukan');
    const sets = [];
    const params = [req.params.id];
    const detail = {};
    if (v.status && v.status !== cur[0].status) {
      if (v.status === 'nonaktif') {
        if (String(req.user.id) === String(req.params.id)) throw conflict('Anda tidak dapat menonaktifkan akun sendiri.', 'SELF_DEACTIVATE');
        const { rows: active } = await client.query("SELECT COUNT(*)::int AS n FROM admins WHERE status = 'aktif' AND id <> $1", [req.params.id]);
        if (active[0].n < 1) throw conflict('Minimal harus ada satu admin aktif.', 'LAST_ADMIN');
      }
      params.push(v.status);
      sets.push(`status = $${params.length}`, 'sesi_valid_sejak = now()');
      detail.status = v.status;
    }
    if (v.password) {
      params.push(await bcrypt.hash(v.password, 10));
      sets.push(`password_hash = $${params.length}`, 'gagal_login = 0', 'terkunci_sampai = NULL', 'sesi_valid_sejak = now()');
      detail.password = 'direset';
    }
    if (!sets.length) return (await client.query('SELECT id, nama, email, status, created_at FROM admins WHERE id = $1', [req.params.id])).rows[0];
    const { rows } = await client.query(`UPDATE admins SET ${[...new Set(sets)].join(', ')} WHERE id = $1 RETURNING id, nama, email, status, created_at`, params);
    await audit(client, { pelakuTipe: 'admin', pelakuId: req.user.id, aksi: 'admin.ubah', objekTipe: 'admin', objekId: rows[0].id, detail });
    return rows[0];
  });
  res.json({ data: row });
}));

// ---- Manajemen member: daftar dengan saldo, aktif/nonaktifkan akun ----
router.get('/members', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const params = [];
  const where = [];
  if (req.query.status) { params.push(req.query.status); where.push(`m.status_akun = $${params.length}`); }
  if (req.query.q) { params.push(`%${req.query.q}%`); where.push(`(m.nama ILIKE $${params.length} OR m.email ILIKE $${params.length} OR m.no_hp ILIKE $${params.length})`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows: count } = await pool.query(`SELECT COUNT(*)::int AS total FROM members m ${clause}`, params);
  const { rows } = await pool.query(
    `SELECT m.id, m.nama, m.email, m.no_hp, m.status_akun, m.created_at,
            COALESCE(s.masuk, 0) - COALESCE(s.terpakai, 0) - COALESCE(s.koreksi, 0) AS total,
            COALESCE(s.masuk, 0) - COALESCE(s.hold, 0) + COALESCE(s.lepas, 0) - COALESCE(s.koreksi, 0) AS tersedia,
            (SELECT COUNT(*)::int FROM receipts r WHERE r.member_id = m.id) AS jumlah_struk
       FROM members m
       LEFT JOIN (
         SELECT member_id,
                SUM(jumlah) FILTER (WHERE jenis = 'masuk')::int AS masuk, SUM(jumlah) FILTER (WHERE jenis = 'hold')::int AS hold,
                SUM(jumlah) FILTER (WHERE jenis = 'terpakai')::int AS terpakai, SUM(jumlah) FILTER (WHERE jenis = 'lepas')::int AS lepas,
                SUM(jumlah) FILTER (WHERE jenis = 'koreksi')::int AS koreksi
           FROM points_ledger GROUP BY member_id) s ON s.member_id = m.id
       ${clause} ORDER BY m.created_at DESC, m.id DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  res.json({ data: rows, meta: { page, limit, total: count[0].total } });
}));

router.patch('/members/:id', asyncHandler(async (req, res) => {
  const v = validate(Joi.object({ status_akun: Joi.string().valid('aktif', 'nonaktif').required() }), req.body);
  const row = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE members SET status_akun = $2::varchar, sesi_valid_sejak = CASE WHEN $2::varchar = 'nonaktif' THEN now() ELSE sesi_valid_sejak END, updated_at = now()
        WHERE id = $1 RETURNING id, nama, email, no_hp, status_akun`,
      [req.params.id, v.status_akun]
    );
    if (!rows.length) throw notFound('Member tidak ditemukan');
    await audit(client, { pelakuTipe: 'admin', pelakuId: req.user.id, aksi: v.status_akun === 'aktif' ? 'member.aktifkan' : 'member.nonaktifkan', objekTipe: 'member', objekId: rows[0].id });
    return rows[0];
  });
  res.json({ data: row });
}));

// ---- Log audit: hanya baca (ADM-05, BR-12, NFR-06) ----
router.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req.query, 25);
    const params = [];
    const where = [];
    const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
    if (req.query.pelaku_tipe) add('l.pelaku_tipe = ?', req.query.pelaku_tipe);
    if (req.query.aksi) add('l.aksi LIKE ?', `${req.query.aksi}%`);
    if (req.query.objek_tipe) add('l.objek_tipe = ?', req.query.objek_tipe);
    if (req.query.from) add('l.created_at::date >= ?', req.query.from);
    if (req.query.to) add('l.created_at::date <= ?', req.query.to);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows: count } = await pool.query(`SELECT COUNT(*)::int AS total FROM audit_logs l ${clause}`, params);
    const { rows } = await pool.query(
      `SELECT l.id, l.pelaku_tipe, l.pelaku_id, l.aksi, l.objek_tipe, l.objek_id, l.detail, l.created_at,
              CASE l.pelaku_tipe WHEN 'admin' THEN a.nama WHEN 'member' THEN m.nama ELSE 'Sistem' END AS pelaku_nama
         FROM audit_logs l
         LEFT JOIN admins a ON l.pelaku_tipe = 'admin' AND a.id = l.pelaku_id
         LEFT JOIN members m ON l.pelaku_tipe = 'member' AND m.id = l.pelaku_id
         ${clause}
        ORDER BY l.created_at DESC, l.id DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    res.json({ data: rows, meta: { page, limit, total: count[0].total } });
  })
);

module.exports = { router };
