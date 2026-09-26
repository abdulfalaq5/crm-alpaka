const jwt = require('jsonwebtoken');
const { config } = require('../config');
const { pool } = require('../db/pool');
const { unauthorized, forbidden, asyncHandler } = require('../utils/http');

const idleSeconds = () => config.sessionIdleMinutes * 60;

function signToken(id, role) {
  return jwt.sign({ sub: String(id), role }, config.jwtSecret, { expiresIn: idleSeconds() });
}

const TABLES = {
  member: { sql: 'SELECT id, nama, status_akun AS status, extract(epoch from sesi_valid_sejak) AS valid_sejak FROM members WHERE id = $1' },
  admin: { sql: 'SELECT id, nama, status, role, extract(epoch from sesi_valid_sejak) AS valid_sejak FROM admins WHERE id = $1' },
};

/**
 * Otentikasi + otorisasi berbasis role di server (NFR-03).
 * Sesi berakhir otomatis bila tidak aktif: token berlaku SESSION_IDLE_MINUTES dan
 * diperpanjang (sliding) lewat header X-Refresh-Token pada setiap permintaan
 * terautentikasi yang bukan latar belakang.
 */
function authenticate(...roles) {
  return asyncHandler(async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw unauthorized();
    }
    const table = TABLES[payload.role];
    if (!table) throw unauthorized();
    if (roles.length && !roles.includes(payload.role)) throw forbidden();

    const { rows } = await pool.query(table.sql, [payload.sub]);
    const account = rows[0];
    if (!account || account.status !== 'aktif') throw unauthorized('Akun tidak aktif');
    // Token yang terbit sebelum ganti password / reset / pencabutan sesi tidak berlaku lagi.
    if (account.valid_sejak && payload.iat < Math.floor(Number(account.valid_sejak))) throw unauthorized();

    req.user = { id: account.id, nama: account.nama, role: payload.role, adminRole: account.role || null };

    // Sesi idle sliding: setiap permintaan terautentikasi memperpanjang token ke jendela penuh,
    // sehingga pengguna yang aktif tidak pernah melihat peringatan "sesi akan berakhir".
    // Permintaan latar belakang (polling lonceng, header X-Background: 1) TIDAK memperpanjang,
    // dan X-Keepalive: 1 (tombol "Tetap masuk"/aktivitas dari klien) selalu memperpanjang.
    const background = req.headers['x-background'] === '1';
    const keepalive = req.headers['x-keepalive'] === '1';
    if (keepalive || !background) {
      res.setHeader('X-Refresh-Token', signToken(account.id, payload.role));
    }
    next();
  });
}

module.exports = { authenticate, signToken };
