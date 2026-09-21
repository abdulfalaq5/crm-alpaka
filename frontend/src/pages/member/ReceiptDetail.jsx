import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Descriptions, Skeleton } from 'antd';
import { useLoad } from '../../hooks';
import { fmtDate, fmtDateTime, num, rupiah } from '../../format';
import StatusBadge from '../../components/StatusBadge';
import FilePreview from '../../components/FilePreview';

// Detail struk untuk member (UPL-06, UPL-07, DSH-04).
export default function ReceiptDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useLoad(`/receipts/${id}`);
  const r = data?.data;

  return (
    <>
      <p><Link to="/struk">← Riwayat Struk</Link></p>
      {error && <Alert type="error" showIcon message={error} />}
      {loading && !r && <Skeleton active />}
      {r && (
        <>
          <h1 className="page-title">Struk {r.nomor_transaksi}</h1>
          <p className="page-sub"><StatusBadge status={r.status} /></p>
          {r.status === 'ditolak' && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              message="Struk ditolak"
              description={r.alasan_penolakan}
              action={r.bisa_diajukan_ulang && <Button danger onClick={() => navigate(`/upload?ulang=${r.id}`)}>Ajukan Ulang</Button>}
            />
          )}
          {r.status === 'disetujui' && (
            <Alert type="success" showIcon style={{ marginBottom: 16 }} message={r.poin_diperoleh ? `Struk disetujui — Anda mendapat ${num(r.poin_diperoleh)} poin.` : 'Struk disetujui.'} />
          )}
          {r.status === 'menunggu_review' && <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Struk sedang menunggu review admin." />}
          <div className="card">
            <Descriptions column={{ xs: 1, sm: 2 }} layout="vertical">
              <Descriptions.Item label="Channel">{r.channel}</Descriptions.Item>
              <Descriptions.Item label="Nomor transaksi">{r.nomor_transaksi}</Descriptions.Item>
              <Descriptions.Item label="Tanggal transaksi">{fmtDate(r.tanggal_transaksi)}</Descriptions.Item>
              <Descriptions.Item label="Nominal">{rupiah(r.nominal)}</Descriptions.Item>
              <Descriptions.Item label="Diajukan">{fmtDateTime(r.created_at)}</Descriptions.Item>
              {r.waktu_keputusan && <Descriptions.Item label="Diputuskan">{fmtDateTime(r.waktu_keputusan)}</Descriptions.Item>}
            </Descriptions>
          </div>
          <div className="card">
            <p className="section-label">Bukti transaksi</p>
            <div style={{ display: 'grid', gap: 12 }}>
              {r.files.map((f) => (
                <FilePreview key={f.id} path={`/receipts/${r.id}/files/${f.id}`} name={f.nama_asli} />
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
