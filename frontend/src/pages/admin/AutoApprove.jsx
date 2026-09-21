import { useEffect, useState } from 'react';
import { Alert, Button, Form, InputNumber, Select, Switch, message } from 'antd';
import api, { errMsg } from '../../api';
import { useLoad } from '../../hooks';
import { rupiah } from '../../format';

// Pengaturan kriteria auto-approve (ADM-04, OI-05, BR-07).
export default function AutoApprove() {
  const { data, reload } = useLoad('/admin/auto-approve');
  const { data: cfg } = useLoad('/config');
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const watch = Form.useWatch([], form);

  useEffect(() => {
    if (!data) return;
    const by = Object.fromEntries(data.data.map((c) => [c.kode, c]));
    form.setFieldsValue({
      channel: { aktif: by.channel.aktif, channels: by.channel.nilai.channels },
      batas_nominal: { aktif: by.batas_nominal.aktif, maks: by.batas_nominal.nilai.maks },
    });
  }, [data, form]);

  const save = async (values) => {
    setSaving(true);
    try {
      await api.put('/admin/auto-approve', values);
      message.success('Pengaturan auto-approve disimpan.');
      reload();
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const active = [];
  if (watch?.channel?.aktif) active.push(`channel ${watch.channel.channels?.length ? watch.channel.channels.join(', ') : '(belum ada channel dipilih — tidak ada yang lolos)'}`);
  if (watch?.batas_nominal?.aktif) active.push(`nominal ≤ ${rupiah(watch.batas_nominal.maks)}`);

  return (
    <>
      <h1 className="page-title">Pengaturan Auto-Approve</h1>
      <p className="page-sub">Struk yang lolos validasi dan memenuhi <b>semua</b> kriteria aktif langsung disetujui tanpa review manual.</p>
      <Alert
        style={{ marginBottom: 16, maxWidth: 640 }}
        type={active.length ? 'warning' : 'info'}
        showIcon
        message={active.length ? `Auto-approve AKTIF: ${active.join(' dan ')}` : 'Auto-approve nonaktif — semua struk masuk antrean review manual.'}
      />
      <div className="card" style={{ maxWidth: 640 }}>
        <Form form={form} layout="vertical" onFinish={save}>
          <p className="section-label">Kriteria channel</p>
          <Form.Item name={['channel', 'aktif']} label="Aktifkan" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name={['channel', 'channels']} label="Channel yang disetujui otomatis">
            <Select mode="multiple" placeholder="Pilih channel" options={(cfg?.channels || []).map((c) => ({ value: c, label: c }))} />
          </Form.Item>
          <p className="section-label" style={{ marginTop: 24 }}>Kriteria batas nominal</p>
          <Form.Item name={['batas_nominal', 'aktif']} label="Aktifkan" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name={['batas_nominal', 'maks']} label="Nominal maksimal (Rp)" rules={[{ required: true, type: 'number', min: 1, message: 'Isi nominal lebih dari nol' }]}>
            <InputNumber style={{ width: '100%' }} controls={false} formatter={(v) => (v ? rupiah(v) : '')} parser={(v) => Number(String(v).replace(/[^\d]/g, '')) || ''} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>Simpan</Button>
        </Form>
      </div>
    </>
  );
}
