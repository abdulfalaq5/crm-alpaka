/**
 * DATA CONTOH untuk demo/presentasi (`npm run seed:demo`) — JANGAN dijalankan di production.
 * Mengisi semua tabel dengan data yang saling konsisten: 8 member, 2 admin, ±30 struk (semua status,
 * termasuk auto-approve, duplikat, kedaluwarsa, pengajuan ulang), ledger poin, redeem (semua status),
 * notifikasi, audit log, reset password, dan file bukti nyata (PDF/PNG).
 *
 * Akun demo (kata sandi seragam: Demo-Alpaka-2026):
 *   member : demo@alpaka.local (riwayat terlengkap), sari.wulandari@example.com, dst.
 *   admin  : reviewer@alpaka.local (admin utama dari .env tetap dipakai)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { config } = require('../../config');
const { validateReceipt, todayIn } = require('../../services/receiptValidation');
const { hitungPoin } = require('../../services/points');
const tiersService = require('../../services/tiers');
const { makeReceiptPdf, makeReceiptPng } = require('../demo/files');

const PASSWORD = 'Demo-Alpaka-2026';

const MEMBERS = {
  demo: { nama: 'Member Demo', email: 'demo@alpaka.local', no_hp: '6281200000001', join: 28 },
  sari: { nama: 'Sari Wulandari', email: 'sari.wulandari@example.com', no_hp: '6281234500002', join: 27 },
  budi: { nama: 'Budi Santoso', email: 'budi.santoso@example.com', no_hp: null, join: 26 },
  dewi: { nama: 'Dewi Lestari', email: null, no_hp: '6281234500004', join: 24 },
  rian: { nama: 'Rian Pratama', email: 'rian.pratama@example.com', no_hp: '6281234500005', join: 20 },
  maya: { nama: 'Maya Anggraini', email: 'maya.anggraini@example.com', no_hp: '6281234500006', join: 18 },
  agus: { nama: 'Agus Setiawan', email: 'agus.setiawan@example.com', no_hp: null, join: 15 },
  nina: { nama: 'Nina Kusuma', email: 'nina.kusuma@example.com', no_hp: '6281234500008', join: 10 },
};

const NEW_REWARDS = [
  { nama: 'Tote Bag Alpaka', deskripsi: 'Tote bag kanvas edisi program loyalty.', poin: 30, aktif: true },
  { nama: 'Botol Minum Alpaka', deskripsi: 'Botol minum stainless 500 ml.', poin: 60, aktif: true },
  { nama: 'Topi Alpaka', deskripsi: 'Topi outdoor ringan, ukuran all-size.', poin: 80, aktif: true },
  { nama: 'Voucher Belanja Rp250.000', deskripsi: 'Voucher belanja untuk pembelian produk Alpaka.', poin: 250, aktif: true },
  { nama: 'Merchandise Edisi Lama', deskripsi: 'Program berakhir, tidak lagi ditampilkan.', poin: 120, aktif: false },
];

// st: A = disetujui admin | AO = disetujui otomatis | Q = menunggu review | RM = ditolak admin | RA = ditolak otomatis (validasi)
// tgl = umur tanggal transaksi (hari), aju = umur pengajuan (hari). png: pakai foto PNG, selain itu PDF.
const R = [
  { m: 'demo', ch: 'Retail', no: 'RTL-260901-0187', nom: 850000, tgl: 22, aju: 22, st: 'A', png: true, extraPdf: true },
  { m: 'demo', ch: 'E-commerce', no: 'EC-260905-3391', nom: 320000, tgl: 18, aju: 18, st: 'AO' },
  { m: 'demo', ch: 'Retail', no: 'RTL-260908-0412', nom: 1200000, tgl: 15, aju: 15, st: 'A', png: true },
  { key: 'd4', m: 'demo', ch: 'Retail', no: 'RTL-260912-5520', nom: 150000, tgl: 10, aju: 10, st: 'RM', alasan: 'Foto struk buram, nominal tidak terbaca.', png: true },
  { m: 'demo', ch: 'Retail', no: 'RTL-260912-5520', nom: 150000, tgl: 10, aju: 9, st: 'A', ulang: 'd4' },
  { m: 'demo', ch: 'Retail', no: 'RTL-260916-0655', nom: 475000, tgl: 5, aju: 5, st: 'A' },
  { m: 'demo', ch: 'E-commerce', no: 'EC-260919-7710', nom: 260000, tgl: 2, aju: 2, st: 'AO' },
  { m: 'demo', ch: 'Retail', no: 'RTL-260920-0733', nom: 690000, tgl: 1, aju: 1, st: 'Q', png: true },
  { m: 'demo', ch: 'E-commerce', no: 'EC-260920-7802', nom: 720000, tgl: 1, aju: 1, st: 'Q' },

  { m: 'sari', ch: 'Retail', no: 'RTL-260903-0221', nom: 980000, tgl: 20, aju: 20, st: 'A' },
  { m: 'sari', ch: 'E-commerce', no: 'EC-260910-4410', nom: 410000, tgl: 12, aju: 12, st: 'AO' },
  { m: 'sari', ch: 'Retail', no: 'RTL-260914-0512', nom: 560000, tgl: 7, aju: 7, st: 'A', png: true },
  { m: 'sari', ch: 'E-commerce', no: 'EC-260910-4410', nom: 410000, tgl: 12, aju: 4, st: 'RA', duplikat: true },
  { m: 'sari', ch: 'Retail', no: 'RTL-260919-0690', nom: 830000, tgl: 2, aju: 2, st: 'Q' },

  { m: 'budi', ch: 'Retail', no: 'RTL-260904-0301', nom: 1500000, tgl: 19, aju: 19, st: 'A', png: true },
  { m: 'budi', ch: 'Retail', no: 'RTL-260909-0388', nom: 300000, tgl: 14, aju: 14, st: 'RM', alasan: 'Nomor transaksi pada struk tidak sesuai dengan yang diisi.' },
  { m: 'budi', ch: 'E-commerce', no: 'EC-260913-4923', nom: 180000, tgl: 9, aju: 9, st: 'AO' },
  { m: 'budi', ch: 'Retail', no: 'RTL-260918-0611', nom: 640000, tgl: 3, aju: 3, st: 'Q' },

  { m: 'dewi', ch: 'E-commerce', no: 'EC-260906-3712', nom: 275000, tgl: 16, aju: 16, st: 'AO' },
  { m: 'dewi', ch: 'Retail', no: 'RTL-260911-0455', nom: 720000, tgl: 11, aju: 11, st: 'A' },
  { m: 'dewi', ch: 'Retail', no: 'RTL-260815-0570', nom: 400000, tgl: 40, aju: 6, st: 'RA' },
  { m: 'dewi', ch: 'E-commerce', no: 'EC-260920-8001', nom: 510000, tgl: 1, aju: 1, st: 'Q' },

  { m: 'rian', ch: 'Retail', no: 'RTL-260907-0350', nom: 2100000, tgl: 14, aju: 14, st: 'A', png: true },
  { m: 'rian', ch: 'Retail', no: 'RTL-260913-0499', nom: 350000, tgl: 8, aju: 8, st: 'A' },
  { m: 'rian', ch: 'E-commerce', no: 'EC-260917-6122', nom: 130000, tgl: 4, aju: 4, st: 'AO' },
  { m: 'rian', ch: 'Retail', no: 'RTL-261001-0001', nom: 300000, tgl: -10, aju: 1, st: 'RA' },

  { m: 'maya', ch: 'E-commerce', no: 'EC-260908-3908', nom: 450000, tgl: 13, aju: 13, st: 'AO' },
  { key: 'm2', m: 'maya', ch: 'Retail', no: 'RTL-260914-0530', nom: 890000, tgl: 7, aju: 7, st: 'RM', alasan: 'Struk tidak memuat tanggal transaksi.', png: true },
  { m: 'maya', ch: 'Retail', no: 'RTL-260914-0530', nom: 890000, tgl: 7, aju: 6, st: 'A', ulang: 'm2', png: true },
  { m: 'maya', ch: 'E-commerce', no: 'EC-260918-6660', nom: 610000, tgl: 3, aju: 3, st: 'Q' },

  { m: 'agus', ch: 'Retail', no: 'RTL-260912-0480', nom: 320000, tgl: 9, aju: 9, st: 'A' },
  { m: 'agus', ch: 'Retail', no: 'RTL-260916-0588', nom: 470000, tgl: 5, aju: 5, st: 'Q' },
  { m: 'agus', ch: 'E-commerce', no: 'EC-260919-7733', nom: 200000, tgl: 2, aju: 2, st: 'AO' },

  { m: 'nina', ch: 'Retail', no: 'RTL-260918-0622', nom: 550000, tgl: 3, aju: 3, st: 'A' },
  { m: 'nina', ch: 'Retail', no: 'RTL-260920-0745', nom: 380000, tgl: 1, aju: 1, st: 'Q' },
];

// st: selesai | ditolak | dibatalkan | menunggu
const D = [
  { m: 'demo', reward: 'Voucher Belanja Rp50.000', aju: 14, st: 'selesai', detail: 'Kode voucher: ALP-50K-8F3A2 (berlaku 30 hari).' },
  { m: 'demo', reward: 'Tote Bag Alpaka', aju: 8, st: 'dibatalkan' },
  { m: 'demo', reward: 'Voucher Belanja Rp100.000', aju: 3, st: 'ditolak', alasan: 'Stok voucher periode ini habis, silakan ajukan kembali minggu depan.' },
  { m: 'demo', reward: 'Botol Minum Alpaka', aju: 1, st: 'menunggu' },
  { m: 'sari', reward: 'Voucher Belanja Rp100.000', aju: 6, st: 'selesai', detail: 'Kode voucher: ALP-100K-77C1.' },
  { m: 'sari', reward: 'Tote Bag Alpaka', aju: 2, st: 'menunggu' },
  { m: 'budi', reward: 'Topi Alpaka', aju: 10, st: 'selesai', detail: 'Diambil di toko Alpaka Kemang, tunjukkan email ini.' },
  { m: 'budi', reward: 'Tote Bag Alpaka', aju: 4, st: 'dibatalkan' },
  { m: 'dewi', reward: 'Tote Bag Alpaka', aju: 7, st: 'selesai', detail: 'Dikirim via kurir, resi JNE-8829301145.' },
  { m: 'rian', reward: 'Voucher Belanja Rp250.000', aju: 5, st: 'menunggu' },
  { m: 'maya', reward: 'Botol Minum Alpaka', aju: 3, st: 'selesai', detail: 'Kode klaim: ALP-BTL-2210.' },
  { m: 'nina', reward: 'Tote Bag Alpaka', aju: 1, st: 'menunggu' },
];

async function run(db, log) {
  const { rows: exists } = await db.query("SELECT 1 FROM members WHERE lower(email) = 'demo@alpaka.local'");
  if (exists.length) return 'dilewati (data demo sudah ada)';

  const { rows: admins } = await db.query('SELECT id FROM admins ORDER BY id LIMIT 1');
  if (!admins.length) throw new Error('Jalankan seeder dasar dulu (admin awal belum ada): npm run db:setup');
  const admin1 = admins[0].id;

  const client = await db.connect();
  const written = [];
  try {
    await client.query('BEGIN');
    const passHash = await bcrypt.hash(PASSWORD, 10);
    const settings = Object.fromEntries((await client.query('SELECT key, value FROM app_settings')).rows.map((r) => [r.key, r.value]));
    const rule = (await client.query('SELECT * FROM point_rules WHERE id = 1')).rows[0];
    const pointRule = { rupiah_per_poin: rule.rupiah_per_poin, pembulatan: rule.pembulatan, minimal_transaksi: Number(rule.minimal_transaksi) };

    // ---- waktu ----
    const at = (daysAgo, hour = 10, minute = 0) => {
      const d = new Date();
      d.setHours(hour, minute, 0, 0);
      d.setDate(d.getDate() - daysAgo);
      return d;
    };
    const plusHours = (d, h) => new Date(d.getTime() + h * 3600 * 1000);
    const today = todayIn(config.timezone);
    const dateStr = (daysAgo) => new Date(Date.parse(`${today}T00:00:00Z`) - daysAgo * 864e5).toISOString().slice(0, 10);

    const audit = (pelakuTipe, pelakuId, aksi, objekTipe, objekId, detail, when) =>
      client.query(
        `INSERT INTO audit_logs (pelaku_tipe, pelaku_id, aksi, objek_tipe, objek_id, detail, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [pelakuTipe, pelakuId, aksi, objekTipe, objekId, JSON.stringify(detail || {}), when]
      );
    const notif = (memberId, jenis, isi, refTipe, refId, when) => {
      const unread = Date.now() - when.getTime() < 3 * 864e5; // ≤3 hari terakhir belum dibaca
      return client.query(
        `INSERT INTO notifications (member_id, jenis_kejadian, isi, referensi_tipe, referensi_id, dibaca_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [memberId, jenis, isi, refTipe, refId, unread ? null : plusHours(when, 1), when]
      );
    };
    const ledger = (memberId, jenis, jumlah, tipe, refId, when) =>
      client.query(
        `INSERT INTO points_ledger (member_id, jenis, jumlah, referensi_tipe, referensi_id, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
        [memberId, jenis, jumlah, tipe, refId, when]
      );

    // ---- admin kedua ----
    const { rows: rv } = await client.query(
      `INSERT INTO admins (nama, email, password_hash, created_at) VALUES ('Reviewer Alpaka', 'reviewer@alpaka.local', $1, $2)
       ON CONFLICT DO NOTHING RETURNING id`,
      [passHash, at(29)]
    );
    const admin2 = rv[0]?.id || (await client.query("SELECT id FROM admins WHERE email = 'reviewer@alpaka.local'")).rows[0].id;
    const adminFor = (i) => (i % 2 === 0 ? admin1 : admin2);

    // ---- pengaturan (diubah admin) ----
    await client.query('UPDATE point_rules SET diubah_oleh = $1, updated_at = $2 WHERE id = 1', [admin1, at(29)]);
    await client.query('UPDATE app_settings SET diubah_oleh = $1, updated_at = $2', [admin1, at(29)]);
    await audit('admin', admin1, 'pengaturan.program', 'pengaturan', null, { point_rule: pointRule, ...settings }, at(29, 9));

    // ---- reward ----
    const rewardId = {};
    for (const r of (await client.query('SELECT id, nama FROM rewards')).rows) rewardId[r.nama] = r.id;
    for (const r of NEW_REWARDS) {
      const { rows } = await client.query(
        'INSERT INTO rewards (nama, deskripsi, poin_dibutuhkan, aktif, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [r.nama, r.deskripsi, r.poin, r.aktif, at(29, 11)]
      );
      rewardId[r.nama] = rows[0].id;
      await audit('admin', admin1, 'reward.buat', 'reward', rows[0].id, { nama: r.nama, poin_dibutuhkan: r.poin }, at(29, 11));
    }
    await audit('admin', admin1, 'reward.ubah', 'reward', rewardId['Merchandise Edisi Lama'], { aktif: false }, at(12, 15));

    // ---- auto-approve aktif sejak 21 hari lalu: E-commerce dengan nominal ≤ Rp500.000 ----
    const criteria = { channel: { aktif: true, nilai: { channels: ['E-commerce'] } }, batas_nominal: { aktif: true, nilai: { maks: 500000 } } };
    for (const [kode, c] of Object.entries(criteria)) {
      await client.query('UPDATE auto_approve_criteria SET aktif=$2, nilai=$3, diubah_oleh=$4, updated_at=$5 WHERE kode=$1', [kode, c.aktif, JSON.stringify(c.nilai), admin1, at(21)]);
    }
    await audit('admin', admin1, 'pengaturan.auto_approve', 'pengaturan', null, criteria, at(21, 9));

    // ---- member ----
    const mid = {};
    for (const [key, m] of Object.entries(MEMBERS)) {
      const { rows } = await client.query(
        `INSERT INTO members (nama, email, no_hp, password_hash, setuju_syarat_at, created_at) VALUES ($1,$2,$3,$4,$5,$5) RETURNING id`,
        [m.nama, m.email, m.no_hp, passHash, at(m.join)]
      );
      mid[key] = rows[0].id;
      await audit('member', rows[0].id, 'member.registrasi', 'member', rows[0].id, {}, at(m.join));
    }

    // ---- struk + file + ledger + notifikasi + audit ----
    const receiptId = {};
    const earned = {};
    let n = 0;
    for (const r of R) {
      n += 1;
      const submitted = at(r.aju, 9 + (n % 8), (n * 7) % 60);
      const decided = plusHours(submitted, 2 + (n % 4));
      const memberId = mid[r.m];

      const v = validateReceipt(
        { channel: r.ch, nomor_transaksi: r.no, tanggal_transaksi: dateStr(r.tgl), nominal: r.nom },
        { channels: settings.channels, claimWindowDays: settings.claim_window_days, minNominal: Number(settings.min_nominal), today, duplikat: !!r.duplikat }
      );
      if (r.st === 'RA' ? v.lulus : !v.lulus) throw new Error(`Data demo tidak konsisten untuk ${r.no} (${r.st}): ${v.alasan.join(' ')}`);

      const status = r.st === 'Q' ? 'menunggu_review' : r.st === 'RM' || r.st === 'RA' ? 'ditolak' : 'disetujui';
      const mode = r.st === 'Q' ? null : r.st === 'A' || r.st === 'RM' ? 'manual' : 'otomatis';
      const decider = mode === 'manual' ? adminFor(n) : null;
      const alasan = r.st === 'RA' ? v.alasan.join(' ') : r.alasan || null;

      const { rows } = await client.query(
        `INSERT INTO receipts (member_id, channel, nomor_transaksi, tanggal_transaksi, nominal, status, hasil_validasi,
                               mode_persetujuan, alasan_penolakan, diputuskan_oleh, waktu_keputusan, resubmit_of, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [memberId, r.ch, r.no, dateStr(r.tgl), r.nom, status, JSON.stringify({ lulus: v.lulus, checks: v.checks }), mode, alasan, decider, r.st === 'Q' ? null : decided, r.ulang ? receiptId[r.ulang] : null, submitted]
      );
      const id = rows[0].id;
      if (r.key) receiptId[r.key] = id;

      // file bukti (nama acak di UPLOAD_DIR, sama seperti upload sungguhan)
      fs.mkdirSync(config.uploadDir, { recursive: true });
      const files = [{ png: !!r.png }];
      if (r.extraPdf) files.push({ png: false });
      for (const f of files) {
        const buf = f.png ? makeReceiptPng(r.no) : makeReceiptPdf({ toko: r.ch === 'Retail' ? 'ALPAKA - Toko Retail' : 'ALPAKA - Pesanan Online', nomor: r.no, tanggal: dateStr(r.tgl), total: r.nom });
        const nama_file = `${crypto.randomUUID()}${f.png ? '.png' : '.pdf'}`;
        fs.writeFileSync(path.join(config.uploadDir, nama_file), buf);
        written.push(nama_file);
        await client.query(
          'INSERT INTO receipt_files (receipt_id, nama_asli, nama_file, mime, ukuran, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
          [id, `struk-${r.no}${f.png ? '.png' : '.pdf'}`, nama_file, f.png ? 'image/png' : 'application/pdf', buf.length, submitted]
        );
      }

      await audit('member', memberId, r.ulang ? 'struk.ajukan_ulang' : 'struk.ajukan', 'receipt', id, {}, submitted);
      if (r.st === 'A' || r.st === 'AO') {
        const poin = hitungPoin(r.nom, pointRule);
        earned[r.m] = (earned[r.m] || 0) + poin;
        await ledger(memberId, 'masuk', poin, 'receipt', id, decided);
        await audit(mode === 'manual' ? 'admin' : 'sistem', decider, mode === 'manual' ? 'struk.setujui' : 'struk.setujui_otomatis', 'receipt', id, { poin }, decided);
        await notif(memberId, 'struk_disetujui', `Struk ${r.no} disetujui. Anda mendapat ${poin} poin.`, 'receipt', id, decided);
      } else if (r.st === 'RM') {
        await audit('admin', decider, 'struk.tolak', 'receipt', id, { alasan }, decided);
        await notif(memberId, 'struk_ditolak', `Struk ${r.no} ditolak. Alasan: ${alasan}`, 'receipt', id, decided);
      } else if (r.st === 'RA') {
        await audit('sistem', null, 'struk.tolak_otomatis', 'receipt', id, { alasan }, submitted);
        await notif(memberId, 'struk_ditolak', `Struk ${r.no} ditolak. Alasan: ${alasan}`, 'receipt', id, submitted);
      }
    }

    // ---- redeem ----
    const spent = {};
    const held = {};
    for (const d of D) {
      n += 1;
      const rid = rewardId[d.reward];
      const poin = (await client.query('SELECT poin_dibutuhkan FROM rewards WHERE id = $1', [rid])).rows[0].poin_dibutuhkan;
      const submitted = at(d.aju, 10 + (n % 6), (n * 11) % 60);
      const decided = plusHours(submitted, 5 + (n % 5));
      const memberId = mid[d.m];
      const status = { selesai: 'selesai', ditolak: 'ditolak', dibatalkan: 'dibatalkan', menunggu: 'menunggu_persetujuan' }[d.st];
      const byAdmin = d.st === 'selesai' || d.st === 'ditolak';
      const decider = byAdmin ? adminFor(n) : null;

      const { rows } = await client.query(
        `INSERT INTO redeems (member_id, reward_id, jumlah_poin, status, alasan_penolakan, detail_pemberian, diputuskan_oleh, waktu_keputusan, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [memberId, rid, poin, status, d.alasan || null, d.detail || null, decider, d.st === 'menunggu' ? null : decided, submitted]
      );
      const id = rows[0].id;
      await ledger(memberId, 'hold', poin, 'redeem', id, submitted);
      await audit('member', memberId, 'redeem.ajukan', 'redeem', id, { reward: d.reward, poin }, submitted);
      await notif(memberId, 'redeem_diajukan', `Pengajuan redeem "${d.reward}" diterima. ${poin} poin ditahan sampai diproses admin.`, 'redeem', id, submitted);

      if (d.st === 'selesai') {
        spent[d.m] = (spent[d.m] || 0) + poin;
        await ledger(memberId, 'terpakai', poin, 'redeem', id, decided);
        await audit('admin', decider, 'redeem.setujui', 'redeem', id, { reward: d.reward, poin }, decided);
        await notif(memberId, 'redeem_disetujui', `Redeem "${d.reward}" disetujui. Detail: ${d.detail}`, 'redeem', id, decided);
      } else if (d.st === 'ditolak') {
        await ledger(memberId, 'lepas', poin, 'redeem', id, decided);
        await audit('admin', decider, 'redeem.tolak', 'redeem', id, { reward: d.reward, poin, alasan: d.alasan }, decided);
        await notif(memberId, 'redeem_ditolak', `Redeem "${d.reward}" ditolak. Alasan: ${d.alasan}. ${poin} poin dikembalikan ke saldo tersedia.`, 'redeem', id, decided);
      } else if (d.st === 'dibatalkan') {
        await ledger(memberId, 'lepas', poin, 'redeem', id, decided);
        await audit('member', memberId, 'redeem.batalkan', 'redeem', id, { reward: d.reward, poin }, decided);
      } else {
        held[d.m] = (held[d.m] || 0) + poin;
      }
    }
    for (const key of Object.keys(MEMBERS)) {
      const tersedia = (earned[key] || 0) - (spent[key] || 0) - (held[key] || 0);
      if (tersedia < 0) throw new Error(`Data demo tidak konsisten: saldo ${key} negatif (${tersedia})`);
      await tiersService.reevaluate(client, mid[key]); // tier dihitung dari ledger yang baru dibuat di atas
    }

    // ---- reset password (satu terpakai, satu kedaluwarsa) ----
    const token = () => crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
    await client.query('INSERT INTO password_resets (member_id, token_hash, expires_at, used_at, created_at) VALUES ($1,$2,$3,$4,$5)', [mid.sari, token(), plusHours(at(12), 1), plusHours(at(12), 0.2), at(12)]);
    await client.query('INSERT INTO password_resets (member_id, token_hash, expires_at, created_at) VALUES ($1,$2,$3,$4)', [mid.budi, token(), plusHours(at(6), 1), at(6)]);
    await audit('member', mid.sari, 'member.reset_password', 'member', mid.sari, {}, plusHours(at(12), 0.2));

    await client.query('COMMIT');
    return `${Object.keys(MEMBERS).length} member, ${R.length} struk, ${D.length} redeem, 2 admin — login: demo@alpaka.local / ${PASSWORD}`;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    for (const f of written) fs.rmSync(path.join(config.uploadDir, f), { force: true });
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { run };
