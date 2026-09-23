import { useEffect, useState } from 'react';
import { App, Button, Form, Input, InputNumber, Modal, Table } from 'antd';
import api, { errMsg, fieldErrors } from '../../api';
import { useLoad } from '../../hooks';
import { num } from '../../format';
import EmptyState from '../../components/EmptyState';

// Master data tier (tambahan.md poin 1): nama, urutan, threshold poin, benefit.
export default function Tiers() {
  const { message } = App.useApp();
  const { data, loading, reload } = useLoad('/admin/tiers');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const open = (tier) => { setEditing(tier); form.setFieldsValue({ nama: '', urutan: (data?.data.length || 0) + 1, min_poin: 0, benefit: '', ...tier }); };

  const save = async (values) => {
    setSaving(true);
    try {
      if (editing.id) await api.put(`/admin/tiers/${editing.id}`, values);
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
    } catch (err) {
      message.error(errMsg(err));
    }
    reload();
  };

  return (
    <>
      <h1 className="page-title">Tier & Progress</h1>
      <p className="page-sub">Tier dievaluasi otomatis dari total poin lifetime member setiap poin bertambah.</p>
      <Button type="primary" style={{ marginBottom: 16 }} onClick={() => open({})}>Tambah Tier</Button>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data?.data || []}
        pagination={false}
        locale={{ emptyText: <EmptyState text="Belum ada tier" /> }}
        columns={[
          { title: 'Urutan', dataIndex: 'urutan', width: 80 },
          { title: 'Nama', dataIndex: 'nama' },
          { title: 'Min. poin', dataIndex: 'min_poin', render: num, align: 'right' },
          { title: 'Benefit', dataIndex: 'benefit', responsive: ['md'] },
          {
            title: '',
            render: (_, r) => (
              <div className="actions">
                <Button size="small" onClick={() => open(r)}>Ubah</Button>
                <Button size="small" danger onClick={() => remove(r.id)}>Hapus</Button>
              </div>
            ),
          },
        ]}
      />
      <Modal open={!!editing} title={editing?.id ? 'Ubah Tier' : 'Tambah Tier'} onCancel={() => setEditing(null)} onOk={() => form.submit()} confirmLoading={saving} okText="Simpan" cancelText="Batal" destroyOnHidden forceRender>
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <Form.Item name="nama" label="Nama tier" rules={[{ required: true, whitespace: true, message: 'Nama wajib diisi' }]}><Input maxLength={60} /></Form.Item>
          <Form.Item name="urutan" label="Urutan (1 = terendah)" rules={[{ required: true, type: 'number', min: 1, message: 'Isi urutan' }]}><InputNumber style={{ width: '100%' }} min={1} /></Form.Item>
          <Form.Item name="min_poin" label="Minimum poin lifetime" rules={[{ required: true, type: 'number', min: 0, message: 'Isi minimum poin' }]}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Form.Item name="benefit" label="Benefit"><Input.TextArea rows={2} maxLength={1000} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
