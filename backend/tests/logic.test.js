const test = require('node:test');
const assert = require('node:assert/strict');
const { hitungPoin, hitungSaldo } = require('../src/services/points');
const { validateReceipt, daysBetween } = require('../src/services/receiptValidation');
const { evaluateAutoApprove } = require('../src/services/autoApprove');
const { normalizePhone } = require('../src/utils/phone');
const { tierForPoints, progress } = require('../src/services/tiers');
const { efektifStatus } = require('../src/services/vouchers');

test('hitungPoin: pembulatan & minimal transaksi', () => {
  const rule = { rupiah_per_poin: 10000, pembulatan: 'bawah', minimal_transaksi: 0 };
  assert.equal(hitungPoin(125000, rule), 12);
  assert.equal(hitungPoin(125000, { ...rule, pembulatan: 'atas' }), 13);
  assert.equal(hitungPoin(125000, { ...rule, pembulatan: 'terdekat' }), 13);
  assert.equal(hitungPoin(124999, { ...rule, pembulatan: 'terdekat' }), 12);
  assert.equal(hitungPoin(90000, { ...rule, minimal_transaksi: 100000 }), 0);
});

test('hitungSaldo: koreksi membalik poin masuk', () => {
  assert.deepEqual(hitungSaldo({ masuk: 100, koreksi: 30 }), { total: 70, ditahan: 0, tersedia: 70 });
  assert.deepEqual(hitungSaldo({ masuk: 100, hold: 40, koreksi: 30 }), { total: 70, ditahan: 40, tersedia: 30 });
});

test('hitungSaldo: hold mengurangi tersedia, terpakai memotong total, lepas mengembalikan', () => {
  assert.deepEqual(hitungSaldo({ masuk: 100 }), { total: 100, ditahan: 0, tersedia: 100 });
  assert.deepEqual(hitungSaldo({ masuk: 100, hold: 40 }), { total: 100, ditahan: 40, tersedia: 60 });
  assert.deepEqual(hitungSaldo({ masuk: 100, hold: 40, terpakai: 40 }), { total: 60, ditahan: 0, tersedia: 60 });
  assert.deepEqual(hitungSaldo({ masuk: 100, hold: 40, lepas: 40 }), { total: 100, ditahan: 0, tersedia: 100 });
});

// Voucher manual: generate = hold + terpakai (potong poin), void = kembalian (kembalikan poin).
test('hitungSaldo: kembalian mengembalikan poin voucher manual tanpa memengaruhi ditahan', () => {
  const setelahGenerate = hitungSaldo({ masuk: 200, hold: 40, terpakai: 40 });
  assert.deepEqual(setelahGenerate, { total: 160, ditahan: 0, tersedia: 160 });
  const setelahVoid = hitungSaldo({ masuk: 200, hold: 40, terpakai: 40, kembalian: 40 });
  assert.deepEqual(setelahVoid, { total: 200, ditahan: 0, tersedia: 200 });
});

const ctx = { channels: ['Retail', 'E-commerce'], claimWindowDays: 30, minNominal: 0, today: '2026-09-21', duplikat: false };
const ok = { channel: 'Retail', nomor_transaksi: 'INV-1', tanggal_transaksi: '2026-09-20', nominal: 100000 };

test('validateReceipt: data valid lulus', () => {
  assert.equal(validateReceipt(ok, ctx).lulus, true);
});

test('validateReceipt: duplikat, tanggal, nominal, channel', () => {
  assert.equal(validateReceipt(ok, { ...ctx, duplikat: true }).checks.duplikat.lulus, false);
  assert.match(validateReceipt({ ...ok, tanggal_transaksi: '2026-09-22' }, ctx).alasan[0], /masa depan/);
  assert.match(validateReceipt({ ...ok, tanggal_transaksi: '2026-08-01' }, ctx).alasan[0], /masa klaim/);
  assert.equal(validateReceipt({ ...ok, tanggal_transaksi: '2026-08-22' }, ctx).lulus, true); // tepat 30 hari
  assert.match(validateReceipt({ ...ok, nominal: 0 }, ctx).alasan[0], /lebih dari nol/);
  assert.match(validateReceipt({ ...ok, nominal: 5000 }, { ...ctx, minNominal: 10000 }).alasan[0], /batas minimal/);
  assert.equal(validateReceipt({ ...ok, channel: 'Lainnya' }, ctx).checks.kelengkapan.lulus, false);
});

test('daysBetween', () => {
  assert.equal(daysBetween('2026-09-20', '2026-09-21'), 1);
  assert.equal(daysBetween('2026-09-22', '2026-09-21'), -1);
});

test('evaluateAutoApprove: butuh kriteria aktif dan semuanya terpenuhi', () => {
  const receipt = { channel: 'Retail', nominal: 200000 };
  const crit = (channelsAktif, nominalAktif) => [
    { kode: 'channel', aktif: channelsAktif, nilai: { channels: ['Retail'] } },
    { kode: 'batas_nominal', aktif: nominalAktif, nilai: { maks: 500000 } },
  ];
  assert.equal(evaluateAutoApprove(crit(false, false), receipt), false); // semua nonaktif → manual
  assert.equal(evaluateAutoApprove(crit(true, true), receipt), true);
  assert.equal(evaluateAutoApprove(crit(false, true), { ...receipt, nominal: 600000 }), false);
  assert.equal(evaluateAutoApprove(crit(true, false), { ...receipt, channel: 'E-commerce' }), false);
  assert.equal(evaluateAutoApprove([{ kode: 'channel', aktif: true, nilai: { channels: [] } }], receipt), false);
});

test('normalizePhone', () => {
  assert.equal(normalizePhone('0812-3456-7890'), '6281234567890');
  assert.equal(normalizePhone('+62 812 3456 7890'), '6281234567890');
  assert.equal(normalizePhone('abc'), null);
});

test('tierForPoints memilih tier tertinggi yang terpenuhi dari daftar tidak terurut', () => {
  const tiers = [
    { id: 3, nama: 'Gold', urutan: 3, min_poin: 300 },
    { id: 1, nama: 'Bronze', urutan: 1, min_poin: 0 },
    { id: 2, nama: 'Silver', urutan: 2, min_poin: 100 },
  ];
  assert.equal(tierForPoints(tiers, 175).nama, 'Silver');
  assert.equal(tierForPoints(tiers, 0).nama, 'Bronze');
  assert.equal(tierForPoints(tiers, 1000).nama, 'Gold');
});

test('progress tier otomatis menghitung progress ke tier berikutnya', () => {
  const tiers = [
    { id: '1', nama: 'Bronze', urutan: 1, min_poin: 0 },
    { id: '2', nama: 'Silver', urutan: 2, min_poin: 100 },
    { id: '3', nama: 'Gold', urutan: 3, min_poin: 300 },
  ];
  assert.deepEqual(progress(tiers, 175), {
    tier_saat_ini: tiers[1],
    tier_berikutnya: tiers[2],
    tier_otomatis: tiers[1],
    tier_manual: false,
    poin_saat_ini: 175,
    poin_dibutuhkan: 125,
    persen: 38,
  });
});

test('progress otomatis mengabaikan current tier yang tertinggal', () => {
  const tiers = [
    { id: '1', nama: 'Bronze', urutan: 1, min_poin: 0 },
    { id: '2', nama: 'Silver', urutan: 2, min_poin: 100 },
    { id: '3', nama: 'Gold', urutan: 3, min_poin: 300 },
  ];
  const result = progress(tiers, 175, { currentTierId: '1', manual: false });
  assert.equal(result.tier_saat_ini.nama, 'Silver');
  assert.equal(result.tier_berikutnya.nama, 'Gold');
  assert.equal(result.tier_manual, false);
});

test('progress menghormati tier manual dan tetap aman saat poin di bawah threshold', () => {
  const tiers = [
    { id: '1', nama: 'Bronze', urutan: 1, min_poin: 0 },
    { id: '2', nama: 'Silver', urutan: 2, min_poin: 100 },
    { id: '3', nama: 'Gold', urutan: 3, min_poin: 300 },
    { id: '4', nama: 'Platinum', urutan: 4, min_poin: 800 },
  ];
  const result = progress(tiers, 50, { currentTierId: '3', manual: true });
  assert.equal(result.tier_saat_ini.nama, 'Gold');
  assert.equal(result.tier_berikutnya.nama, 'Platinum');
  assert.equal(result.tier_manual, true);
  assert.equal(result.poin_dibutuhkan, 750);
  assert.equal(result.persen, 6);
});

test('progress tanpa konfigurasi tier tidak menampilkan tier tertinggi', () => {
  const result = progress([], 100);
  assert.equal(result.tier_saat_ini, null);
  assert.equal(result.tier_berikutnya, null);
  assert.equal(result.persen, 0);
});

// ---- Voucher Management (tambahan.md poin 3) ----
test('efektifStatus: voucher aktif yang lewat masa berlaku tampil kedaluwarsa', () => {
  const now = new Date('2026-09-25T10:00:00Z');
  assert.equal(efektifStatus({ status: 'active', expires_at: '2026-09-24T23:59:00Z' }, now), 'expired');
  assert.equal(efektifStatus({ status: 'active', expires_at: '2026-09-25T23:59:00Z' }, now), 'active');
});

test('efektifStatus: reservasi yang lewat waktu tampil aktif kembali', () => {
  const now = new Date('2026-09-25T10:00:00Z');
  assert.equal(efektifStatus({ status: 'reserved', reserved_until: '2026-09-25T09:00:00Z' }, now), 'active');
  assert.equal(efektifStatus({ status: 'reserved', reserved_until: '2026-09-25T11:00:00Z' }, now), 'reserved');
});

test('efektifStatus: status final tidak diubah walau tanggalnya sudah lewat', () => {
  const now = new Date('2026-09-25T10:00:00Z');
  for (const status of ['used', 'expired', 'void']) {
    assert.equal(efektifStatus({ status, expires_at: '2020-01-01T00:00:00Z' }, now), status);
  }
});
