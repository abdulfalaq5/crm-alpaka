import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal } from 'antd';
import api, { session, tokenExp } from '../api';
import { useAuth } from '../auth';

const WARN_SECONDS = 120;

// Peringatan sebelum sesi habis (idle) dan logout otomatis saat token kedaluwarsa.
export default function SessionGuard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [left, setLeft] = useState(null);

  useEffect(() => {
    if (!user) {
      setLeft(null);
      return undefined;
    }
    const tick = () => {
      const exp = tokenExp(session.get()?.token);
      if (!exp) return;
      const secs = Math.round(exp - Date.now() / 1000);
      if (secs <= 0) {
        signOut(true);
        navigate(user.role === 'admin' ? '/admin/login' : '/masuk', { replace: true });
      } else {
        setLeft(secs <= WARN_SECONDS ? secs : null);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [user, signOut, navigate]);

  // Permintaan biasa memperpanjang sesi lewat header X-Refresh-Token (ditangani interceptor api).
  const stay = () => api.get('/auth/me', { headers: { 'X-Keepalive': '1' } }).then(() => setLeft(null)).catch(() => {});

  const mm = left !== null ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '';
  return (
    <Modal
      open={left !== null}
      title="Sesi akan berakhir"
      closable={false}
      maskClosable={false}
      keyboard={false}
      footer={[
        <Button key="out" onClick={() => { signOut(); navigate(user?.role === 'admin' ? '/admin/login' : '/masuk'); }}>Keluar</Button>,
        <Button key="stay" type="primary" onClick={stay}>Tetap masuk</Button>,
      ]}
    >
      Karena tidak ada aktivitas, sesi Anda berakhir dalam <b>{mm}</b>. Pilih “Tetap masuk” untuk melanjutkan.
    </Modal>
  );
}
