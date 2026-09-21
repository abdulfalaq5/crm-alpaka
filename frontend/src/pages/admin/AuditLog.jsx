import { useState } from 'react';
import { Alert, DatePicker, Input, Select, Table } from 'antd';
import { useLoad } from '../../hooks';
import { fmtDateTime } from '../../format';
import EmptyState from '../../components/EmptyState';

// Log audit: hanya baca, tanpa opsi ubah/hapus (ADM-05, BR-12, NFR-06).
export default function AuditLog() {
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const { data, loading, error } = useLoad('/admin/audit-logs', { page, limit: 25, ...filters }, [page, JSON.stringify(filters)]);
  const setFilter = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };

  return (
    <>
      <h1 className="page-title">Log Audit</h1>
      <p className="page-sub">Catatan permanen keputusan dan perubahan. Tidak dapat diubah atau dihapus.</p>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <div className="actions" style={{ marginBottom: 16 }}>
        <Select allowClear placeholder="Semua pelaku" style={{ minWidth: 150 }} onChange={(v) => setFilter({ pelaku_tipe: v })}
          options={[{ value: 'admin', label: 'Admin' }, { value: 'member', label: 'Member' }, { value: 'sistem', label: 'Sistem' }]} />
        <Input.Search allowClear placeholder="Aksi diawali… (mis. struk.)" style={{ width: 240 }} onSearch={(v) => setFilter({ aksi: v || undefined })} />
        <DatePicker.RangePicker onChange={(v) => setFilter({ from: v?.[0]?.format('YYYY-MM-DD'), to: v?.[1]?.format('YYYY-MM-DD') })} />
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={data?.data || []}
        scroll={{ x: 720 }}
        locale={{ emptyText: <EmptyState text="Tidak ada log" /> }}
        pagination={{ current: page, pageSize: 25, total: data?.meta.total || 0, onChange: setPage, showSizeChanger: false }}
        expandable={{ rowExpandable: (r) => Object.keys(r.detail || {}).length > 0, expandedRowRender: (r) => <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(r.detail, null, 2)}</pre> }}
        columns={[
          { title: 'Waktu', dataIndex: 'created_at', render: fmtDateTime },
          { title: 'Pelaku', render: (_, r) => `${r.pelaku_nama || '-'} (${r.pelaku_tipe})` },
          { title: 'Aksi', dataIndex: 'aksi' },
          { title: 'Objek', render: (_, r) => `${r.objek_tipe}${r.objek_id ? ` #${r.objek_id}` : ''}` },
        ]}
      />
    </>
  );
}
