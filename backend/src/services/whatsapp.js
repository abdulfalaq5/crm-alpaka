const { config } = require('../config');

const enabled = () => Boolean(config.whatsapp.url);

/**
 * Kirim pesan WhatsApp lewat gateway HTTP generik: POST JSON { to, message } dengan Bearer token.
 * Sesuaikan bentuk payload di sini bila penyedia yang dipilih Client (OI-08) memakai format lain.
 * Biaya layanan pihak ketiga bukan tanggungan Developer (NTF-05).
 */
async function sendWhatsapp(to, message) {
  const res = await fetch(config.whatsapp.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(config.whatsapp.token ? { authorization: `Bearer ${config.whatsapp.token}` } : {}),
    },
    body: JSON.stringify({ to, message }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Gateway WhatsApp membalas HTTP ${res.status}`);
}

module.exports = { enabled, sendWhatsapp };
