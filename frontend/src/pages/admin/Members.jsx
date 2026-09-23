import { useState } from 'react';
import { Alert, App, Form, Input, InputNumber, Modal, Popconfirm, Select, Table, Button } from 'antd';
import api, { errMsg, fieldErrors } from '../../api';
import { useLoad } from '../../hooks';
import { fmtDate, num } from '../../format';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';

// Daftar member + saldo; admin dapat menonaktifkan/mengaktifkan akun (mencabut sesi seketika).
export default function Members() {
  const { message } = App.useApp();
  const [adjusting, setAdjusting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useLoad('/admin/members', { page, limit: 15, ...filters }, [page, JSON.stringify(filters)]);

  const adjustPoints = async (values) => {
    setSaving(true);
    try {
      await api.post(`/admin/members/${adjusting.id}/points`, values);
      message.success('Poin disesuaikan.');
      setAdjusting(null);
      form.resetFields();
    } catch (err) {
      if (err.response?.status === 422) form.setFields(fieldErrors(err));
      else message.error(errMsg(err));
    } finally {
      setSaving(false);
      reload();
    }
  };

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
          { title: 'Member', render: (_, r) => <>{r.nama}<div className="cell-sub">{r.email || r.no_hp}</div></> },
          { title: 'Bergabung', dataIndex: 'created_at', render: fmtDate, responsive: ['md'] },
          { title: 'Struk', dataIndex: 'jumlah_struk', align: 'right', responsive: ['md'] },
          { title: 'Total', dataIndex: 'total', render: num, align: 'right', responsive: ['sm'] },
          { title: 'Tersedia', dataIndex: 'tersedia', render: num, align: 'right' },
          { title: 'Status', dataIndex: 'status_akun', render: (s) => <StatusBadge status={s === 'aktif' ? 'disetujui' : 'dibatalkan'} label={s === 'aktif' ? 'Aktif' : 'Nonaktif'} />, responsive: ['sm'] },
          {
            title: '',
            render: (_, r) => (
              <div className="actions">
                <Button size="small" onClick={() => setAdjusting(r)}>Sesuaikan poin</Button>
                {r.status_akun === 'aktif' ? (
                  <Popconfirm title="Nonaktifkan akun ini?" description="Member langsung keluar dan tidak bisa masuk lagi." okText="Nonaktifkan" cancelText="Batal" onConfirm={() => setStatus(r.id, 'nonaktif')}>
                    <Button size="small" danger>Nonaktifkan</Button>
                  </Popconfirm>
                ) : (
                  <Button size="small" onClick={() => setStatus(r.id, 'aktif')}>Aktifkan</Button>
                )}
              </div>
            ),
          },
        ]}
      />
      <Modal open={!!adjusting} title={`Sesuaikan Poin — ${adjusting?.nama || ''}`} onCancel={() => setAdjusting(null)} onOk={() => form.submit()} confirmLoading={saving} okText="Simpan" cancelText="Batal" destroyOnHidden forceRender>
        <Form form={form} layout="vertical" onFinish={adjustPoints} requiredMark={false}>
          <Form.Item name="jumlah" label="Jumlah poin" extra="Positif untuk menambah, negatif untuk mengurangi." rules={[{ required: true, message: 'Isi jumlah poin' }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="alasan" label="Alasan" rules={[{ required: true, whitespace: true, min: 3, message: 'Alasan wajib diisi' }]}>
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
