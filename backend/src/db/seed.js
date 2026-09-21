const fs = require('fs');
const path = require('path');
const { assertConfig } = require('../config');
const { pool } = require('./pool');

const SEEDERS_DIR = path.join(__dirname, 'seeders');

/**
 * Jalankan semua seeder di seeders/ (urut nama file). Seeder wajib idempotent
 * (ON CONFLICT DO NOTHING / cek data), sehingga aman dijalankan berulang kali dan tidak menimpa
 * pengaturan yang sudah diubah admin.
 *
 * Seeder data referensi (wajib) memakai nama NN_*.js; data contoh memakai prefix demo_ dan
 * hanya dijalankan dengan `npm run seed:demo`.
 */
async function seed({ demo = false, log = console.log } = {}) {
  assertConfig();
  const files = fs
    .readdirSync(SEEDERS_DIR)
    .filter((f) => f.endsWith('.js'))
    .filter((f) => (f.startsWith('demo_') ? demo : true))
    .sort();
  for (const file of files) {
    const result = await require(path.join(SEEDERS_DIR, file)).run(pool, log);
    log(`[seed] ${file}${result ? `: ${result}` : ''}`);
  }
}

module.exports = { seed };

if (require.main === module) {
  seed({ demo: process.argv.includes('--demo') })
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
