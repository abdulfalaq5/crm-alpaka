import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, DatePicker, Form, Input, InputNumber, Select, Upload, App } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api, { errMsg, fieldErrors } from '../../api';
import { useLoad } from '../../hooks';
import { rupiah } from '../../format';

const OK_EXT = ['.jpg', '.jpeg', '.png', '.pdf'];

// Upload struk/invoice (UPL-01..05). Dengan ?ulang=<id> halaman ini menjadi form pengajuan ulang (UPL-07).
export default function ReceiptUpload() {
  const { message } = App.useApp();
  const [params] = useSearchParams();
  const resubmitId = params.get('ulang');
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const { data: cfg } = useLoad('/config');
  const { data: old } = useLoad(resubmitId ? `/receipts/${resubmitId}` : '/config');
  const [fileList, setFileList] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const previous = resubmitId ? old?.data : null;
  useEffect(() => {
    if (previous) form.setFieldsValue({ channel: previous.channel });
  }, [previous, form]);

  const maxMb = cfg?.max_file_size_mb || 5;
  const maxFiles = cfg?.max_files || 3;

  // Validasi sisi client sebelum submit (selaras UPL-04 / OI-07); server tetap memvalidasi ulang.
  const beforeUpload = (file) => {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!OK_EXT.includes(ext)) {
      message.error(`"${file.name}" bukan JPG, PNG, atau PDF.`);
      return Upload.LIST_IGNORE;
    }
    if (file.size > maxMb * 1024 * 1024) {
      message.error(`"${file.name}" melebihi ${maxMb} MB.`);
      return Upload.LIST_IGNORE;
    }
    if (fileList.length >= maxFiles) {
      message.error(`Maksimal ${maxFiles} file per pengajuan.`);
      return Upload.LIST_IGNORE;
    }
    return false; // jangan upload otomatis; dikirim bersama form
  };

  const onFinish = async (values) => {
    if (!fileList.length) {
      form.setFields([{ name: 'files', errors: ['Unggah minimal satu file bukti'] }]);
      return;
    }
    setSaving(true);
    setError(null);
    const body = new FormData();
    body.append('channel', values.channel);
    body.append('nomor_transaksi', values.nomor_transaksi);
    body.append('tanggal_transaksi', values.tanggal_transaksi.format('YYYY-MM-DD'));
    body.append('nominal', values.nominal);
    fileList.forEach((f) => body.append('files', f.originFileObj));
    try {
      const { data } = await api.post(resubmitId ? `/receipts/${resubmitId}/resubmit` : '/receipts', body);
      if (data.data.status === 'ditolak') message.warning('Struk ditolak otomatis. Lihat alasannya di halaman detail.', 6);
      else message.success('Struk berhasil diajukan.');
      navigate(`/struk/${data.data.id}`);
    } catch (err) {
      if (err.response?.status === 422) form.setFields(fieldErrors(err));
      setError(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h1 className="page-title">{resubmitId ? 'Ajukan Ulang Struk' : 'Upload Struk'}</h1>
      <p className="page-sub">Isi data transaksi dan unggah bukti (JPG, PNG, atau PDF).</p>
      {previous && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`Struk ${previous.nomor_transaksi} ditolak`}
          description={`Alasan: ${previous.alasan_penolakan}. Perbaiki data atau unggah bukti baru.`}
        />
      )}
      <div className="card" style={{ maxWidth: 640 }}>
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="channel" label="Channel" rules={[{ required: true, message: 'Pilih channel' }]}>
            <Select size="large" placeholder="Pilih channel" options={(cfg?.channels || []).map((c) => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.Item name="nomor_transaksi" label="Nomor transaksi / invoice" rules={[{ required: true, whitespace: true, message: 'Nomor transaksi wajib diisi' }]}>
            <Input size="large" maxLength={80} />
          </Form.Item>
          <Form.Item name="tanggal_transaksi" label="Tanggal transaksi" rules={[{ required: true, message: 'Tanggal wajib diisi' }]}
            extra={cfg ? `Maksimal ${cfg.claim_window_days} hari sejak tanggal transaksi.` : null}>
            <DatePicker
              size="large"
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              disabledDate={(d) => d.isAfter(dayjs(), 'day')}
            />
          </Form.Item>
          <Form.Item
            name="nominal"
            label="Nominal transaksi (Rp)"
            rules={[{ required: true, message: 'Nominal wajib diisi' }, { type: 'number', min: 1, message: 'Nominal harus lebih dari nol' }]}
          >
            <InputNumber
              size="large"
              style={{ width: '100%' }}
              controls={false}
              formatter={(v) => (v ? rupiah(v) : '')}
              parser={(v) => Number(String(v).replace(/[^\d]/g, '')) || ''}
            />
          </Form.Item>
          <Form.Item name="files" label="Bukti struk / invoice" extra={`JPG, PNG, atau PDF. Maks ${maxMb} MB per file, ${maxFiles} file.`}>
            <Upload.Dragger
              multiple
              accept=".jpg,.jpeg,.png,.pdf"
              listType="picture"
              fileList={fileList}
              beforeUpload={beforeUpload}
              onChange={({ fileList: next }) => setFileList(next)}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p>Tarik file ke sini atau klik untuk memilih</p>
            </Upload.Dragger>
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={saving}>
            {resubmitId ? 'Kirim Ulang' : 'Kirim Struk'}
          </Button>
        </Form>
      </div>
    </>
  );
}
