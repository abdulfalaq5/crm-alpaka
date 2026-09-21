#!/usr/bin/env node
/**
 * Backup PostgreSQL + folder upload (NFR-09, OI-14).
 *   npm run backup
 * Hasil di BACKUP_DIR (default backend/backups):
 *   alpaka-db-YYYYMMDD-HHMMSS.dump         (pg_dump format custom, restore dengan pg_restore / npm run restore)
 *   alpaka-uploads-YYYYMMDD-HHMMSS.tar.gz  (file bukti struk & gambar reward)
 * Backup lebih tua dari BACKUP_KEEP_DAYS (default 14) dihapus otomatis. Jadwalkan dengan cron / systemd timer
 * (lihat deploy/README.md) dan salin hasilnya ke penyimpanan di luar server.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { config } = require('../src/config');

const dir = path.resolve(__dirname, '..', process.env.BACKUP_DIR || 'backups');
const keepDays = Number(process.env.BACKUP_KEEP_DAYS) || 14;
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const env = { ...process.env, PGPASSWORD: config.db.password || '' };

function run(cmd, args) {
  const r = spawnSync(cmd, args, { env, encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    console.error(`[backup] ${cmd} gagal: ${r.error?.message || r.stderr}`);
    process.exit(1);
  }
}

fs.mkdirSync(dir, { recursive: true });

const dump = path.join(dir, `alpaka-db-${stamp}.dump`);
run('pg_dump', ['-h', config.db.host, '-p', String(config.db.port), '-U', config.db.user, '-d', config.db.database, '-Fc', '--no-owner', '-f', dump]);
console.log(`[backup] database  -> ${dump} (${(fs.statSync(dump).size / 1024).toFixed(0)} KB)`);

if (fs.existsSync(config.uploadDir)) {
  const tar = path.join(dir, `alpaka-uploads-${stamp}.tar.gz`);
  run('tar', ['-czf', tar, '-C', path.dirname(config.uploadDir), path.basename(config.uploadDir)]);
  console.log(`[backup] uploads   -> ${tar} (${(fs.statSync(tar).size / 1024).toFixed(0)} KB)`);
} else {
  console.log('[backup] folder uploads belum ada, dilewati');
}

const limit = Date.now() - keepDays * 864e5;
for (const f of fs.readdirSync(dir)) {
  const full = path.join(dir, f);
  if (/^alpaka-(db|uploads)-/.test(f) && fs.statSync(full).mtimeMs < limit) {
    fs.unlinkSync(full);
    console.log(`[backup] hapus backup lama: ${f}`);
  }
}
