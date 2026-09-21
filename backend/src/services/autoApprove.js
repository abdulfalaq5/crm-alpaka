// Evaluasi kriteria auto-approve (ADM-04, OI-05, BR-07). Fungsi murni.
// Struk hanya disetujui otomatis bila ada minimal satu kriteria aktif dan SEMUA kriteria aktif terpenuhi.
function evaluateAutoApprove(criteria, receipt) {
  const active = criteria.filter((c) => c.aktif);
  if (!active.length) return false;
  return active.every((c) => {
    if (c.kode === 'channel') {
      const channels = c.nilai.channels || [];
      return channels.length > 0 && channels.includes(receipt.channel);
    }
    if (c.kode === 'batas_nominal') {
      return Number(receipt.nominal) <= Number(c.nilai.maks);
    }
    return false; // kriteria tak dikenal: jangan setujui otomatis
  });
}

module.exports = { evaluateAutoApprove };
