const multer = require('multer');
const { AppError } = require('../utils/http');
const { config } = require('../config');

const notFoundHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan' } });
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    return res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof multer.MulterError) {
    return res.status(422).json({ error: { code: 'UPLOAD_ERROR', message: err.message } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'JSON tidak valid' } });
  }
  console.error(err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: config.isProd ? 'Terjadi kesalahan pada server' : err.message,
    },
  });
};

module.exports = { notFoundHandler, errorHandler };
