import { useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Switch, Table, Upload, App } from 'antd';
import api, { errMsg, fieldErrors } from '../../api';
import { useLoad } from '../../hooks';
import { num } from '../../format';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';

// Manajemen reward sederhana (RDM-07, OI-09). Reward tidak dihapus, hanya dinonaktifkan, agar riwayat redeem utuh.
export default function Rewards() {
  const { message } = App.useApp();
  const { data, loading, reload } = useLoad('/admin/rewards');
  const [editing, setEditing] = useState(null); // null | {} (baru) | reward
  const [saving, setSaving] = useState(false);
  const [pendingImage, setPendingImage] = useState(null); // File terpilih yang diunggah setelah reward tersimpan
  const [form] = Form.useForm();

  const open = (reward) => {
    setEditing(reward);
    setPendingImage(null);
    form.setFieldsValue({ nama: '', deskripsi: '', poin_dibutuhkan: undefined, aktif: true, ...reward });
  };

  const save = async (values) => {
    setSaving(true);
    try {
      const { data: saved } = editing.id ? await api.put(`/admin/rewards/${editing.id}`, values) : await api.post('/admin/rewards', values);
      if (pendingImage) {
        const body = new FormData();
        body.append('image', pendingImage);
        await api.post(`/admin/rewards/${saved.data.id}/image`, body);
      }
      message.success('Reward disimpan.');
      setEditing(null);
      reload();
    } catch (err) {
      if (err.response?.status === 422) form.setFields(fieldErrors(err));
      else message.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h1 className="page-title">Reward</h1>
      <p className="page-sub">Daftar reward yang dapat ditukar member.</p>
      <Button type="primary" style={{ marginBottom: 16 }} onClick={() => open({})}>Tambah Reward</Button>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data?.data || []}
        pagination={false}
        scroll={{ x: 560 }}
        locale={{ emptyText: <EmptyState text="Belum ada reward" /> }}
        columns={[
          { title: '', dataIndex: 'gambar_url', width: 64, render: (u) => (u ? <img src={u} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} /> : null) },
          { title: 'Nama', dataIndex: 'nama' },
          { title: 'Deskripsi', dataIndex: 'deskripsi' },
          { title: 'Poin', dataIndex: 'poin_dibutuhkan', render: num, align: 'right' },
          { title: 'Status', dataIndex: 'aktif', render: (a) => (a ? <StatusBadge status="disetujui" /> : <StatusBadge status="dibatalkan" />), responsive: ['sm'] },
          { title: '', render: (_, r) => <Button size="small" onClick={() => open(r)}>Ubah</Button> },
        ]}
      />
      <Modal open={!!editing} title={editing?.id ? 'Ubah Reward' : 'Tambah Reward'} onCancel={() => setEditing(null)} onOk={() => form.submit()} confirmLoading={saving} okText="Simpan" cancelText="Batal" destroyOnClose forceRender>
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <Form.Item name="nama" label="Nama reward" rules={[{ required: true, whitespace: true, message: 'Nama wajib diisi' }]}><Input maxLength={120} /></Form.Item>
          <Form.Item name="deskripsi" label="Deskripsi"><Input.TextArea rows={3} maxLength={500} /></Form.Item>
          <Form.Item name="poin_dibutuhkan" label="Poin dibutuhkan" rules={[{ required: true, type: 'number', min: 1, message: 'Isi poin (minimal 1)' }]}><InputNumber style={{ width: '100%' }} min={1} /></Form.Item>
          <Form.Item label="Gambar (opsional)" extra="JPG, PNG, atau WebP, maks 2 MB.">
            <Upload
              accept=".jpg,.jpeg,.png,.webp"
              maxCount={1}
              listType="picture"
              beforeUpload={(file) => {
                if (file.size > 2 * 1024 * 1024) { message.error('Ukuran gambar maksimal 2 MB.'); return Upload.LIST_IGNORE; }
                setPendingImage(file);
                return false;
              }}
              onRemove={() => setPendingImage(null)}
            >
              <Button>Pilih gambar</Button>
            </Upload>
            {editing?.gambar_url && !pendingImage && (
              <div style={{ marginTop: 8 }}>
                <img src={editing.gambar_url} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 4 }} />
                <div>
                  <Button size="small" danger type="link" onClick={async () => { await api.delete(`/admin/rewards/${editing.id}/image`).catch(() => {}); setEditing(null); reload(); }}>Hapus gambar</Button>
                </div>
              </div>
            )}
          </Form.Item>
          <Form.Item name="aktif" label="Aktif (tampil ke member)" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
