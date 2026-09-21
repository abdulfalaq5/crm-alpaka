import { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, message } from 'antd';
import api, { errMsg, fieldErrors } from '../../api';
import { useAuth } from '../../auth';

// Profil dasar & ganti kata sandi (REG-07).
export default function Profile() {
  const { user, updateUser } = useAuth();
  const [form] = Form.useForm();
  const [pwForm] = Form.useForm();
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    form.setFieldsValue({ nama: user?.nama, email: user?.email, no_hp: user?.no_hp });
  }, [user, form]);

  const saveProfile = async (values) => {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.patch('/member/profile', values);
      updateUser(data.user);
      message.success('Profil diperbarui.');
    } catch (err) {
      if (err.response?.status === 422) form.setFields(fieldErrors(err));
      setError(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async ({ password_lama, password_baru }) => {
    try {
      await api.post('/member/password', { password_lama, password_baru });
      message.success('Kata sandi diubah.');
      pwForm.resetFields();
    } catch (err) {
      if (err.response?.status === 422) pwForm.setFields(fieldErrors(err));
      else message.error(errMsg(err));
    }
  };

  return (
    <>
      <h1 className="page-title">Profil</h1>
      <p className="page-sub">Data dasar akun Anda.</p>
      <div className="card" style={{ maxWidth: 560 }}>
        <p className="section-label">Data akun</p>
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Form form={form} layout="vertical" onFinish={saveProfile} requiredMark={false}>
          <Form.Item name="nama" label="Nama" rules={[{ required: true, whitespace: true, message: 'Nama wajib diisi' }]}><Input /></Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Format email tidak valid' }]}><Input /></Form.Item>
          <Form.Item name="no_hp" label="Nomor HP"><Input /></Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>Simpan</Button>
        </Form>
      </div>
      <div className="card" style={{ maxWidth: 560 }}>
        <p className="section-label">Ganti kata sandi</p>
        <Form form={pwForm} layout="vertical" onFinish={savePassword} requiredMark={false}>
          <Form.Item name="password_lama" label="Kata sandi lama" rules={[{ required: true, message: 'Wajib diisi' }]}><Input.Password autoComplete="current-password" /></Form.Item>
          <Form.Item name="password_baru" label="Kata sandi baru" rules={[{ required: true, min: 8, message: 'Minimal 8 karakter' }]}><Input.Password autoComplete="new-password" /></Form.Item>
          <Button htmlType="submit">Ubah kata sandi</Button>
        </Form>
      </div>
    </>
  );
}
