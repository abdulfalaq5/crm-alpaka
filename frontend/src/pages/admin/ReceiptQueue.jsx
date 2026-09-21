import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, DatePicker, Input, Select, Table } from 'antd';
import { useLoad } from '../../hooks';
import { fmtDateTime, rupiah } from '../../format';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';

const LABELS = { menunggu_review: 'Menunggu Review', disetujui: 'Disetujui', ditolak: 'Ditolak' };

// Antrean struk dengan filter, pencarian, dan ringkasan per status (ADM-01).
export default function ReceiptQueue() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ status: 'menunggu_review' });
  const [page, setPage] = useState(1);
  const params = { page, limit: 15, ...filters };
  const { data, loading, error } = useLoad('/admin/receipts', params, [page, JSON.stringify(filters)]);
  const { data: cfg } = useLoad('/config');
  const summary = data?.meta.ringkasan;

  const setFilter = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };

  return (
    <>
      <h1 className="page-title">Antrean Struk</h1>
      <p className="page-sub">Review struk yang menunggu keputusan.</p>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <div className="summary-cards">
        {Object.entries(LABELS).map(([key, label]) => (
          <button key={key} type="button" className={`summary-card ${filters.status === key ? 'active' : ''}`} onClick={() => setFilter({ status: key })}>
            <div className="section-label" style={{ marginBottom: 0 }}>{label}</div>
            <div className="num">{summary?.[key] ?? '–'}</div>
          </button>
        ))}
        <button type="button" className={`summary-card ${!filters.status ? 'active' : ''}`} onClick={() => setFilter({ status: undefined })}>
          <div className="section-label" style={{ marginBottom: 0 }}>Semua</div>
          <div className="num">{summary ? Object.values(summary).reduce((a, b) => a + b, 0) : '–'}</div>
        </button>
      </div>
      <div className="actions" style={{ marginBottom: 16 }}>
        <Input.Search allowClear placeholder="Cari no. transaksi / nama / email" style={{ width: 300, maxWidth: '100%' }} onSearch={(q) => setFilter({ q: q || undefined })} />
        <Select allowClear placeholder="Semua channel" style={{ minWidth: 170 }} onChange={(channel) => setFilter({ channel })} options={(cfg?.channels || []).map((c) => ({ value: c, label: c }))} />
        <DatePicker.RangePicker
          onChange={(v) => setFilter({ from: v?.[0]?.format('YYYY-MM-DD'), to: v?.[1]?.format('YYYY-MM-DD') })}
          placeholder={['Diajukan dari', 'sampai']}
        />
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data?.data || []}
        scroll={{ x: 800 }}
        locale={{ emptyText: <EmptyState text="Tidak ada struk pada filter ini" /> }}
        pagination={{ current: page, pageSize: 15, total: data?.meta.total || 0, onChange: setPage, showSizeChanger: false }}
        onRow={(r) => ({ onClick: () => navigate(`/admin/struk/${r.id}`), className: 'clickable-row' })}
        columns={[
          { title: 'Diajukan', dataIndex: 'created_at', render: fmtDateTime },
          { title: 'Member', render: (_, r) => <>{r.member_nama}<div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{r.member_email}</div></> },
          { title: 'Channel', dataIndex: 'channel' },
          { title: 'No. transaksi', dataIndex: 'nomor_transaksi' },
          { title: 'Nominal', dataIndex: 'nominal', render: rupiah, align: 'right' },
          { title: 'Status', dataIndex: 'status', render: (s, r) => <><StatusBadge status={s} />{r.mode_persetujuan === 'otomatis' && <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>otomatis</div>}</> },
        ]}
      />
    </>
  );
}
