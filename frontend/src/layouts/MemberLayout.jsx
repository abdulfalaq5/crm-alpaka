import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, Dropdown, Layout, Menu } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { useAuth } from '../auth';
import NotificationBell from '../components/NotificationBell';

const NAV = [
  { key: '/', label: <Link to="/">Dashboard</Link> },
  { key: '/upload', label: <Link to="/upload">Upload Struk</Link> },
  { key: '/struk', label: <Link to="/struk">Riwayat Struk</Link> },
  { key: '/redeem', label: <Link to="/redeem">Redeem</Link> },
  { key: '/voucher', label: <Link to="/voucher">Voucher</Link> },
  { key: '/notifikasi', label: <Link to="/notifikasi">Notifikasi</Link> },
];

export default function MemberLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const selected = NAV.map((n) => n.key)
    .filter((k) => (k === '/' ? pathname === '/' : pathname.startsWith(k)))
    .slice(-1);

  const userMenu = {
    items: [
      { key: 'profil', label: 'Profil' },
      { key: 'keluar', label: 'Keluar' },
    ],
    onClick: ({ key }) => {
      if (key === 'profil') navigate('/profil');
      if (key === 'keluar') {
        signOut();
        navigate('/masuk');
      }
    },
  };

  return (
    <Layout style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <Layout.Header
        style={{
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '0 16px',
        }}
      >
        <Link to="/" className="brand">
          ALPAKA
        </Link>
        <Menu mode="horizontal" items={NAV} selectedKeys={selected} style={{ flex: 1, minWidth: 0, borderBottom: 0 }} />
        <NotificationBell />
        <Dropdown menu={userMenu} trigger={['click']}>
          <Button type="text" icon={<UserOutlined />} aria-label="Akun">
            <span className="hide-xs">{user?.nama?.split(' ')[0]}</span>
          </Button>
        </Dropdown>
      </Layout.Header>
      <Layout.Content>
        {/* Dashboard memakai kanvas lebar sesuai desain editorial; halaman lain tetap container standar. */}
        <div className={pathname === '/' ? 'container wide' : 'container'}>
          <Outlet />
        </div>
      </Layout.Content>
      <Layout.Footer style={{ textAlign: 'center', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 13 }}>
        © {new Date().getFullYear()} Alpaka — Program Loyalty
      </Layout.Footer>
    </Layout>
  );
}
