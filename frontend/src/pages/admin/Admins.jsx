import { useState } from 'react';
import { App, Button, Form, Input, Modal, Popconfirm, Table } from 'antd';
import api, { errMsg, fieldErrors } from '../../api';
import { useAuth } from '../../auth';
import { useLoad } from '../../hooks';
import { fmtDate } from '../../format';
import StatusBadge from '../../components/StatusBadge';

// Manajemen admin (OI-13): semua admin berhak akses penuh (tidak ada peran bertingkat di Fase 1).
export default function Admins() {
  const { message } = App.useApp();
  const { user } = useAuth();
  const { data, loading, reload } = useLoad('/admin/admins');
  const [open, setOpen] = useState(false);
  const [resetFor, setResetFor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();

  const create = async (values) => {
    setSaving(true);
    try {
      await api.post('/admin/admins', values);
      message.success('Admin ditambahkan.');
      setOpen(false);
      form.resetFields();
      reload();
    } catch (err) {
      if (err.response?.status === 422) form.setFields(fieldErrors(err));
      else message.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const patch = async (id, body, ok) => {
    try {
      await api.patch(`/admin/admins/${id}`, body);
      message.success(ok);
      return true;
    } catch (err) {
      message.error(errMsg(err));
      return false;
    } finally {
      reload();
    }
  };

  const doReset = async ({ password }) => {
    if (await patch(resetFor.id, { password }, 'Kata sandi direset. Sesi admin tersebut telah keluar.')) {
      setResetFor(null);
      resetForm.resetFields();
    }
  };

  return (
    <>
      <h1 className="page-title">Kelola Admin</h1>
      <p className="page-sub">Semua admin memiliki akses penuh ke panel ini. Aksi tercatat di Log Audit.</p>
      <Button type="primary" style={{ marginBottom: 16 }} onClick={() => setOpen(true)}>Tambah Admin</Button>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data?.data || []}
        pagination={false}
        columns={[
          { title: 'Admin', render: (_, r) => <>{r.nama}<div className="cell-sub">{r.email}</div></> },
          { title: 'Dibuat', dataIndex: 'created_at', render: fmtDate, responsive: ['md'] },
          { title: 'Status', dataIndex: 'status', render: (s) => <StatusBadge status={s === 'aktif' ? 'disetujui' : 'dibatalkan'} label={s === 'aktif' ? 'Aktif' : 'Nonaktif'} />, responsive: ['sm'] },
          {
            title: '',
            render: (_, r) => (
              <div className="actions">
                <Button size="small" onClick={() => setResetFor(r)}>Reset sandi</Button>
                {r.status === 'aktif' ? (
                  <Popconfirm title="Nonaktifkan admin ini?" okText="Nonaktifkan" cancelText="Batal" onConfirm={() => patch(r.id, { status: 'nonaktif' }, 'Admin dinonaktifkan.')} disabled={String(r.id) === String(user?.id)}>
                    <Button size="small" danger disabled={String(r.id) === String(user?.id)}>Nonaktifkan</Button>
                  </Popconfirm>
                ) : (
                  <Button size="small" onClick={() => patch(r.id, { status: 'aktif' }, 'Admin diaktifkan.')}>Aktifkan</Button>
                )}
              </div>
            ),
          },
        ]}
      />
      <Modal open={open} title="Tambah Admin" okText="Simpan" cancelText="Batal" onOk={() => form.submit()} onCancel={() => setOpen(false)} confirmLoading={saving} destroyOnHidden forceRender>
        <Form form={form} layout="vertical" onFinish={create} requiredMark={false}>
          <Form.Item name="nama" label="Nama" rules={[{ required: true, whitespace: true, message: 'Nama wajib diisi' }]}><Input /></Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Email valid wajib diisi' }]}><Input /></Form.Item>
          <Form.Item name="password" label="Kata sandi awal" rules={[{ required: true, min: 8, message: 'Minimal 8 karakter' }]}><Input.Password autoComplete="new-password" /></Form.Item>
        </Form>
      </Modal>
      <Modal open={!!resetFor} title={`Reset kata sandi — ${resetFor?.nama || ''}`} okText="Reset" cancelText="Batal" onOk={() => resetForm.submit()} onCancel={() => setResetFor(null)} destroyOnHidden forceRender>
        <Form form={resetForm} layout="vertical" onFinish={doReset} requiredMark={false}>
          <Form.Item name="password" label="Kata sandi baru" rules={[{ required: true, min: 8, message: 'Minimal 8 karakter' }]}><Input.Password autoComplete="new-password" /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
