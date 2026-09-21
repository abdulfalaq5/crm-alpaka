const jwt = require('jsonwebtoken');
const { config } = require('../config');
const { pool } = require('../db/pool');
const { unauthorized, forbidden, asyncHandler } = require('../utils/http');

const idleSeconds = () => config.sessionIdleMinutes * 60;

function signToken(id, role) {
  return jwt.sign({ sub: String(id), role }, config.jwtSecret, { expiresIn: idleSeconds() });
}

const TABLES = {
  member: { sql: 'SELECT id, nama, status_akun AS status FROM members WHERE id = $1' },
  admin: { sql: 'SELECT id, nama, status FROM admins WHERE id = $1' },
};

/**
 * Otentikasi + otorisasi berbasis role di server (NFR-03).
 * Sesi berakhir otomatis bila tidak aktif: token berlaku SESSION_IDLE_MINUTES dan
 * diperpanjang lewat header X-Refresh-Token selama pengguna masih aktif.
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

    req.user = { id: account.id, nama: account.nama, role: payload.role };

    const remaining = payload.exp - Math.floor(Date.now() / 1000);
    if (remaining < idleSeconds() / 2) {
      res.setHeader('X-Refresh-Token', signToken(account.id, payload.role));
    }
    next();
  });
}

module.exports = { authenticate, signToken };
