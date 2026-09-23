// E2E API. Jalankan di database KOSONG/sementara (membuat data uji): lihat README bagian "Pengujian".
// Perlu server berjalan dengan ADMIN_EMAIL=admin@alpaka.local, ADMIN_PASSWORD=Admin-Alpaka-2026, MAIL_HOST kosong.
// KEAMANAN: tes ini membuat banyak data. Target WAJIB eksplisit dan bukan backend sistem utama (9721).
if (!process.env.API_URL) { console.error('API_URL wajib diisi (backend sementara, mis. http://localhost:9731). Lihat README bagian Pengujian.'); process.exit(2); }
if (/:(9721)\b/.test(process.env.API_URL)) { console.error('Ditolak: 9721 adalah backend sistem utama. Pakai backend sementara dengan database uji.'); process.exit(2); }
const BASE = process.env.API_URL + '/api';
let fails = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + extra}`); if (!cond) fails++; };
const call = async (method, path, { token, json, form } = {}) => {
  const headers = {}; if (token) headers.authorization = `Bearer ${token}`;
  let body; if (json) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); } if (form) body = form;
  const r = await fetch(BASE + path, { method, headers, body });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, body: ct.includes('json') ? await r.json() : null, headers: r.headers, raw: r };
};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const receiptForm = (o, files = [['bukti.png', PNG, 'image/png']]) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, String(v));
  for (const [n, b, t] of files) f.append('files', new Blob([b], { type: t }), n);
  return f;
};
const R = (nomor, nominal = 500000, extra = {}) => ({ channel: 'Retail', nomor_transaksi: nomor, tanggal_transaksi: daysAgo(1), nominal, ...extra });

// --- registrasi
let r = await call('POST', '/auth/register', { json: { nama: 'Ani', email: 'ani@test.com', password: 'rahasia123', setuju_syarat: true } });
check('register 201', r.status === 201, JSON.stringify(r.body));
const A = r.body.token;
r = await call('POST', '/auth/register', { json: { nama: 'Ani2', email: 'ANI@test.com', password: 'rahasia123', setuju_syarat: true } });
check('register email duplikat (case-insens) 409', r.status === 409 && r.body.error.code === 'IDENTIFIER_EXISTS');
r = await call('POST', '/auth/register', { json: { nama: 'Budi', no_hp: '0812-1111-2222', password: 'rahasia123', setuju_syarat: true } });
check('register no_hp 201', r.status === 201); const B = r.body.token;
r = await call('POST', '/auth/register', { json: { nama: 'Budi2', no_hp: '+62 812 1111 2222', password: 'rahasia123', setuju_syarat: true } });
check('no_hp duplikat lintas format 409', r.status === 409);
r = await call('POST', '/auth/register', { json: { nama: 'X', email: 'x@test.com', password: 'rahasia123', setuju_syarat: false } });
check('register tanpa persetujuan 422', r.status === 422);
r = await call('POST', '/auth/register', { json: { nama: 'X', password: 'rahasia123', setuju_syarat: true } });
check('register tanpa kontak 422', r.status === 422);
r = await call('POST', '/auth/register', { json: { nama: 'X', email: 'x@test.com', password: 'pendek', setuju_syarat: true } });
check('password pendek 422', r.status === 422);

// --- login & lockout
r = await call('POST', '/auth/login', { json: { identifier: '081211112222', password: 'rahasia123' } });
check('login via no_hp ok', r.status === 200 && r.body.user.role === 'member', JSON.stringify(r.body));
await call('POST', '/auth/register', { json: { nama: 'Lock', email: 'lock@test.com', password: 'rahasia123', setuju_syarat: true } });
let last;
for (let i = 0; i < 5; i++) last = await call('POST', '/auth/login', { json: { identifier: 'lock@test.com', password: 'salah-salah' } });
check('login salah 401', last.status === 401);
r = await call('POST', '/auth/login', { json: { identifier: 'lock@test.com', password: 'rahasia123' } });
check('akun terkunci setelah 5 gagal (429)', r.status === 429, r.status);
r = await call('POST', '/auth/login', { json: { identifier: 'ani@test.com', password: 'rahasia123' } });
check('login email ok', r.status === 200);

// --- RBAC
r = await call('GET', '/admin/receipts', { token: A });
check('member akses /admin -> 403', r.status === 403);
r = await call('GET', '/member/points');
check('tanpa token -> 401', r.status === 401);
r = await call('POST', '/auth/admin/login', { json: { identifier: 'admin@alpaka.local', password: 'Admin-Alpaka-2026' } });
check('admin login', r.status === 200 && r.body.user.role === 'admin'); const ADM = r.body.token;
r = await call('POST', '/auth/admin/login', { json: { identifier: 'ani@test.com', password: 'rahasia123' } });
check('member tidak bisa login admin', r.status === 401);
r = await call('GET', '/member/points', { token: ADM });
check('admin token ditolak di endpoint member -> 403', r.status === 403);

// --- upload struk
r = await call('POST', '/receipts', { token: A, form: receiptForm(R('INV-001')) });
check('upload struk -> menunggu_review', r.status === 201 && r.body.data.status === 'menunggu_review', JSON.stringify(r.body));
const rec1 = r.body.data;
r = await call('POST', '/receipts', { token: B, form: receiptForm(R('inv-001')) });
check('duplikat lintas member -> ditolak otomatis', r.body.data?.status === 'ditolak' && /duplikat/i.test(r.body.data.alasan_penolakan), JSON.stringify(r.body));
const dupRec = r.body.data;
r = await call('POST', '/receipts', { token: A, form: receiptForm(R('INV-F', 100000, { tanggal_transaksi: daysAgo(-3) })) });
check('tanggal masa depan -> ditolak', r.body.data?.status === 'ditolak' && /masa depan/.test(r.body.data.alasan_penolakan));
r = await call('POST', '/receipts', { token: A, form: receiptForm(R('INV-OLD', 100000, { tanggal_transaksi: daysAgo(90) })) });
check('kedaluwarsa masa klaim -> ditolak', r.body.data?.status === 'ditolak' && /masa klaim/.test(r.body.data.alasan_penolakan));
r = await call('POST', '/receipts', { token: A, form: receiptForm(R('INV-ZERO', 0)) });
check('nominal 0 -> ditolak', r.body.data?.status === 'ditolak');
r = await call('POST', '/receipts', { token: A, form: receiptForm(R('INV-CH', 1000, { channel: 'Warung' })) });
check('channel tak resmi -> ditolak', r.body.data?.status === 'ditolak');
r = await call('POST', '/receipts', { token: A, form: receiptForm(R('INV-BAD'), [['x.png', Buffer.from('<?php echo 1; ?>'), 'image/png']]) });
check('file palsu (isi bukan gambar) -> 422', r.status === 422, JSON.stringify(r.body));
r = await call('POST', '/receipts', { token: A, form: receiptForm(R('INV-EXE'), [['x.exe', PNG, 'image/png']]) });
check('ekstensi tidak diizinkan -> 422', r.status === 422);
r = await call('POST', '/receipts', { token: A, form: receiptForm(R('INV-NOFILE'), []) });
check('tanpa file -> 422', r.status === 422);
r = await call('POST', '/receipts', { token: A, form: receiptForm(R('INV-MANY'), Array(4).fill(['a.png', PNG, 'image/png'])) });
check('4 file (maks 3) -> 422', r.status === 422 && /Jumlah file/.test(r.body.error.message), JSON.stringify(r.body));
r = await call('POST', '/receipts', { token: A, form: receiptForm(R('INV-BIG'), [['big.png', Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]), 'image/png']]) });
check('file > 5MB -> 422', r.status === 422 && /Ukuran/.test(r.body.error.message), JSON.stringify(r.body));
r = await call('POST', '/receipts', { token: A, form: receiptForm({ channel: 'Retail', nomor_transaksi: '', tanggal_transaksi: today, nominal: 1000 }) });
check('data wajib kosong -> 422', r.status === 422);

// akses file
r = await call('GET', `/receipts/${rec1.id}/files/${rec1.files[0].id}`, { token: A });
check('pemilik bisa buka file', r.status === 200 && r.headers.get('content-type') === 'image/png');
r = await call('GET', `/receipts/${rec1.id}/files/${rec1.files[0].id}`, { token: B });
check('member lain tidak bisa buka file (404)', r.status === 404);
r = await call('GET', `/admin/receipts/${rec1.id}/files/${rec1.files[0].id}`, { token: ADM });
check('admin bisa buka file', r.status === 200);
r = await call('GET', `/receipts/${rec1.id}`, { token: B });
check('member lain tidak bisa lihat detail (404)', r.status === 404);

// admin review
r = await call('GET', '/admin/receipts?status=menunggu_review', { token: ADM });
check('antrean admin', r.status === 200 && r.body.data.length === 1 && r.body.meta.ringkasan.ditolak >= 5, JSON.stringify(r.body.meta));
r = await call('GET', `/admin/receipts/${rec1.id}`, { token: ADM });
check('detail admin memuat hasil_validasi & member', r.body.data.hasil_validasi?.checks && r.body.data.member_nama === 'Ani');
r = await call('POST', `/admin/receipts/${rec1.id}/reject`, { token: ADM, json: {} });
check('tolak tanpa alasan -> 422', r.status === 422);
// approve dua kali bersamaan → hanya sekali
const both = await Promise.all([1, 2, 3].map(() => call('POST', `/admin/receipts/${rec1.id}/approve`, { token: ADM })));
check('approve paralel: tepat 1 sukses, lainnya 409', both.filter((x) => x.status === 200).length === 1 && both.filter((x) => x.status === 409).length === 2, both.map((x) => x.status).join());
r = await call('POST', `/admin/receipts/${rec1.id}/reject`, { token: ADM, json: { alasan: 'ubah pikiran' } });
check('struk terkunci setelah diputuskan (409)', r.status === 409);
r = await call('GET', '/member/points', { token: A });
check('poin masuk 50 (500000/10000), tidak dobel', r.body.data.total === 50 && r.body.data.tersedia === 50, JSON.stringify(r.body));

// resubmit
r = await call('POST', `/receipts/${dupRec.id}/resubmit`, { token: B, form: receiptForm(R('INV-B-1', 200000)) });
check('resubmit struk ditolak -> menunggu_review', r.status === 201 && r.body.data.status === 'menunggu_review' && r.body.data.resubmit_of == dupRec.id, JSON.stringify(r.body));
r = await call('POST', `/receipts/${rec1.id}/resubmit`, { token: A, form: receiptForm(R('INV-A-2')) });
check('resubmit struk yang bukan ditolak -> 409', r.status === 409);
r = await call('POST', `/receipts/${dupRec.id}/resubmit`, { token: B, form: receiptForm(R('INV-B-2', 200000)) });
check('resubmit dua kali -> 409', r.status === 409);
r = await call('POST', `/receipts/${dupRec.id}/resubmit`, { token: A, form: receiptForm(R('INV-A-3')) });
check('resubmit struk milik orang lain -> 404', r.status === 404);
r = await call('POST', `/admin/receipts/${(await call('GET','/admin/receipts?status=menunggu_review',{token:ADM})).body.data[0].id}/reject`, { token: ADM, json: { alasan: 'Foto buram' } });
check('admin tolak dengan alasan', r.status === 200 && r.body.data.alasan_penolakan === 'Foto buram');

// redeem
r = await call('GET', '/rewards', { token: A });
const reward50 = r.body.data.find((x) => x.poin_dibutuhkan === 50), reward100 = r.body.data.find((x) => x.poin_dibutuhkan === 100);
r = await call('POST', '/redeem', { token: A, json: { reward_id: reward100.id } });
check('redeem saldo kurang -> 422 tanpa hold', r.status === 422 && /tidak mencukupi/.test(r.body.error.message));
r = await call('GET', '/member/points/mutations', { token: A });
check('tidak ada entri hold', !r.body.data.some((x) => x.jenis === 'hold'));
const race = await Promise.all([1, 2, 3, 4, 5].map(() => call('POST', '/redeem', { token: A, json: { reward_id: reward50.id } })));
check('redeem paralel: hanya 1 lolos (saldo 50)', race.filter((x) => x.status === 201).length === 1, race.map((x) => x.status).join());
const redeem = race.find((x) => x.status === 201).body.data;
r = await call('GET', '/member/points', { token: A });
check('saldo: total 50, ditahan 50, tersedia 0', JSON.stringify(r.body.data) === JSON.stringify({ total: 50, ditahan: 50, tersedia: 0 }), JSON.stringify(r.body));
r = await call('POST', `/redeem/${redeem.id}/cancel`, { token: B });
check('member lain tak bisa batalkan (404)', r.status === 404);
r = await call('POST', `/redeem/${redeem.id}/cancel`, { token: A });
check('batalkan -> dibatalkan', r.status === 200 && r.body.data.status === 'dibatalkan');
r = await call('GET', '/member/points', { token: A });
check('hold dilepas → tersedia 50', r.body.data.tersedia === 50 && r.body.data.ditahan === 0, JSON.stringify(r.body));
r = await call('POST', `/redeem/${redeem.id}/cancel`, { token: A });
check('batal dua kali -> 409', r.status === 409);
r = await call('POST', '/redeem', { token: A, json: { reward_id: reward50.id } }); const red2 = r.body.data;
r = await call('POST', `/admin/redeems/${red2.id}/reject`, { token: ADM, json: {} });
check('tolak redeem tanpa alasan -> 422', r.status === 422);
r = await call('POST', `/admin/redeems/${red2.id}/reject`, { token: ADM, json: { alasan: 'Stok habis' } });
check('tolak redeem', r.status === 200 && r.body.data.status === 'ditolak');
r = await call('GET', '/member/points', { token: A });
check('tolak → poin kembali (tersedia 50)', r.body.data.tersedia === 50);
r = await call('POST', '/redeem', { token: A, json: { reward_id: reward50.id } }); const red3 = r.body.data;
r = await call('POST', `/admin/redeems/${red3.id}/approve`, { token: ADM, json: { detail_pemberian: 'Kode: ALP-1234' } });
check('setujui redeem + detail', r.status === 200 && r.body.data.status === 'selesai' && r.body.data.detail_pemberian === 'Kode: ALP-1234');
r = await call('GET', '/member/points', { token: A });
check('setelah approve: total 0, tersedia 0, ditahan 0', JSON.stringify(r.body.data) === JSON.stringify({ total: 0, ditahan: 0, tersedia: 0 }), JSON.stringify(r.body));
r = await call('POST', `/admin/redeems/${red3.id}/approve`, { token: ADM, json: {} });
check('approve redeem dua kali -> 409', r.status === 409);
r = await call('GET', `/member/redeems/${red3.id}`, { token: A });
check('member melihat detail pemberian', r.body.data.detail_pemberian === 'Kode: ALP-1234');

// auto-approve
r = await call('PUT', '/admin/auto-approve', { token: ADM, json: { channel: { aktif: true, channels: ['Retail'] }, batas_nominal: { aktif: true, maks: 300000 } } });
check('set auto-approve', r.status === 200 && r.body.data.every((c) => c.aktif));
r = await call('POST', '/receipts', { token: A, form: receiptForm(R('AUTO-1', 250000)) });
check('memenuhi kriteria -> disetujui otomatis + poin 25', r.body.data?.status === 'disetujui' && r.body.data.mode_persetujuan === 'otomatis' && r.body.data.poin_diperoleh === 25, JSON.stringify(r.body));
r = await call('POST', '/receipts', { token: A, form: receiptForm(R('AUTO-2', 350000)) });
check('nominal > batas -> manual', r.body.data?.status === 'menunggu_review');
r = await call('POST', '/receipts', { token: A, form: receiptForm(R('AUTO-3', 100000, { channel: 'E-commerce' })) });
check('channel bukan whitelist -> manual', r.body.data?.status === 'menunggu_review');

// settings
r = await call('PUT', '/admin/settings', { token: ADM, json: { point_rule: { rupiah_per_poin: 5000, pembulatan: 'atas', minimal_transaksi: 0 }, claim_window_days: 30, min_nominal: 0, max_file_size_mb: 5, max_files: 3, channels: ['Retail', 'E-commerce'] } });
check('ubah aturan poin', r.status === 200 && r.body.data.point_rule.rupiah_per_poin === 5000);
r = await call('POST', '/admin/receipts/' + (await call('GET', '/admin/receipts?q=AUTO-3', { token: ADM })).body.data[0].id + '/approve', { token: ADM });
check('aturan baru dipakai (100000/5000=20)', r.body.data?.poin_diperoleh === 20, JSON.stringify(r.body));

// notifikasi, dashboard
r = await call('GET', '/member/notifications', { token: A });
const kinds = new Set(r.body.data.map((n) => n.jenis_kejadian));
check('notifikasi 5 jenis kejadian', ['struk_disetujui', 'struk_ditolak', 'redeem_diajukan', 'redeem_disetujui', 'redeem_ditolak'].every((k) => kinds.has(k)), [...kinds].join());
check('unread count > 0', r.body.meta.belum_dibaca > 0);
await call('POST', '/member/notifications/read', { token: A, json: {} });
r = await call('GET', '/member/notifications', { token: A });
check('tandai dibaca', r.body.meta.belum_dibaca === 0);
r = await call('GET', '/member/dashboard', { token: A });
check('dashboard', r.status === 200 && r.body.data.points && r.body.data.struk_terbaru.length > 0);

// reward mgmt & audit
r = await call('POST', '/admin/rewards', { token: ADM, json: { nama: 'Tote Bag', poin_dibutuhkan: 30 } });
check('admin buat reward', r.status === 201); const rw = r.body.data;
r = await call('PUT', `/admin/rewards/${rw.id}`, { token: ADM, json: { nama: 'Tote Bag', poin_dibutuhkan: 30, aktif: false } });
r = await call('GET', '/rewards', { token: A });
check('reward nonaktif tak tampil ke member', !r.body.data.some((x) => x.id === rw.id));
r = await call('GET', '/admin/audit-logs?limit=100', { token: ADM });
check('audit log terisi', r.body.meta.total > 20 && r.body.data.some((l) => l.aksi === 'struk.setujui') && r.body.data.some((l) => l.pelaku_tipe === 'sistem'));
r = await call('DELETE', '/admin/audit-logs/1', { token: ADM });
check('tidak ada endpoint hapus log (404)', r.status === 404);
r = await call('GET', '/config', { token: A });
check('config', r.body.channels.length === 2);

// sesi: header refresh tidak diharapkan pada token baru
r = await call('GET', '/auth/me', { token: A });
check('me', r.body.user.email === 'ani@test.com');


// ================= FITUR LANJUTAN =================
const findReceipt = async (q) => (await call('GET', `/admin/receipts?q=${q}&limit=50`, { token: ADM })).body.data[0];
const balance = async (t) => (await call('GET', '/member/points', { token: t })).body.data;

// koreksi keputusan (OI-12)
r = await call('POST', `/admin/receipts/${rec1.id}/correct`, { token: ADM, json: {} });
check('koreksi tanpa alasan -> 422', r.status === 422);
r = await call('POST', `/admin/receipts/${rec1.id}/correct`, { token: ADM, json: { alasan: 'Salah setuju' } });
check('koreksi struk yang poinnya sudah dipakai redeem -> 409 POINTS_IN_USE', r.status === 409 && r.body.error.code === 'POINTS_IN_USE', JSON.stringify(r.body));
const auto1 = await findReceipt('AUTO-1');
const before = await balance(A);
r = await call('POST', `/admin/receipts/${auto1.id}/correct`, { token: ADM, json: { alasan: 'Struk ternyata palsu (uji koreksi)' } });
check('koreksi disetujui -> ditolak', r.status === 200 && r.body.data.status === 'ditolak' && r.body.data.koreksi.length === 1 && r.body.data.koreksi[0].poin_delta === -25, JSON.stringify(r.body));
let after = await balance(A);
check('poin dibalik (-25)', after.total === before.total - 25 && after.tersedia === before.tersedia - 25, JSON.stringify([before, after]));
r = await call('GET', `/receipts/${auto1.id}`, { token: A });
check('member melihat alasan koreksi & poin_diperoleh kosong', r.body.data.status === 'ditolak' && /palsu/.test(r.body.data.alasan_penolakan) && !r.body.data.poin_diperoleh);
r = await call('POST', `/admin/receipts/${auto1.id}/correct`, { token: ADM, json: { alasan: 'Ternyata struk asli' } });
check('koreksi ditolak -> disetujui (poin sesuai aturan saat ini)', r.status === 200 && r.body.data.status === 'disetujui' && r.body.data.poin_diperoleh === 50 && r.body.data.koreksi.length === 2, JSON.stringify(r.body.data.poin_diperoleh));
after = await balance(A);
check('poin masuk lagi (+50 vs setelah pembalikan)', after.total === before.total - 25 + 50, JSON.stringify(after));
r = await call('GET', '/member/points/mutations', { token: A });
check('mutasi memuat entri koreksi dengan keterangan struk', r.body.data.some((x) => x.jenis === 'koreksi' && x.keterangan === 'AUTO-1'));
const pend = (await call('GET', '/admin/receipts?status=menunggu_review', { token: ADM })).body.data[0];
r = await call('POST', `/admin/receipts/${pend.id}/correct`, { token: ADM, json: { alasan: 'coba' } });
check('koreksi struk yang belum diputuskan -> 409', r.status === 409 && r.body.error.code === 'NOT_DECIDED');
r = await call('POST', `/admin/receipts/${dupRec.id}/correct`, { token: ADM, json: { alasan: 'paksa setujui duplikat' } });
check('koreksi ke disetujui saat duplikat aktif -> 409 DUPLICATE', r.status === 409 && r.body.error.code === 'DUPLICATE', JSON.stringify(r.body));
r = await call('POST', `/admin/receipts/${auto1.id}/correct`, { token: A, json: { alasan: 'x' } });
check('member tidak bisa koreksi -> 403', r.status === 403);

// pencabutan sesi saat ganti password
const oldToken = A;
r = await call('POST', '/member/password', { token: A, json: { password_lama: 'salahbanget', password_baru: 'passwordbaru1' } });
check('ganti password: kata sandi lama salah -> 422', r.status === 422);
r = await call('POST', '/member/password', { token: A, json: { password_lama: 'rahasia123', password_baru: 'passwordbaru1' } });
check('ganti password ok + token baru', r.status === 200 && !!r.body.token);
const newToken = r.body.token;
await new Promise((res) => setTimeout(res, 1100));
r = await call('GET', '/member/points', { token: oldToken });
check('token lama tidak berlaku setelah ganti password (401)', r.status === 401);
r = await call('GET', '/member/points', { token: newToken });
check('token baru berlaku', r.status === 200);
r = await call('POST', '/auth/login', { json: { identifier: 'ani@test.com', password: 'passwordbaru1' } });
check('login dengan password baru', r.status === 200); const A2 = r.body.token;

// preferensi notifikasi
r = await call('PATCH', '/member/notification-prefs', { token: A2, json: { notif_email: false, notif_whatsapp: true } });
check('simpan preferensi notifikasi', r.status === 200 && r.body.data.notif_email === false);
r = await call('GET', '/auth/me', { token: A2 });
check('/auth/me memuat preferensi', r.body.user.notif_email === false && r.body.user.notif_whatsapp === true);
r = await call('GET', '/config', { token: A2 });
check('config: kanal notifikasi tersedia & terms tidak bocor ke config', r.body.notification_channels.in_app === true && !('terms_text' in r.body));

// terms publik (OI-15)
r = await call('GET', '/public/terms');
check('terms publik tanpa login', r.status === 200 && r.body.data.teks.length > 100);
const cur = (await call('GET', '/admin/settings', { token: ADM })).body.data;
r = await call('PUT', '/admin/settings', { token: ADM, json: { ...cur, terms_text: 'Teks syarat resmi Alpaka (uji).' } });
r = await call('GET', '/public/terms');
check('admin mengubah terms', r.body.data.teks === 'Teks syarat resmi Alpaka (uji).');

// manajemen admin (OI-13)
// role default admin baru = 'viewer' (least privilege); tes di bawah pakai role='super_admin' eksplisit
// karena skenarionya menguji proteksi self-deactivate/last-admin di endpoint kelola-admin (superOnly).
r = await call('POST', '/admin/admins', { token: ADM, json: { nama: 'Admin Viewer Default', email: 'viewer-default@alpaka.local', password: 'ViewerDefault-123' } });
check('admin baru default role viewer', r.status === 201 && r.body.data.role === 'viewer');
const vtok = (await call('POST', '/auth/admin/login', { json: { identifier: 'viewer-default@alpaka.local', password: 'ViewerDefault-123' } })).body.token;
r = await call('POST', `/admin/receipts/1/approve`, { token: vtok });
check('viewer tidak bisa approve struk -> 403', r.status === 403);
r = await call('GET', '/admin/admins', { token: vtok });
check('viewer tetap bisa membaca (GET) -> 200', r.status === 200);
r = await call('POST', '/admin/admins', { token: vtok, json: { nama: 'X', email: 'x@alpaka.local', password: 'rahasia123' } });
check('viewer tidak bisa membuat admin -> 403', r.status === 403);

r = await call('POST', '/admin/admins', { token: ADM, json: { nama: 'Admin Dua', email: 'dua@alpaka.local', password: 'adminDua-123', role: 'super_admin' } });
check('buat admin dengan role eksplisit', r.status === 201 && r.body.data.role === 'super_admin'); const adm2 = r.body.data;
r = await call('POST', '/admin/admins', { token: ADM, json: { nama: 'Dobel', email: 'DUA@alpaka.local', password: 'adminDua-123' } });
check('email admin duplikat -> 409', r.status === 409);
r = await call('POST', '/admin/admins', { token: ADM, json: { nama: 'Lemah', email: 'lemah@alpaka.local', password: '123' } });
check('password admin lemah -> 422', r.status === 422);
r = await call('POST', '/auth/admin/login', { json: { identifier: 'dua@alpaka.local', password: 'adminDua-123' } });
check('admin baru bisa login', r.status === 200); const ADM2 = r.body.token;
r = await call('PATCH', `/admin/admins/${adm2.id}`, { token: ADM2, json: { status: 'nonaktif' } });
check('tidak bisa menonaktifkan diri sendiri -> 409', r.status === 409 && r.body.error.code === 'SELF_DEACTIVATE');
r = await call('PATCH', `/admin/admins/${adm2.id}`, { token: ADM, json: { status: 'nonaktif' } });
check('nonaktifkan admin lain', r.status === 200 && r.body.data.status === 'nonaktif');
r = await call('GET', '/admin/summary', { token: ADM2 });
check('token admin nonaktif langsung ditolak (401)', r.status === 401);
r = await call('POST', '/auth/admin/login', { json: { identifier: 'dua@alpaka.local', password: 'adminDua-123' } });
check('admin nonaktif tidak bisa login (403)', r.status === 403);
const admins = (await call('GET', '/admin/admins', { token: ADM })).body.data;
const admin1 = admins.find((x) => x.email === 'admin@alpaka.local');
await call('PATCH', `/admin/admins/${adm2.id}`, { token: ADM, json: { status: 'aktif', password: 'adminDua-456' } });
r = await call('POST', '/auth/admin/login', { json: { identifier: 'dua@alpaka.local', password: 'adminDua-456' } });
check('aktifkan kembali + reset password', r.status === 200);
await call('PATCH', `/admin/admins/${adm2.id}`, { token: ADM, json: { status: 'nonaktif' } });
r = await call('PATCH', `/admin/admins/${admin1.id}`, { token: ADM, json: { status: 'nonaktif' } });
check('admin terakhir/diri sendiri tidak bisa dinonaktifkan (409)', r.status === 409);
r = await call('PATCH', `/admin/admins/${admin1.id}`, { token: ADM, json: { role: 'viewer' } });
check('turunkan peran diri sendiri (super admin terakhir) -> 409 LAST_ADMIN', r.status === 409 && r.body.error.code === 'LAST_ADMIN');
r = await call('PATCH', `/admin/admins/${adm2.id}`, { token: ADM, json: { role: 'approver' } });
check('ubah peran admin lain', r.status === 200 && r.body.data.role === 'approver');

// manajemen member
r = await call('GET', '/admin/members?q=ani', { token: ADM });
const ani = r.body.data.find((m) => m.email === 'ani@test.com');
check('daftar member + saldo', r.status === 200 && ani && typeof ani.tersedia === 'number' && ani.tersedia === (await balance(A2)).tersedia, JSON.stringify(ani));
r = await call('PATCH', `/admin/members/${ani.id}`, { token: ADM, json: { status_akun: 'nonaktif' } });
check('nonaktifkan member', r.status === 200);
r = await call('GET', '/member/points', { token: A2 });
check('token member nonaktif langsung ditolak', r.status === 401);
r = await call('POST', '/auth/login', { json: { identifier: 'ani@test.com', password: 'passwordbaru1' } });
check('member nonaktif tidak bisa login (403)', r.status === 403);
await call('PATCH', `/admin/members/${ani.id}`, { token: ADM, json: { status_akun: 'aktif' } });
r = await call('POST', '/auth/login', { json: { identifier: 'ani@test.com', password: 'passwordbaru1' } });
check('member diaktifkan kembali', r.status === 200);

// gambar reward (OI-09)
const imgForm = (buf, name, type) => { const f = new FormData(); f.append('image', new Blob([buf], { type }), name); return f; };
r = await call('POST', `/admin/rewards/${rw.id}/image`, { token: ADM, form: imgForm(PNG, 'r.png', 'image/png') });
check('unggah gambar reward', r.status === 200 && /\/api\/public\/rewards\/\d+\/image/.test(r.body.data.gambar_url), JSON.stringify(r.body));
const imgUrl = r.body.data.gambar_url;
const img = await fetch('http://localhost:' + BASE.split(':')[2].split('/')[0] + imgUrl);
check('gambar reward tampil publik (image/png)', img.status === 200 && img.headers.get('content-type') === 'image/png');
r = await call('POST', `/admin/rewards/${rw.id}/image`, { token: ADM, form: imgForm(Buffer.from('<?php ?>'), 'x.png', 'image/png') });
check('gambar palsu ditolak (422)', r.status === 422);
r = await call('POST', `/admin/rewards/${rw.id}/image`, { token: A2, form: imgForm(PNG, 'r.png', 'image/png') });
check('member tidak bisa unggah gambar reward (403)', r.status === 403);
r = await call('DELETE', `/admin/rewards/${rw.id}/image`, { token: ADM });
const gone = await fetch('http://localhost:' + BASE.split(':')[2].split('/')[0] + imgUrl);
check('hapus gambar reward', r.status === 200 && gone.status === 404);

console.log(fails ? `\n${fails} GAGAL` : '\nSEMUA LULUS');
process.exit(fails ? 1 : 0);
