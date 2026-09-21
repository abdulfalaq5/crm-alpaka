import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Skeleton, Table, Tabs } from 'antd';
import { useState } from 'react';
import { useLoad } from '../../hooks';
import { MUTATION, fmtDate, fmtDateTime, num, rupiah } from '../../format';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import { useAuth } from '../../auth';

// Dashboard member (DSH-01..03, DSH-06). Angka dan status diambil dari backend, tidak dihitung ulang.
function Mutations() {
  const [page, setPage] = useState(1);
  const { data, loading } = useLoad('/member/points/mutations', { page, limit: 10 }, [page]);
  return (
    <Table
      rowKey="id"
      loading={loading}
      dataSource={data?.data || []}
      locale={{ emptyText: <EmptyState text="Belum ada mutasi poin" /> }}
      pagination={{ current: page, pageSize: 10, total: data?.meta.total || 0, onChange: setPage, showSizeChanger: false }}
      columns={[
        { title: 'Tanggal', dataIndex: 'created_at', render: fmtDateTime, responsive: ['sm'] },
        { title: 'Jenis', dataIndex: 'jenis', render: (j) => MUTATION[j].label },
        { title: 'Keterangan', dataIndex: 'keterangan', render: (k, r) => (r.referensi_tipe === 'receipt' ? `Struk ${k}` : r.referensi_tipe === 'koreksi' ? `Koreksi struk ${k}` : `Redeem ${k || ''}`) },
        {
          title: 'Poin',
          align: 'right',
          render: (_, r) => (
            <b style={{ color: `var(--color-${MUTATION[r.jenis].color})` }}>
              {MUTATION[r.jenis].sign}
              {num(r.jumlah)}
            </b>
          ),
        },
      ]}
    />
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error } = useLoad('/member/dashboard');
  const d = data?.data;

  return (
    <>
      <h1 className="page-title">Halo, {user?.nama?.split(' ')[0]}</h1>
      <p className="page-sub">Ringkasan poin dan aktivitas terbaru Anda.</p>
      {error && <Alert type="error" showIcon message={error} />}
      {loading && !d && <Skeleton active />}
      {d && (
        <>
          <div className="balance-grid">
            <div className="balance-item primary">
              <div className="section-label">Poin tersedia</div>
              <div className="num">{num(d.points.tersedia)}</div>
            </div>
            <div className="balance-item">
              <div className="section-label">Total poin</div>
              <div className="num">{num(d.points.total)}</div>
            </div>
            <div className="balance-item">
              <div className="section-label">Ditahan (hold)</div>
              <div className="num">{num(d.points.ditahan)}</div>
            </div>
          </div>
          <div className="actions" style={{ margin: '16px 0 24px' }}>
            <Button type="primary" onClick={() => navigate('/upload')}>Upload Struk</Button>
            <Button onClick={() => navigate('/redeem')}>Tukar Poin</Button>
          </div>

          <Tabs
            items={[
              {
                key: 'ringkasan',
                label: 'Aktivitas Terbaru',
                children: (
                  <>
                    <div className="card">
                      <p className="section-label">Struk terakhir</p>
                      {d.struk_terbaru.length === 0 ? (
                        <EmptyState text="Belum ada struk yang diunggah" />
                      ) : (
                        <Table
                          rowKey="id"
                          size="small"
                          pagination={false}
                          dataSource={d.struk_terbaru}
                          onRow={(r) => ({ onClick: () => navigate(`/struk/${r.id}`), className: 'clickable-row' })}
                          columns={[
                            { title: 'Tanggal', dataIndex: 'tanggal_transaksi', render: fmtDate },
                            { title: 'Channel', dataIndex: 'channel', responsive: ['md'] },
                            { title: 'Nominal', dataIndex: 'nominal', render: rupiah },
                            { title: 'Status', dataIndex: 'status', render: (s) => <StatusBadge status={s} /> },
                            { title: 'Poin', dataIndex: 'poin_diperoleh', align: 'right', render: (p) => (p ? `+${num(p)}` : '-'), responsive: ['sm'] },
                          ]}
                        />
                      )}
                      <div style={{ marginTop: 8 }}><Link to="/struk">Lihat semua struk</Link></div>
                    </div>
                    <div className="card">
                      <p className="section-label">Redeem terakhir</p>
                      {d.redeem_terbaru.length === 0 ? (
                        <EmptyState text="Belum ada redeem" />
                      ) : (
                        <Table
                          rowKey="id"
                          size="small"
                          pagination={false}
                          dataSource={d.redeem_terbaru}
                          columns={[
                            { title: 'Tanggal', dataIndex: 'created_at', render: fmtDate, responsive: ['sm'] },
                            { title: 'Reward', dataIndex: 'reward_nama' },
                            { title: 'Poin', dataIndex: 'jumlah_poin', render: num },
                            { title: 'Status', dataIndex: 'status', render: (s) => <StatusBadge status={s} /> },
                          ]}
                        />
                      )}
                      <div style={{ marginTop: 8 }}><Link to="/redeem">Lihat riwayat redeem</Link></div>
                    </div>
                  </>
                ),
              },
              { key: 'mutasi', label: 'Mutasi Poin', children: <Mutations /> },
            ]}
          />
        </>
      )}
    </>
  );
}
