import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Checkbox, Form, Input } from 'antd';
import { ArrowRightOutlined, CheckOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { errMsg } from '../../api';
import { useAuth } from '../../auth';

const HERO = new URL('../../assets/morello-editorial.jpg', import.meta.url).href;

// Teks per mode; mode admin memakai endpoint, label, dan copy yang sama (REG-06).
const COPY = {
  member: {
    kicker: 'Member space',
    heading: 'Selamat datang kembali',
    sub: 'Masuk untuk melihat poin, voucher, dan progres tier kamu.',
    identifier: 'Email atau nomor HP',
    placeholder: 'nama@email.com atau 08xxxxxxxxxx',
    remember: 'Ingat saya di perangkat ini',
    cta: 'Masuk ke member area Alpaka',
    asideKicker: 'Poin loyalitas',
    asideTitle: 'Hal baik datang bagi yang menjelajah.',
    asideLead: 'Kumpulkan poin dari setiap pembelian, tukarkan dengan hadiah pilihan, dan buka tier berikutnya.',
    asideFoot: 'Alpaka · member space',
  },
  admin: {
    kicker: 'Admin space',
    heading: 'Masuk sebagai admin',
    sub: 'Kelola antrean struk, redeem, reward, dan voucher Alpaka.',
    identifier: 'Email admin',
    placeholder: 'nama@alpaka.local',
    remember: 'Ingat saya di perangkat ini',
    cta: 'Masuk ke dashboard admin',
    asideKicker: 'Operasional',
    asideTitle: 'Satu ruang untuk seluruh antrean kerja.',
    asideLead: 'Tinjau struk dan redeem, terbitkan voucher, dan pantau tier member dari satu dashboard.',
    asideFoot: 'Alpaka · admin console',
  },
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sama seperti normalisasi backend (`backend/src/utils/phone.js`): 0/8/62 → 62, lalu 8–13 digit. */
function validPhone(value) {
  let d = String(value).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('0')) d = `62${d.slice(1)}`;
  else if (d.startsWith('8')) d = `62${d}`;
  return /^62\d{8,13}$/.test(d);
}

function identifierRule(admin) {
  return () => ({
    validator: (_, value) => {
      const v = (value || '').trim();
      if (!v) return Promise.reject(new Error(admin ? 'Email wajib diisi' : 'Email atau nomor HP wajib diisi'));
      if (v.includes('@')) return EMAIL.test(v) ? Promise.resolve() : Promise.reject(new Error('Format email belum benar'));
      if (admin) return Promise.reject(new Error('Gunakan email admin untuk masuk'));
      return validPhone(v) ? Promise.resolve() : Promise.reject(new Error('Format nomor HP belum benar'));
    },
  });
}

// Login member (REG-04, REG-05). Tampilan mengikuti referensi desain "More Rewards Hub" (morello-member-hub).
// Mode admin memakai endpoint terpisah (REG-06).
export default function Login({ admin = false }) {
  const { login, expired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(true);
  const [sukses, setSukses] = useState(false);
  const c = admin ? COPY.admin : COPY.member;
  const tujuan = location.state?.from || (admin ? '/admin' : '/');

  const onFinish = async (values) => {
    setLoading(true);
    setError(null);
    try {
      await login(admin ? '/auth/admin/login' : '/auth/login', values, { remember });
      setSukses(true);
      setTimeout(() => navigate(tujuan, { replace: true }), 600);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <aside className="auth-editorial">
        <img src={HERO} alt="Kurasi hadiah member Alpaka" />
        <div className="veil" />
        <div className="inner">
          <span className="brand light">Alpaka</span>
          <div>
            <p className="kicker">{c.asideKicker}</p>
            <h2>{c.asideTitle}</h2>
            <p className="lead">{c.asideLead}</p>
          </div>
          <p className="foot">{c.asideFoot}</p>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-topbar">
          <span className="brand only-lg-off">Alpaka</span>
          <span className="auth-topnote">Program loyalitas</span>
        </div>

        <div className="auth-panel soft-in">
          <p className="kicker">{c.kicker}</p>
          <h1>
            {c.heading}
            <span className="dot">.</span>
          </h1>
          <p className="sub">{c.sub}</p>

          {expired && !error && <Alert type="warning" showIcon message="Sesi Anda telah berakhir. Silakan masuk kembali." className="auth-alert" />}
          {error && <Alert type="error" showIcon message={error} className="auth-alert" />}

          {sukses ? (
            <div role="status" className="auth-ok">
              <CheckOutlined /> Berhasil masuk. Mengalihkan ke dashboard…
            </div>
          ) : (
            <Form layout="vertical" onFinish={onFinish} requiredMark={false} className="auth-form">
              <Form.Item name="identifier" label={c.identifier} rules={[identifierRule(admin)]}>
                <Input
                  size="large"
                  prefix={<MailOutlined className="field-ico" />}
                  placeholder={c.placeholder}
                  autoComplete="username"
                  autoFocus
                />
              </Form.Item>
              <Form.Item
                name="password"
                label="Kata sandi"
                className="has-extra"
                rules={[{ required: true, message: 'Kata sandi wajib diisi' }, { min: 6, message: 'Kata sandi minimal 6 karakter' }]}
                extra={
                  !admin ? (
                    <Link className="auth-forgot" to="/lupa-password">
                      Lupa kata sandi?
                    </Link>
                  ) : null
                }
              >
                <Input.Password
                  size="large"
                  prefix={<LockOutlined className="field-ico" />}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  iconRender={(visible) => (
                    <span className="field-eye" aria-label={visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}>
                      {visible ? 'Sembunyikan' : 'Lihat'}
                    </span>
                  )}
                />
              </Form.Item>

              <Form.Item className="auth-remember" valuePropName="checked" noStyle>
                <Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)}>
                  {c.remember}
                </Checkbox>
              </Form.Item>

              <Button type="primary" htmlType="submit" size="large" block loading={loading} className="auth-submit">
                {loading ? 'Memproses…' : c.cta}
                {!loading && <ArrowRightOutlined />}
              </Button>

              {!admin && (
                <p className="auth-alt">
                  Belum menjadi member? <Link to="/daftar">Daftar di sini</Link>
                </p>
              )}
            </Form>
          )}
        </div>

        <p className="auth-legal">Dengan masuk, kamu menyetujui syarat &amp; ketentuan serta kebijakan privasi Alpaka.</p>
      </main>
    </div>
  );
}
