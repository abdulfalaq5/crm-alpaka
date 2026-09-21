/**
 * Layanan notifikasi (NTF). Setiap kanal adalah "provider" terpisah.
 * - in_app  : selalu aktif; disimpan ke tabel notifications dalam transaksi yang sama dengan perubahan status,
 *             sehingga sistem tetap berfungsi tanpa layanan pihak ketiga (NTF-05).
 * - whatsapp: aktif bila WA_API_URL diisi (gateway HTTP generik) dan member punya no. HP.
 * - email   : aktif bila MAIL_HOST diisi di .env dan member punya email. Baris kanal 'email' dicatat
 *             ('menunggu') dalam transaksi, lalu dikirim SETELAH commit dan statusnya diperbarui
 *             menjadi 'terkirim' / 'gagal'. Kegagalan SMTP tidak pernah membatalkan proses bisnis.
 * Member dapat mematikan email/WhatsApp lewat preferensi notifikasi; in-app tidak bisa dimatikan.
 * Untuk kanal baru (mis. SMS, OI-08) cukup tambahkan provider ke `externalChannels`.
 */
const { pool } = require('../db/pool');
const { config } = require('../config');
const mailer = require('./mailer');
const whatsapp = require('./whatsapp');

const EVENTS = {
  struk_disetujui: 'Struk disetujui',
  struk_ditolak: 'Struk ditolak',
  redeem_diajukan: 'Redeem diajukan',
  redeem_disetujui: 'Redeem disetujui',
  redeem_ditolak: 'Redeem ditolak',
};

const LINKS = { receipt: (id) => `/struk/${id}`, redeem: () => '/redeem' };

const emailChannel = {
  kanal: 'email',
  aktif: mailer.enabled,
  alamat: (member) => (member.notif_email ? member.email : null),
  kirim: (to, n) =>
    mailer.sendMail({
      to,
      subject: `[Alpaka] ${EVENTS[n.jenis] || 'Notifikasi'}`,
      title: EVENTS[n.jenis] || 'Notifikasi',
      body: n.isi,
      link: `${config.appUrl}${n.referensiTipe ? LINKS[n.referensiTipe](n.referensiId) : '/notifikasi'}`,
      linkLabel: 'Lihat di Alpaka',
    }),
};
const whatsappChannel = {
  kanal: 'whatsapp',
  aktif: whatsapp.enabled,
  alamat: (member) => (member.notif_whatsapp ? member.no_hp : null),
  kirim: (to, n) => whatsapp.sendWhatsapp(to, `[Alpaka] ${EVENTS[n.jenis] || 'Notifikasi'}\n${n.isi}\n${config.appUrl}`),
};
// Tambahkan provider kanal baru (SMS, dll.) di sini; logic inti tidak perlu diubah.
const externalChannels = [emailChannel, whatsappChannel];

async function markStatus(id, status) {
  await pool.query('UPDATE notifications SET status_kirim = $2 WHERE id = $1', [id, status]).catch(() => {});
}

async function notify(client, { memberId, jenis, isi, referensiTipe = null, referensiId = null }) {
  const { rows } = await client.query(
    `INSERT INTO notifications (member_id, jenis_kejadian, isi, kanal, status_kirim, referensi_tipe, referensi_id)
     VALUES ($1, $2, $3, 'in_app', 'terkirim', $4, $5) RETURNING *`,
    [memberId, jenis, isi, referensiTipe, referensiId]
  );
  const notification = rows[0];

  const active = externalChannels.filter((c) => c.aktif());
  if (active.length) {
    const { rows: m } = await client.query('SELECT email, no_hp, notif_email, notif_whatsapp FROM members WHERE id = $1', [memberId]);
    for (const channel of active) {
      const to = channel.alamat(m[0]);
      if (!to) continue;
      const { rows: r } = await client.query(
        `INSERT INTO notifications (member_id, jenis_kejadian, isi, kanal, status_kirim, referensi_tipe, referensi_id)
         VALUES ($1, $2, $3, $4, 'menunggu', $5, $6) RETURNING id`,
        [memberId, jenis, isi, channel.kanal, referensiTipe, referensiId]
      );
      const send = async () => {
        try {
          await channel.kirim(to, { jenis, isi, referensiTipe, referensiId });
          await markStatus(r[0].id, 'terkirim');
        } catch (err) {
          console.error(`[notif:${channel.kanal}] gagal kirim ke ${to}: ${err.message}`);
          await markStatus(r[0].id, 'gagal');
        }
      };
      if (client.afterCommit) client.afterCommit.push(send);
      else send();
    }
  }
  return notification;
}

module.exports = { notify, EVENTS };
