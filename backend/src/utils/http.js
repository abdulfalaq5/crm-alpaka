class AppError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code || 'ERROR';
    this.details = details;
  }
}

const badRequest = (msg, details) => new AppError(400, msg, 'BAD_REQUEST', details);
const unauthorized = (msg = 'Sesi tidak valid atau telah berakhir') =>
  new AppError(401, msg, 'UNAUTHORIZED');
const forbidden = (msg = 'Anda tidak memiliki akses') => new AppError(403, msg, 'FORBIDDEN');
const notFound = (msg = 'Data tidak ditemukan') => new AppError(404, msg, 'NOT_FOUND');
const conflict = (msg, code) => new AppError(409, msg, code || 'CONFLICT');
const unprocessable = (msg, details) => new AppError(422, msg, 'VALIDATION_ERROR', details);

// Bungkus handler async agar error otomatis diteruskan ke error middleware.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function parsePagination(query, defaultLimit = 20) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), 100);
  return { page, limit, offset: (page - 1) * limit };
}

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  unprocessable,
  asyncHandler,
  parsePagination,
};
