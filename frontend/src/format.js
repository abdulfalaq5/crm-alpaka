import dayjs from 'dayjs';
import 'dayjs/locale/id';

dayjs.locale('id');

export const rupiah = (n) => `Rp${Number(n || 0).toLocaleString('id-ID')}`;
export const num = (n) => Number(n || 0).toLocaleString('id-ID');
export const fmtDate = (d) => (d ? dayjs(d).format('DD MMM YYYY') : '-');
export const fmtDateTime = (d) => (d ? dayjs(d).format('DD MMM YYYY HH:mm') : '-');

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
};
