import { useState } from 'react';
import { Alert, App, Button, Drawer, Form, Input, InputNumber, List, Modal, Popconfirm, Progress, Select, Table, Tag } from 'antd';
import api, { errMsg, fieldErrors } from '../../api';
import { useAdminRole } from '../../auth';
import { useLoad } from '../../hooks';
import { fmtDate, fmtDateTime, num } from '../../format';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';

function TierHistoryDrawer({ member, onClose }) {
  const { data, loading, error } = useLoad(`/admin/members/${member.id}/tier-history`);
  return (
    <Drawer title={`Riwayat Tier — ${member.nama}`} width={560} open onClose={onClose}>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <List
        loading={loading}
        dataSource={data?.data || []}
        locale={{ emptyText: <EmptyState text="Belum ada riwayat tier" /> }}
        renderItem={(row) => (
          <List.Item style={{ display: 'block' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <b>{row.dari || '—'} → {row.ke || '—'}</b>
              <Tag color={row.sebab === 'manual' ? 'gold' : 'default'}>{row.sebab === 'manual' ? 'Manual' : 'Otomatis'}</Tag>
            </div>
            <div className="cell-sub">{row.alasan || 'Dihitung dari poin lifetime'}</div>
            <div className="cell-sub">{fmtDateTime(row.created_at)}{row.admin_nama ? ` · ${row.admin_nama}` : ''}</div>
          </List.Item>
        )}
      />
    </Drawer>
  );
}

export default function Members() {
  const { message } = App.useApp();
  const { canWrite } = useAdminRole();
  const [adjusting, setAdjusting] = useState(null);
  const [tierMember, setTierMember] = useState(null);
  const [historyMember, setHistoryMember] = useState(null);
  const [savingPoints, setSavingPoints] = useState(false);
  const [savingTier, setSavingTier] = useState(false);
  const [pointForm] = Form.useForm();
  const [tierForm] = Form.useForm();
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useLoad('/admin/members', { page, limit: 15, ...filters }, [page, JSON.stringify(filters)]);
  const { data: tierData, error: tierError } = useLoad('/admin/tiers');
  const tierOptions = (tierData?.data || []).map((tier) => ({
    value: String(tier.id),
    label: `${tier.nama} · ${num(tier.min_poin)} poin`,
  }));

  const adjustPoints = async (values) => {
    setSavingPoints(true);
    try {
      await api.post(`/admin/members/${adjusting.id}/points`, values);
      message.success('Poin disesuaikan.');
      setAdjusting(null);
      pointForm.resetFields();
      reload();
    } catch (err) {
      if (err.response?.status === 422) pointForm.setFields(fieldErrors(err));
      else message.error(errMsg(err));
    } finally {
      setSavingPoints(false);
    }
  };

  const setStatus = async (id, status_akun) => {
    try {
      await api.patch(`/admin/members/${id}`, { status_akun });
      message.success(status_akun === 'aktif' ? 'Akun diaktifkan.' : 'Akun dinonaktifkan.');
      reload();
    } catch (err) {
      message.error(errMsg(err));
    }
  };

  const openTier = (member) => {
    tierForm.setFieldsValue({
      tier_id: member.tier_manual && member.current_tier_id ? String(member.current_tier_id) : 'otomatis',
      alasan: '',
    });
    setTierMember(member);
  };

  const saveTier = async (values) => {
    setSavingTier(true);
    try {
      const otomatis = values.tier_id === 'otomatis';
      await api.patch(`/admin/members/${tierMember.id}/tier`, {
        tier_id: otomatis ? null : values.tier_id,
        alasan: values.alasan,
      });
      message.success(otomatis ? 'Tier dikembalikan ke mode otomatis.' : 'Tier member berhasil diperbarui.');
      setTierMember(null);
      tierForm.resetFields();
      reload();
    } catch (err) {
      if (err.response?.status === 422) tierForm.setFields(fieldErrors(err));
      else message.error(errMsg(err));
    } finally {
      setSavingTier(false);
    }
  };

  const filterTier = (value) => {
    setFilters((current) => {
      const next = { ...current };
      delete next.tier_id;
      delete next.tier_source;
      if (value === 'manual' || value === 'otomatis') next.tier_source = value;
      if (value && value !== 'manual' && value !== 'otomatis') next.tier_id = value;
      return next;
    });
    setPage(1);
  };

  return (
    <>
      <h1 className="page-title">Member</h1>
      <p className="page-sub">Daftar member, saldo, tier efektif, dan progress menuju tier berikutnya.</p>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {tierError && <Alert type="error" showIcon message={tierError} style={{ marginBottom: 16 }} />}
      <div className="actions" style={{ marginBottom: 16 }}>
        <Input.Search allowClear placeholder="Cari nama / email / no. HP" style={{ width: 300, maxWidth: '100%' }} onSearch={(q) => { setFilters((current) => ({ ...current, q: q || undefined })); setPage(1); }} />
        <Select allowClear placeholder="Semua status" style={{ minWidth: 150 }} onChange={(value) => { setFilters((current) => ({ ...current, status: value })); setPage(1); }}
          options={[{ value: 'aktif', label: 'Aktif' }, { value: 'nonaktif', label: 'Nonaktif' }]} />
        <Select
          allowClear
          placeholder="Semua tier"
          style={{ minWidth: 190 }}
          onChange={filterTier}
          options={[
            { value: 'manual', label: 'Tier manual' },
            { value: 'otomatis', label: 'Tier otomatis' },
            ...tierOptions,
          ]}
        />
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data?.data || []}
        locale={{ emptyText: <EmptyState text="Tidak ada member" /> }}
        pagination={{ current: page, pageSize: 15, total: data?.meta.total || 0, onChange: setPage, showSizeChanger: false }}
        columns={[
          { title: 'Member', render: (_, row) => <>{row.nama}<div className="cell-sub">{row.email || row.no_hp}</div></> },
          {
            title: 'Tier',
            render: (_, row) => (
              <>
                <b>{row.current_tier_nama || 'Belum ada tier'}</b>{' '}
                <Tag color={row.tier_manual ? 'gold' : 'default'}>{row.tier_manual ? 'Manual' : 'Otomatis'}</Tag>
                <div className="cell-sub">{row.tier_berikutnya_nama ? `Berikutnya: ${row.tier_berikutnya_nama}` : row.current_tier_nama ? 'Tier tertinggi' : 'Tier belum dikonfigurasi'}</div>
              </>
            ),
          },
          {
            title: 'Poin lifetime',
            dataIndex: 'poin_lifetime',
            align: 'right',
            render: (value, row) => (
              <>
                <b>{num(value)}</b>
                <div className="cell-sub">
                  {row.tier_berikutnya_nama ? `${num(row.poin_dibutuhkan)} poin lagi · ${row.persen}%` : row.current_tier_nama ? 'Tier tertinggi tercapai' : 'Tier belum dikonfigurasi'}
                </div>
                {row.tier_berikutnya_nama && <Progress percent={row.persen} showInfo={false} size="small" strokeColor="#171717" trailColor="#e4e1dc" />}
              </>
            ),
          },
          { title: 'Tersedia', dataIndex: 'tersedia', render: num, align: 'right' },
          { title: 'Struk', dataIndex: 'jumlah_struk', align: 'right', responsive: ['md'] },
          { title: 'Bergabung', dataIndex: 'created_at', render: fmtDate, responsive: ['lg'] },
          { title: 'Status', dataIndex: 'status_akun', render: (value) => <StatusBadge status={value === 'aktif' ? 'disetujui' : 'dibatalkan'} label={value === 'aktif' ? 'Aktif' : 'Nonaktif'} />, responsive: ['sm'] },
          {
            title: '',
            render: (_, row) => (
              <div className="actions">
                {canWrite && <Button size="small" onClick={() => openTier(row)}>Atur tier</Button>}
                {canWrite && <Button size="small" onClick={() => setAdjusting(row)}>Sesuaikan poin</Button>}
                <Button size="small" onClick={() => setHistoryMember(row)}>Riwayat</Button>
                {canWrite && (row.status_akun === 'aktif' ? (
                  <Popconfirm title="Nonaktifkan akun ini?" description="Member langsung keluar dan tidak bisa masuk lagi." okText="Nonaktifkan" cancelText="Batal" onConfirm={() => setStatus(row.id, 'nonaktif')}>
                    <Button size="small" danger>Nonaktifkan</Button>
                  </Popconfirm>
                ) : (
                  <Button size="small" onClick={() => setStatus(row.id, 'aktif')}>Aktifkan</Button>
                ))}
              </div>
            ),
          },
        ]}
      />
      <Modal open={!!adjusting} title={`Sesuaikan Poin — ${adjusting?.nama || ''}`} onCancel={() => setAdjusting(null)} onOk={() => pointForm.submit()} confirmLoading={savingPoints} okText="Simpan" cancelText="Batal" destroyOnHidden forceRender>
        <Form form={pointForm} layout="vertical" onFinish={adjustPoints} requiredMark={false}>
          <Form.Item name="jumlah" label="Jumlah poin" extra="Positif untuk menambah, negatif untuk mengurangi." rules={[{ required: true, message: 'Isi jumlah poin' }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="alasan" label="Alasan" rules={[{ required: true, whitespace: true, min: 3, message: 'Alasan wajib diisi' }]}>
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal open={!!tierMember} title={`Atur Tier — ${tierMember?.nama || ''}`} onCancel={() => setTierMember(null)} onOk={() => tierForm.submit()} confirmLoading={savingTier} okText="Simpan" cancelText="Batal" destroyOnHidden forceRender>
        <Alert type="info" showIcon message="Tier manual tetap berlaku sampai admin mengembalikannya ke mode otomatis." style={{ marginBottom: 16 }} />
        <Form form={tierForm} layout="vertical" onFinish={saveTier} requiredMark={false}>
          <Form.Item name="tier_id" label="Tier efektif" rules={[{ required: true, message: 'Pilih tier' }]}>
            <Select
              options={[
                { value: 'otomatis', label: 'Otomatis — mengikuti poin lifetime' },
                ...tierOptions,
              ]}
            />
          </Form.Item>
          <Form.Item name="alasan" label="Alasan" rules={[{ required: true, whitespace: true, min: 3, message: 'Alasan wajib diisi' }]}>
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
      {historyMember && <TierHistoryDrawer member={historyMember} onClose={() => setHistoryMember(null)} />}
    </>
  );
}
