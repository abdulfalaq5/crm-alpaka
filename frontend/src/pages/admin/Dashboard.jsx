import { Button, Col, Row, Table } from 'antd';
import api from '../../api';
import { useLoad } from '../../hooks';
import { num } from '../../format';
import EmptyState from '../../components/EmptyState';

// href biasa tidak menyertakan token (Authorization ada di header, bukan cookie) — unduh lewat blob.
async function downloadCsv(path, filename) {
  const { data } = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const Stat = ({ label, value }) => (
  <div className="card" style={{ textAlign: 'center' }}>
    <div className="section-label" style={{ marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
  </div>
);

// Basic metrics untuk Admin Dashboard (tambahan.md poin 6).
export default function AdminDashboard() {
  const { data } = useLoad('/admin/metrics');
  const m = data?.data;

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">Ringkasan operasional program loyalty.</p>
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}><Stat label="Member aktif" value={m ? num(m.member_aktif) : '–'} /></Col>
        <Col xs={12} md={6}><Stat label="Total member" value={m ? num(m.member_total) : '–'} /></Col>
        <Col xs={12} md={6}><Stat label="Poin beredar" value={m ? num(m.poin_beredar) : '–'} /></Col>
        <Col xs={12} md={6}><Stat label="Redemption rate" value={m ? `${m.redemption_rate}%` : '–'} /></Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} md={12}>
          <div className="card">
            <p className="section-label">Sebaran tier</p>
            {!m?.tier.length ? <EmptyState text="Belum ada tier" /> : (
              <Table rowKey="nama" size="small" pagination={false} dataSource={m.tier} columns={[{ title: 'Tier', dataIndex: 'nama' }, { title: 'Member', dataIndex: 'jumlah_member', align: 'right' }]} />
            )}
          </div>
        </Col>
        <Col xs={24} md={12}>
          <div className="card">
            <p className="section-label">Top reward ditukar</p>
            {!m?.top_reward.length ? <EmptyState text="Belum ada redeem selesai" /> : (
              <Table rowKey="nama" size="small" pagination={false} dataSource={m.top_reward} columns={[{ title: 'Reward', dataIndex: 'nama' }, { title: 'Jumlah', dataIndex: 'jumlah', align: 'right' }]} />
            )}
          </div>
        </Col>
      </Row>
      <div className="card">
        <p className="section-label">Export laporan (CSV)</p>
        <div className="actions">
          <Button onClick={() => downloadCsv('/admin/export/members.csv', 'member.csv')}>Member</Button>
          <Button onClick={() => downloadCsv('/admin/export/receipts.csv', 'struk.csv')}>Struk</Button>
          <Button onClick={() => downloadCsv('/admin/export/redeems.csv', 'redeem.csv')}>Redeem</Button>
        </div>
      </div>
    </>
  );
}
