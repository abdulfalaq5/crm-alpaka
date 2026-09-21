const { withTransaction } = require('../db/pool');
const { audit } = require('./audit');
const { notify } = require('./notifications');
const { getBalance, lockMember, addEntry, hitungPoin } = require('./points');
const { getPointRule } = require('./settings');
const { getReceipt } = require('./receipts');
const { notFound, conflict, unprocessable } = require('../utils/http');

/**
 * Koreksi keputusan struk yang sudah final (ADM-06, OI-12). Membalik keputusan dan menyesuaikan poin:
 *  - disetujui → ditolak : poin yang pernah masuk dibalik (ledger `koreksi`). Ditolak bila poin sudah
 *                          terpakai/ditahan untuk redeem, agar saldo tidak menjadi negatif (BR-09).
 *  - ditolak → disetujui : poin dicatat sesuai aturan konversi saat ini. Ditolak bila struk lain
 *                          dengan channel + nomor sama masih aktif (duplikat).
 * Setiap koreksi tercatat di receipt_corrections + audit_logs; alasan wajib diisi.
 */
async function correctReceipt({ id, adminId, alasan }) {
  if (!alasan) throw unprocessable('Alasan koreksi wajib diisi.', { alasan: 'Alasan wajib diisi' });

  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM receipts WHERE id = $1 FOR UPDATE', [id]);
    if (!rows.length) throw notFound('Struk tidak ditemukan');
    const receipt = rows[0];
    if (receipt.status === 'menunggu_review') {
      throw conflict('Struk belum diputuskan. Gunakan Setujui atau Tolak.', 'NOT_DECIDED');
    }
    await lockMember(client, receipt.member_id);

    const toApprove = receipt.status === 'ditolak';
    const ke = toApprove ? 'disetujui' : 'ditolak';
    let poinDelta = 0;

    const { rows: c } = await client.query(
      `INSERT INTO receipt_corrections (receipt_id, dari_status, ke_status, alasan, dikoreksi_oleh)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [id, receipt.status, ke, alasan, adminId]
    );
    const correctionId = c[0].id;

    if (toApprove) {
      const poin = hitungPoin(Number(receipt.nominal), await getPointRule(client));
      if (poin > 0) {
        await addEntry(client, {
          memberId: receipt.member_id, jenis: 'masuk', jumlah: poin, referensiTipe: 'koreksi', referensiId: correctionId,
        });
      }
      poinDelta = poin;
      try {
        await client.query(
          `UPDATE receipts SET status = 'disetujui', mode_persetujuan = 'manual', alasan_penolakan = NULL,
                  diputuskan_oleh = $2, waktu_keputusan = now() WHERE id = $1`,
          [id, adminId]
        );
      } catch (err) {
        if (err.code !== '23505') throw err;
        throw conflict('Tidak dapat disetujui: struk lain dengan channel dan nomor transaksi sama masih aktif.', 'DUPLICATE');
      }
    } else {
      const { rows: earned } = await client.query(
        `SELECT COALESCE(SUM(CASE l.jenis WHEN 'masuk' THEN l.jumlah ELSE -l.jumlah END), 0)::int AS net
           FROM points_ledger l
          WHERE l.jenis IN ('masuk', 'koreksi')
            AND ((l.referensi_tipe = 'receipt' AND l.referensi_id = $1)
              OR (l.referensi_tipe = 'koreksi' AND l.referensi_id IN
                    (SELECT rc.id FROM receipt_corrections rc WHERE rc.receipt_id = $1 AND rc.id <> $2)))`,
        [id, correctionId]
      );
      const net = earned[0].net;
      if (net > 0) {
        const saldo = await getBalance(client, receipt.member_id);
        if (saldo.tersedia < net) {
          throw conflict(
            `Poin dari struk ini (${net}) sudah dipakai atau ditahan untuk redeem, sehingga tidak dapat dibalik. Selesaikan atau tolak redeem terkait terlebih dahulu.`,
            'POINTS_IN_USE'
          );
        }
        await addEntry(client, {
          memberId: receipt.member_id, jenis: 'koreksi', jumlah: net, referensiTipe: 'koreksi', referensiId: correctionId,
        });
        poinDelta = -net;
      }
      await client.query(
        `UPDATE receipts SET status = 'ditolak', mode_persetujuan = 'manual', alasan_penolakan = $3,
                diputuskan_oleh = $2, waktu_keputusan = now() WHERE id = $1`,
        [id, adminId, alasan]
      );
    }

    await client.query('UPDATE receipt_corrections SET poin_delta = $2 WHERE id = $1', [correctionId, poinDelta]);
    await audit(client, {
      pelakuTipe: 'admin', pelakuId: adminId, aksi: 'struk.koreksi', objekTipe: 'receipt', objekId: id,
      detail: { dari: receipt.status, ke, alasan, poin: poinDelta },
    });
    await notify(client, {
      memberId: receipt.member_id, jenis: toApprove ? 'struk_disetujui' : 'struk_ditolak',
      referensiTipe: 'receipt', referensiId: id,
      isi: toApprove
        ? `Keputusan struk ${receipt.nomor_transaksi} dikoreksi: struk disetujui.${poinDelta ? ` Anda mendapat ${poinDelta} poin.` : ''}`
        : `Keputusan struk ${receipt.nomor_transaksi} dikoreksi: struk ditolak. Alasan: ${alasan}${poinDelta ? ` (${-poinDelta} poin dibatalkan)` : ''}`,
    });
  });
  return getReceipt(id, { admin: true });
}

module.exports = { correctReceipt };
