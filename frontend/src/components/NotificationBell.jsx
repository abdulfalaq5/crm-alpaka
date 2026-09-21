import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Popover } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import api, { BACKGROUND } from '../api';
import { fmtDateTime } from '../format';

// Ikon lonceng dengan badge jumlah belum dibaca (NTF-04).
export default function NotificationBell() {
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: res } = await api.get('/member/notifications', { params: { limit: 5 }, ...BACKGROUND });
      setData({ items: res.data, unread: res.meta.belum_dibaca });
    } catch {
      /* diam: badge hanya pelengkap */
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);

  const onOpenChange = async (next) => {
    setOpen(next);
    if (next) {
      await load();
    } else if (data.unread) {
      await api.post('/member/notifications/read', {}).catch(() => {});
      load();
    }
  };

  const content = (
    <div style={{ width: 300, maxWidth: '80vw' }}>
      {data.items.length === 0 && <div className="empty">Belum ada notifikasi</div>}
      {data.items.map((n) => (
        <div key={n.id} className={`notif-item ${n.dibaca_at ? '' : 'unread'}`}>
          <div>{n.isi}</div>
          <div className="when">{fmtDateTime(n.created_at)}</div>
        </div>
      ))}
      <div style={{ textAlign: 'center', paddingTop: 8 }}>
        <Link to="/notifikasi" onClick={() => setOpen(false)}>
          Lihat semua
        </Link>
      </div>
    </div>
  );

  return (
    <Popover content={content} trigger="click" placement="bottomRight" open={open} onOpenChange={onOpenChange}>
      <Badge count={data.unread} size="small" offset={[-2, 4]}>
        <Button type="text" aria-label="Notifikasi" icon={<BellOutlined style={{ fontSize: 18 }} />} />
      </Badge>
    </Popover>
  );
}
