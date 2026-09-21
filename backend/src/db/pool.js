const { Pool } = require('pg');
const { config } = require('../config');

const pool = new Pool({ ...config.db, max: 10 });

/**
 * Jalankan fn di dalam transaksi database atomik.
 * Commit bila fn selesai, rollback bila melempar error. Callback di `client.afterCommit` hanya dijalankan setelah commit.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    client.afterCommit = []; // aksi yang baru boleh jalan setelah commit (mis. kirim email)
    const result = await fn(client);
    await client.query('COMMIT');
    const tasks = client.afterCommit;
    client.afterCommit = null;
    for (const task of tasks) Promise.resolve().then(task).catch((err) => console.error('[afterCommit]', err.message));
    return result;
  } catch (err) {
    client.afterCommit = null;
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTransaction };
