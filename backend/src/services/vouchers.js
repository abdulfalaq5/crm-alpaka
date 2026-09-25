/**
 * Voucher Management (tambahan.md poin 3) + Voucher Integration checkout More (poin 5).
 * Lifecycle: active → reserved (saat validasi checkout) → used (checkout sukses) / kembali ke active
 * (reservasi lewat waktu / checkout gagal) / expired (lewat expires_at) / void (dibatalkan admin).
 *
 * Sumber voucher:
 * - 'redeem' : terbit otomatis saat admin menyetujui redeem member (dipanggil services/redeems.js).
 * - 'manual' : admin membuat voucher dari halaman Voucher. Poin member tetap dipotong dan dicatat
 *              sebagai redeem berstatus 'selesai' sumber 'manual', sehingga saldo, laporan redeem,
 *              dan riwayat member tetap konsisten (satu voucher = satu redeem).
 */
const crypto = require('crypto');
const { pool, withTransaction } = require('../db/pool');
const { config } = require('../config');
const { audit } = require('./audit');
const { notify } = require('./notifications');
const { getBalance, lockMember, addEntry } = require('./points');
const { notFound, conflict, unprocessable, AppError } = require('../utils/http');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa karakter mirip (0/O, 1/I) agar mudah dibaca
const MAX_BULK = 25; // batas voucher yang dapat dibuat dalam satu permintaan

function generateCode() {
  let code = 'ALP-';
  for (let i = 0; i < 8; i++) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return code;
}

/**
 * Status yang ditampilkan ke pengguna. Nilai di database dipakai apa adanya, tapi voucher bisa saja
 * belum disentuh scheduler (mis. server sempat mati) sehingga status aktual sudah tidak sesuai waktu.
 * Fungsi murni agar bisa diuji tanpa database.
 */
function efektifStatus(voucher, now = new Date()) {
  const lewat = (t) => t && new Date(t) < now;
  if (voucher.status === 'active' && lewat(voucher.expires_at)) return 'expired';
  if (voucher.status === 'reserved' && lewat(voucher.reserved_until)) return 'active';
  return voucher.status;
}

/** Sisipkan satu voucher dengan kode unik; ulangi bila kode kebetulan bentrok (sangat jarang). */
async function insertVoucher(client, { kode, memberId, rewardId, redeemId, berlakuHari, sumber = 'redeem', dibuatOleh = null, catatan = null }) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { rows } = await client.query(
        `INSERT INTO vouchers (kode, member_id, reward_id, redeem_id, status, expires_at, sumber, dibuat_oleh, catatan)
         VALUES ($1, $2, $3, $4, 'active', now() + ($5 || ' days')::interval, $6, $7, $8) RETURNING *`,
        [kode, memberId, rewardId, redeemId, berlakuHari, sumber, dibuatOleh, catatan]
      );
      return rows[0];
    } catch (err) {
      if (err.code !== '23505') throw err; // kode bentrok: coba lagi dengan kode baru
    }
  }
  throw new Error('Gagal membuat kode voucher unik setelah beberapa percobaan');
}

/** Terbitkan voucher untuk redeem yang baru disetujui. Dipanggil dari services/redeems.js dalam transaksi yang sama. */
async function issueForRedeem(client, { redeemId, memberId, reward }) {
  return insertVoucher(client, {
    kode: generateCode(), memberId, rewardId: reward.id, redeemId, berlakuHari: reward.berlaku_hari,
  });
}

/**
 * Generate voucher manual oleh admin. Satu permintaan dapat membuat beberapa voucher (bulk) untuk satu
 * member dan reward; tiap voucher memakai satu redeem sendiri sehingga pemotongan poin tercatat resmi.
 * Syarat stok, tier minimum, dan masa tampil reward tidak diperiksa — penerbitan manual adalah keputusan
 * admin (stok reward tetap dikurangi bila reward memang dibatasi).
 */
async function createManual({ memberId, rewardId, jumlah = 1, berlakuHari = null, catatan = null, adminId }) {
  return withTransaction(async (client) => {
    await lockMember(client, memberId);

    const { rows: m } = await client.query('SELECT id, nama, email, status_akun FROM members WHERE id = $1', [memberId]);
    if (!m.length) throw notFound('Member tidak ditemukan');
    if (m[0].status_akun !== 'aktif') throw conflict('Akun member nonaktif. Aktifkan dulu sebelum menerbitkan voucher.', 'MEMBER_NONAKTIF');

    const { rows: rw } = await client.query('SELECT * FROM rewards WHERE id = $1', [rewardId]);
    if (!rw.length) throw notFound('Reward tidak ditemukan');
    const reward = rw[0];
    const hari = berlakuHari || reward.berlaku_hari;
    const totalPoin = reward.poin_dibutuhkan * jumlah;

    if (reward.stok !== null && reward.stok < jumlah) {
      throw unprocessable(`Stok reward "${reward.nama}" hanya ${reward.stok}, tidak cukup untuk ${jumlah} voucher.`, { jumlah: 'Stok reward tidak cukup' });
    }
    const saldo = await getBalance(client, memberId);
    if (saldo.tersedia < totalPoin) {
      throw unprocessable(
        `Saldo poin ${m[0].nama} tidak mencukupi. Dibutuhkan ${totalPoin} poin (${jumlah} × ${reward.poin_dibutuhkan}), tersedia ${saldo.tersedia} poin.`,
        { member_id: 'Saldo poin tidak mencukupi' }
      );
    }

    const vouchers = [];
    for (let i = 0; i < jumlah; i++) {
      const { rows: r } = await client.query(
        `INSERT INTO redeems (member_id, reward_id, jumlah_poin, status, detail_pemberian, diputuskan_oleh, waktu_keputusan, sumber)
         VALUES ($1, $2, $3, 'selesai', $4, $5, now(), 'manual') RETURNING id`,
        [memberId, reward.id, reward.poin_dibutuhkan, catatan || 'Voucher diterbitkan manual oleh admin.', adminId]
      );
      // Hold lalu 'terpakai' dalam transaksi yang sama, sama seperti pengajuan redeem yang disetujui.
      // Kedua entri ini saling meniadakan di hitungSaldo (ditahan = hold − lepas − terpakai); tanpa
      // hold, saldo 'ditahan' jadi negatif dan angka dashboard member menyesatkan.
      const ref = { referensiTipe: 'redeem', referensiId: r[0].id };
      await addEntry(client, { memberId, jenis: 'hold', jumlah: reward.poin_dibutuhkan, ...ref });
      await addEntry(client, { memberId, jenis: 'terpakai', jumlah: reward.poin_dibutuhkan, ...ref });
      vouchers.push(await insertVoucher(client, {
        kode: generateCode(), memberId, rewardId: reward.id, redeemId: r[0].id, berlakuHari: hari,
        sumber: 'manual', dibuatOleh: adminId, catatan,
      }));
    }
    if (reward.stok !== null) await client.query('UPDATE rewards SET stok = stok - $2 WHERE id = $1', [reward.id, jumlah]);

    await audit(client, {
      pelakuTipe: 'admin', pelakuId: adminId, aksi: 'voucher.generate', objekTipe: 'voucher', objekId: vouchers[0].id,
      detail: { member: m[0].nama, reward: reward.nama, jumlah, total_poin: totalPoin, berlaku_hari: hari, ...(catatan ? { catatan } : {}) },
    });
    await notify(client, {
      memberId, jenis: 'voucher_manual', referensiTipe: 'voucher', referensiId: vouchers[0].id,
      isi: `Voucher "${reward.nama}" diterbitkan oleh admin. Kode: ${vouchers.map((v) => v.kode).join(', ')}. Berlaku sampai ${new Date(vouchers[0].expires_at).toLocaleDateString('id-ID')}.`,
    });
    // Tier TIDAK perlu dievaluasi ulang: tier dihitung dari poin lifetime (masuk − koreksi), sedangkan
    // penerbitan voucher hanya menambah entri hold/terpakai. Kembalian saat void pun dicatat sebagai
    // 'kembalian' (bukan 'masuk') supaya poin yang dikembalikan tidak ikut menaikkan tier.
    // Kembalikan baris yang sama dengan daftar/detail agar UI tidak perlu memuat ulang.
    const { rows } = await client.query(`SELECT ${COLS}, m.nama AS member_nama, m.email AS member_email ${FROM} WHERE v.id = ANY($1::bigint[])`, [vouchers.map((v) => v.id)]);
    return withEffective(rows);
  });
}

const COLS = `v.id, v.kode, v.member_id, v.reward_id, w.nama AS reward_nama, v.redeem_id, v.status,
  v.issued_at, v.expires_at, v.reserved_at, v.reserved_until, v.reserved_order_id,
  v.used_at, v.used_order_id, v.voided_at, v.void_reason, v.sumber, v.catatan, v.created_at,
  v.dibuat_oleh, a.nama AS dibuat_oleh_nama, ad.nama AS voided_oleh_nama,
  d.status AS redeem_status, d.sumber AS redeem_sumber, d.jumlah_poin`;

const FROM = `FROM vouchers v JOIN rewards w ON w.id = v.reward_id JOIN members m ON m.id = v.member_id
  LEFT JOIN admins a ON a.id = v.dibuat_oleh LEFT JOIN admins ad ON ad.id = v.voided_oleh
  LEFT JOIN redeems d ON d.id = v.redeem_id`;

function buildFilter({ memberId = null, status = null, sumber = null, q = null, from = null, to = null }) {
  const params = [];
  const where = [];
  if (memberId) { params.push(memberId); where.push(`v.member_id = $${params.length}`); }
  if (status) {
    // Terima satu status atau daftar dipisah koma (mis. 'used,expired,void' untuk tab Riwayat member).
    params.push(Array.isArray(status) ? status : String(status).split(',').filter(Boolean));
    where.push(`v.status = ANY($${params.length})`);
  }
  if (sumber) { params.push(sumber); where.push(`v.sumber = $${params.length}`); }
  if (q) { params.push(`%${q}%`); where.push(`(v.kode ILIKE $${params.length} OR m.nama ILIKE $${params.length} OR m.email ILIKE $${params.length} OR w.nama ILIKE $${params.length})`); }
  if (from) { params.push(from); where.push(`v.issued_at >= $${params.length}::date`); }
  // `to` bersifat inklusif sampai akhir hari tersebut; tanpa ini voucher yang terbit hari yang sama
  // akan hilang karena issued_at (pukul) > tanggal (00:00).
  if (to) { params.push(to); where.push(`v.issued_at < ($${params.length}::date + interval '1 day')`); }
  return { params, clause: where.length ? `WHERE ${where.join(' AND ')}` : '' };
}

const withEffective = (rows) => rows.map((r) => ({ ...r, status_efektif: efektifStatus(r) }));

async function listVouchers({ memberId = null, status = null, sumber = null, q = null, from = null, to = null, pagination, ringkasan = false }) {
  const { params, clause } = buildFilter({ memberId, status, sumber, q, from, to });
  const { rows: count } = await pool.query(`SELECT COUNT(*)::int AS total ${FROM} ${clause}`, params);
  const { rows } = await pool.query(
    `SELECT ${COLS}, m.nama AS member_nama, m.email AS member_email, m.no_hp AS member_no_hp ${FROM} ${clause}
      ORDER BY v.created_at DESC LIMIT ${pagination.limit} OFFSET ${pagination.offset}`,
    params
  );
  return {
    data: withEffective(rows),
    meta: { page: pagination.page, limit: pagination.limit, total: count[0].total, ...(ringkasan ? { ringkasan: await summary(memberId) } : {}) },
  };
}

/**
 * Ringkasan voucher untuk kartu statistik. Tanpa `memberId` mencakup seluruh voucher (halaman admin);
 * dengan `memberId` hanya voucher milik member tersebut (halaman member) — jangan sampai data global
 * bocor ke member.
 */
async function summary(memberId = null) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'active')::int AS aktif,
            COUNT(*) FILTER (WHERE status = 'reserved')::int AS dipesan,
            COUNT(*) FILTER (WHERE status = 'used')::int AS terpakai,
            COUNT(*) FILTER (WHERE status = 'expired')::int AS kedaluwarsa,
            COUNT(*) FILTER (WHERE status = 'void')::int AS dibatalkan,
            COUNT(*) FILTER (WHERE sumber = 'manual')::int AS manual,
            COUNT(*) FILTER (WHERE status = 'active' AND expires_at <= now() + interval '7 days')::int AS akan_kedaluwarsa
       FROM vouchers WHERE ($1::bigint IS NULL OR member_id = $1)`,
    [memberId]
  );
  return rows[0];
}

/** Baris lengkap untuk laporan redemption (export CSV) — mengikuti filter yang sama, tanpa pagination. */
async function listForExport(filters = {}) {
  const { params, clause } = buildFilter(filters);
  const { rows } = await pool.query(
    `SELECT v.kode, m.nama AS member, m.email, w.nama AS reward, r.jumlah_poin, v.sumber, v.status,
            v.issued_at, v.expires_at, v.used_at, v.used_order_id, v.voided_at, v.void_reason, v.catatan
       FROM vouchers v JOIN rewards w ON w.id = v.reward_id JOIN members m ON m.id = v.member_id
     LEFT JOIN redeems r ON r.id = v.redeem_id ${clause}
      ORDER BY v.issued_at DESC`,
    params
  );
  return withEffective(rows); // pakai status efektif, jangan status mentah (mis. 'active' yang sudah lewat tanggal)
}

async function getVoucher(id) {
  const { rows } = await pool.query(
    `SELECT ${COLS}, m.nama AS member_nama, m.email AS member_email, m.no_hp AS member_no_hp, d.detail_pemberian
     ${FROM} WHERE v.id = $1`,
    [id]
  );
  if (!rows.length) throw notFound('Voucher tidak ditemukan');
  return withEffective(rows)[0];
}

/** Satu voucher milik member berdasarkan kode — untuk tombol "Cek kode" di halaman member. */
async function findByKodeForMember(kode, memberId) {
  const { rows } = await pool.query(
    `SELECT ${COLS}, m.nama AS member_nama, m.email AS member_email ${FROM}
      WHERE UPPER(v.kode) = UPPER($1) AND v.member_id = $2`,
    [kode, memberId]
  );
  if (!rows.length) throw new AppError(404, 'Kode voucher tidak ditemukan atau bukan milik Anda.', 'VOUCHER_NOT_FOUND');
  return withEffective(rows)[0];
}

/** Perpanjang masa berlaku voucher aktif (mis. member belum sempat memakai sebelum kedaluwarsa). */
async function extendExpiry({ id, adminId, tambahHari, alasan }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE vouchers SET expires_at = expires_at + ($2 || ' days')::interval
        WHERE id = $1 AND status = 'active' RETURNING *`,
      [id, tambahHari]
    );
    if (!rows.length) {
      const { rows: exists } = await client.query('SELECT status FROM vouchers WHERE id = $1', [id]);
      if (!exists.length) throw notFound('Voucher tidak ditemukan');
      throw conflict(`Voucher berstatus ${exists[0].status} — hanya voucher aktif yang bisa diperpanjang.`, 'ALREADY_FINAL');
    }
    await audit(client, {
      pelakuTipe: 'admin', pelakuId: adminId, aksi: 'voucher.perpanjang', objekTipe: 'voucher', objekId: Number(id),
      detail: { kode: rows[0].kode, tambah_hari: tambahHari, expires_at: rows[0].expires_at, alasan },
    });
    await notify(client, {
      memberId: rows[0].member_id, jenis: 'voucher_perpanjang', referensiTipe: 'voucher', referensiId: rows[0].id,
      isi: `Masa berlaku voucher ${rows[0].kode} diperpanjang ${tambahHari} hari, kini berlaku sampai ${new Date(rows[0].expires_at).toLocaleDateString('id-ID')}.`,
    });
    return rows[0];
  });
}

/**
 * Void voucher manual oleh admin. Voucher yang warnanya sudah dipakai/dibatalkan/expired tidak bisa di-void.
 * Void membatalkan efek penerbitan manual: redeem sumber 'manual' menjadi 'dibatalkan' dan poin reward
 * dikembalikan ke saldo member. Voucher dari redeem yang disetujui biasa TIDAK mengembalikan poin —
 * approval admin atas redeem itu sudah final, void hanya mencabut kode vouchernya.
 */
async function voidVoucher({ id, adminId, alasan }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      // Voucher 'reserved' boleh di-void (mis. kode bocor saat masih di keranjang), tapi reservasinya
      // dilepas sekalian supaya order di More tidak menggantung dan tidak bisa memakai kode mati.
      // CTE dipakai agar status lama ikut terbawa: UPDATE ... RETURNING hanya mengembalikan nilai baru.
      `WITH lama AS (
         SELECT id, status AS status_lama, reserved_order_id FROM vouchers WHERE id = $1 FOR UPDATE
       ), upd AS (
         UPDATE vouchers v SET status = 'void', voided_at = now(), voided_oleh = $2, void_reason = $3,
                reserved_at = CASE WHEN lama.status_lama = 'reserved' THEN NULL ELSE v.reserved_at END,
                reserved_until = CASE WHEN lama.status_lama = 'reserved' THEN NULL ELSE v.reserved_until END,
                reserved_order_id = CASE WHEN lama.status_lama = 'reserved' THEN NULL ELSE v.reserved_order_id END
           FROM lama WHERE v.id = lama.id AND lama.status_lama IN ('active', 'reserved')
         RETURNING v.*, lama.status_lama, lama.reserved_order_id AS order_lama
       ) SELECT * FROM upd`,
      [id, adminId, alasan]
    );
    if (!rows.length) {
      const exists = await client.query('SELECT status FROM vouchers WHERE id = $1', [id]);
      if (!exists.rows.length) throw notFound('Voucher tidak ditemukan');
      throw conflict('Voucher sudah dipakai/void/kedaluwarsa, tidak dapat di-void.', 'ALREADY_FINAL');
    }
    const voucher = rows[0];
    const dariKeranjang = voucher.status_lama === 'reserved';
    await audit(client, {
      pelakuTipe: 'admin', pelakuId: adminId, aksi: 'voucher.void', objekTipe: 'voucher', objekId: id,
      detail: { kode: voucher.kode, alasan, status_lama: voucher.status_lama, ...(dariKeranjang ? { reservasi_dilepas: true, order: voucher.order_lama } : {}) },
    });

    const { rows: r } = await client.query(
      `UPDATE redeems SET status = 'dibatalkan', alasan_penolakan = $2, waktu_keputusan = now()
        WHERE id = $1 AND status = 'selesai' AND sumber = 'manual'
        RETURNING member_id, jumlah_poin`,
      [voucher.redeem_id, `Voucher ${voucher.kode} di-void: ${alasan}`]
    );
    if (r.length) {
      // Kembalikan poin yang dipotong saat generate. Pakai jenis 'kembalian', bukan 'koreksi' (koreksi
      // mengurangi total) dan bukan 'masuk' (poin akan terhitung masuk ke Lifetime Points/tier).
      await addEntry(client, { memberId: r[0].member_id, jenis: 'kembalian', jumlah: r[0].jumlah_poin, referensiTipe: 'redeem', referensiId: voucher.redeem_id });
      await audit(client, {
        pelakuTipe: 'admin', pelakuId: adminId, aksi: 'redeem.batalkan', objekTipe: 'redeem', objekId: voucher.redeem_id,
        detail: { via: 'voucher.void', kode: voucher.kode, alasan, poin_dikembalikan: r[0].jumlah_poin },
      });
    }
    await notify(client, {
      memberId: voucher.member_id, jenis: 'voucher_void', referensiTipe: 'voucher', referensiId: voucher.id,
      isi: `Voucher ${voucher.kode} dibatalkan admin. Alasan: ${alasan.replace(/[.\s]+$/, '')}.${r.length ? ` ${r[0].jumlah_poin} poin dikembalikan ke saldo Anda.` : ''}`,
    });
    return voucher;
  });
}

/** Voucher lewat expires_at atau reservasi lewat reserved_until dikembalikan otomatis — dipanggil scheduler. */
async function runMaintenance() {
  const expired = await pool.query(`UPDATE vouchers SET status = 'expired' WHERE status = 'active' AND expires_at < now() RETURNING id`);
  const released = await pool.query(
    `UPDATE vouchers SET status = 'active', reserved_at = NULL, reserved_until = NULL, reserved_order_id = NULL
      WHERE status = 'reserved' AND reserved_until < now() RETURNING id`
  );
  return { expired: expired.rowCount, released: released.rowCount };
}

// ---- Dipanggil sistem More (integrations/more.js) ----

async function findActiveByCode(client, kode) {
  const { rows } = await client.query(
    `SELECT v.*, r.nama AS reward_nama, r.poin_dibutuhkan FROM vouchers v JOIN rewards r ON r.id = v.reward_id WHERE v.kode = $1 FOR UPDATE`,
    [kode]
  );
  return rows[0] || null;
}

/** Validasi voucher saat checkout: reservasi sementara agar tidak dipakai dua kali (poin 5). */
async function reserveForCheckout({ kode, orderId }) {
  return withTransaction(async (client) => {
    const v = await findActiveByCode(client, kode);
    if (!v) throw new AppError(404, 'Kode voucher tidak ditemukan', 'VOUCHER_NOT_FOUND');
    if (v.status === 'reserved' && v.reserved_order_id === orderId) return v; // idempotent: order sama, panggilan ulang
    if (v.status === 'expired' || (v.status === 'active' && new Date(v.expires_at) < new Date())) {
      await client.query("UPDATE vouchers SET status = 'expired' WHERE id = $1", [v.id]);
      throw new AppError(409, 'Voucher sudah kedaluwarsa', 'VOUCHER_EXPIRED');
    }
    if (v.status !== 'active') throw new AppError(409, `Voucher berstatus ${v.status}, tidak dapat dipakai`, 'VOUCHER_NOT_ACTIVE');
    const { rows } = await client.query(
      `UPDATE vouchers SET status = 'reserved', reserved_at = now(), reserved_until = now() + ($2 || ' minutes')::interval,
              reserved_order_id = $3 WHERE id = $1 RETURNING *`,
      [v.id, config.more.voucherReserveMinutes, orderId]
    );
    return { ...rows[0], reward_nama: v.reward_nama, poin_dibutuhkan: v.poin_dibutuhkan };
  });
}

/** Konfirmasi voucher terpakai setelah checkout sukses (poin 5). */
async function confirmUsed({ kode, orderId }) {
  return withTransaction(async (client) => {
    const v = await findActiveByCode(client, kode);
    if (!v) throw new AppError(404, 'Kode voucher tidak ditemukan', 'VOUCHER_NOT_FOUND');
    if (v.status === 'used' && v.used_order_id === orderId) return v; // idempotent
    if (v.status !== 'reserved' || v.reserved_order_id !== orderId) {
      throw new AppError(409, 'Voucher belum divalidasi untuk order ini, atau reservasi sudah lewat waktu', 'RESERVATION_MISMATCH');
    }
    const { rows } = await client.query(
      `UPDATE vouchers SET status = 'used', used_at = now(), used_order_id = $2 WHERE id = $1 RETURNING *`,
      [v.id, orderId]
    );
    return rows[0];
  });
}

module.exports = {
  generateCode, efektifStatus, issueForRedeem, createManual, listVouchers, listForExport, summary, getVoucher,
  findByKodeForMember, extendExpiry, voidVoucher, runMaintenance, reserveForCheckout, confirmUsed, MAX_BULK,
};
