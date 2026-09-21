const { config, assertConfig } = require('./config');
const { pool } = require('./db/pool');
const { migrate } = require('./db/migrate');
const { seed } = require('./db/seed');
const { createApp } = require('./app');

async function main() {
  assertConfig();
  await migrate(); // terapkan migrasi yang belum berjalan
  await seed({ log: () => {} }); // data referensi awal (idempotent, tidak menimpa perubahan admin)
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`Alpaka Loyalty API berjalan di http://localhost:${config.port} (${config.env})`);
  });

  const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Gagal memulai server:', err.message);
  process.exit(1);
});
