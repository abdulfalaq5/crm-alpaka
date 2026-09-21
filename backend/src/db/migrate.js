const fs = require('fs');
const path = require('path');
const { assertConfig } = require('../config');
const { pool } = require('./pool');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const LOCK_ID = 727201; // advisory lock: cegah dua instance migrasi bersamaan

/**
 * Jalankan migrasi SQL berurutan (migrations/NNN_nama.sql) yang belum tercatat di schema_migrations.
 * Setiap file berjalan dalam satu transaksi; gagal = rollback dan berhenti.
 */
async function migrate({ log = console.log } = {}) {
  assertConfig();
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name       VARCHAR(120) PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`
    );
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => r.name));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

    let applied = 0;
    for (const file of files) {
      if (done.has(file)) continue;
      try {
        await client.query('BEGIN');
        await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Migrasi ${file} gagal: ${err.message}`);
      }
      log(`[migrate] diterapkan: ${file}`);
      applied += 1;
    }
    if (!applied) log('[migrate] skema sudah terbaru');
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}

module.exports = { migrate };

if (require.main === module) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
