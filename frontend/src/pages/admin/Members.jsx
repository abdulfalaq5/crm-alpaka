import { useState } from 'react';
import { Alert, App, Input, Popconfirm, Select, Table, Button } from 'antd';
import api, { errMsg } from '../../api';
import { useLoad } from '../../hooks';
import { fmtDate, num } from '../../format';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';

// Daftar member + saldo; admin dapat menonaktifkan/mengaktifkan akun (mencabut sesi seketika).
export default function Members() {
  const { message } = App.useApp();
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useLoad('/admin/members', { page, limit: 15, ...filters }, [page, JSON.stringify(filters)]);

  const setStatus = async (id, status_akun) => {
    try {
      await api.patch(`/admin/members/${id}`, { status_akun });
      message.success(status_akun === 'aktif' ? 'Akun diaktifkan.' : 'Akun dinonaktifkan.');
    } catch (err) {
      message.error(errMsg(err));
    }
    reload();
  };

  return (
    <>
      <h1 className="page-title">Member</h1>
      <p className="page-sub">Daftar member terdaftar beserta saldo poinnya.</p>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <div className="actions" style={{ marginBottom: 16 }}>
        <Input.Search allowClear placeholder="Cari nama / email / no. HP" style={{ width: 300, maxWidth: '100%' }} onSearch={(q) => { setFilters((f) => ({ ...f, q: q || undefined })); setPage(1); }} />
        <Select allowClear placeholder="Semua status" style={{ minWidth: 150 }} onChange={(v) => { setFilters((f) => ({ ...f, status: v })); setPage(1); }}
          options={[{ value: 'aktif', label: 'Aktif' }, { value: 'nonaktif', label: 'Nonaktif' }]} />
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data?.data || []}
        locale={{ emptyText: <EmptyState text="Tidak ada member" /> }}
        pagination={{ current: page, pageSize: 15, total: data?.meta.total || 0, onChange: setPage, showSizeChanger: false }}
        columns={[
          { title: 'Member', render: (_, r) => <>{r.nama}<div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{r.email || r.no_hp}</div></> },
          { title: 'Bergabung', dataIndex: 'created_at', render: fmtDate, responsive: ['md'] },
          { title: 'Struk', dataIndex: 'jumlah_struk', align: 'right', responsive: ['md'] },
          { title: 'Total', dataIndex: 'total', render: num, align: 'right', responsive: ['sm'] },
          { title: 'Tersedia', dataIndex: 'tersedia', render: num, align: 'right' },
          { title: 'Status', dataIndex: 'status_akun', render: (s) => <StatusBadge status={s === 'aktif' ? 'disetujui' : 'dibatalkan'} label={s === 'aktif' ? 'Aktif' : 'Nonaktif'} /> },
          {
            title: '',
            render: (_, r) =>
              r.status_akun === 'aktif' ? (
                <Popconfirm title="Nonaktifkan akun ini?" description="Member langsung keluar dan tidak bisa masuk lagi." okText="Nonaktifkan" cancelText="Batal" onConfirm={() => setStatus(r.id, 'nonaktif')}>
                  <Button size="small" danger>Nonaktifkan</Button>
                </Popconfirm>
              ) : (
                <Button size="small" onClick={() => setStatus(r.id, 'aktif')}>Aktifkan</Button>
              ),
          },
        ]}
      />
    </>
  );
}
