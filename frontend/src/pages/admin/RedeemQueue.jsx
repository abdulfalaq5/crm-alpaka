import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Input, Table } from 'antd';
import { useLoad } from '../../hooks';
import { fmtDateTime, num } from '../../format';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';

const LABELS = { menunggu_persetujuan: 'Menunggu Persetujuan', selesai: 'Disetujui', ditolak: 'Ditolak', dibatalkan: 'Dibatalkan' };

// Antrean redeem (RDM).
export default function RedeemQueue() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ status: 'menunggu_persetujuan' });
  const [page, setPage] = useState(1);
  const { data, loading, error } = useLoad('/admin/redeems', { page, limit: 15, ...filters }, [page, JSON.stringify(filters)]);
  const summary = data?.meta.ringkasan;
  const setFilter = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };

  return (
    <>
      <h1 className="page-title">Antrean Redeem</h1>
      <p className="page-sub">Pengajuan penukaran poin yang menunggu persetujuan.</p>
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
      <Input.Search allowClear placeholder="Cari nama member / email / reward" style={{ width: 320, maxWidth: '100%', marginBottom: 16 }} onSearch={(q) => setFilter({ q: q || undefined })} />
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data?.data || []}
        locale={{ emptyText: <EmptyState text="Tidak ada redeem pada filter ini" /> }}
        pagination={{ current: page, pageSize: 15, total: data?.meta.total || 0, onChange: setPage, showSizeChanger: false }}
        onRow={(r) => ({ onClick: () => navigate(`/admin/redeem/${r.id}`), className: 'clickable-row' })}
        columns={[
          { title: 'Diajukan', dataIndex: 'created_at', render: fmtDateTime, responsive: ['md'] },
          { title: 'Member', render: (_, r) => <>{r.member_nama}<div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{r.member_email}</div></> },
          { title: 'Reward', dataIndex: 'reward_nama' },
          { title: 'Poin', dataIndex: 'jumlah_poin', render: num, align: 'right', responsive: ['sm'] },
          { title: 'Status', dataIndex: 'status', render: (s) => <StatusBadge status={s} /> },
        ]}
      />
    </>
  );
}
