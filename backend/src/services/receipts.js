const { pool, withTransaction } = require('../db/pool');
const { config } = require('../config');
const { audit } = require('./audit');
const { notify } = require('./notifications');
const { awardForReceipt } = require('./points');
const { getSettings } = require('./settings');
const { validateReceipt, todayIn } = require('./receiptValidation');
const { evaluateAutoApprove } = require('./autoApprove');
const { checkFiles, saveFiles, removeFiles } = require('./files');
const { notFound, conflict, unprocessable } = require('../utils/http');

const COLS = `
  r.id, r.member_id, r.channel, r.nomor_transaksi,
  to_char(r.tanggal_transaksi, 'YYYY-MM-DD') AS tanggal_transaksi,
  r.nominal::float8 AS nominal, r.status, r.mode_persetujuan, r.alasan_penolakan,
  r.waktu_keputusan, r.resubmit_of, r.created_at,
  (SELECT NULLIF(SUM(CASE pl.jenis WHEN 'masuk' THEN pl.jumlah ELSE -pl.jumlah END), 0)::int
     FROM points_ledger pl
    WHERE pl.jenis IN ('masuk', 'koreksi')
      AND ((pl.referensi_tipe = 'receipt' AND pl.referensi_id = r.id)
        OR (pl.referensi_tipe = 'koreksi' AND pl.referensi_id IN
              (SELECT c.id FROM receipt_corrections c WHERE c.receipt_id = r.id)))) AS poin_diperoleh,
  (r.status = 'ditolak' AND NOT EXISTS (
    SELECT 1 FROM receipts c WHERE c.resubmit_of = r.id AND c.status <> 'ditolak')) AS bisa_diajukan_ulang`;

const DUPLICATE_STATUSES = ['menunggu_review', 'disetujui'];

async function attachFiles(rows) {
  if (!rows.length) return rows;
  const { rows: files } = await pool.query(
    'SELECT id, receipt_id, nama_asli, mime, ukuran FROM receipt_files WHERE receipt_id = ANY($1) ORDER BY id',
    [rows.map((r) => r.id)]
  );
  for (const r of rows) r.files = files.filter((f) => f.receipt_id === r.id).map(({ receipt_id, ...f }) => f);
  return rows;
}

/**
 * Ajukan struk (UPL) lalu jalankan validasi otomatis (VAL) dan cek auto-approve (ADM-04).
 * Validasi gagal → status `ditolak` otomatis dengan alasan tersimpan (BR-08).
 */
async function submitReceipt({ memberId, input, files, resubmitOf = null }) {
  const settings = await getSettings(pool);
  const checked = checkFiles(files);
  const stored = await saveFiles(checked);

  try {
    const id = await withTransaction(async (client) => {
      if (resubmitOf) {
        const { rows } = await client.query(
          'SELECT status FROM receipts WHERE id = $1 AND member_id = $2 FOR UPDATE',
          [resubmitOf, memberId]
        );
        if (!rows.length) throw notFound('Struk yang diajukan ulang tidak ditemukan');
        if (rows[0].status !== 'ditolak') throw conflict('Hanya struk yang ditolak yang dapat diajukan ulang');
        const { rows: active } = await client.query(
          "SELECT 1 FROM receipts WHERE resubmit_of = $1 AND status <> 'ditolak'",
          [resubmitOf]
        );
        if (active.length) throw conflict('Struk ini sudah diajukan ulang');
      }

      const ctx = {
        channels: settings.channels,
        claimWindowDays: settings.claim_window_days,
        minNominal: Number(settings.min_nominal),
        today: todayIn(config.timezone),
      };
      const { rows: dup } = await client.query(
        `SELECT 1 FROM receipts WHERE lower(channel) = lower($1) AND lower(nomor_transaksi) = lower($2)
           AND status = ANY($3) LIMIT 1`,
        [input.channel, input.nomor_transaksi, DUPLICATE_STATUSES]
      );
      let result = validateReceipt(input, { ...ctx, duplikat: dup.length > 0 });

      const insert = async (status) => {
        const { rows } = await client.query(
          `INSERT INTO receipts (member_id, channel, nomor_transaksi, tanggal_transaksi, nominal, status,
                                 hasil_validasi, mode_persetujuan, alasan_penolakan, waktu_keputusan, resubmit_of)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
          [
            memberId, input.channel, input.nomor_transaksi, input.tanggal_transaksi, input.nominal, status,
            JSON.stringify({ lulus: result.lulus, checks: result.checks }),
            status === 'ditolak' ? 'otomatis' : null,
            status === 'ditolak' ? result.alasan.join(' ') : null,
            status === 'ditolak' ? new Date() : null,
            resubmitOf,
          ]
        );
        return rows[0].id;
      };

      let receiptId;
      if (result.lulus) {
        // Savepoint: dua request bersamaan dengan nomor yang sama → salah satunya kena unique index.
        await client.query('SAVEPOINT insert_receipt');
        try {
          receiptId = await insert('menunggu_review');
        } catch (err) {
          if (err.code !== '23505') throw err;
          await client.query('ROLLBACK TO SAVEPOINT insert_receipt');
          result = validateReceipt(input, { ...ctx, duplikat: true });
          receiptId = await insert('ditolak');
        }
      } else {
        receiptId = await insert('ditolak');
      }

      for (const f of stored) {
        await client.query(
          'INSERT INTO receipt_files (receipt_id, nama_asli, nama_file, mime, ukuran) VALUES ($1, $2, $3, $4, $5)',
          [receiptId, f.nama_asli, f.nama_file, f.mime, f.ukuran]
        );
      }
      await audit(client, {
        pelakuTipe: 'member', pelakuId: memberId, aksi: resubmitOf ? 'struk.ajukan_ulang' : 'struk.ajukan',
        objekTipe: 'receipt', objekId: receiptId,
      });

      const { rows: current } = await client.query('SELECT * FROM receipts WHERE id = $1', [receiptId]);
      const receipt = current[0];

      if (receipt.status === 'ditolak') {
        await audit(client, {
          pelakuTipe: 'sistem', aksi: 'struk.tolak_otomatis', objekTipe: 'receipt', objekId: receiptId,
          detail: { alasan: receipt.alasan_penolakan },
        });
        await notify(client, {
          memberId, jenis: 'struk_ditolak', referensiTipe: 'receipt', referensiId: receiptId,
          isi: `Struk ${receipt.nomor_transaksi} ditolak. Alasan: ${receipt.alasan_penolakan}`,
        });
      } else {
        const { rows: criteria } = await client.query('SELECT kode, nilai, aktif FROM auto_approve_criteria');
        if (evaluateAutoApprove(criteria, receipt)) {
          await client.query(
            `UPDATE receipts SET status = 'disetujui', mode_persetujuan = 'otomatis', waktu_keputusan = now()
              WHERE id = $1`,
            [receiptId]
          );
          const poin = await awardForReceipt(client, receipt);
          await audit(client, {
            pelakuTipe: 'sistem', aksi: 'struk.setujui_otomatis', objekTipe: 'receipt', objekId: receiptId,
            detail: { poin },
          });
          await notify(client, {
            memberId, jenis: 'struk_disetujui', referensiTipe: 'receipt', referensiId: receiptId,
            isi: `Struk ${receipt.nomor_transaksi} disetujui.${poin ? ` Anda mendapat ${poin} poin.` : ''}`,
          });
        }
      }
      return receiptId;
    });
    return getReceipt(id, { memberId });
  } catch (err) {
    await removeFiles(stored);
    throw err;
  }
}

/** Detail struk. Untuk member (memberId diisi) hanya struk miliknya; admin mendapat hasil validasi & data member. */
async function getReceipt(id, { memberId = null, admin = false } = {}) {
  const params = [id];
  let where = 'r.id = $1';
  if (memberId) {
    params.push(memberId);
    where += ' AND r.member_id = $2';
  }
  const extra = admin
    ? `, r.hasil_validasi, m.nama AS member_nama, m.email AS member_email, m.no_hp AS member_no_hp,
         a.nama AS diputuskan_oleh_nama`
    : '';
  const { rows } = await pool.query(
    `SELECT ${COLS}${extra}
       FROM receipts r
       JOIN members m ON m.id = r.member_id
       LEFT JOIN admins a ON a.id = r.diputuskan_oleh
      WHERE ${where}`,
    params
  );
  if (!rows.length) throw notFound('Struk tidak ditemukan');
  await attachFiles(rows);
  if (admin) {
    const { rows: corr } = await pool.query(
      `SELECT c.id, c.dari_status, c.ke_status, c.alasan, c.poin_delta, c.created_at, a.nama AS admin_nama
         FROM receipt_corrections c JOIN admins a ON a.id = c.dikoreksi_oleh
        WHERE c.receipt_id = $1 ORDER BY c.id`,
      [id]
    );
    rows[0].koreksi = corr;
  }
  return rows[0];
}

async function listReceipts({ memberId = null, filters = {}, pagination }) {
  const params = [];
  const where = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (memberId) add('r.member_id = ?', memberId);
  if (filters.status) add('r.status = ?', filters.status);
  if (filters.channel) add('r.channel = ?', filters.channel);
  if (filters.from) add('r.created_at::date >= ?', filters.from);
  if (filters.to) add('r.created_at::date <= ?', filters.to);
  if (filters.q) {
    params.push(`%${filters.q}%`);
    const p = `$${params.length}`;
    where.push(`(r.nomor_transaksi ILIKE ${p} OR m.nama ILIKE ${p} OR m.email ILIKE ${p} OR m.no_hp ILIKE ${p})`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows: count } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM receipts r JOIN members m ON m.id = r.member_id ${clause}`,
    params
  );
  const { rows } = await pool.query(
    `SELECT ${COLS}, m.nama AS member_nama, m.email AS member_email
       FROM receipts r JOIN members m ON m.id = r.member_id
       ${clause}
      ORDER BY CASE WHEN r.status = 'menunggu_review' THEN 0 ELSE 1 END,
               CASE WHEN r.status = 'menunggu_review' THEN r.created_at END ASC,
               r.created_at DESC
      LIMIT ${pagination.limit} OFFSET ${pagination.offset}`,
    params
  );
  return { data: rows, meta: { page: pagination.page, limit: pagination.limit, total: count[0].total } };
}

async function queueSummary() {
  const { rows } = await pool.query('SELECT status, COUNT(*)::int AS jumlah FROM receipts GROUP BY status');
  const summary = { menunggu_review: 0, disetujui: 0, ditolak: 0 };
  for (const r of rows) summary[r.status] = r.jumlah;
  return summary;
}

/** Keputusan admin. Struk dikunci setelah diputuskan: update hanya berlaku bila masih `menunggu_review` (ADM-06). */
async function decideReceipt({ id, adminId, approve, alasan }) {
  if (!approve && !alasan) throw unprocessable('Alasan penolakan wajib diisi.', { alasan: 'Alasan wajib diisi' });

  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE receipts
          SET status = $2, mode_persetujuan = 'manual', diputuskan_oleh = $3, waktu_keputusan = now(),
              alasan_penolakan = $4
        WHERE id = $1 AND status = 'menunggu_review'
        RETURNING *`,
      [id, approve ? 'disetujui' : 'ditolak', adminId, approve ? null : alasan]
    );
    if (!rows.length) {
      const { rows: exists } = await client.query('SELECT status FROM receipts WHERE id = $1', [id]);
      if (!exists.length) throw notFound('Struk tidak ditemukan');
      throw conflict('Struk sudah diputuskan dan tidak dapat diubah lagi.', 'ALREADY_DECIDED');
    }
    const receipt = rows[0];
    let poin = 0;
    if (approve) poin = await awardForReceipt(client, receipt);

    await audit(client, {
      pelakuTipe: 'admin', pelakuId: adminId, aksi: approve ? 'struk.setujui' : 'struk.tolak',
      objekTipe: 'receipt', objekId: id, detail: approve ? { poin } : { alasan },
    });
    await notify(client, {
      memberId: receipt.member_id, jenis: approve ? 'struk_disetujui' : 'struk_ditolak',
      referensiTipe: 'receipt', referensiId: id,
      isi: approve
        ? `Struk ${receipt.nomor_transaksi} disetujui.${poin ? ` Anda mendapat ${poin} poin.` : ''}`
        : `Struk ${receipt.nomor_transaksi} ditolak. Alasan: ${alasan}`,
    });
  });
  return getReceipt(id, { admin: true });
}

module.exports = { submitReceipt, getReceipt, listReceipts, queueSummary, decideReceipt };
