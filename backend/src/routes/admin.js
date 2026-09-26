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
const rewardsService = require('../services/rewards');
const { conflict } = require('../utils/http');
const { writeAccess, superOnly } = require('../middleware/adminRole');
const tiersService = require('../services/tiers');
const vouchersService = require('../services/vouchers');
const { manualAdjustment } = require('../services/points');
const { getBalance } = require('../services/points');
const metrics = require('../services/metrics');
const { sendCsv } = require('../utils/csv');
const { getSettings, getPointRule, listChannelPointRules } = require('../services/settings');

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
  writeAccess,
  asyncHandler(async (req, res) => {
    res.json({ data: await receipts.decideReceipt({ id: req.params.id, adminId: req.user.id, approve: true }) });
  })
);

router.post(
  '/receipts/:id/reject',
  writeAccess,
  asyncHandler(async (req, res) => {
    const v = validate(Joi.object({ alasan: Joi.string().trim().min(3).max(500).required().messages({ 'any.required': 'Alasan penolakan wajib diisi', 'string.empty': 'Alasan penolakan wajib diisi', 'string.min': 'Alasan penolakan terlalu pendek' }) }), req.body);
    res.json({ data: await receipts.decideReceipt({ id: req.params.id, adminId: req.user.id, approve: false, alasan: v.alasan }) });
  })
);

router.post(
  '/receipts/:id/correct',
  writeAccess,
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
  writeAccess,
  asyncHandler(async (req, res) => {
    const v = validate(Joi.object({ detail_pemberian: Joi.string().trim().max(1000).allow('', null) }), req.body);
    res.json({ data: await redeems.approveRedeem({ id: req.params.id, adminId: req.user.id, detail: v.detail_pemberian || null }) });
  })
);

router.post(
  '/redeems/:id/reject',
  writeAccess,
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
  superOnly,
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
    res.json({ data: { ...(await getSettings(pool)), point_rule: await getPointRule(pool) } });
  })
);

router.put(
  '/settings',
  superOnly,
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
    res.json({ data: { ...(await getSettings(pool)), point_rule: await getPointRule(pool) } });
  })
);

// ---- Manajemen reward (RDM-07) ----
const rewardSchema = Joi.object({
  nama: Joi.string().trim().min(2).max(120).required().messages({ 'any.required': 'Nama reward wajib diisi', 'string.empty': 'Nama reward wajib diisi' }),
  deskripsi: Joi.string().trim().max(500).allow('', null),
  poin_dibutuhkan: Joi.number().integer().min(1).max(100000000).required().messages({ 'any.required': 'Poin wajib diisi', 'number.base': 'Poin harus berupa angka' }),
  aktif: Joi.boolean().default(true),
  stok: Joi.number().integer().min(0).allow(null), // kosong/null = tanpa batas (tambahan.md poin 2)
  tier_minimum_id: Joi.number().integer().allow(null),
  valid_from: Joi.date().iso().allow(null, ''),
  valid_until: Joi.date().iso().allow(null, ''),
  berlaku_hari: Joi.number().integer().min(1).max(3650).default(30), // masa berlaku voucher setelah redeem disetujui
});

const withImage = ({ gambar_file, gambar_mime, ...r }) => ({
  ...r,
  gambar_url: imageUrl({ ...r, gambar_file }),
  status_stok: rewardsService.statusStok(r.stok),
});

router.get('/rewards', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.*, t.nama AS tier_minimum_nama FROM rewards r LEFT JOIN tiers t ON t.id = r.tier_minimum_id ORDER BY r.aktif DESC, r.poin_dibutuhkan, r.id`
  );
  res.json({ data: rows.map(withImage) });
}));

const rewardValues = (v) => [v.nama, v.deskripsi || null, v.poin_dibutuhkan, v.aktif, v.stok ?? null, v.tier_minimum_id || null, v.valid_from || null, v.valid_until || null, v.berlaku_hari];

router.post('/rewards', writeAccess, asyncHandler(async (req, res) => {
  const v = validate(rewardSchema, req.body);
  const row = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO rewards (nama, deskripsi, poin_dibutuhkan, aktif, stok, tier_minimum_id, valid_from, valid_until, berlaku_hari)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      rewardValues(v)
    );
    await audit(client, { pelakuTipe: 'admin', pelakuId: req.user.id, aksi: 'reward.buat', objekTipe: 'reward', objekId: rows[0].id, detail: v });
    return rows[0];
  });
  res.status(201).json({ data: withImage(row) });
}));

router.put('/rewards/:id', writeAccess, asyncHandler(async (req, res) => {
  const v = validate(rewardSchema, req.body);
  const row = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE rewards SET nama=$2, deskripsi=$3, poin_dibutuhkan=$4, aktif=$5, stok=$6, tier_minimum_id=$7, valid_from=$8, valid_until=$9, berlaku_hari=$10
        WHERE id=$1 RETURNING *`,
      [req.params.id, ...rewardValues(v)]
    );
    if (!rows.length) throw notFound('Reward tidak ditemukan');
    await audit(client, { pelakuTipe: 'admin', pelakuId: req.user.id, aksi: 'reward.ubah', objekTipe: 'reward', objekId: rows[0].id, detail: v });
    return rows[0];
  });
  res.json({ data: withImage(row) });
}));

// Gambar reward (OI-09): unggah/ganti dan hapus.
router.post('/rewards/:id/image', writeAccess, rewardImageUpload, asyncHandler(async (req, res) => {
  const { rows: cur } = await pool.query('SELECT gambar_file FROM rewards WHERE id = $1', [req.params.id]);
  if (!cur.length) throw notFound('Reward tidak ditemukan');
  const saved = await saveRewardImage(req.file);
  const { rows } = await pool.query('UPDATE rewards SET gambar_file = $2, gambar_mime = $3 WHERE id = $1 RETURNING *', [req.params.id, saved.name, saved.mime]);
  await removeRewardImage(cur[0].gambar_file);
  await audit(pool, { pelakuTipe: 'admin', pelakuId: req.user.id, aksi: 'reward.gambar', objekTipe: 'reward', objekId: rows[0].id });
  res.json({ data: withImage(rows[0]) });
}));

router.delete('/rewards/:id/image', writeAccess, asyncHandler(async (req, res) => {
  const { rows: cur } = await pool.query('SELECT gambar_file FROM rewards WHERE id = $1', [req.params.id]);
  if (!cur.length) throw notFound('Reward tidak ditemukan');
  await pool.query('UPDATE rewards SET gambar_file = NULL, gambar_mime = NULL WHERE id = $1', [req.params.id]);
  await removeRewardImage(cur[0].gambar_file);
  res.json({ message: 'ok' });
}));

// ---- Manajemen admin (OI-13): semua admin berhak akses penuh; tidak ada peran bertingkat di Fase 1 ----
router.get('/admins', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT id, nama, email, status, role, created_at FROM admins ORDER BY id');
  res.json({ data: rows });
}));

const passwordRule = Joi.string().min(8).max(72).messages({ 'string.min': 'Kata sandi minimal 8 karakter', 'string.max': 'Kata sandi maksimal 72 karakter' });
const roleRule = Joi.string().valid('super_admin', 'approver', 'viewer'); // RBAC (tambahan.md poin 6)

router.post('/admins', superOnly, asyncHandler(async (req, res) => {
  const v = validate(Joi.object({
    nama: Joi.string().trim().min(2).max(120).required().messages({ 'any.required': 'Nama wajib diisi', 'string.empty': 'Nama wajib diisi' }),
    email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(160).required().messages({ 'any.required': 'Email wajib diisi', 'string.email': 'Format email tidak valid', 'string.empty': 'Email wajib diisi' }),
    password: passwordRule.required().messages({ 'any.required': 'Kata sandi wajib diisi' }),
    role: roleRule.default('viewer'),
  }), req.body);
  try {
    const row = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'INSERT INTO admins (nama, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, nama, email, status, role, created_at',
        [v.nama, v.email, await bcrypt.hash(v.password, 10), v.role]
      );
      await audit(client, { pelakuTipe: 'admin', pelakuId: req.user.id, aksi: 'admin.buat', objekTipe: 'admin', objekId: rows[0].id, detail: { email: v.email, role: v.role } });
      return rows[0];
    });
    res.status(201).json({ data: row });
  } catch (err) {
    if (err.code === '23505') throw conflict('Email admin sudah terdaftar.', 'IDENTIFIER_EXISTS');
    throw err;
  }
}));

router.patch('/admins/:id', superOnly, asyncHandler(async (req, res) => {
  const v = validate(Joi.object({ status: Joi.string().valid('aktif', 'nonaktif'), password: passwordRule, role: roleRule }).or('status', 'password', 'role'), req.body);
  const row = await withTransaction(async (client) => {
    const { rows: cur } = await client.query('SELECT id, status, role FROM admins WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!cur.length) throw notFound('Admin tidak ditemukan');
    const sets = [];
    const params = [req.params.id];
    const detail = {};
    const isSelf = String(req.user.id) === String(req.params.id);
    if (v.status && v.status !== cur[0].status) {
      if (v.status === 'nonaktif') {
        if (isSelf) throw conflict('Anda tidak dapat menonaktifkan akun sendiri.', 'SELF_DEACTIVATE');
        const { rows: active } = await client.query("SELECT COUNT(*)::int AS n FROM admins WHERE status = 'aktif' AND role = 'super_admin' AND id <> $1", [req.params.id]);
        if (cur[0].role === 'super_admin' && active[0].n < 1) throw conflict('Minimal harus ada satu super admin aktif.', 'LAST_ADMIN');
      }
      params.push(v.status);
      sets.push(`status = $${params.length}`, 'sesi_valid_sejak = now()');
      detail.status = v.status;
    }
    if (v.role && v.role !== cur[0].role) {
      if (isSelf && cur[0].role === 'super_admin' && v.role !== 'super_admin') {
        const { rows: others } = await client.query("SELECT COUNT(*)::int AS n FROM admins WHERE role = 'super_admin' AND status = 'aktif' AND id <> $1", [req.params.id]);
        if (others[0].n < 1) throw conflict('Tidak dapat menurunkan peran diri sendiri: ini super admin aktif terakhir.', 'LAST_ADMIN');
      }
      params.push(v.role);
      sets.push(`role = $${params.length}`, 'sesi_valid_sejak = now()');
      detail.role = v.role;
    }
    if (v.password) {
      params.push(await bcrypt.hash(v.password, 10));
      sets.push(`password_hash = $${params.length}`, 'gagal_login = 0', 'terkunci_sampai = NULL', 'sesi_valid_sejak = now()');
      detail.password = 'direset';
    }
    if (!sets.length) return (await client.query('SELECT id, nama, email, status, role, created_at FROM admins WHERE id = $1', [req.params.id])).rows[0];
    const { rows } = await client.query(`UPDATE admins SET ${[...new Set(sets)].join(', ')} WHERE id = $1 RETURNING id, nama, email, status, role, created_at`, params);
    await audit(client, { pelakuTipe: 'admin', pelakuId: req.user.id, aksi: 'admin.ubah', objekTipe: 'admin', objekId: rows[0].id, detail });
    return rows[0];
  });
  res.json({ data: row });
}));

// ---- Manajemen member: daftar dengan saldo, aktif/nonaktifkan akun ----
router.get('/members', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const memberFilters = validate(Joi.object({
    tier_id: Joi.string().pattern(/^[1-9]\d*$/).allow(''),
    tier_source: Joi.string().valid('manual', 'otomatis'),
  }).unknown(true), req.query);
  const params = [];
  const where = [];
  if (req.query.status) { params.push(req.query.status); where.push(`m.status_akun = $${params.length}`); }
  if (req.query.q) { params.push(`%${req.query.q}%`); where.push(`(m.nama ILIKE $${params.length} OR m.email ILIKE $${params.length} OR m.no_hp ILIKE $${params.length})`); }
  if (memberFilters.tier_source === 'manual') where.push('m.manual_tier_id IS NOT NULL');
  if (memberFilters.tier_source === 'otomatis') where.push('m.manual_tier_id IS NULL');
  if (memberFilters.tier_id) {
    params.push(memberFilters.tier_id);
    where.push(`m.current_tier_id = $${params.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [countResult, memberResult, tiers] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total FROM members m ${clause}`, params),
    pool.query(
      `SELECT m.id, m.nama, m.email, m.no_hp, m.status_akun, m.created_at, m.current_tier_id, m.manual_tier_id,
              COALESCE(s.masuk, 0) + COALESCE(s.kembalian, 0) - COALESCE(s.terpakai, 0) - COALESCE(s.koreksi, 0) AS total,
              COALESCE(s.masuk, 0) - COALESCE(s.koreksi, 0) AS poin_lifetime,
              COALESCE(s.masuk, 0) + COALESCE(s.kembalian, 0) - COALESCE(s.hold, 0) + COALESCE(s.lepas, 0) - COALESCE(s.koreksi, 0) AS tersedia,
              (SELECT COUNT(*)::int FROM receipts r WHERE r.member_id = m.id) AS jumlah_struk
         FROM members m
         LEFT JOIN (
           SELECT member_id,
                  SUM(jumlah) FILTER (WHERE jenis = 'masuk')::int AS masuk, SUM(jumlah) FILTER (WHERE jenis = 'hold')::int AS hold,
                  SUM(jumlah) FILTER (WHERE jenis = 'terpakai')::int AS terpakai, SUM(jumlah) FILTER (WHERE jenis = 'lepas')::int AS lepas,
                  SUM(jumlah) FILTER (WHERE jenis = 'koreksi')::int AS koreksi, SUM(jumlah) FILTER (WHERE jenis = 'kembalian')::int AS kembalian
             FROM points_ledger GROUP BY member_id) s ON s.member_id = m.id
         ${clause} ORDER BY m.created_at DESC, m.id DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    ),
    tiersService.listTiers(pool),
  ]);
  const data = memberResult.rows.map((row) => {
    const memberProgress = tiersService.progress(tiers, row.poin_lifetime, {
      currentTierId: row.current_tier_id,
      manual: row.manual_tier_id !== null,
    });
    return {
      ...row,
      tier_manual: row.manual_tier_id !== null,
      current_tier_nama: memberProgress.tier_saat_ini?.nama || null,
      tier_otomatis_nama: memberProgress.tier_otomatis?.nama || null,
      tier_berikutnya_nama: memberProgress.tier_berikutnya?.nama || null,
      poin_dibutuhkan: memberProgress.poin_dibutuhkan,
      persen: memberProgress.persen,
    };
  });
  res.json({ data, meta: { page, limit, total: countResult.rows[0].total } });
}));

router.patch('/members/:id', writeAccess, asyncHandler(async (req, res) => {
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

router.patch('/members/:id/tier', writeAccess, asyncHandler(async (req, res) => {
  const v = validate(Joi.object({
    tier_id: Joi.string().pattern(/^[1-9]\d*$/).allow(null).required().messages({
      'any.required': 'Tier tujuan wajib diisi',
      'string.pattern.base': 'Tier tujuan tidak valid',
    }),
    alasan: Joi.string().trim().min(3).max(500).required().messages({
      'any.required': 'Alasan wajib diisi',
      'string.empty': 'Alasan wajib diisi',
      'string.min': 'Alasan terlalu pendek',
    }),
  }), req.body);
  const row = await withTransaction((client) => tiersService.assignTier(client, {
    memberId: req.params.id,
    tierId: v.tier_id,
    reason: v.alasan,
    adminId: req.user.id,
  }));
  res.json({ data: row });
}));

// ---- Tier & Progress (tambahan.md poin 1) ----
const tierSchema = Joi.object({
  nama: Joi.string().trim().min(1).max(60).required(),
  urutan: Joi.number().integer().min(1).required(),
  min_poin: Joi.number().integer().min(0).required(),
  benefit: Joi.string().allow('', null).max(1000),
});

router.get('/tiers', asyncHandler(async (req, res) => {
  res.json({ data: await tiersService.listTiers(pool) });
}));

router.post('/tiers', superOnly, asyncHandler(async (req, res) => {
  const v = validate(tierSchema, req.body);
  try {
    const row = await withTransaction(async (client) => {
      await tiersService.validateTierDefinition(client, v);
      const { rows } = await client.query('INSERT INTO tiers (nama, urutan, min_poin, benefit) VALUES ($1,$2,$3,$4) RETURNING *', [v.nama, v.urutan, v.min_poin, v.benefit || null]);
      await audit(client, { pelakuTipe: 'admin', pelakuId: req.user.id, aksi: 'tier.buat', objekTipe: 'tier', objekId: rows[0].id, detail: v });
      await tiersService.reevaluateAll(client);
      return rows[0];
    });
    res.status(201).json({ data: row });
  } catch (err) {
    if (err.code === '23505') throw conflict('Urutan tier sudah dipakai tier lain.', 'ORDER_TAKEN');
    throw err;
  }
}));

router.put('/tiers/:id', superOnly, asyncHandler(async (req, res) => {
  const v = validate(tierSchema, req.body);
  try {
    const row = await withTransaction(async (client) => {
      await tiersService.validateTierDefinition(client, v, req.params.id);
      const { rows: existing } = await client.query('SELECT urutan, min_poin FROM tiers WHERE id = $1', [req.params.id]);
      if (!existing.length) throw notFound('Tier tidak ditemukan');
      const definitionChanged = Number(existing[0].urutan) !== v.urutan || Number(existing[0].min_poin) !== v.min_poin;
      const { rows } = await client.query('UPDATE tiers SET nama=$2, urutan=$3, min_poin=$4, benefit=$5 WHERE id=$1 RETURNING *', [req.params.id, v.nama, v.urutan, v.min_poin, v.benefit || null]);
      await audit(client, { pelakuTipe: 'admin', pelakuId: req.user.id, aksi: 'tier.ubah', objekTipe: 'tier', objekId: rows[0].id, detail: v });
      if (definitionChanged) await tiersService.reevaluateAll(client);
      return rows[0];
    });
    res.json({ data: row });
  } catch (err) {
    if (err.code === '23505') throw conflict('Urutan tier sudah dipakai tier lain.', 'ORDER_TAKEN');
    throw err;
  }
}));

router.delete('/tiers/:id', superOnly, asyncHandler(async (req, res) => {
  try {
    await withTransaction(async (client) => {
      await tiersService.lockTierDefinitions(client);
      const { rows: used } = await client.query(
        `SELECT (SELECT COUNT(*)::int FROM members WHERE current_tier_id = $1) AS member,
                (SELECT COUNT(*)::int FROM rewards WHERE tier_minimum_id = $1) AS reward`,
        [req.params.id]
      );
      if (used[0].member > 0 || used[0].reward > 0) {
        throw conflict(`Tier masih digunakan oleh ${used[0].member} member dan ${used[0].reward} reward, tidak dapat dihapus.`, 'TIER_IN_USE');
      }
      const { rowCount } = await client.query('DELETE FROM tiers WHERE id = $1', [req.params.id]);
      if (!rowCount) throw notFound('Tier tidak ditemukan');
      await audit(client, { pelakuTipe: 'admin', pelakuId: req.user.id, aksi: 'tier.hapus', objekTipe: 'tier', objekId: req.params.id });
    });
    res.json({ message: 'ok' });
  } catch (err) {
    if (err.code === '23503') throw conflict('Tier pernah digunakan dan tidak dapat dihapus.', 'TIER_IN_USE');
    throw err;
  }
}));

router.get('/tiers/growth', asyncHandler(async (req, res) => {
  res.json({ data: await metrics.tierGrowth(Number(req.query.months) || 6) });
}));

// ---- Voucher Management (tambahan.md poin 3) ----
// Filter halaman voucher. `status` menerima satu nilai atau daftar dipisah koma (mis. ?status=active,void).
const STATUS_VOUCHER = ['active', 'reserved', 'used', 'expired', 'void'];
const voucherFilterSchema = Joi.object({
  status: Joi.string()
    .custom((value, helpers) => (value.split(',').every((s) => STATUS_VOUCHER.includes(s)) ? value : helpers.message({ custom: 'Status voucher tidak dikenal' }))),
  sumber: Joi.string().valid('redeem', 'manual'),
  q: Joi.string().trim().max(120),
  from: Joi.date().iso(),
  to: Joi.date().iso(),
}).unknown(true);

router.get('/vouchers', asyncHandler(async (req, res) => {
  const f = validate(voucherFilterSchema, req.query);
  res.json(await vouchersService.listVouchers({ ...f, pagination: parsePagination(req.query), ringkasan: true }));
}));

// Jalankan pembersihan expiry & reservasi sekarang (selain scheduler) tanpa perlu menunggu interval.
router.post('/vouchers/maintenance', writeAccess, asyncHandler(async (req, res) => {
  const hasil = await vouchersService.runMaintenance();
  await audit(pool, { pelakuTipe: 'admin', pelakuId: req.user.id, aksi: 'voucher.maintenance', objekTipe: 'voucher', detail: hasil });
  res.json({ data: hasil });
}));

router.post('/vouchers', writeAccess, asyncHandler(async (req, res) => {
  const v = validate(Joi.object({
    member_id: Joi.number().integer().positive().required().messages({
      'any.required': 'Pilih member', 'number.base': 'Member tidak valid', 'number.positive': 'Member tidak valid',
    }),
    reward_id: Joi.number().integer().positive().required().messages({
      'any.required': 'Pilih reward', 'number.base': 'Reward tidak valid', 'number.positive': 'Reward tidak valid',
    }),
    jumlah: Joi.number().integer().min(1).max(vouchersService.MAX_BULK).default(1).messages({
      'any.required': 'Isi jumlah voucher',
      'number.base': 'Jumlah voucher harus berupa angka',
      'number.min': 'Jumlah voucher minimal 1',
      'number.max': `Jumlah voucher maksimal ${vouchersService.MAX_BULK} per permintaan`,
    }),
    berlaku_hari: Joi.number().integer().min(1).max(3650).messages({
      'number.base': 'Masa berlaku harus berupa angka',
      'number.min': 'Masa berlaku minimal 1 hari',
      'number.max': 'Masa berlaku maksimal 3650 hari',
    }),
    catatan: Joi.string().trim().max(500).allow('').messages({ 'string.max': 'Catatan maksimal 500 karakter' }),
  }), req.body);
  res.status(201).json({
    data: await vouchersService.createManual({
      memberId: v.member_id,
      rewardId: v.reward_id,
      jumlah: v.jumlah,
      berlakuHari: v.berlaku_hari || null,
      catatan: v.catatan || null,
      adminId: req.user.id,
    }),
  });
}));

router.get('/vouchers/:id', asyncHandler(async (req, res) => {
  res.json({ data: await vouchersService.getVoucher(req.params.id) });
}));

router.post('/vouchers/:id/extend', writeAccess, asyncHandler(async (req, res) => {
  const v = validate(Joi.object({
    tambah_hari: Joi.number().integer().min(1).max(365).required().messages({
      'any.required': 'Isi jumlah hari perpanjangan',
      'number.base': 'Jumlah hari harus berupa angka',
      'number.min': 'Perpanjangan minimal 1 hari',
      'number.max': 'Perpanjangan maksimal 365 hari',
    }),
    alasan: Joi.string().trim().min(3).max(500).required().messages({
      'any.required': 'Alasan wajib diisi', 'string.empty': 'Alasan wajib diisi',
      'string.min': 'Alasan terlalu pendek', 'string.max': 'Alasan maksimal 500 karakter',
    }),
  }), req.body);
  res.json({ data: await vouchersService.extendExpiry({ id: req.params.id, adminId: req.user.id, tambahHari: v.tambah_hari, alasan: v.alasan }) });
}));

router.post('/vouchers/:id/void', writeAccess, asyncHandler(async (req, res) => {
  const v = validate(Joi.object({ alasan: Joi.string().trim().min(3).max(500).required() }), req.body);
  res.json({ data: await vouchersService.voidVoucher({ id: req.params.id, adminId: req.user.id, alasan: v.alasan }) });
}));

// ---- Aturan poin per channel (Admin Dashboard poin 6: "bisa beda rule per channel") ----
router.get('/point-rules/channel', asyncHandler(async (req, res) => {
  res.json({ data: await listChannelPointRules(pool) });
}));

const channelRuleSchema = Joi.object({
  channel: Joi.string().trim().min(1).max(60).required(),
  rupiah_per_poin: Joi.number().integer().min(1).max(1000000000).required(),
  pembulatan: Joi.string().valid('bawah', 'atas', 'terdekat').required(),
  minimal_transaksi: Joi.number().min(0).max(9999999999999).required(),
});

router.put('/point-rules/channel', superOnly, asyncHandler(async (req, res) => {
  const v = validate(channelRuleSchema, req.body);
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO channel_point_rules (channel, rupiah_per_poin, pembulatan, minimal_transaksi, diubah_oleh)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (channel) DO UPDATE SET rupiah_per_poin=$2, pembulatan=$3, minimal_transaksi=$4, diubah_oleh=$5, updated_at=now()`,
      [v.channel, v.rupiah_per_poin, v.pembulatan, v.minimal_transaksi, req.user.id]
    );
    await audit(client, { pelakuTipe: 'admin', pelakuId: req.user.id, aksi: 'pengaturan.poin_channel', objekTipe: 'pengaturan', detail: v });
  });
  res.json({ data: await listChannelPointRules(pool) });
}));

router.delete('/point-rules/channel/:channel', superOnly, asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM channel_point_rules WHERE channel = $1', [req.params.channel]);
  if (!rowCount) throw notFound('Aturan channel ini tidak ditemukan');
  await audit(pool, { pelakuTipe: 'admin', pelakuId: req.user.id, aksi: 'pengaturan.poin_channel_hapus', objekTipe: 'pengaturan', detail: { channel: req.params.channel } });
  res.json({ message: 'ok' });
}));

// ---- Member: manual point adjustment (Admin Dashboard poin 6) ----
router.post('/members/:id/points', writeAccess, asyncHandler(async (req, res) => {
  const v = validate(Joi.object({
    jumlah: Joi.number().integer().invalid(0).required().messages({ 'any.invalid': 'Jumlah tidak boleh nol', 'any.required': 'Jumlah wajib diisi' }),
    alasan: Joi.string().trim().min(3).max(500).required().messages({ 'any.required': 'Alasan wajib diisi', 'string.min': 'Alasan terlalu pendek' }),
  }), req.body);
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT 1 FROM members WHERE id = $1', [req.params.id]);
    if (!rows.length) throw notFound('Member tidak ditemukan');
    const adjId = await manualAdjustment(client, { memberId: req.params.id, jumlah: v.jumlah, alasan: v.alasan, adminId: req.user.id });
    await audit(client, { pelakuTipe: 'admin', pelakuId: req.user.id, aksi: 'poin.penyesuaian_manual', objekTipe: 'member', objekId: req.params.id, detail: { jumlah: v.jumlah, alasan: v.alasan, adjustment_id: adjId } });
  });
  res.json({ data: await getBalance(pool, req.params.id) });
}));

router.get('/members/:id/points/mutations', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const { rows: count } = await pool.query('SELECT COUNT(*)::int AS total FROM points_ledger WHERE member_id = $1', [req.params.id]);
  const { rows } = await pool.query(
    `SELECT l.id, l.jenis, l.jumlah, l.referensi_tipe, l.referensi_id, l.created_at,
            CASE l.referensi_tipe WHEN 'receipt' THEN r.nomor_transaksi WHEN 'manual' THEN pa.alasan ELSE w.nama END AS keterangan
       FROM points_ledger l
       LEFT JOIN receipts r ON l.referensi_tipe = 'receipt' AND r.id = l.referensi_id
       LEFT JOIN redeems d ON l.referensi_tipe = 'redeem' AND d.id = l.referensi_id
       LEFT JOIN rewards w ON w.id = d.reward_id
       LEFT JOIN point_adjustments pa ON l.referensi_tipe = 'manual' AND pa.id = l.referensi_id
      WHERE l.member_id = $1 ORDER BY l.created_at DESC, l.id DESC LIMIT $2 OFFSET $3`,
    [req.params.id, limit, offset]
  );
  res.json({ data: rows, meta: { page, limit, total: count[0].total } });
}));

router.get('/members/:id/tier-history', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT h.id, h.dari_tier_id, h.ke_tier_id, td.nama AS dari, tk.nama AS ke,
            h.sebab, h.alasan, a.nama AS admin_nama, h.created_at
       FROM member_tier_history h
       LEFT JOIN tiers td ON td.id = h.dari_tier_id
       LEFT JOIN tiers tk ON tk.id = h.ke_tier_id
       LEFT JOIN admins a ON a.id = h.diubah_oleh
      WHERE h.member_id = $1 ORDER BY h.created_at DESC, h.id DESC`,
    [req.params.id]
  );
  res.json({ data: rows });
}));

// ---- Basic metrics (Admin Dashboard poin 6) ----
router.get('/metrics', asyncHandler(async (req, res) => {
  res.json({ data: await metrics.overview() });
}));

// ---- Log integrasi More (tambahan.md poin 4/5 — audit & troubleshooting) ----
router.get('/integration-logs', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, 25);
  const params = [];
  const where = [];
  if (req.query.endpoint) { params.push(req.query.endpoint); where.push(`endpoint = $${params.length}`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows: count } = await pool.query(`SELECT COUNT(*)::int AS total FROM integration_logs ${clause}`, params);
  const { rows } = await pool.query(`SELECT * FROM integration_logs ${clause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
  res.json({ data: rows, meta: { page, limit, total: count[0].total } });
}));

// ---- Export CSV (Admin Dashboard poin 6: "nilai tambah kalau ada waktu") ----
router.get('/export/members.csv', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT m.nama, m.email, m.no_hp, m.status_akun, m.created_at, t.nama AS tier,
            COALESCE(s.masuk,0) + COALESCE(s.kembalian,0) - COALESCE(s.terpakai,0) - COALESCE(s.koreksi,0) AS total
       FROM members m LEFT JOIN tiers t ON t.id = m.current_tier_id
       LEFT JOIN (SELECT member_id, SUM(jumlah) FILTER (WHERE jenis='masuk') masuk, SUM(jumlah) FILTER (WHERE jenis='terpakai') terpakai, SUM(jumlah) FILTER (WHERE jenis='koreksi') koreksi, SUM(jumlah) FILTER (WHERE jenis='kembalian') kembalian FROM points_ledger GROUP BY member_id) s ON s.member_id = m.id
      ORDER BY m.id`
  );
  sendCsv(res, 'member.csv', rows, [
    { label: 'Nama', value: 'nama' }, { label: 'Email', value: 'email' }, { label: 'No HP', value: 'no_hp' },
    { label: 'Status', value: 'status_akun' }, { label: 'Tier', value: 'tier' }, { label: 'Total Poin', value: 'total' },
    { label: 'Bergabung', value: (r) => r.created_at },
  ]);
}));

router.get('/export/redeems.csv', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT m.nama AS member, w.nama AS reward, d.jumlah_poin, d.status, v.kode AS voucher, d.created_at, d.waktu_keputusan
       FROM redeems d JOIN members m ON m.id = d.member_id JOIN rewards w ON w.id = d.reward_id LEFT JOIN vouchers v ON v.redeem_id = d.id
      ORDER BY d.id DESC`
  );
  sendCsv(res, 'redeem.csv', rows, [
    { label: 'Member', value: 'member' }, { label: 'Reward', value: 'reward' }, { label: 'Poin', value: 'jumlah_poin' },
    { label: 'Status', value: 'status' }, { label: 'Kode Voucher', value: 'voucher' },
    { label: 'Diajukan', value: (r) => r.created_at }, { label: 'Diputuskan', value: (r) => r.waktu_keputusan },
  ]);
}));

router.get('/export/vouchers.csv', asyncHandler(async (req, res) => {
  const f = validate(voucherFilterSchema, req.query);
  const rows = await vouchersService.listForExport(f);
  const labelStatus = { active: 'Aktif', reserved: 'Dipakai di Checkout', used: 'Terpakai', expired: 'Kedaluwarsa', void: 'Dibatalkan' };
  sendCsv(res, 'voucher.csv', rows, [
    { label: 'Kode', value: 'kode' }, { label: 'Member', value: 'member' }, { label: 'Email', value: 'email' },
    { label: 'Reward', value: 'reward' }, { label: 'Poin', value: 'jumlah_poin' },
    { label: 'Sumber', value: (r) => (r.sumber === 'manual' ? 'Manual' : 'Redeem') },
    { label: 'Status', value: (r) => labelStatus[r.status_efektif] || r.status_efektif },
    { label: 'Diterbitkan', value: (r) => r.issued_at },
    { label: 'Berlaku Sampai', value: (r) => r.expires_at }, { label: 'Dipakai', value: (r) => r.used_at },
    { label: 'No. Order', value: 'used_order_id' }, { label: 'Dibatalkan', value: (r) => r.voided_at },
    { label: 'Alasan Void', value: 'void_reason' }, { label: 'Catatan', value: 'catatan' },
  ]);
}));

router.get('/export/receipts.csv', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT m.nama AS member, r.channel, r.nomor_transaksi, r.nominal, r.status, r.sumber, r.created_at
       FROM receipts r JOIN members m ON m.id = r.member_id ORDER BY r.id DESC`
  );
  sendCsv(res, 'struk.csv', rows, [
    { label: 'Member', value: 'member' }, { label: 'Channel', value: 'channel' }, { label: 'No Transaksi', value: 'nomor_transaksi' },
    { label: 'Nominal', value: 'nominal' }, { label: 'Status', value: 'status' }, { label: 'Sumber', value: 'sumber' },
    { label: 'Tanggal', value: (r) => r.created_at },
  ]);
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
