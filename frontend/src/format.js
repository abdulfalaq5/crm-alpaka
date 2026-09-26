import dayjs from 'dayjs';
import 'dayjs/locale/id';

dayjs.locale('id');

export const rupiah = (n) => `Rp${Number(n || 0).toLocaleString('id-ID')}`;
export const num = (n) => Number(n || 0).toLocaleString('id-ID');
export const fmtDate = (d) => (d ? dayjs(d).format('DD MMM YYYY') : '-');
export const fmtDateTime = (d) => (d ? dayjs(d).format('DD MMM YYYY HH:mm') : '-');

/** Sisa masa berlaku dalam hari (dibulatkan ke atas); null bila tidak ada tanggalnya. */
export const sisaHari = (d) => (d ? Math.max(Math.ceil(dayjs(d).startOf('day').diff(dayjs().startOf('day'), 'day')), 0) : null);

export const STATUS = {
  menunggu_review: { label: 'Menunggu Review', color: 'warning' },
  disetujui: { label: 'Disetujui', color: 'success' },
  ditolak: { label: 'Ditolak', color: 'danger' },
  menunggu_persetujuan: { label: 'Menunggu Persetujuan', color: 'warning' },
  selesai: { label: 'Disetujui', color: 'success' },
  dibatalkan: { label: 'Dibatalkan', color: 'neutral' },
};

export const MUTATION = {
  masuk: { label: 'Poin Masuk', sign: '+', color: 'success' },
  hold: { label: 'Ditahan (Hold)', sign: '−', color: 'warning' },
  terpakai: { label: 'Terpakai', sign: '−', color: 'danger' },
  lepas: { label: 'Hold Dilepas', sign: '+', color: 'success' },
  koreksi: { label: 'Koreksi Poin', sign: '−', color: 'danger' },
  kembalian: { label: 'Kembalian Poin', sign: '+', color: 'success' },
};

export const VOUCHER_STATUS = {
  active: { label: 'Aktif', color: 'success' },
  reserved: { label: 'Dipakai di Checkout', color: 'warning' },
  used: { label: 'Terpakai', color: 'neutral' },
  expired: { label: 'Kedaluwarsa', color: 'danger' },
  void: { label: 'Dibatalkan', color: 'danger' },
};

export const VOUCHER_SUMBER = {
  redeem: 'Redeem',
  manual: 'Manual',
};

export const STATUS_STOK = {
  tersedia: { label: 'Tersedia', color: 'success' },
  habis: { label: 'Stok Habis', color: 'danger' },
  tanpa_batas: { label: 'Tanpa Batas', color: 'neutral' },
};

/** Label pendek untuk tombol yang terkunci; pesan lengkap datang dari `alasan_terkunci`. */
export const ALASAN_TERKUNCI = {
  stok_habis: 'Stok habis',
  belum_tersedia: 'Belum tersedia',
  tidak_berlaku: 'Sudah berakhir',
  tier: 'Tier belum memenuhi',
};
