// Normalisasi nomor HP Indonesia ke format 628xxxxxxxxx agar keunikan identifier konsisten.
function normalizePhone(input) {
  if (!input) return null;
  let digits = String(input).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith('8')) digits = `62${digits}`;
  return /^62\d{8,13}$/.test(digits) ? digits : null;
}

module.exports = { normalizePhone };
