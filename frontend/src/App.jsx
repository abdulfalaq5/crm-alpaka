import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { App as AntApp, ConfigProvider, Spin } from 'antd';
import idID from 'antd/locale/id_ID';
import { AuthProvider, RequireRole } from './auth';
import MemberLayout from './layouts/MemberLayout';
import AdminLayout from './layouts/AdminLayout';
import SessionGuard from './components/SessionGuard';
import Login from './pages/member/Login';

const Register = lazy(() => import('./pages/member/Register'));
const ForgotPassword = lazy(() => import('./pages/member/ForgotPassword'));
const Dashboard = lazy(() => import('./pages/member/Dashboard'));
const ReceiptUpload = lazy(() => import('./pages/member/ReceiptUpload'));
const ReceiptList = lazy(() => import('./pages/member/ReceiptList'));
const ReceiptDetail = lazy(() => import('./pages/member/ReceiptDetail'));
const Redeem = lazy(() => import('./pages/member/Redeem'));
const Notifications = lazy(() => import('./pages/member/Notifications'));
const Profile = lazy(() => import('./pages/member/Profile'));
const ReceiptQueue = lazy(() => import('./pages/admin/ReceiptQueue'));
const ReceiptReview = lazy(() => import('./pages/admin/ReceiptReview'));
const RedeemQueue = lazy(() => import('./pages/admin/RedeemQueue'));
const RedeemReview = lazy(() => import('./pages/admin/RedeemReview'));
const AutoApprove = lazy(() => import('./pages/admin/AutoApprove'));
const ProgramSettings = lazy(() => import('./pages/admin/ProgramSettings'));
const Rewards = lazy(() => import('./pages/admin/Rewards'));
const AuditLog = lazy(() => import('./pages/admin/AuditLog'));
const Members = lazy(() => import('./pages/admin/Members'));
const Tiers = lazy(() => import('./pages/admin/Tiers'));
const Vouchers = lazy(() => import('./pages/admin/Vouchers'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const Admins = lazy(() => import('./pages/admin/Admins'));

// Token desain dari FRONTEND.md (Bagian 0): monokrom, banyak whitespace, border tipis, radius 4px.
const theme = {
  token: {
    colorPrimary: '#171717',
    colorBgLayout: '#faf9f7',
    colorBgContainer: '#ffffff',
    colorText: '#171717',
    colorTextSecondary: '#6b6b68',
    colorBorder: '#e4e1dc',
    colorSuccess: '#3f7a56',
    colorWarning: '#b8862e',
    colorError: '#b23b3b',
    borderRadius: 4,
    fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
    fontSize: 15,
  },
  components: {
    Button: { primaryShadow: 'none', defaultShadow: 'none' },
    Menu: { itemSelectedBg: '#efece7', itemSelectedColor: '#171717', itemHoverBg: '#f5f3ef' },
  },
};

export default function App() {
  return (
    <ConfigProvider theme={theme} locale={idID}>
      <AntApp>
        <AuthProvider>
          <BrowserRouter>
            <SessionGuard />
            <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}><Spin /></div>}>
            <Routes>
              <Route path="/masuk" element={<Login />} />
              <Route path="/daftar" element={<Register />} />
              <Route path="/lupa-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ForgotPassword reset />} />

              <Route element={<RequireRole role="member"><MemberLayout /></RequireRole>}>
                <Route index element={<Dashboard />} />
                <Route path="upload" element={<ReceiptUpload />} />
                <Route path="struk" element={<ReceiptList />} />
                <Route path="struk/:id" element={<ReceiptDetail />} />
                <Route path="redeem" element={<Redeem />} />
                <Route path="notifikasi" element={<Notifications />} />
                <Route path="profil" element={<Profile />} />
              </Route>

              <Route path="/admin/login" element={<Login admin />} />
              <Route path="/admin" element={<RequireRole role="admin"><AdminLayout /></RequireRole>}>
                <Route index element={<AdminDashboard />} />
                <Route path="struk" element={<ReceiptQueue />} />
                <Route path="struk/:id" element={<ReceiptReview />} />
                <Route path="redeem" element={<RedeemQueue />} />
                <Route path="redeem/:id" element={<RedeemReview />} />
                <Route path="auto-approve" element={<AutoApprove />} />
                <Route path="pengaturan" element={<ProgramSettings />} />
                <Route path="reward" element={<Rewards />} />
                <Route path="tier" element={<Tiers />} />
                <Route path="voucher" element={<Vouchers />} />
                <Route path="member" element={<Members />} />
                <Route path="kelola-admin" element={<Admins />} />
                <Route path="audit" element={<AuditLog />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
}
