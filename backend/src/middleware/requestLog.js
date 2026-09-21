const fs = require('fs');
const path = require('path');
const { config } = require('../config');

let stream;
let streamDay;

// Satu file per hari: logs/access-YYYY-MM-DD.log
function getStream() {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== streamDay) {
    if (stream) stream.end();
    fs.mkdirSync(config.logDir, { recursive: true });
    stream = fs.createWriteStream(path.join(config.logDir, `access-${day}.log`), { flags: 'a' });
    streamDay = day;
  }
  return stream;
}

/**
 * Log akses HTTP (Bab 0 poin 4): waktu, IP, pengguna, method, path, status, durasi.
 * Sengaja TIDAK mencatat query string, header, atau body agar token/kata sandi tidak bocor ke log.
 */
function requestLog(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const user = req.user ? `${req.user.role}#${req.user.id}` : '-';
    const line = `${new Date().toISOString()} ${req.ip} ${user} ${req.method} ${req.baseUrl}${req.path} ${res.statusCode} ${ms.toFixed(1)}ms`;
    if (config.env !== 'test') getStream().write(`${line}\n`);
    if (!config.isProd || res.statusCode >= 500) console.log(line);
  });
  next();
}

module.exports = { requestLog };
