# Deployment production

Arsitektur: **Nginx (HTTPS)** → frontend statis (`frontend/dist`) + proxy `/api` → **backend Node** (`BACKEND_PORT`, default 9721) → **PostgreSQL**.

## 1. Persiapan server
```bash
# Node.js 20+, PostgreSQL, nginx, certbot
sudo useradd -r -m alpaka
sudo -u alpaka git clone <repo> /opt/alpaka && cd /opt/alpaka
cp .env.example .env && chmod 600 .env     # isi DB_*, JWT_SECRET (>=32 karakter), ADMIN_*, MAIL_* / WA_*
```
Di `.env` production wajib: `NODE_ENV=production`, `FORCE_HTTPS=true`, `CORS_ORIGIN=https://<domain>`, `APP_URL=https://<domain>`.

**Frontend & backend di subdomain terpisah** (mis. `app.example.com` + `api.example.com`, masing-masing dengan nginx/vhost sendiri): set `VITE_API_URL=https://api.example.com/api` sebelum `npm run build` di frontend, dan `CORS_ORIGIN=https://app.example.com` di backend. Tanpa `VITE_API_URL`, frontend memanggil `/api` secara relatif terhadap domain frontend sendiri, sehingga request akan salah arah (ke frontend, bukan backend).

## 2. Build & jalankan
```bash
cd backend  && npm ci --omit=dev          # migrasi + seeder dasar berjalan otomatis saat start
cd ../frontend && npm ci && npm run build # hasil: frontend/dist (dilayani nginx)
sudo cp deploy/systemd/alpaka-backend.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now alpaka-backend
```
Ganti password admin awal setelah login pertama. **Jangan** menjalankan `npm run seed:demo` di production.

## 3. Nginx + HTTPS
```bash
sudo cp deploy/nginx/alpaka.conf /etc/nginx/sites-available/alpaka   # ganti domain & path di dalamnya
sudo ln -s /etc/nginx/sites-available/alpaka /etc/nginx/sites-enabled/
sudo certbot --nginx -d <domain>      # membuat sertifikat
sudo nginx -t && sudo systemctl reload nginx
```
Header `X-Forwarded-Proto` diteruskan nginx; backend (`FORCE_HTTPS=true`) mengalihkan HTTP ke HTTPS dan mengirim HSTS.

## 4. Backup terjadwal (NFR-09)
```bash
sudo cp deploy/systemd/alpaka-backup.{service,timer} /etc/systemd/system/
sudo systemctl enable --now alpaka-backup.timer
```
Hasil di `backend/backups/` (database `.dump` + `uploads .tar.gz`, disimpan `BACKUP_KEEP_DAYS` hari, default 14). **Salin ke penyimpanan di luar server** (mis. rsync/rclone/S3). Uji restore secara berkala:
```bash
createdb db_restore_uji
DB_NAME=db_restore_uji UPLOAD_DIR=uploads_restore npm run restore -- backups/alpaka-db-<stamp>.dump backups/alpaka-uploads-<stamp>.tar.gz --yes
```

## 5. Alternatif sederhana (staging)
`cd frontend && npm run build && npm start` menjalankan hasil build di `FRONTEND_PORT` (9722) dengan proxy `/api` ke backend — tanpa TLS, hanya untuk uji internal.

## Log
Log akses HTTP: `backend/logs/access-YYYY-MM-DD.log` (tanpa query string/body). Log aplikasi: `journalctl -u alpaka-backend`. Rotasi log akses dengan `logrotate` atau hapus berkala.
