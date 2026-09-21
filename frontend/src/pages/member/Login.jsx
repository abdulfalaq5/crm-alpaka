import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Form, Input } from 'antd';
import { errMsg } from '../../api';
import { useAuth } from '../../auth';

// Login member (REG-04, REG-05). Mode admin memakai endpoint terpisah (REG-06).
export default function Login({ admin = false }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const onFinish = async (values) => {
    setLoading(true);
    setError(null);
    try {
      await login(admin ? '/auth/admin/login' : '/auth/login', values);
      navigate(location.state?.from || (admin ? '/admin' : '/'), { replace: true });
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
        <p className="section-label" style={{ textAlign: 'center' }}>{admin ? 'Login Admin' : 'Masuk'}</p>
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="identifier" label={admin ? 'Email' : 'Email atau nomor HP'} rules={[{ required: true, message: 'Wajib diisi' }]}>
            <Input size="large" autoComplete="username" autoFocus />
          </Form.Item>
          <Form.Item name="password" label="Kata sandi" rules={[{ required: true, message: 'Kata sandi wajib diisi' }]}>
            <Input.Password size="large" autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading}>
            Masuk
          </Button>
        </Form>
        {!admin && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <Link to="/lupa-password">Lupa password?</Link>
            <span>
              Belum punya akun? <Link to="/daftar">Daftar</Link>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
