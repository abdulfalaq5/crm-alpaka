import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Badge, Button, Layout, Menu } from 'antd';
import { AuditOutlined, FileDoneOutlined, GiftOutlined, LogoutOutlined, SettingOutlined, SwapOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useAuth } from '../auth';
import { useLoad } from '../hooks';

// Panel admin: tema sama, layout khas dashboard dengan sidebar (B0).
export default function AdminLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { data } = useLoad('/admin/summary', undefined, [pathname]);

  const items = [
    { key: '/admin/struk', icon: <FileDoneOutlined />, label: <Link to="/admin/struk">Antrean Struk <Badge count={data?.data.struk.menunggu_review || 0} size="small" /></Link> },
    { key: '/admin/redeem', icon: <SwapOutlined />, label: <Link to="/admin/redeem">Antrean Redeem <Badge count={data?.data.redeem.menunggu_persetujuan || 0} size="small" /></Link> },
    { key: '/admin/auto-approve', icon: <ThunderboltOutlined />, label: <Link to="/admin/auto-approve">Pengaturan Auto-Approve</Link> },
    { key: '/admin/pengaturan', icon: <SettingOutlined />, label: <Link to="/admin/pengaturan">Pengaturan Program</Link> },
    { key: '/admin/reward', icon: <GiftOutlined />, label: <Link to="/admin/reward">Reward</Link> },
    { key: '/admin/audit', icon: <AuditOutlined />, label: <Link to="/admin/audit">Log Audit</Link> },
  ];
  const selected = items.map((i) => i.key).filter((k) => pathname.startsWith(k));

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider
        breakpoint="lg"
        collapsedWidth={0}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={250}
        theme="light"
        style={{ borderRight: '1px solid var(--color-border)' }}
      >
        <div style={{ padding: '20px 24px' }}>
          <span className="brand">ALPAKA</span>
          <div className="section-label" style={{ marginTop: 4, marginBottom: 0 }}>Admin Panel</div>
        </div>
        <Menu mode="inline" items={items} selectedKeys={selected} style={{ borderInlineEnd: 0 }} />
      </Layout.Sider>
      <Layout style={{ background: 'var(--color-bg)' }}>
        <Layout.Header
          style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, padding: '0 16px' }}
        >
          <span style={{ color: 'var(--color-text-secondary)' }}>{user?.nama}</span>
          <Button
            icon={<LogoutOutlined />}
            onClick={() => {
              signOut();
              navigate('/admin/login');
            }}
          >
            Keluar
          </Button>
        </Layout.Header>
        <Layout.Content>
          <div className="container" style={{ maxWidth: 1200 }}>
            <Outlet />
          </div>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
