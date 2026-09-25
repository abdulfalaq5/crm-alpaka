import { useState } from 'react';
import { Alert, App, Button, Form, Input, InputNumber, Modal, Popconfirm, Table } from 'antd';
import api, { errMsg, fieldErrors } from '../../api';
import { useAdminRole } from '../../auth';
import { useLoad } from '../../hooks';
import { num } from '../../format';
import EmptyState from '../../components/EmptyState';

export default function Tiers() {
  const { message } = App.useApp();
  const { isSuperAdmin } = useAdminRole();
  const { data, loading, error, reload } = useLoad('/admin/tiers');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const open = (tier) => {
    const tiers = [...(data?.data || [])].sort((a, b) => a.urutan - b.urutan);
    const last = tiers[tiers.length - 1];
    form.setFieldsValue({
      nama: '',
      urutan: (last?.urutan || 0) + 1,
      min_poin: last ? Number(last.min_poin) + 1 : 0,
      benefit: '',
      ...tier,
    });
    setEditing(tier);
  };

  const save = async (values) => {
    setSaving(true);
    try {
      if (editing?.id) await api.put(`/admin/tiers/${editing.id}`, values);
      else await api.post('/admin/tiers', values);
      message.success('Tier disimpan.');
      setEditing(null);
      reload();
    } catch (err) {
      if (err.response?.status === 422) form.setFields(fieldErrors(err));
      else message.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/admin/tiers/${id}`);
      message.success('Tier dihapus.');
      reload();
    } catch (err) {
      message.error(errMsg(err));
    }
  };

  const columns = [
    { title: 'Urutan', dataIndex: 'urutan', width: 80 },
    { title: 'Nama', dataIndex: 'nama' },
    { title: 'Min. poin', dataIndex: 'min_poin', render: num, align: 'right' },
    { title: 'Benefit', dataIndex: 'benefit', responsive: ['md'] },
  ];
  if (isSuperAdmin) {
    columns.push({
      title: '',
      render: (_, row) => (
        <div className="actions">
          <Button size="small" onClick={() => open(row)}>Ubah</Button>
          <Popconfirm title="Hapus tier ini?" description="Tier hanya dapat dihapus jika tidak pernah digunakan." okText="Hapus" cancelText="Batal" onConfirm={() => remove(row.id)}>
            <Button size="small" danger>Hapus</Button>
          </Popconfirm>
        </div>
      ),
    });
  }

  return (
    <>
      <h1 className="page-title">Tier & Progress</h1>
      <p className="page-sub">Atur nama, urutan, minimum poin lifetime, dan benefit setiap tier.</p>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Alert type="info" showIcon message="Urutan dan minimum poin harus sama-sama meningkat. Perubahan pada keduanya langsung mengevaluasi ulang tier member otomatis." style={{ marginBottom: 16 }} />
      {isSuperAdmin && <Button type="primary" style={{ marginBottom: 16 }} onClick={() => open({})}>Tambah Tier</Button>}
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data?.data || []}
        pagination={false}
        locale={{ emptyText: <EmptyState text="Belum ada tier" /> }}
        columns={columns}
      />
      <Modal open={!!editing} title={editing?.id ? 'Ubah Tier' : 'Tambah Tier'} onCancel={() => setEditing(null)} onOk={() => form.submit()} confirmLoading={saving} okText="Simpan" cancelText="Batal" destroyOnHidden forceRender>
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <Form.Item name="nama" label="Nama tier" rules={[{ required: true, whitespace: true, message: 'Nama wajib diisi' }]}><Input maxLength={60} /></Form.Item>
          <Form.Item name="urutan" label="Urutan (1 = terendah)" rules={[{ required: true, type: 'number', min: 1, message: 'Isi urutan' }]}><InputNumber style={{ width: '100%' }} min={1} precision={0} /></Form.Item>
          <Form.Item name="min_poin" label="Minimum poin lifetime" rules={[{ required: true, type: 'number', min: 0, message: 'Isi minimum poin' }]}><InputNumber style={{ width: '100%' }} min={0} precision={0} /></Form.Item>
          <Form.Item name="benefit" label="Benefit"><Input.TextArea rows={2} maxLength={1000} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
