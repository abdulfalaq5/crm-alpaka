const test = require('node:test');
const assert = require('node:assert/strict');
const { hitungPoin, hitungSaldo } = require('../src/services/points');
const { validateReceipt, daysBetween } = require('../src/services/receiptValidation');
const { evaluateAutoApprove } = require('../src/services/autoApprove');
const { normalizePhone } = require('../src/utils/phone');

test('hitungPoin: pembulatan & minimal transaksi', () => {
  const rule = { rupiah_per_poin: 10000, pembulatan: 'bawah', minimal_transaksi: 0 };
  assert.equal(hitungPoin(125000, rule), 12);
  assert.equal(hitungPoin(125000, { ...rule, pembulatan: 'atas' }), 13);
  assert.equal(hitungPoin(125000, { ...rule, pembulatan: 'terdekat' }), 13);
  assert.equal(hitungPoin(124999, { ...rule, pembulatan: 'terdekat' }), 12);
  assert.equal(hitungPoin(90000, { ...rule, minimal_transaksi: 100000 }), 0);
});

test('hitungSaldo: hold mengurangi tersedia, terpakai memotong total, lepas mengembalikan', () => {
  assert.deepEqual(hitungSaldo({ masuk: 100 }), { total: 100, ditahan: 0, tersedia: 100 });
  assert.deepEqual(hitungSaldo({ masuk: 100, hold: 40 }), { total: 100, ditahan: 40, tersedia: 60 });
  assert.deepEqual(hitungSaldo({ masuk: 100, hold: 40, terpakai: 40 }), { total: 60, ditahan: 0, tersedia: 60 });
  assert.deepEqual(hitungSaldo({ masuk: 100, hold: 40, lepas: 40 }), { total: 100, ditahan: 0, tersedia: 100 });
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
