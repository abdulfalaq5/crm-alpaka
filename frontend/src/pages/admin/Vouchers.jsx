import { useState } from 'react';
import { Alert, Input, Select, Table } from 'antd';
import ReasonModal from '../../components/ReasonModal';
import api, { errMsg } from '../../api';
import { useLoad } from '../../hooks';
import { fmtDateTime, VOUCHER_STATUS } from '../../format';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import { App, Button } from 'antd';

// Monitoring voucher: status, kedaluwarsa, void manual (tambahan.md poin 3).
export default function Vouchers() {
  const { message } = App.useApp();
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useLoad('/admin/vouchers', { page, limit: 15, ...filters }, [page, JSON.stringify(filters)]);
  const [voiding, setVoiding] = useState(null);

  const badge = (s) => <StatusBadge status="menunggu_review" label={VOUCHER_STATUS[s]?.label || s} />;

  const doVoid = async (alasan) => {
    try {
      await api.post(`/admin/vouchers/${voiding.id}/void`, { alasan });
      message.success('Voucher di-void.');
      setVoiding(null);
      reload();
    } catch (err) {
      message.error(errMsg(err));
      throw err;
    }
  };

  return (
    <>
      <h1 className="page-title">Voucher</h1>
      <p className="page-sub">Kode voucher diterbitkan otomatis saat redeem disetujui.</p>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <div className="actions" style={{ marginBottom: 16 }}>
        <Input.Search allowClear placeholder="Cari kode / nama member" style={{ width: 280 }} onSearch={(q) => { setFilters((f) => ({ ...f, q: q || undefined })); setPage(1); }} />
        <Select allowClear placeholder="Semua status" style={{ minWidth: 180 }} onChange={(v) => { setFilters((f) => ({ ...f, status: v })); setPage(1); }}
          options={Object.entries(VOUCHER_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data?.data || []}
        locale={{ emptyText: <EmptyState text="Belum ada voucher" /> }}
        pagination={{ current: page, pageSize: 15, total: data?.meta.total || 0, onChange: setPage, showSizeChanger: false }}
        columns={[
          { title: 'Kode', dataIndex: 'kode', render: (k) => <code>{k}</code> },
          { title: 'Member', render: (_, r) => <>{r.member_nama}<div className="cell-sub">{r.member_email}</div></> },
          { title: 'Reward', dataIndex: 'reward_nama', responsive: ['md'] },
          { title: 'Status', dataIndex: 'status', render: badge },
          { title: 'Kedaluwarsa', dataIndex: 'expires_at', render: fmtDateTime, responsive: ['md'] },
          {
            title: '',
            render: (_, r) => ['active', 'reserved'].includes(r.status) && <Button size="small" danger onClick={() => setVoiding(r)}>Void</Button>,
          },
        ]}
      />
      <ReasonModal open={!!voiding} danger title={`Void voucher ${voiding?.kode || ''}`} label="Alasan void" okText="Void voucher" onSubmit={doVoid} onCancel={() => setVoiding(null)} />
    </>
  );
}
