import { useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Popconfirm, Select, Table, App } from 'antd';
import api, { errMsg, fieldErrors } from '../../api';
import { useLoad } from '../../hooks';
import EmptyState from '../../components/EmptyState';

const money = { style: { width: '100%' }, controls: false, min: 0, formatter: (v) => (v ? `Rp${Number(v).toLocaleString('id-ID')}` : ''), parser: (v) => Number(String(v).replace(/[^\d]/g, '')) || 0 };

// Parameter program yang bisa diubah tanpa ubah kode: konversi poin, masa klaim, batas file, channel.
export default function ProgramSettings() {
  const { message } = App.useApp();
  const { data, reload } = useLoad('/admin/settings');
  const { data: channelRules, reload: reloadChannelRules } = useLoad('/admin/point-rules/channel');
  const [chForm] = Form.useForm();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) form.setFieldsValue(data.data); }, [data, form]);

  const save = async (values) => {
    setSaving(true);
    try {
      await api.put('/admin/settings', values);
      message.success('Pengaturan disimpan.');
      reload();
    } catch (err) {
      if (err.response?.status === 422) form.setFields(fieldErrors(err));
      message.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const saveChannelRule = async (values) => {
    try {
      await api.put('/admin/point-rules/channel', values);
      message.success('Aturan channel disimpan.');
      chForm.resetFields();
      reloadChannelRules();
    } catch (err) {
      message.error(errMsg(err));
    }
  };

  const removeChannelRule = async (channel) => {
    await api.delete(`/admin/point-rules/channel/${encodeURIComponent(channel)}`).catch((err) => message.error(errMsg(err)));
    reloadChannelRules();
  };

  return (
    <>
      <h1 className="page-title">Pengaturan Program</h1>
      <p className="page-sub">Perubahan berlaku untuk pengajuan berikutnya.</p>
      <Form form={form} layout="vertical" onFinish={save} style={{ maxWidth: 640 }}>
        <div className="card">
          <p className="section-label">Aturan konversi poin</p>
          <Form.Item name={['point_rule', 'rupiah_per_poin']} label="Rupiah per 1 poin" rules={[{ required: true }]}><InputNumber {...money} min={1} /></Form.Item>
          <Form.Item name={['point_rule', 'pembulatan']} label="Pembulatan">
            <Select options={[{ value: 'bawah', label: 'Ke bawah' }, { value: 'atas', label: 'Ke atas' }, { value: 'terdekat', label: 'Terdekat' }]} />
          </Form.Item>
          <Form.Item name={['point_rule', 'minimal_transaksi']} label="Minimal transaksi untuk mendapat poin"><InputNumber {...money} /></Form.Item>
        </div>
        <div className="card">
          <p className="section-label">Validasi transaksi</p>
          <Form.Item name="claim_window_days" label="Batas masa klaim (hari sejak tanggal transaksi)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={1} max={3650} /></Form.Item>
          <Form.Item name="min_nominal" label="Nominal minimal per struk"><InputNumber {...money} /></Form.Item>
          <Form.Item name="channels" label="Channel resmi" rules={[{ required: true, type: 'array', min: 1, message: 'Minimal satu channel' }]}>
            <Select mode="tags" tokenSeparators={[',']} placeholder="Ketik nama channel lalu Enter" />
          </Form.Item>
        </div>
        <div className="card">
          <p className="section-label">Syarat program & kebijakan privasi</p>
          <Form.Item name="terms_text" extra="Tampil di halaman registrasi. Ganti draf ini dengan teks resmi dari Alpaka sebelum go-live.">
            <Input.TextArea rows={10} maxLength={20000} showCount />
          </Form.Item>
        </div>
        <div className="card">
          <p className="section-label">Upload bukti</p>
          <Form.Item name="max_file_size_mb" label="Ukuran maksimal per file (MB)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={1} max={20} /></Form.Item>
          <Form.Item name="max_files" label="Jumlah file maksimal per pengajuan" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={1} max={10} /></Form.Item>
        </div>
        <Button type="primary" htmlType="submit" loading={saving} style={{ marginTop: 16 }}>Simpan</Button>
      </Form>

      <div className="card" style={{ maxWidth: 640, marginTop: 24 }}>
        <p className="section-label">Aturan poin per channel (opsional)</p>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginTop: -8 }}>Menggantikan aturan global di atas untuk channel tertentu.</p>
        <Table
          rowKey="channel"
          size="small"
          pagination={false}
          dataSource={channelRules?.data || []}
          locale={{ emptyText: <EmptyState text="Belum ada override channel" /> }}
          columns={[
            { title: 'Channel', dataIndex: 'channel' },
            { title: 'Rp / poin', dataIndex: 'rupiah_per_poin' },
            { title: 'Pembulatan', dataIndex: 'pembulatan' },
            { title: '', render: (_, r) => <Popconfirm title="Hapus override ini?" okText="Hapus" cancelText="Batal" onConfirm={() => removeChannelRule(r.channel)}><Button size="small" danger>Hapus</Button></Popconfirm> },
          ]}
        />
        <Form form={chForm} layout="inline" onFinish={saveChannelRule} style={{ marginTop: 16, gap: 8, rowGap: 8 }}>
          <Form.Item name="channel" rules={[{ required: true, message: 'Channel' }]}><Input placeholder="Nama channel" style={{ width: 160 }} /></Form.Item>
          <Form.Item name="rupiah_per_poin" rules={[{ required: true, message: 'Rp/poin' }]}><InputNumber placeholder="Rp / poin" min={1} style={{ width: 130 }} /></Form.Item>
          <Form.Item name="pembulatan" initialValue="bawah"><Select style={{ width: 110 }} options={[{ value: 'bawah', label: 'Ke bawah' }, { value: 'atas', label: 'Ke atas' }, { value: 'terdekat', label: 'Terdekat' }]} /></Form.Item>
          <Form.Item name="minimal_transaksi" initialValue={0}><InputNumber placeholder="Minimal transaksi" min={0} style={{ width: 150 }} /></Form.Item>
          <Form.Item><Button htmlType="submit">Simpan Channel</Button></Form.Item>
        </Form>
      </div>
    </>
  );
}
