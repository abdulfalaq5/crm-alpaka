import { useEffect, useState } from 'react';
import { Alert, App, Button, Form, Input, Switch } from 'antd';
import api, { errMsg, fieldErrors } from '../../api';
import { useAuth } from '../../auth';
import { useLoad } from '../../hooks';

// Profil dasar, ganti kata sandi (REG-07), dan preferensi notifikasi (OI-08).
export default function Profile() {
  const { message } = App.useApp();
  const { user, updateUser, replaceToken } = useAuth();
  const [form] = Form.useForm();
  const [pwForm] = Form.useForm();
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const { data: me } = useLoad('/auth/me');
  const { data: cfg } = useLoad('/config');
  const [prefs, setPrefs] = useState({ notif_email: true, notif_whatsapp: true });

  useEffect(() => {
    form.setFieldsValue({ nama: user?.nama, email: user?.email, no_hp: user?.no_hp });
  }, [user, form]);

  useEffect(() => {
    if (me) setPrefs({ notif_email: me.user.notif_email, notif_whatsapp: me.user.notif_whatsapp });
  }, [me]);

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
      const { data } = await api.post('/member/password', { password_lama, password_baru });
      replaceToken(data.token); // sesi lain dicabut; sesi ini memakai token baru
      message.success('Kata sandi diubah. Sesi di perangkat lain telah keluar.');
      pwForm.resetFields();
    } catch (err) {
      if (err.response?.status === 422) pwForm.setFields(fieldErrors(err));
      else message.error(errMsg(err));
    }
  };

  const savePrefs = async (next) => {
    const before = prefs;
    setPrefs(next);
    try {
      await api.patch('/member/notification-prefs', next);
      message.success('Preferensi notifikasi disimpan.');
    } catch (err) {
      setPrefs(before);
      message.error(errMsg(err));
    }
  };

  const ch = cfg?.notification_channels || {};
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
        <p className="section-label">Preferensi notifikasi</p>
        <div className="pref-row"><span>Di dalam aplikasi</span><Switch checked disabled aria-label="Notifikasi in-app" /></div>
        <div className="pref-row">
          <span>Email{!ch.email && <small> — belum tersedia</small>}</span>
          <Switch checked={prefs.notif_email} disabled={!ch.email} aria-label="Notifikasi email" onChange={(v) => savePrefs({ ...prefs, notif_email: v })} />
        </div>
        <div className="pref-row">
          <span>WhatsApp{!ch.whatsapp && <small> — belum tersedia</small>}</span>
          <Switch checked={prefs.notif_whatsapp} disabled={!ch.whatsapp} aria-label="Notifikasi WhatsApp" onChange={(v) => savePrefs({ ...prefs, notif_whatsapp: v })} />
        </div>
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
