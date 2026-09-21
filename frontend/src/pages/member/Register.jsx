import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Checkbox, Form, Input, App } from 'antd';
import api, { errMsg, fieldErrors } from '../../api';
import { useAuth } from '../../auth';

// Registrasi member (REG-01..03, REG-08).
export default function Register() {
  const { modal } = App.useApp();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [error, setError] = useState(null);
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(false);
  const [terms, setTerms] = useState('');

  // Teks syarat & kebijakan privasi diatur admin (OI-15).
  useEffect(() => {
    api.get('/public/terms').then(({ data }) => setTerms(data.data.teks)).catch(() => {});
  }, []);

  const onFinish = async ({ konfirmasi, ...values }) => {
    setLoading(true);
    setError(null);
    setExists(false);
    try {
      const { data } = await api.post('/auth/register', values);
      signIn(data.token, data.user);
      navigate('/', { replace: true });
    } catch (err) {
      if (err.response?.data?.error?.code === 'IDENTIFIER_EXISTS') setExists(true);
      else if (err.response?.status === 422) form.setFields(fieldErrors(err));
      else setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const showTerms = (e) => {
    e.preventDefault();
    modal.info({
      title: 'Syarat Program & Kebijakan Privasi',
      width: 640,
      content: <div style={{ maxHeight: '60vh', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>{terms || 'Teks belum tersedia.'}</div>,
    });
  };

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <span className="brand">ALPAKA</span>
        <p className="section-label" style={{ textAlign: 'center' }}>Registrasi</p>
        {exists && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="Email atau nomor HP sudah terdaftar."
            description={<Link to="/masuk">Masuk ke akun Anda</Link>}
          />
        )}
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="nama" label="Nama lengkap" rules={[{ required: true, whitespace: true, message: 'Nama wajib diisi' }]}>
            <Input size="large" autoComplete="name" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Format email tidak valid' }]}>
            <Input size="large" autoComplete="email" />
          </Form.Item>
          <Form.Item name="no_hp" label="Nomor HP" extra="Isi email atau nomor HP (minimal salah satu).">
            <Input size="large" autoComplete="tel" placeholder="0812xxxxxxxx" />
          </Form.Item>
          <Form.Item name="password" label="Kata sandi" rules={[{ required: true, min: 8, message: 'Kata sandi minimal 8 karakter' }]}>
            <Input.Password size="large" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="konfirmasi"
            label="Ulangi kata sandi"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Ulangi kata sandi' },
              ({ getFieldValue }) => ({
                validator: (_, v) => (!v || getFieldValue('password') === v ? Promise.resolve() : Promise.reject(new Error('Kata sandi tidak sama'))),
              }),
            ]}
          >
            <Input.Password size="large" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="setuju_syarat"
            valuePropName="checked"
            rules={[{ validator: (_, v) => (v ? Promise.resolve() : Promise.reject(new Error('Anda harus menyetujui syarat program'))) }]}
          >
            <Checkbox>
              Saya menyetujui{' '}
              <a href="#syarat" onClick={showTerms}>
                syarat program &amp; kebijakan privasi
              </a>
            </Checkbox>
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading}>
            Daftar
          </Button>
        </Form>
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          Sudah punya akun? <Link to="/masuk">Masuk</Link>
        </div>
      </div>
    </div>
  );
}
