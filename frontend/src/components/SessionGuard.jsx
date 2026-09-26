import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal } from 'antd';
import api, { session, tokenExp, tokenTtl } from '../api';
import { useAuth } from '../auth';

// Jendela peringatan mengikuti validitas token, bukan angka tetap:
// 20% dari jendela sesi, dibatasi 15–120 detik. Kalau SESSION_IDLE_MINUTES kecil,
// dialog tidak akan muncul terus-menerus.
const WARN_MIN = 15;
const WARN_MAX = 120;
const WARN_RATIO = 0.2;
const PING_MIN_INTERVAL_MS = 5 * 60 * 1000;

const warnWindow = (ttl) => Math.min(WARN_MAX, Math.max(WARN_MIN, Math.round((ttl || 0) * WARN_RATIO)));

/** Sisa masa token dalam detik; null bila token tidak terbaca. */
function sisa(token) {
  const exp = tokenExp(token);
  return exp ? exp - Date.now() / 1000 : null;
}

// Peringatan sebelum sesi habis (idle), perpanjangan diam-diam saat ada aktivitas pengguna,
// dan logout otomatis saat token benar-benar kedaluwarsa.
export default function SessionGuard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [left, setLeft] = useState(null);
  const leftRef = useRef(null);
  const lastPing = useRef(0);

  const keLogin = useCallback(() => navigate(user?.role === 'admin' ? '/admin/login' : '/masuk', { replace: true }), [navigate, user?.role]);

  // Permintaan biasa sudah memperpanjang sesi lewat header X-Refresh-Token (interceptor api).
  // Pings berikut hanya untuk aktivitas yang tidak memicu permintaan API (klik, scroll, ketik).
  const ping = useCallback(() => {
    lastPing.current = Date.now();
    return api.get('/auth/me', { headers: { 'X-Keepalive': '1' } }).then(() => true).catch((err) => {
      // 401 berarti token sudah tidak berlaku: langsung putuskan sesi, jangan biarkan user terkunci di dialog.
      if (err.response?.status === 401) signOut(true);
      return false;
    });
  }, [signOut]);

  const stay = useCallback(async () => {
    if (await ping()) setLeft(null);
  }, [ping]);

  useEffect(() => {
    if (!user) {
      leftRef.current = null;
      setLeft(null);
      return undefined;
    }
    const tick = () => {
      const token = session.get()?.token;
      const secs = sisa(token);
      if (secs === null) return;
      if (secs <= 0) {
        signOut(true);
        keLogin();
        return;
      }
      const next = secs <= warnWindow(tokenTtl(token)) ? Math.round(secs) : null;
      leftRef.current = next;
      setLeft(next);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [user, signOut, keLogin]);

  // Aktivitas nyata (klik/ketik) = aktivitas: perpanjang sesi diam-diam, tanpa dialog.
  useEffect(() => {
    if (!user) return undefined;
    const onActivity = () => {
      if (leftRef.current !== null) return; // dialog sedang terbuka → biarkan pengguna memilih
      const token = session.get()?.token;
      const secs = sisa(token);
      const ttl = tokenTtl(token);
      if (secs === null || !ttl) return;
      if (secs < ttl / 2 && Date.now() - lastPing.current > PING_MIN_INTERVAL_MS) ping();
    };
    window.addEventListener('pointerdown', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity);
    return () => {
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
    };
  }, [user, ping]);

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
