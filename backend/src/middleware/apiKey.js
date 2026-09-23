const crypto = require('crypto');
const { config } = require('../config');
const { forbidden, unauthorized } = require('../utils/http');

/**
 * Autentikasi antar sistem untuk integrasi More by Morello (tambahan.md poin 4).
 * Header: X-Api-Key. Dibandingkan dengan timingSafeEqual agar tidak rentan timing attack.
 * Endpoint mengembalikan 403 bila MORE_API_KEY belum diisi di .env (integrasi belum diaktifkan).
 */
function requireMoreApiKey(req, res, next) {
  if (!config.more.apiKey) return next(forbidden('Integrasi More by Morello belum diaktifkan (MORE_API_KEY kosong)'));
  const given = req.headers['x-api-key'];
  if (!given) return next(unauthorized('Header X-Api-Key wajib diisi'));
  const a = Buffer.from(String(given));
  const b = Buffer.from(config.more.apiKey);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return next(unauthorized('API key tidak valid'));
  next();
}

module.exports = { requireMoreApiKey };
