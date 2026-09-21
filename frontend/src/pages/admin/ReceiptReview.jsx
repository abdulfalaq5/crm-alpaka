import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Col, Descriptions, Popconfirm, Row, Skeleton, App } from 'antd';
import { CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons';
import api, { errMsg } from '../../api';
import { useLoad } from '../../hooks';
import { fmtDate, fmtDateTime, num, rupiah } from '../../format';
import StatusBadge from '../../components/StatusBadge';
import FilePreview from '../../components/FilePreview';
import ReasonModal from '../../components/ReasonModal';

const CHECK_LABEL = { kelengkapan: 'Kelengkapan data', duplikat: 'Duplikasi', tanggal: 'Tanggal transaksi', nominal: 'Nominal' };

// Review struk oleh admin (ADM-02, ADM-03, ADM-06): setelah diputuskan halaman menjadi read-only.
export default function ReceiptReview() {
  const { message } = App.useApp();
  const { id } = useParams();
  const { data, loading, error, reload } = useLoad(`/admin/receipts/${id}`);
  const [rejecting, setRejecting] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const r = data?.data;

  const approve = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/receipts/${id}/approve`);
      message.success('Struk disetujui.');
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setBusy(false);
      reload();
    }
  };

  const reject = async (alasan) => {
    try {
      await api.post(`/admin/receipts/${id}/reject`, { alasan });
      message.success('Struk ditolak.');
      setRejecting(false);
      reload();
    } catch (err) {
      message.error(errMsg(err));
      if (err.response?.status === 409) { setRejecting(false); reload(); }
      throw err;
    }
  };

  const correct = async (alasan) => {
    try {
      await api.post(`/admin/receipts/${id}/correct`, { alasan });
      message.success('Keputusan dikoreksi.');
      setCorrecting(false);
      reload();
    } catch (err) {
      message.error(errMsg(err)); // mis. poin sudah dipakai redeem / duplikat aktif
      throw err;
    }
  };

  return (
    <>
      <p><Link to="/admin/struk">← Antrean Struk</Link></p>
      {error && <Alert type="error" showIcon message={error} />}
      {loading && !r && <Skeleton active />}
      {r && (
        <>
          <h1 className="page-title">Struk {r.nomor_transaksi}</h1>
          <p className="page-sub"><StatusBadge status={r.status} /></p>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={13}>
              <div className="card">
                <p className="section-label">Bukti transaksi</p>
                <div style={{ display: 'grid', gap: 12 }}>
                  {r.files.map((f) => <FilePreview key={f.id} path={`/admin/receipts/${r.id}/files/${f.id}`} name={f.nama_asli} />)}
                </div>
              </div>
            </Col>
            <Col xs={24} lg={11}>
              <div className="card">
                <p className="section-label">Data transaksi</p>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Channel">{r.channel}</Descriptions.Item>
                  <Descriptions.Item label="No. transaksi">{r.nomor_transaksi}</Descriptions.Item>
                  <Descriptions.Item label="Tanggal">{fmtDate(r.tanggal_transaksi)}</Descriptions.Item>
                  <Descriptions.Item label="Nominal">{rupiah(r.nominal)}</Descriptions.Item>
                  <Descriptions.Item label="Diajukan">{fmtDateTime(r.created_at)}</Descriptions.Item>
                  {r.resubmit_of && <Descriptions.Item label="Pengajuan ulang dari">
                    <Link to={`/admin/struk/${r.resubmit_of}`}>Struk #{r.resubmit_of}</Link></Descriptions.Item>}
                </Descriptions>
              </div>
              <div className="card">
                <p className="section-label">Data member</p>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Nama">{r.member_nama}</Descriptions.Item>
                  <Descriptions.Item label="Email">{r.member_email || '-'}</Descriptions.Item>
                  <Descriptions.Item label="No. HP">{r.member_no_hp || '-'}</Descriptions.Item>
                </Descriptions>
              </div>
              <div className="card">
                <p className="section-label">Hasil validasi otomatis</p>
                {Object.entries(r.hasil_validasi?.checks || {}).map(([k, c]) => (
                  <div className="check-row" key={k}>
                    {c.lulus ? <CheckCircleFilled style={{ color: 'var(--color-success)', marginTop: 4 }} /> : <CloseCircleFilled style={{ color: 'var(--color-danger)', marginTop: 4 }} />}
                    <div><b>{CHECK_LABEL[k] || k}</b>: {c.pesan}</div>
                  </div>
                ))}
              </div>
              {r.koreksi?.length > 0 && (
                <div className="card">
                  <p className="section-label">Riwayat koreksi</p>
                  {r.koreksi.map((k) => (
                    <div key={k.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
                      <div><StatusBadge status={k.dari_status} /> → <StatusBadge status={k.ke_status} />{k.poin_delta ? <b style={{ marginLeft: 8 }}>{k.poin_delta > 0 ? '+' : ''}{num(k.poin_delta)} poin</b> : null}</div>
                      <div>{k.alasan}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{k.admin_nama} · {fmtDateTime(k.created_at)}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="card">
                {r.status === 'menunggu_review' ? (
                  <>
                    <p className="section-label">Keputusan</p>
                    <div className="actions">
                      <Popconfirm title="Setujui struk ini?" description="Poin akan dicatat ke member." okText="Setujui" cancelText="Batal" onConfirm={approve}>
                        <Button type="primary" loading={busy}>Setujui</Button>
                      </Popconfirm>
                      <Button danger onClick={() => setRejecting(true)}>Tolak</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="section-label">Keputusan (final)</p>
                    <Descriptions column={1} size="small">
                      <Descriptions.Item label="Status"><StatusBadge status={r.status} /></Descriptions.Item>
                      <Descriptions.Item label="Cara">{r.mode_persetujuan === 'otomatis' ? 'Otomatis oleh sistem' : `Manual oleh ${r.diputuskan_oleh_nama}`}</Descriptions.Item>
                      <Descriptions.Item label="Waktu">{fmtDateTime(r.waktu_keputusan)}</Descriptions.Item>
                      {r.alasan_penolakan && <Descriptions.Item label="Alasan">{r.alasan_penolakan}</Descriptions.Item>}
                      {r.poin_diperoleh && <Descriptions.Item label="Poin diberikan">{num(r.poin_diperoleh)}</Descriptions.Item>}
                    </Descriptions>
                    <Button style={{ marginTop: 12 }} onClick={() => setCorrecting(true)}>Koreksi keputusan</Button>
                  </>
                )}
              </div>
            </Col>
          </Row>
          <ReasonModal
            open={correcting}
            danger={r.status === 'disetujui'}
            title={r.status === 'disetujui' ? 'Koreksi: ubah menjadi DITOLAK' : 'Koreksi: ubah menjadi DISETUJUI'}
            label="Alasan koreksi"
            okText={r.status === 'disetujui' ? 'Tolak & batalkan poin' : 'Setujui & beri poin'}
            placeholder={r.status === 'disetujui' ? 'Alasan ini ditampilkan kepada member. Poin dari struk ini akan dibatalkan.' : 'Catatan koreksi. Poin dicatat sesuai aturan konversi saat ini.'}
            onSubmit={correct}
            onCancel={() => setCorrecting(false)}
          />
          <ReasonModal open={rejecting} danger title="Tolak struk" label="Alasan penolakan" okText="Tolak struk" onSubmit={reject} onCancel={() => setRejecting(false)} placeholder="Alasan ini akan ditampilkan kepada member" />
        </>
      )}
    </>
  );
}
