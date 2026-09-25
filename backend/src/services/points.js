const { getPointRule } = require('./settings');
const tiers = require('./tiers');

/** Konversi nominal transaksi ke poin sesuai aturan (PNT-01/02). Fungsi murni. */
function hitungPoin(nominal, rule) {
  if (nominal < rule.minimal_transaksi) return 0;
  const raw = nominal / rule.rupiah_per_poin;
  if (rule.pembulatan === 'atas') return Math.ceil(raw);
  if (rule.pembulatan === 'terdekat') return Math.round(raw);
  return Math.floor(raw);
}

/** Hitung saldo dari ledger (PNT-03). Fungsi murni atas jumlah per jenis. */
function hitungSaldo({ masuk = 0, hold = 0, terpakai = 0, lepas = 0, koreksi = 0, kembalian = 0 }) {
  const total = masuk + kembalian - terpakai - koreksi; // koreksi = pembalikan poin masuk dari struk yang dikoreksi; kembalian = refund voucher manual
  const ditahan = hold - lepas - terpakai;
  return { total, ditahan, tersedia: total - ditahan };
}

async function getBalance(db, memberId) {
  const { rows } = await db.query(
    `SELECT jenis, COALESCE(SUM(jumlah), 0)::int AS jumlah
       FROM points_ledger WHERE member_id = $1 GROUP BY jenis`,
    [memberId]
  );
  const sums = {};
  for (const r of rows) sums[r.jenis] = r.jumlah;
  return hitungSaldo(sums);
}

/** Kunci baris member agar perubahan saldo oleh request bersamaan berjalan berurutan (NFR-05, BR-09). */
async function lockMember(client, memberId) {
  await tiers.lockTierEvaluation(client);
  await client.query('SELECT id FROM members WHERE id = $1 FOR UPDATE', [memberId]);
}

async function addEntry(client, { memberId, jenis, jumlah, referensiTipe, referensiId }) {
  const { rowCount } = await client.query(
    `INSERT INTO points_ledger (member_id, jenis, jumlah, referensi_tipe, referensi_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (referensi_tipe, referensi_id, jenis) DO NOTHING`,
    [memberId, jenis, jumlah, referensiTipe, referensiId]
  );
  return rowCount === 1;
}

/** Catat poin masuk untuk struk yang disetujui. Idempotent: hanya sekali per struk (PNT-05, BR-03). */
async function awardForReceipt(client, receipt) {
  const rule = await getPointRule(client, receipt.channel);
  const poin = hitungPoin(Number(receipt.nominal), rule);
  if (poin <= 0) return 0;
  await lockMember(client, receipt.member_id);
  const inserted = await addEntry(client, {
    memberId: receipt.member_id,
    jenis: 'masuk',
    jumlah: poin,
    referensiTipe: 'receipt',
    referensiId: receipt.id,
  });
  if (inserted) await tiers.reevaluate(client, receipt.member_id); // tambahan.md poin 1: evaluasi ulang tier setelah poin bertambah
  return inserted ? poin : 0;
}

/** Penyesuaian poin manual oleh admin (Admin Dashboard poin 6). Boleh negatif; saldo tidak boleh jadi negatif. */
async function manualAdjustment(client, { memberId, jumlah, alasan, adminId }) {
  await lockMember(client, memberId);
  if (jumlah < 0) {
    const saldo = await getBalance(client, memberId);
    if (saldo.tersedia < -jumlah) throw new (require('../utils/http').AppError)(422, 'Saldo tersedia tidak mencukupi untuk pengurangan ini.', 'INSUFFICIENT_BALANCE');
  }
  const { rows } = await client.query(
    'INSERT INTO point_adjustments (member_id, jumlah, alasan, dibuat_oleh) VALUES ($1, $2, $3, $4) RETURNING id',
    [memberId, jumlah, alasan, adminId]
  );
  // Positif dicatat sebagai 'masuk' (menambah total), negatif sebagai 'koreksi' (mengurangi total) — konsisten dengan hitungSaldo().
  await client.query(
    `INSERT INTO points_ledger (member_id, jenis, jumlah, referensi_tipe, referensi_id) VALUES ($1, $2, $3, 'manual', $4)`,
    [memberId, jumlah < 0 ? 'koreksi' : 'masuk', Math.abs(jumlah), rows[0].id]
  );
  await tiers.reevaluate(client, memberId);
  return rows[0].id;
}

module.exports = { hitungPoin, hitungSaldo, getBalance, lockMember, addEntry, awardForReceipt, manualAdjustment };
