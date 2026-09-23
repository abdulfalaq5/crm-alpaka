const express = require('express');
const Joi = require('joi');
const { pool } = require('../db/pool');
const { config } = require('../config');
const { requireMoreApiKey } = require('../middleware/apiKey');
const { validate } = require('../utils/validate');
const { normalizePhone } = require('../utils/phone');
const receipts = require('../services/receipts');
const vouchersService = require('../services/vouchers');
const { asyncHandler, AppError } = require('../utils/http');

/**
 * Integrasi More by Morello (tambahan.md poin 4 & 5): implementasi DEFAULT yang bisa langsung dipakai
 * tanpa menunggu spesifikasi resmi dari tim More — format payload/response di sini sengaja sederhana
 * (JSON datar) dan mudah disesuaikan begitu kontrak API mereka dikonfirmasi.
 *
 * Autentikasi: header `X-Api-Key` (lihat middleware/apiKey.js). Semua request dicatat ke
 * `integration_logs` untuk audit & troubleshooting. Idempotency: field `external_id` / `order_id`
 * yang sama pada endpoint yang sama tidak diproses dua kali (dilindungi constraint unik di database).
 */
const router = express.Router();
router.use(requireMoreApiKey);

async function logCall({ endpoint, requestId, payload, statusKode, hasil, error }) {
  await pool
    .query(
      `INSERT INTO integration_logs (integrasi, arah, endpoint, request_id, status_kode, payload, hasil, error)
       VALUES ('more', 'masuk', $1, $2, $3, $4, $5, $6)
       ON CONFLICT (integrasi, endpoint, request_id) WHERE request_id IS NOT NULL DO NOTHING`,
      [endpoint, requestId || null, statusKode, JSON.stringify(payload), JSON.stringify(hasil || {}), error || null]
    )
    .catch((err) => console.error('[integrations:more] gagal mencatat log:', err.message));
}

const wrap = (endpoint, getRequestId) =>
  asyncHandler(async (req, res, next) => {
    const requestId = getRequestId(req.body);
    try {
      const result = await req.handler(req, res);
      await logCall({ endpoint, requestId, payload: req.body, statusKode: result.status, hasil: result.body });
      res.status(result.status).json(result.body);
    } catch (err) {
      const status = err instanceof AppError ? err.status : 500;
      await logCall({ endpoint, requestId, payload: req.body, statusKode: status, error: err.message });
      next(err);
    }
  });

// ---- 4. Transaksi → poin otomatis ----
const transactionSchema = Joi.object({
  external_id: Joi.string().trim().min(1).max(100).required(),
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }),
  no_hp: Joi.string().trim().max(20),
  channel: Joi.string().trim().max(60).default('More by Morello'),
  nominal: Joi.number().positive().required(),
  tanggal_transaksi: Joi.string().isoDate().required(),
}).or('email', 'no_hp');

router.post(
  '/transaction',
  (req, res, next) => {
    req.handler = async () => {
      const v = validate(transactionSchema, req.body);
      const byEmail = Boolean(v.email);
      const no_hp = v.no_hp ? normalizePhone(v.no_hp) : null;
      if (v.no_hp && !no_hp) return { status: 422, body: { error: { code: 'VALIDATION_ERROR', message: 'Format no_hp tidak valid' } } };

      const { rows } = await pool.query(
        `SELECT id FROM members WHERE ${byEmail ? 'lower(email) = $1' : 'no_hp = $1'}`,
        [byEmail ? v.email : no_hp]
      );
      if (!rows.length) {
        // OI terbuka (tambahan.md poin 4): auto-register vs tolak. Default: TOLAK — aktifkan MORE_AUTO_REGISTER=true bila Client memutuskan auto-register.
        if (!config.more.autoRegisterUnknownMember) {
          return { status: 422, body: { error: { code: 'MEMBER_NOT_FOUND', message: 'Member belum terdaftar di program loyalty Alpaka.' } } };
        }
        return { status: 501, body: { error: { code: 'NOT_IMPLEMENTED', message: 'Auto-register member dari integrasi belum diimplementasikan.' } } };
      }

      try {
        const result = await receipts.submitFromIntegration({
          memberId: rows[0].id, channel: v.channel, nomorTransaksi: v.external_id, tanggal: v.tanggal_transaksi.slice(0, 10), nominal: v.nominal,
        });
        return { status: 201, body: { status: 'diterima', receipt_id: String(result.receiptId), poin_diberikan: result.poin } };
      } catch (err) {
        if (err instanceof AppError && err.code === 'DUPLICATE') {
          return { status: 200, body: { status: 'sudah_diproses', message: err.message } }; // idempotent: sukses, tidak diproses ulang
        }
        throw err;
      }
    };
    next();
  },
  wrap('/transaction', (b) => b?.external_id)
);

// ---- 5. Validasi & redeem voucher saat checkout ----
const voucherSchema = Joi.object({ kode: Joi.string().trim().max(24).required(), order_id: Joi.string().trim().min(1).max(80).required() });

router.post(
  '/voucher/validate',
  (req, res, next) => {
    req.handler = async () => {
      const v = validate(voucherSchema, req.body);
      const voucher = await vouchersService.reserveForCheckout({ kode: v.kode.toUpperCase(), orderId: v.order_id });
      return {
        status: 200,
        body: { valid: true, kode: voucher.kode, reward: voucher.reward_nama, berlaku_sampai: voucher.reserved_until },
      };
    };
    next();
  },
  wrap('/voucher/validate', (b) => b?.order_id)
);

router.post(
  '/voucher/redeem',
  (req, res, next) => {
    req.handler = async () => {
      const v = validate(voucherSchema, req.body);
      const voucher = await vouchersService.confirmUsed({ kode: v.kode.toUpperCase(), orderId: v.order_id });
      return { status: 200, body: { status: 'used', kode: voucher.kode, used_at: voucher.used_at } };
    };
    next();
  },
  wrap('/voucher/redeem', (b) => b?.order_id)
);

module.exports = { router };
