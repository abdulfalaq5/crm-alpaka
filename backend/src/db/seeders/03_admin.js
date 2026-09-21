const bcrypt = require('bcryptjs');
const { config } = require('../../config');

// Akun admin awal dari ADMIN_EMAIL / ADMIN_PASSWORD — hanya dibuat bila tabel admins masih kosong.
async function run(db, log) {
  const { rows } = await db.query('SELECT 1 FROM admins LIMIT 1');
  if (rows.length) return 'dilewati (admin sudah ada)';
  if (!config.admin.email || !config.admin.password) {
    log('[seed] ADMIN_EMAIL / ADMIN_PASSWORD belum diisi di .env — akun admin awal tidak dibuat.');
    return 'dilewati (ADMIN_* kosong)';
  }
  await db.query('INSERT INTO admins (nama, email, password_hash) VALUES ($1, $2, $3)', [
    config.admin.nama,
    config.admin.email.toLowerCase(),
    await bcrypt.hash(config.admin.password, 10),
  ]);
  return `admin dibuat: ${config.admin.email}`;
}

module.exports = { run };
