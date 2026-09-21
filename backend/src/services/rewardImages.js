const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { config } = require('../config');
const { unprocessable } = require('../utils/http');

const MAX_BYTES = 2 * 1024 * 1024;
const dir = () => path.join(config.uploadDir, 'rewards');

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

function detectMime(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1, fields: 5 } }).single('image');

/** Middleware multipart untuk gambar reward (JPG/PNG/WebP, maks 2 MB). */
function rewardImageUpload(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(unprocessable('Ukuran gambar maksimal 2 MB.', { image: 'Gambar terlalu besar' }));
    return next(err);
  });
}

/** Validasi isi file (bukan hanya ekstensi) lalu simpan dengan nama acak. */
async function saveRewardImage(file) {
  if (!file) throw unprocessable('Pilih file gambar.', { image: 'Gambar wajib dipilih' });
  const mime = detectMime(file.buffer);
  if (!mime) throw unprocessable('Format gambar harus JPG, PNG, atau WebP.', { image: 'Format tidak sesuai' });
  await fs.mkdir(dir(), { recursive: true });
  const name = `${crypto.randomUUID()}${EXT[mime]}`;
  await fs.writeFile(path.join(dir(), name), file.buffer, { flag: 'wx' });
  return { name, mime };
}

const removeRewardImage = (name) => (name ? fs.unlink(path.join(dir(), path.basename(name))).catch(() => {}) : Promise.resolve());
const rewardImagePath = (name) => path.join(dir(), path.basename(name));
const imageUrl = (r) => (r.gambar_file ? `/api/public/rewards/${r.id}/image?v=${r.gambar_file.slice(0, 8)}` : null);

module.exports = { rewardImageUpload, saveRewardImage, removeRewardImage, rewardImagePath, imageUrl };
