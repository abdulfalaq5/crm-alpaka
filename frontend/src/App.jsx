import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { App as AntApp, ConfigProvider } from 'antd';
import idID from 'antd/locale/id_ID';
import { AuthProvider, RequireRole } from './auth';
import MemberLayout from './layouts/MemberLayout';
import AdminLayout from './layouts/AdminLayout';
import Login from './pages/member/Login';
import Register from './pages/member/Register';
import ForgotPassword from './pages/member/ForgotPassword';
import Dashboard from './pages/member/Dashboard';
import ReceiptUpload from './pages/member/ReceiptUpload';
import ReceiptList from './pages/member/ReceiptList';
import ReceiptDetail from './pages/member/ReceiptDetail';
import Redeem from './pages/member/Redeem';
import Notifications from './pages/member/Notifications';
import Profile from './pages/member/Profile';
import ReceiptQueue from './pages/admin/ReceiptQueue';
import ReceiptReview from './pages/admin/ReceiptReview';
import RedeemQueue from './pages/admin/RedeemQueue';
import RedeemReview from './pages/admin/RedeemReview';
import AutoApprove from './pages/admin/AutoApprove';
import ProgramSettings from './pages/admin/ProgramSettings';
import Rewards from './pages/admin/Rewards';
import AuditLog from './pages/admin/AuditLog';

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
  components: { Button: { primaryShadow: 'none', defaultShadow: 'none' } },
};

export default function App() {
  return (
    <ConfigProvider theme={theme} locale={idID}>
      <AntApp>
        <AuthProvider>
          <BrowserRouter>
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
                <Route index element={<Navigate to="struk" replace />} />
                <Route path="struk" element={<ReceiptQueue />} />
                <Route path="struk/:id" element={<ReceiptReview />} />
                <Route path="redeem" element={<RedeemQueue />} />
                <Route path="redeem/:id" element={<RedeemReview />} />
                <Route path="auto-approve" element={<AutoApprove />} />
                <Route path="pengaturan" element={<ProgramSettings />} />
                <Route path="reward" element={<Rewards />} />
                <Route path="audit" element={<AuditLog />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
}
