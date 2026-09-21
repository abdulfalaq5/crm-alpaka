import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Pagination } from 'antd';
import api from '../../api';
import { useLoad } from '../../hooks';
import { fmtDateTime } from '../../format';
import EmptyState from '../../components/EmptyState';

const LINK = { receipt: (id) => `/struk/${id}`, redeem: () => '/redeem' };

// Riwayat notifikasi in-app (NTF-01, NTF-02, NTF-04).
export default function Notifications() {
  const [page, setPage] = useState(1);
  const { data, error, reload } = useLoad('/member/notifications', { page, limit: 15 }, [page]);

  useEffect(() => {
    // Buka halaman = dianggap dibaca.
    if (data?.meta.belum_dibaca) api.post('/member/notifications/read', {}).catch(() => {});
  }, [data]);

  return (
    <>
      <h1 className="page-title">Notifikasi</h1>
      <p className="page-sub">Pembaruan status struk dan redeem Anda.</p>
      {error && <Alert type="error" showIcon message={error} />}
      <div className="card">
        {data?.data.length === 0 && <EmptyState text="Belum ada notifikasi" />}
        {data?.data.map((n) => (
          <div key={n.id} className={`notif-item ${n.dibaca_at ? '' : 'unread'}`}>
            <div>{n.isi}</div>
            <div className="when">
              {fmtDateTime(n.created_at)}
              {n.referensi_tipe && (
                <>
                  {' · '}
                  <Link to={LINK[n.referensi_tipe](n.referensi_id)}>Lihat</Link>
                </>
              )}
            </div>
          </div>
        ))}
        {data && data.meta.total > 15 && (
          <Pagination style={{ marginTop: 16 }} current={page} pageSize={15} total={data.meta.total} onChange={setPage} showSizeChanger={false} />
        )}
      </div>
      <Button style={{ marginTop: 12 }} onClick={reload}>Muat ulang</Button>
    </>
  );
}
