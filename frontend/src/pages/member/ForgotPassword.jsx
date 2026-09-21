import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Form, Input } from 'antd';
import api, { errMsg } from '../../api';

// Pemulihan akses (REG-07): minta tautan reset, lalu atur kata sandi baru. Satu komponen, dua mode.
export default function ForgotPassword({ reset = false }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const onFinish = async (values) => {
    setLoading(true);
    setError(null);
    try {
      if (reset) {
        await api.post('/auth/reset-password', { token: params.get('token') || '', password: values.password });
        navigate('/masuk', { replace: true });
      } else {
        const { data } = await api.post('/auth/forgot-password', values);
        setMsg(data.message);
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <span className="brand">ALPAKA</span>
        <p className="section-label" style={{ textAlign: 'center' }}>{reset ? 'Kata Sandi Baru' : 'Lupa Password'}</p>
        {msg && <Alert type="success" showIcon message={msg} style={{ marginBottom: 16 }} />}
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          {reset ? (
            <Form.Item name="password" label="Kata sandi baru" rules={[{ required: true, min: 8, message: 'Kata sandi minimal 8 karakter' }]}>
              <Input.Password size="large" autoComplete="new-password" />
            </Form.Item>
          ) : (
            <Form.Item name="identifier" label="Email atau nomor HP" rules={[{ required: true, message: 'Wajib diisi' }]}>
              <Input size="large" />
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit" size="large" block loading={loading}>
            {reset ? 'Simpan kata sandi' : 'Kirim instruksi'}
          </Button>
        </Form>
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Link to="/masuk">Kembali ke halaman masuk</Link>
        </div>
      </div>
    </div>
  );
}
