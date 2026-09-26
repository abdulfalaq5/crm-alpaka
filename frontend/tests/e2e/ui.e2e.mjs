// E2E UI (Playwright + Chrome). Jalankan di stack sementara berisi data demo — membuat/menyetujui data. Lihat README bagian "Pengujian".
// Perlu: npm i playwright-core (tidak dipasang di proyek), backend dengan seed:demo, MAIL_HOST kosong.
import { chromium } from 'playwright-core';
import fs from 'fs';
// KEAMANAN: tes ini membuat/menyetujui/menolak data. Target WAJIB diberikan eksplisit dan tidak boleh
// memakai port sistem utama (BACKEND_PORT/FRONTEND_PORT di .env) — jalankan di stack sementara.
if (!process.env.APP_URL) { console.error('APP_URL wajib diisi (stack sementara, mis. http://localhost:9732). Lihat README bagian Pengujian.'); process.exit(2); }
const BASE = process.env.APP_URL;
if (!process.env.I_KNOW_THIS_MUTATES_DATA && /:(9722)\b/.test(BASE)) { console.error('Ditolak: 9722 adalah frontend sistem utama. Pakai stack sementara.'); process.exit(2); }
const SHOTS = './shots'; fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const results = []; const problems = [];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
fs.writeFileSync('./bukti.png', png); // file sementara di direktori kerja

async function newPage(vp = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`PAGEERROR ${page.url()} :: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`CONSOLE ${page.url()} :: ${m.text().slice(0, 200)}`); });
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) problems.push(`HTTP${r.status()} ${r.url()}`); });
  return page;
}
async function step(name, fn) {
  try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name + ' -> ' + e.message.split('\n')[0]]); }
}
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
const login = async (p, id, pw, path = '/masuk') => { await p.goto(BASE + path); await p.locator('input').first().fill(id); await p.locator('input[type=password]').fill(pw); await p.getByRole('button', { name: 'Masuk' }).click(); };

// ================= MEMBER =================
const m = await newPage();
await step('login member', async () => { await login(m, 'demo@alpaka.local', 'Demo-Alpaka-2026'); await m.getByText('Poin tersedia').waitFor(); });
await step('dashboard: saldo 215/275/60', async () => { const t = await m.locator('.balance-grid').innerText(); if (!/215/.test(t) || !/275/.test(t) || !/60/.test(t)) throw new Error(t); await shot(m, 'm-dashboard'); });
await step('dashboard: tab Mutasi Poin', async () => { await m.getByRole('tab', { name: 'Mutasi Poin' }).click(); await m.getByText('Poin Masuk').first().waitFor(); });
await step('lonceng notifikasi + badge', async () => { await m.locator('.ant-badge-count').first().waitFor({ timeout: 4000 }); await m.getByRole('button', { name: 'Notifikasi' }).click(); await m.getByText('Lihat semua', { exact: true }).waitFor(); await shot(m, 'm-bell'); await m.keyboard.press('Escape'); });
await step('riwayat struk + filter', async () => { await m.goto(BASE + '/struk'); await m.getByText('RTL-260901-0187').waitFor(); await shot(m, 'm-struk-list'); });
await step('detail struk ditolak → Ajukan Ulang', async () => { await m.goto(BASE + '/struk'); await m.locator('.ant-select').first().click(); await m.locator('.ant-select-item-option', { hasText: 'Ditolak' }).click(); await m.getByText('EC-260919').first().waitFor({ state: 'detached' }).catch(() => {}); await m.locator('tbody tr.clickable-row').first().click(); await m.getByText('Struk ditolak').first().waitFor(); await shot(m, 'm-struk-ditolak'); });
await step('detail struk: preview bukti tampil', async () => { await m.goto(BASE + '/struk'); await m.getByText('RTL-260901-0187').click(); await m.locator('.file-tile img, .file-tile iframe').first().waitFor({ timeout: 6000 }); await shot(m, 'm-struk-detail'); });
await step('upload struk (Retail → menunggu review)', async () => {
  await m.goto(BASE + '/upload');
  await m.locator('.ant-select').first().click(); await m.locator('.ant-select-item-option', { hasText: 'Retail' }).click();
  await m.getByLabel('Nomor transaksi').fill('UI-TEST-001');
  const d = new Date(Date.now() - 2 * 864e5); const ds = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  await m.getByPlaceholder('Pilih tanggal').fill(ds); await m.keyboard.press('Enter');
  await m.getByLabel('Nominal transaksi (Rp)').fill('300000');
  await m.locator('input[type=file]').setInputFiles('./bukti.png');
  await shot(m, 'm-upload-filled');
  await m.getByRole('button', { name: 'Kirim Struk' }).click();
  await m.getByText('Struk sedang menunggu review admin.').waitFor({ timeout: 8000 });
});
await step('upload: file .txt ditolak di client', async () => { await m.goto(BASE + '/upload'); fs.writeFileSync('./x.txt', 'hi'); await m.locator('input[type=file]').setInputFiles('./x.txt'); await m.getByText('bukan JPG, PNG, atau PDF').waitFor({ timeout: 4000 }); });
await step('upload: validasi form kosong', async () => { await m.goto(BASE + '/upload'); await m.getByRole('button', { name: 'Kirim Struk' }).click(); await m.locator('.ant-form-item-explain-error', { hasText: 'Pilih channel' }).waitFor(); });
await step('redeem: katalog + tombol disable bila poin kurang', async () => { await m.goto(BASE + '/redeem'); await m.getByText('Voucher Belanja Rp250.000').waitFor(); await m.getByRole('button', { name: 'Poin belum cukup' }).first().waitFor(); await shot(m, 'm-redeem'); });
await step('redeem: Tukar → konfirmasi hold → riwayat', async () => { await m.getByRole('button', { name: 'Tukar', exact: true }).first().click(); await m.getByText('akan ditahan (hold)').waitFor(); await m.getByRole('button', { name: 'Ajukan Redeem' }).click(); await m.getByText('Pengajuan redeem dikirim').waitFor(); await m.getByRole('tab', { name: 'Riwayat Redeem' }).click(); await m.getByText('Menunggu Persetujuan').first().waitFor(); await shot(m, 'm-redeem-riwayat'); });
await step('redeem: batalkan pengajuan', async () => { await m.getByRole('button', { name: 'Batalkan' }).first().click(); await m.getByRole('button', { name: 'Ya, batalkan' }).click(); await m.getByText('Poin dikembalikan').waitFor(); });
await step('notifikasi page', async () => { await m.goto(BASE + '/notifikasi'); await m.getByText('disetujui').first().waitFor(); await shot(m, 'm-notif'); });
await step('profil: simpan nama', async () => { await m.goto(BASE + '/profil'); await m.getByLabel('Nama').fill('Member Demo'); await m.getByRole('button', { name: 'Simpan' }).click(); await m.getByText('Profil diperbarui.').waitFor(); });
await step('member tidak bisa buka /admin', async () => { await m.goto(BASE + '/admin/struk'); await m.getByText('Poin tersedia').waitFor(); });
await step('logout', async () => { await m.getByRole('button', { name: 'Akun' }).click(); await m.getByText('Keluar').click(); await m.getByText('Masuk').first().waitFor(); });
await step('login salah → pesan error', async () => { await login(m, 'demo@alpaka.local', 'salahsalah'); await m.getByText('kata sandi salah').waitFor(); });

// registrasi
const r = await newPage();
await step('register: validasi + sukses', async () => {
  await r.goto(BASE + '/daftar');
  await r.getByRole('button', { name: 'Daftar' }).click(); await r.getByText('Nama wajib diisi').waitFor();
  await r.getByLabel('Nama lengkap').fill('Tester UI'); await r.getByLabel('Email').fill('tester.ui@example.com');
  await r.getByLabel('Kata sandi', { exact: true }).fill('rahasia123'); await r.getByLabel('Ulangi kata sandi').fill('rahasia123');
  await r.getByRole('button', { name: 'Daftar' }).click(); await r.getByText('Anda harus menyetujui').waitFor();
  await r.locator('.ant-checkbox-input').check(); await r.getByRole('button', { name: 'Daftar' }).click();
  await r.getByText('Halo, Tester').waitFor({ timeout: 8000 }); await shot(r, 'm-new-dashboard');
});
const r2 = await newPage();
await step('register: email sudah terdaftar → arahkan ke login', async () => {
  await r2.goto(BASE + '/daftar'); await r2.getByLabel('Nama lengkap').fill('Dobel'); await r2.getByLabel('Email').fill('demo@alpaka.local');
  await r2.getByLabel('Kata sandi', { exact: true }).fill('rahasia123'); await r2.getByLabel('Ulangi kata sandi').fill('rahasia123'); await r2.locator('.ant-checkbox-input').check();
  await r2.getByRole('button', { name: 'Daftar' }).click(); await r2.getByText('sudah terdaftar').first().waitFor();
});
await step('lupa password: form terkirim', async () => { await r2.goto(BASE + '/lupa-password'); await r2.locator('input').first().fill('demo@alpaka.local'); await r2.getByRole('button', { name: 'Kirim instruksi' }).click(); await r2.getByText('instruksi pemulihan').waitFor(); });

// ================= ADMIN =================
const a = await newPage();
await step('login admin', async () => { await login(a, 'admin@alpaka.local', 'Admin-Alpaka-2026', '/admin/login'); await a.getByText('Antrean Struk').first().waitFor(); });
await step('admin: dashboard — metrik dasar + 6 kartu domain', async () => {
  await a.goto(BASE + '/admin');
  await a.locator('.metric-strip .metric').first().waitFor({ timeout: 8000 });
  if ((await a.locator('.metric-strip .metric').count()) !== 4) throw new Error('metrik dasar harus 4 kartu');
  for (const kicker of ['Member', 'Invoice', 'Point rules', 'Reward', 'Voucher', 'Performa']) {
    if (!(await a.locator('.adash-grid .panel', { hasText: kicker }).count())) throw new Error('kartu domain hilang: ' + kicker);
  }
  await a.getByRole('link', { name: /Buka antrean struk/ }).waitFor();
  await a.getByRole('link', { name: /Atur poin/ }).waitFor();
  await shot(a, 'a-dashboard');
});
await step('admin: dashboard — tautan kartu ke halaman terkait', async () => {
  await a.getByRole('link', { name: /Kelola$/ }).first().click();
  await a.waitForURL(/\/admin\/member$/, { timeout: 8000 });
});
await step('admin: antrean struk + ringkasan', async () => { await a.getByText('UI-TEST-001').waitFor(); await shot(a, 'a-queue'); });
await step('admin: review struk (bukti + validasi)', async () => { await a.getByText('UI-TEST-001').click(); await a.getByText('Hasil validasi otomatis').waitFor(); await a.locator('.file-tile img, .file-tile iframe').first().waitFor({ timeout: 6000 }); await shot(a, 'a-review'); });
await step('admin: tolak wajib alasan', async () => { await a.getByRole('button', { name: 'Tolak', exact: true }).click(); await a.getByRole('button', { name: 'Tolak struk' }).click(); await a.getByText('Alasan penolakan wajib diisi').waitFor(); });
await step('admin: tolak dengan alasan → read-only', async () => { await a.getByLabel('Alasan penolakan').fill('Foto tidak jelas (uji UI)'); await a.getByRole('button', { name: 'Tolak struk' }).click(); await a.getByText('Keputusan (final)').waitFor(); if (await a.getByRole('button', { name: 'Setujui' }).count()) throw new Error('tombol masih ada'); });
await step('admin: setujui struk lain', async () => { await a.goto(BASE + '/admin/struk'); await a.locator('tbody tr.clickable-row').first().click(); await a.getByText('Hasil validasi otomatis').waitFor(); await a.getByRole('button', { name: 'Setujui', exact: true }).click(); await a.getByRole('button', { name: 'Setujui', exact: true }).last().click(); await a.getByText('Keputusan (final)').waitFor({ timeout: 6000 }); });
await step('admin: filter + pencarian', async () => { await a.goto(BASE + '/admin/struk'); await a.getByPlaceholder('Cari no. transaksi / nama / email').fill('Sari'); await a.keyboard.press('Enter'); await a.waitForTimeout(600); await a.getByText('Semua').first().click(); await a.getByText('Sari Wulandari').first().waitFor(); });
await step('admin: antrean & review redeem (setujui + detail)', async () => { await a.goto(BASE + '/admin/redeem'); await a.locator('tbody tr.clickable-row').first().click(); await a.getByRole('button', { name: 'Setujui', exact: true }).click(); await a.getByLabel(/Detail pemberian/).fill('Kode: UI-1234'); await a.getByRole('button', { name: 'Setujui redeem' }).click(); await a.getByText('Kode: UI-1234').waitFor({ timeout: 6000 }); await shot(a, 'a-redeem-review'); });
await step('admin: tolak redeem', async () => { await a.goto(BASE + '/admin/redeem'); await a.locator('tbody tr.clickable-row').first().click(); await a.getByRole('button', { name: 'Tolak', exact: true }).click(); await a.getByLabel('Alasan penolakan').fill('Stok habis (uji UI)'); await a.getByRole('button', { name: 'Tolak redeem' }).click(); await a.getByText('Stok habis (uji UI)').first().waitFor({ timeout: 6000 }); });
await step('admin: auto-approve simpan', async () => { await a.goto(BASE + '/admin/auto-approve'); await a.getByText('Auto-approve AKTIF').waitFor(); await a.getByRole('button', { name: 'Simpan' }).click(); await a.getByText('Pengaturan auto-approve disimpan.').waitFor(); await shot(a, 'a-auto'); });
await step('admin: pengaturan program simpan', async () => { await a.goto(BASE + '/admin/pengaturan'); await a.getByText('Aturan konversi poin').waitFor(); await a.getByRole('button', { name: 'Simpan' }).click(); await a.getByText('Pengaturan disimpan.').waitFor(); await shot(a, 'a-settings'); });
await step('admin: tambah reward', async () => { await a.goto(BASE + '/admin/reward'); await a.getByRole('button', { name: 'Tambah Reward' }).click(); await a.getByLabel('Nama reward').fill('Stiker Alpaka'); await a.getByLabel('Poin dibutuhkan').fill('10'); await a.getByRole('button', { name: 'Simpan' }).click(); await a.getByText('Stiker Alpaka').waitFor(); await shot(a, 'a-rewards'); });
await step('admin: log audit', async () => { await a.goto(BASE + '/admin/audit'); await a.getByText('struk.tolak').first().waitFor(); await shot(a, 'a-audit'); });
await step('admin logout', async () => { await a.getByRole('button', { name: 'Keluar' }).click(); await a.getByText('Login Admin').waitFor(); });

// ================= MOBILE =================
const mob = await newPage({ width: 375, height: 800 });
await step('mobile: dashboard tanpa scroll horizontal', async () => { await login(mob, 'demo@alpaka.local', 'Demo-Alpaka-2026'); await mob.getByText('Poin tersedia').waitFor(); const w = await mob.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]); await shot(mob, 'mob-dashboard'); if (w[0] > w[1] + 1) throw new Error(`scrollWidth ${w[0]} > ${w[1]}`); });
for (const p of ['/upload', '/struk', '/redeem']) await step(`mobile: ${p} tanpa scroll horizontal`, async () => { await mob.goto(BASE + p); await mob.waitForTimeout(800); const w = await mob.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]); await shot(mob, 'mob' + p.replace('/', '-')); if (w[0] > w[1] + 1) throw new Error(`scrollWidth ${w[0]} > ${w[1]}`); });


// ================= FITUR LANJUTAN =================
const noOverflow = async (p, label) => { const o = await p.evaluate(() => [...document.querySelectorAll('.ant-table-content, .ant-table-body')].filter((e) => e.scrollWidth > e.clientWidth + 1).length); if (o) throw new Error(`${label}: ${o} tabel bisa digeser horizontal`); };
const m2 = await newPage();
await step('register: modal syarat menampilkan teks dari server', async () => { await m2.goto(BASE + '/daftar'); await m2.getByText('syarat program & kebijakan privasi').click(); await m2.getByText('SYARAT PROGRAM LOYALTY ALPAKA').waitFor(); await shot(m2, 'm-terms'); });
await step('profil: preferensi notifikasi (email/WA belum tersedia → disabled)', async () => { await login(m2, 'demo@alpaka.local', 'Demo-Alpaka-2026'); await m2.getByText('Poin tersedia').waitFor(); await m2.goto(BASE + '/profil'); await m2.getByText('Preferensi notifikasi').waitFor(); const sw = m2.getByRole('switch', { name: 'Notifikasi email' }); await sw.waitFor(); const off = await sw.isDisabled(); const note = await m2.getByText('belum tersedia').count(); if (off !== note > 0) throw new Error(`switch disabled=${off} tapi keterangan 'belum tersedia'=${note}`); await shot(m2, 'm-profil'); });
await step('profil: ganti password → token diganti, tetap login', async () => { await m2.getByLabel('Kata sandi lama').fill('Demo-Alpaka-2026'); await m2.getByLabel('Kata sandi baru').fill('Demo-Alpaka-2027'); await m2.getByRole('button', { name: 'Ubah kata sandi' }).click(); await m2.getByText('Kata sandi diubah.').waitFor(); await m2.goto(BASE + '/'); await m2.getByText('Poin tersedia').waitFor(); await m2.goto(BASE + '/profil'); await m2.getByLabel('Kata sandi lama').fill('Demo-Alpaka-2027'); await m2.getByLabel('Kata sandi baru').fill('Demo-Alpaka-2026'); await m2.getByRole('button', { name: 'Ubah kata sandi' }).click(); await m2.getByText('Kata sandi diubah.').waitFor(); });

const a2 = await newPage();
await step('admin: login ulang', async () => { await login(a2, 'admin@alpaka.local', 'Admin-Alpaka-2026', '/admin/login'); await a2.getByText('Antrean Struk').first().waitFor(); });
await step('admin: koreksi keputusan disetujui → ditolak + riwayat', async () => {
  await a2.goto(BASE + '/admin/struk'); await a2.getByText('Semua').first().click();
  await a2.getByPlaceholder('Cari no. transaksi / nama / email').fill('RTL-260912-0480'); await a2.keyboard.press('Enter');
  await a2.locator('tbody tr.clickable-row', { hasText: 'RTL-260912-0480' }).click();
  await a2.getByRole('button', { name: 'Koreksi keputusan' }).click();
  await a2.getByRole('button', { name: 'Tolak & batalkan poin' }).click(); await a2.locator('.ant-form-item-explain-error', { hasText: 'Alasan koreksi wajib diisi' }).waitFor();
  await a2.getByLabel('Alasan koreksi').fill('Struk terbukti milik orang lain (uji UI)'); await a2.getByRole('button', { name: 'Tolak & batalkan poin' }).click();
  await a2.getByText('Riwayat koreksi').waitFor({ timeout: 6000 }); await a2.getByText('−32 poin').or(a2.getByText('-32 poin')).first().waitFor(); await shot(a2, 'a-koreksi');
});
await step('admin: koreksi struk yang poinnya sudah dipakai → pesan error', async () => {
  await a2.goto(BASE + '/admin/struk'); await a2.getByText('Semua').first().click(); await a2.getByPlaceholder('Cari no. transaksi / nama / email').fill('RTL-260904-0301'); await a2.keyboard.press('Enter');
  await a2.locator('tbody tr.clickable-row', { hasText: 'RTL-260904-0301' }).click(); await a2.getByRole('button', { name: 'Koreksi keputusan' }).click();
  await a2.getByLabel('Alasan koreksi').fill('uji poin terpakai'); await a2.getByRole('button', { name: 'Tolak & batalkan poin' }).click();
  await a2.getByText(/sudah dipakai atau ditahan/).waitFor({ timeout: 6000 });
});
await step('admin: halaman Member + nonaktifkan/aktifkan', async () => { await a2.goto(BASE + '/admin/member'); await a2.getByText('Nina Kusuma').waitFor(); await a2.locator('tr', { hasText: 'Nina Kusuma' }).getByRole('button', { name: 'Nonaktifkan' }).click(); await a2.getByRole('button', { name: 'Nonaktifkan', exact: true }).last().click(); await a2.getByText('Akun dinonaktifkan.').waitFor(); await a2.locator('tr', { hasText: 'Nina Kusuma' }).getByRole('button', { name: 'Aktifkan' }).click(); await a2.getByText('Akun diaktifkan.').waitFor(); await shot(a2, 'a-members'); });
await step('admin: Kelola Admin — tambah admin', async () => { await a2.goto(BASE + '/admin/kelola-admin'); await a2.getByText('Reviewer Alpaka').waitFor(); await a2.getByRole('button', { name: 'Tambah Admin' }).click(); await a2.getByLabel('Nama').fill('Admin UI'); await a2.getByLabel('Email').fill('admin.ui@alpaka.local'); await a2.getByLabel('Kata sandi awal').fill('adminUi-12345'); await a2.getByRole('button', { name: 'Simpan' }).click(); await a2.getByText('Admin ditambahkan.').waitFor(); await a2.getByText('admin.ui@alpaka.local').waitFor(); await shot(a2, 'a-admins'); });
await step('admin: tombol nonaktifkan diri sendiri disabled', async () => { const row = a2.locator('tr', { hasText: 'admin@alpaka.local' }).first(); if (!(await row.getByRole('button', { name: 'Nonaktifkan' }).isDisabled())) throw new Error('harus disabled'); });
await step('admin: pengaturan program memuat teks syarat', async () => { await a2.goto(BASE + '/admin/pengaturan'); await a2.getByText('Syarat program & kebijakan privasi').waitFor(); await a2.waitForFunction(() => document.querySelector('textarea')?.value.includes('SYARAT PROGRAM'), null, { timeout: 6000 }); });
await step('admin: unggah gambar reward → tampil di katalog member', async () => {
  await a2.goto(BASE + '/admin/reward'); await a2.locator('tr', { hasText: 'Tote Bag Alpaka' }).getByRole('button', { name: 'Ubah' }).click();
  await a2.locator('.ant-modal input[type=file]').setInputFiles('./bukti.png'); await a2.getByRole('button', { name: 'Simpan' }).click(); await a2.getByText('Reward disimpan.').waitFor(); await a2.locator('tr', { hasText: 'Tote Bag Alpaka' }).locator('img').waitFor();
  await m2.goto(BASE + '/redeem'); await m2.locator('.reward-card', { hasText: 'Tote Bag Alpaka' }).locator('img').waitFor({ timeout: 6000 }); await shot(m2, 'm-redeem-gambar');
});
await step('admin: log audit memuat struk.koreksi & admin.buat', async () => { await a2.goto(BASE + '/admin/audit'); await a2.getByText('struk.koreksi').first().waitFor(); await a2.getByText('admin.buat').first().waitFor(); });

// mobile: tidak ada tabel yang harus digeser horizontal
const mob2 = await newPage({ width: 375, height: 800 });
await login(mob2, 'demo@alpaka.local', 'Demo-Alpaka-2026'); await mob2.getByText('Poin tersedia').waitFor();
await step('mobile: dashboard tanpa tabel horizontal-scroll', async () => { await mob2.waitForTimeout(600); await noOverflow(mob2, 'dashboard'); });
await step('mobile: riwayat struk tanpa tabel horizontal-scroll', async () => { await mob2.goto(BASE + '/struk'); await mob2.getByText('RTL-').first().waitFor(); await noOverflow(mob2, 'struk'); await shot(mob2, 'mob-struk2'); });
await step('mobile: riwayat redeem tanpa tabel horizontal-scroll', async () => { await mob2.goto(BASE + '/redeem'); await mob2.getByText('Poin tersedia Anda').waitFor(); await mob2.getByRole('tab', { name: 'Riwayat Redeem' }).click(); await mob2.locator('.ant-tabs-tab-active', { hasText: 'Riwayat' }).waitFor(); await mob2.locator('tbody tr.ant-table-row').first().waitFor({ timeout: 10000 }); await noOverflow(mob2, 'redeem'); await shot(mob2, 'mob-redeem2'); });
const amob = await newPage({ width: 375, height: 800 });
await login(amob, 'admin@alpaka.local', 'Admin-Alpaka-2026', '/admin/login'); await amob.getByText('Antrean Struk').first().waitFor();
await step('mobile admin: antrean struk tanpa tabel horizontal-scroll', async () => { await amob.waitForTimeout(600); await noOverflow(amob, 'admin struk'); await shot(amob, 'mob-admin'); });

await browser.close();
for (const [s, n] of results) console.log(s.padEnd(5), n);
const uniq = [...new Set(problems)];
console.log('\nMASALAH KONSOL/JARINGAN:', uniq.length ? '\n' + uniq.join('\n') : 'tidak ada');
process.exit(results.some(([s]) => s === 'FAIL') ? 1 : 0);
