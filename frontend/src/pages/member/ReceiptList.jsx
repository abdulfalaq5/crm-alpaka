import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Select, Table } from 'antd';
import { useLoad } from '../../hooks';
import { fmtDate, num, rupiah } from '../../format';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';

// Riwayat struk (DSH-02).
export default function ReceiptList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState();
  const { data, loading, error } = useLoad('/receipts', { page, limit: 10, status }, [page, status]);

  return (
    <>
      <h1 className="page-title">Riwayat Struk</h1>
      <p className="page-sub">Semua struk yang pernah Anda ajukan beserta statusnya.</p>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <div className="actions" style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="Semua status"
          style={{ minWidth: 200 }}
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={[
            { value: 'menunggu_review', label: 'Menunggu Review' },
            { value: 'disetujui', label: 'Disetujui' },
            { value: 'ditolak', label: 'Ditolak' },
          ]}
        />
        <Button type="primary" onClick={() => navigate('/upload')}>Upload Struk</Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data?.data || []}
        scroll={{ x: 620 }}
        locale={{ emptyText: <EmptyState text="Belum ada struk"><Button type="link" onClick={() => navigate('/upload')}>Upload struk pertama Anda</Button></EmptyState> }}
        pagination={{ current: page, pageSize: 10, total: data?.meta.total || 0, onChange: setPage, showSizeChanger: false }}
        onRow={(r) => ({ onClick: () => navigate(`/struk/${r.id}`), className: 'clickable-row' })}
        columns={[
          { title: 'Tanggal transaksi', dataIndex: 'tanggal_transaksi', render: fmtDate },
          { title: 'Channel', dataIndex: 'channel' },
          { title: 'No. transaksi', dataIndex: 'nomor_transaksi' },
          { title: 'Nominal', dataIndex: 'nominal', render: rupiah, align: 'right' },
          { title: 'Status', dataIndex: 'status', render: (s) => <StatusBadge status={s} /> },
          { title: 'Poin', dataIndex: 'poin_diperoleh', align: 'right', render: (p) => (p ? `+${num(p)}` : '-') },
        ]}
      />
    </>
  );
}
