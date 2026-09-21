// Validasi transaksi otomatis (VAL-01..VAL-04). Fungsi murni agar mudah diuji.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Tanggal hari ini (YYYY-MM-DD) pada zona waktu tertentu. */
function todayIn(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

const rupiah = (n) => `Rp${Number(n).toLocaleString('id-ID')}`;

/**
 * @param data      { channel, nomor_transaksi, tanggal_transaksi (YYYY-MM-DD), nominal }
 * @param ctx       { channels, claimWindowDays, minNominal, today (YYYY-MM-DD), duplikat (bool) }
 * @returns { lulus, alasan[], checks }
 */
function validateReceipt(data, ctx) {
  const checks = {};
  const alasan = [];
  const record = (nama, lulus, pesan) => {
    checks[nama] = { lulus, pesan };
    if (!lulus) alasan.push(pesan);
  };

  const lengkap = Boolean(
    data.channel && data.nomor_transaksi && data.tanggal_transaksi && Number.isFinite(data.nominal)
  );
  if (!lengkap) {
    record('kelengkapan', false, 'Data wajib belum lengkap.');
  } else if (!ctx.channels.includes(data.channel)) {
    record('kelengkapan', false, 'Channel tidak termasuk daftar channel resmi.');
  } else {
    record('kelengkapan', true, 'Data lengkap.');
  }

  if (ctx.duplikat) {
    record(
      'duplikat',
      false,
      'Struk duplikat: kombinasi channel dan nomor transaksi ini sudah diajukan dan masih menunggu review atau sudah disetujui.'
    );
  } else {
    record('duplikat', true, 'Tidak ada duplikat.');
  }

  const selisih = daysBetween(data.tanggal_transaksi, ctx.today);
  if (selisih < 0) {
    record('tanggal', false, 'Tanggal transaksi tidak boleh di masa depan.');
  } else if (selisih > ctx.claimWindowDays) {
    record('tanggal', false, `Tanggal transaksi melewati batas masa klaim (${ctx.claimWindowDays} hari).`);
  } else {
    record('tanggal', true, 'Tanggal transaksi valid.');
  }

  if (!(data.nominal > 0)) {
    record('nominal', false, 'Nominal harus lebih dari nol.');
  } else if (data.nominal < ctx.minNominal) {
    record('nominal', false, `Nominal di bawah batas minimal ${rupiah(ctx.minNominal)}.`);
  } else {
    record('nominal', true, 'Nominal valid.');
  }

  return { lulus: alasan.length === 0, alasan, checks };
}

module.exports = { validateReceipt, todayIn, daysBetween };
