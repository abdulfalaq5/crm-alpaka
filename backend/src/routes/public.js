const express = require('express');
const { pool } = require('../db/pool');
const { asyncHandler, notFound } = require('../utils/http');
const { rewardImagePath } = require('../services/rewardImages');

const router = express.Router();

// Syarat program & kebijakan privasi: tampil di halaman registrasi (sebelum login), diatur admin (OI-15).
router.get(
  '/terms',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'terms_text'");
    res.json({ data: { teks: rows[0]?.value || '' } });
  })
);

// Gambar katalog reward bersifat publik (bukan data pribadi). File acak; tipe ditentukan dari data tersimpan.
router.get(
  '/rewards/:id/image',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT gambar_file, gambar_mime FROM rewards WHERE id = $1', [req.params.id]);
    if (!rows.length || !rows[0].gambar_file) throw notFound('Gambar tidak ditemukan');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type(rows[0].gambar_mime).sendFile(rewardImagePath(rows[0].gambar_file));
  })
);

module.exports = { router };
