import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Descriptions, Skeleton, App } from 'antd';
import api, { errMsg } from '../../api';
import { useLoad } from '../../hooks';
import { fmtDateTime, num } from '../../format';
import StatusBadge from '../../components/StatusBadge';
import ReasonModal from '../../components/ReasonModal';

// Review redeem (RDM-04, RDM-05): setujui + catat detail pemberian, atau tolak dengan alasan wajib.
export default function RedeemReview() {
  const { message } = App.useApp();
  const { id } = useParams();
  const { data, loading, error, reload } = useLoad(`/admin/redeems/${id}`);
  const [mode, setMode] = useState(null); // 'approve' | 'reject'
  const r = data?.data;

  const submit = (path, body, okMsg) => async (text) => {
    try {
      await api.post(`/admin/redeems/${id}/${path}`, body(text));
      message.success(okMsg);
      setMode(null);
      reload();
    } catch (err) {
      message.error(errMsg(err));
      if (err.response?.status === 409) { setMode(null); reload(); }
      throw err;
    }
  };

  return (
    <>
      <p><Link to="/admin/redeem">← Antrean Redeem</Link></p>
      {error && <Alert type="error" showIcon message={error} />}
      {loading && !r && <Skeleton active />}
      {r && (
        <>
          <h1 className="page-title">Redeem #{r.id}</h1>
          <p className="page-sub"><StatusBadge status={r.status} /></p>
          <div className="card" style={{ maxWidth: 720 }}>
            <Descriptions column={{ xs: 1, sm: 2 }} layout="vertical" size="small">
              <Descriptions.Item label="Member">{r.member_nama}</Descriptions.Item>
              <Descriptions.Item label="Kontak">{r.member_email || r.member_no_hp || '-'}</Descriptions.Item>
              <Descriptions.Item label="Reward">{r.reward_nama}</Descriptions.Item>
              <Descriptions.Item label="Poin ditahan/dipakai">{num(r.jumlah_poin)}</Descriptions.Item>
              <Descriptions.Item label="Diajukan">{fmtDateTime(r.created_at)}</Descriptions.Item>
              {r.waktu_keputusan && <Descriptions.Item label="Diputuskan">{fmtDateTime(r.waktu_keputusan)}{r.diputuskan_oleh_nama ? ` oleh ${r.diputuskan_oleh_nama}` : ' oleh member'}</Descriptions.Item>}
              {r.detail_pemberian && <Descriptions.Item label="Detail pemberian">{r.detail_pemberian}</Descriptions.Item>}
              {r.alasan_penolakan && <Descriptions.Item label="Alasan penolakan">{r.alasan_penolakan}</Descriptions.Item>}
            </Descriptions>
            {r.status === 'menunggu_persetujuan' && (
              <div className="actions" style={{ marginTop: 16 }}>
                <Button type="primary" onClick={() => setMode('approve')}>Setujui</Button>
                <Button danger onClick={() => setMode('reject')}>Tolak</Button>
              </div>
            )}
          </div>
          <ReasonModal
            open={mode === 'approve'}
            title="Setujui redeem"
            label="Detail pemberian reward (kode voucher / catatan)"
            required={false}
            okText="Setujui redeem"
            placeholder="Contoh: Kode voucher ALP-1234, berlaku sampai 31 Desember"
            onSubmit={submit('approve', (t) => ({ detail_pemberian: t }), 'Redeem disetujui. Poin resmi terpotong.')}
            onCancel={() => setMode(null)}
          />
          <ReasonModal
            open={mode === 'reject'}
            danger
            title="Tolak redeem"
            label="Alasan penolakan"
            okText="Tolak redeem"
            onSubmit={submit('reject', (t) => ({ alasan: t }), 'Redeem ditolak. Poin dikembalikan ke member.')}
            onCancel={() => setMode(null)}
          />
        </>
      )}
    </>
  );
}
