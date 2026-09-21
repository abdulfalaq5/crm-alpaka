#!/usr/bin/env node
/**
 * Restore backup.  npm run restore -- <file.dump> [<uploads.tar.gz>] --yes
 * MENIMPA seluruh isi database DB_NAME (dan folder upload bila file tar diberikan). Butuh --yes.
 * Untuk uji restore, arahkan ke database lain:  DB_NAME=db_restore_uji npm run restore -- file.dump --yes
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { config } = require('../src/config');

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length || !args.includes('--yes')) {
  console.error('Pemakaian: npm run restore -- <file.dump> [<uploads.tar.gz>] --yes\nPERINGATAN: menimpa database "%s".', config.db.database);
  process.exit(1);
}
const env = { ...process.env, PGPASSWORD: config.db.password || '' };
const conn = ['-h', config.db.host, '-p', String(config.db.port), '-U', config.db.user, '-d', config.db.database];

const [dump, tar] = files.map((f) => path.resolve(f));
const r = spawnSync('pg_restore', [...conn, '--clean', '--if-exists', '--no-owner', dump], { env, encoding: 'utf8' });
if (r.error || (r.status !== 0 && !/already exists|does not exist/.test(r.stderr))) {
  console.error(`[restore] pg_restore gagal: ${r.error?.message || r.stderr}`);
  process.exit(1);
}
console.log(`[restore] database "${config.db.database}" dipulihkan dari ${path.basename(dump)}`);

if (tar) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  // --strip-components=1: isi arsip masuk langsung ke UPLOAD_DIR tujuan, apa pun nama folder asalnya.
  const t = spawnSync('tar', ['-xzf', tar, '-C', config.uploadDir, '--strip-components=1'], { encoding: 'utf8' });
  if (t.status !== 0) {
    console.error(`[restore] tar gagal: ${t.stderr}`);
    process.exit(1);
  }
  console.log(`[restore] file upload dipulihkan ke ${config.uploadDir}`);
}
