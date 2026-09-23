const { forbidden } = require('../utils/http');

/**
 * RBAC admin (tambahan.md poin 6): super_admin (semua akses), approver (operasional harian:
 * review struk/redeem, tidak bisa ubah pengaturan/kelola admin), viewer (hanya baca).
 * Dipasang SETELAH authenticate('admin') — req.user.adminRole sudah tersedia (lihat middleware/auth.js).
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.adminRole)) return next(forbidden(`Peran '${req.user.adminRole}' tidak memiliki akses ke aksi ini`));
    next();
  };
}

const writeAccess = requireRole('super_admin', 'approver'); // approve/reject/reward/voucher, dll — bukan pengaturan sistem
const superOnly = requireRole('super_admin'); // pengaturan program, kelola admin, aturan poin

module.exports = { requireRole, writeAccess, superOnly };
