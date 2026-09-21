const nodemailer = require('nodemailer');
const { config } = require('../config');

let transporter;

const enabled = () => config.mail.mailer === 'smtp' && Boolean(config.mail.host);

function getTransporter() {
  if (!transporter) {
    const { host, port, user, password } = config.mail;
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // port lain (mis. 2525 Mailtrap) memakai STARTTLS bila ditawarkan
      auth: user ? { user, pass: password } : undefined,
    });
  }
  return transporter;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Bungkus teks pesan dengan template HTML sederhana bergaya monokrom Alpaka. */
function renderHtml({ title, body, link, linkLabel }) {
  return `<!doctype html><html><body style="margin:0;background:#faf9f7;font-family:Helvetica,Arial,sans-serif;color:#171717">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="font-weight:700;letter-spacing:0.28em;font-size:16px;margin-bottom:24px">ALPAKA</div>
    <div style="background:#fff;border:1px solid #e4e1dc;border-radius:4px;padding:24px">
      <h2 style="margin:0 0 12px;font-size:18px">${escapeHtml(title)}</h2>
      <p style="margin:0 0 20px;line-height:1.55">${escapeHtml(body)}</p>
      ${link ? `<a href="${escapeHtml(link)}" style="display:inline-block;background:#171717;color:#fff;text-decoration:none;padding:10px 18px;border-radius:4px;font-size:14px">${escapeHtml(linkLabel || 'Buka Alpaka')}</a>` : ''}
    </div>
    <p style="color:#6b6b68;font-size:12px;margin-top:16px">Email otomatis dari Sistem Loyalty Alpaka. Mohon tidak membalas email ini.</p>
  </div></body></html>`;
}

// Email dikirim satu per satu dengan jeda minimum (lihat MAIL_INTERVAL_MS) agar tidak kena rate limit SMTP.
let queue = Promise.resolve();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sendMail(message) {
  const job = queue.then(() => deliver(message));
  queue = job.catch(() => {}).then(() => sleep(config.mail.intervalMs));
  return job;
}

/** Kirim email. Melempar error bila SMTP gagal; pemanggil yang memutuskan cara menanganinya. */
async function deliver({ to, subject, title, body, link, linkLabel }) {
  const { fromName, fromAddress } = config.mail;
  const text = `${body}${link ? `\n\n${linkLabel || 'Buka'}: ${link}` : ''}\n\n— Alpaka Loyalty`;
  return getTransporter().sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to,
    subject,
    text,
    html: renderHtml({ title: title || subject, body, link, linkLabel }),
  });
}

module.exports = { enabled, sendMail };
