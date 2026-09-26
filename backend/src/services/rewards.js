const { imageUrl } = require('./rewardImages');
const { notFound } = require('../utils/http');

// Katalog reward (tambahan.md poin 2). Kolom yang dibaca member; `gambar_file` internal tidak pernah keluar.
const COLS = `r.id, r.nama, r.deskripsi, r.poin_dibutuhkan, r.berlaku_hari, r.stok, r.aktif,
              r.tier_minimum_id, r.valid_from, r.valid_until, r.gambar_file`;

// Tier minimum reward + tier milik member yang sedang login (untuk menentukan boleh/tidaknya ditukar).
const JOINS = `LEFT JOIN tiers t ON t.id = r.tier_minimum_id
       LEFT JOIN members m ON m.id = $MEMBER
       LEFT JOIN tiers mt ON mt.id = m.current_tier_id`;

/** Tanggal lokal sebagai 'YYYY-MM-DD' (kolom DATE sampai di node-postgres sebagai Date lokal). */
const tanggal = (v) => (v instanceof Date
  ? new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  : String(v).slice(0, 10));

const hariIni = () => tanggal(new Date());

const select = (where, paramMember = '$1') =>
  `SELECT ${COLS}, t.nama AS tier_minimum_nama, t.urutan AS tier_minimum_urutan, mt.urutan AS urutan_member
     FROM rewards r ${JOINS.replace('$MEMBER', paramMember)}
    ${where}
    ORDER BY r.poin_dibutuhkan, r.id`;

const cekId = (id) => (/^\d+$/.test(String(id)) ? String(id) : null);

/**
 * Alasan reward tidak tersedia bagi siapa pun: stok habis atau di luar masa tampil.
 * Tidak termasuk syarat tier (itu Depends on member, bukan pada reward-nya).
 */
function alasanTersedia(r, hari = hariIni()) {
  if (r.stok !== null && r.stok <= 0) {
    return { kode: 'stok_habis', pesan: 'Stok reward ini sudah habis.', field: 'Stok habis' };
  }
  if (r.valid_from && tanggal(r.valid_from) > hari) {
    return { kode: 'belum_tersedia', pesan: 'Reward ini belum tersedia.', field: 'Belum tersedia' };
  }
  if (r.valid_until && tanggal(r.valid_until) < hari) {
    return { kode: 'tidak_berlaku', pesan: 'Reward ini sudah tidak berlaku.', field: 'Sudah tidak berlaku' };
  }
  return null;
}

/**
 * Alasan reward tidak bisa ditukar oleh member tertentu, atau `null` bila bisa.
 *
 * Satu sumber kebenaran untuk sisi server: dipakai `createRedeem` agar penolakan redeem selalu
 * sama dengan keterangan yang tampil di katalog. Masa berlaku dibandingkan per tanggal
 * (YYYY-MM-DD), bukan per jam, supaya reward yang tampil hari ini juga bisa diredeem hari ini.
 */
function alasanTerkunci(r, urutan_member, hari = hariIni()) {
  const umum = alasanTersedia(r, hari);
  if (umum) return umum;
  if (r.tier_minimum_id && (urutan_member ?? -1) < (r.tier_minimum_urutan ?? Infinity)) {
    return {
      kode: 'tier',
      pesan: `Reward ini khusus member tier ${r.tier_minimum_nama || 'terentu'} ke atas.`,
      field: 'Tier belum memenuhi syarat',
    };
  }
  return null;
}

const statusStok = (stok) => (stok === null ? 'tanpa_batas' : stok > 0 ? 'tersedia' : 'habis');

/** Bentuk satu baris katalog untuk member tertentu: gambar, status stok, dan alasan terkunci. */
function untukMember(r) {
  const { gambar_file, tier_minimum_urutan, urutan_member, ...rest } = r;
  const lock = alasanTerkunci(r, urutan_member);
  return {
    ...rest,
    gambar_url: imageUrl(r),
    status_stok: statusStok(r.stok),
    memenuhi_tier: !r.tier_minimum_id || (urutan_member ?? -1) >= (tier_minimum_urutan ?? Infinity),
    bisa_ditukar: !lock,
    alasan_kode: lock ? lock.kode : null,
    alasan_terkunci: lock ? lock.pesan : null,
  };
}

/**
 * Katalog reward untuk member: hanya yang aktif dan tersedia (stok belum habis, masih dalam masa
 * tampil). Reward eksklusif tier tetap ditampilkan dengan `memenuhi_tier: false` supaya member
 * tahu alasannya; kekurangannya ditegakkan server saat redeem. Kekurangan poin dinilai di sisi
 * klien dari saldo tersedia.
 */
async function katalog(db, memberId) {
  const { rows } = await db.query(select('WHERE r.aktif = TRUE'), [memberId]);
  return rows.filter((r) => !alasanTersedia(r)).map(untukMember);
}

/**
 * Detail satu reward. Reward nonaktif dianggap tidak ada (produk ditarik admin), tetapi stok habis
 * atau kedaluwarsa tetap dikembalikan lengkap dengan `alasan_terkunci` agar tautan lama yang
 * sudah dibagikan tidak membuat member bingung.
 */
async function detail(db, id, memberId) {
  if (!cekId(id)) throw notFound('Reward tidak ditemukan');
  const { rows } = await db.query(select('WHERE r.id = $2'), [memberId, String(id)]);
  if (!rows.length) throw notFound('Reward tidak ditemukan');
  if (!rows[0].aktif) throw notFound('Reward sudah tidak tersedia');
  return untukMember(rows[0]);
}

/** Baris reward mentah + tier minimum + tier member, untuk pengecekan ketersediaan saat redeem. */
async function ambil(db, id, memberId) {
  if (!cekId(id)) throw notFound('Reward tidak ditemukan atau tidak aktif');
  const { rows } = await db.query(
    `SELECT r.*, t.nama AS tier_minimum_nama, t.urutan AS tier_minimum_urutan, mt.urutan AS urutan_member
       FROM rewards r ${JOINS.replace('$MEMBER', '$2')}
      WHERE r.id = $1`,
    [String(id), memberId]
  );
  if (!rows.length || !rows[0].aktif) throw notFound('Reward tidak ditemukan atau tidak aktif');
  return rows[0];
}

module.exports = { katalog, detail, ambil, alasanTersedia, alasanTerkunci, statusStok, untukMember, hariIni, tanggal };
