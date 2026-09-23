const path = require('path');
const dotenv = require('dotenv');

// Semua konfigurasi (port, database, dll.) dibaca dari .env di root proyek.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const int = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const config = {
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.BACKEND_PORT, 9721),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: int(process.env.DB_PORT, 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  jwtSecret: process.env.JWT_SECRET,
  sessionIdleMinutes: int(process.env.SESSION_IDLE_MINUTES, 30),
  corsOrigins: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  forceHttps: process.env.FORCE_HTTPS === 'true',
  uploadDir: path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads'),
  timezone: process.env.APP_TIMEZONE || 'Asia/Jakarta',
  admin: {
    nama: process.env.ADMIN_NAME || 'Administrator',
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  },
  appUrl: process.env.APP_URL || `http://localhost:${int(process.env.FRONTEND_PORT, 9722)}`,
  // Email notifikasi (kanal tambahan, NTF-03). Nonaktif bila MAIL_HOST kosong; in-app tetap selalu aktif.
  mail: {
    mailer: (process.env.MAIL_MAILER || 'smtp').toLowerCase(),
    host: process.env.MAIL_HOST,
    port: int(process.env.MAIL_PORT, 587),
    user: process.env.MAIL_USERNAME,
    password: process.env.MAIL_PASSWORD,
    fromAddress: process.env.MAIL_FROM_ADDRESS || 'no-reply@alpaka.local',
    fromName: process.env.MAIL_FROM_NAME || 'Alpaka Loyalty',
    // Jeda antar email (ms). Mailtrap sandbox hanya mengizinkan ±1 email/detik, jadi default 1100 ms untuk host mailtrap.
    intervalMs: int(process.env.MAIL_INTERVAL_MS, /mailtrap/i.test(process.env.MAIL_HOST || '') ? 1100 : 0),
  },
  // WhatsApp lewat gateway HTTP generik (OI-08). Nonaktif bila WA_API_URL kosong.
  whatsapp: { url: process.env.WA_API_URL, token: process.env.WA_API_TOKEN },
  // Swagger UI (/api/docs): default aktif di development, nonaktif di production kecuali SWAGGER_ENABLED=true.
  swaggerEnabled: process.env.SWAGGER_ENABLED ? process.env.SWAGGER_ENABLED === 'true' : (process.env.NODE_ENV || 'development') !== 'production',
  logDir: path.resolve(__dirname, '..', process.env.LOG_DIR || 'logs'),
  // Batas percobaan login per IP per 15 menit (selain penguncian per akun). Naikkan hanya untuk stack uji.
  // Batas permintaan API per IP per menit (semua endpoint). Kantor/NAT dengan banyak pengguna satu IP perlu nilai lebih besar.
  rateLimitPerMinute: int(process.env.RATE_LIMIT_PER_MIN, 300),
  loginRateLimit: int(process.env.LOGIN_RATE_LIMIT, 30),
  // Integrasi More by Morello (tambahan.md poin 4 & 5) — default aman menunggu spesifikasi resmi dari tim More.
  more: {
    apiKey: process.env.MORE_API_KEY, // kosong = endpoint integrasi nonaktif (403)
    autoRegisterUnknownMember: process.env.MORE_AUTO_REGISTER === 'true', // default: tolak (memutuskan OI terbuka)
    voucherReserveMinutes: int(process.env.MORE_VOUCHER_RESERVE_MINUTES, 15),
  },
  maintenanceIntervalMinutes: int(process.env.MAINTENANCE_INTERVAL_MINUTES, 10), // evaluasi tier & expire voucher/reservasi
  maxLoginAttempts: 5,
  lockMinutes: 15,
};

config.isProd = config.env === 'production';

function assertConfig() {
  const missing = [];
  if (!config.jwtSecret) missing.push('JWT_SECRET');
  if (!config.db.user) missing.push('DB_USER');
  if (!config.db.database) missing.push('DB_NAME');
  if (missing.length) {
    throw new Error(`Konfigurasi .env belum lengkap: ${missing.join(', ')}`);
  }
  if (config.isProd && config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET minimal 32 karakter di production');
  }
}

module.exports = { config, assertConfig };
