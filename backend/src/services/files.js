const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { config } = require('../config');
const { pool } = require('../db/pool');
const { getSettings } = require('./settings');
const { unprocessable } = require('../utils/http');

// Tipe file bukti yang diizinkan (UPL-04): JPG, PNG, PDF. Dicek lewat ekstensi DAN isi file (magic bytes).
const ALLOWED_EXT = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf' };

const MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'application/pdf': '.pdf' };

function detectMime(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (buf.length > 4 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

/** Middleware multipart: batas ukuran & jumlah file diambil dari pengaturan (OI-07). */
async function receiptUpload(req, res, next) {
  try {
    const s = await getSettings(pool);
    const maxMb = s.max_file_size_mb;
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: maxMb * 1024 * 1024, files: s.max_files, fields: 20, fieldSize: 10 * 1024 },
    }).array('files', s.max_files);

    upload(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(unprocessable(`Ukuran file melebihi batas ${maxMb} MB per file.`, { files: 'Ukuran file terlalu besar' }));
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
        return next(unprocessable(`Jumlah file melebihi batas ${s.max_files} file per pengajuan.`, { files: 'Terlalu banyak file' }));
      }
      return next(err);
    });
  } catch (err) {
    next(err);
  }
}

/** Validasi file hasil upload; melempar 422 dengan pesan jelas bila tidak sesuai. */
function checkFiles(files) {
  if (!files || !files.length) {
    throw unprocessable('Bukti transaksi wajib diunggah (JPG, PNG, atau PDF).', { files: 'File bukti wajib diunggah' });
  }
  return files.map((f) => {
    const ext = path.extname(f.originalname || '').toLowerCase();
    const mime = detectMime(f.buffer);
    if (!ALLOWED_EXT[ext] || !mime || ALLOWED_EXT[ext] !== mime) {
      throw unprocessable(`File "${path.basename(f.originalname || 'file')}" tidak valid. Hanya JPG, PNG, atau PDF yang diterima.`, {
        files: 'Format file tidak sesuai',
      });
    }
    return {
      buffer: f.buffer,
      nama_asli: path.basename(f.originalname).slice(0, 255),
      mime,
      ukuran: f.size,
      ext: MIME_EXT[mime],
    };
  });
}

/** Simpan file dengan nama acak (bukan nama asli) di luar folder publik (UPL-05, NFR-02). */
async function saveFiles(checked) {
  await fs.mkdir(config.uploadDir, { recursive: true });
  const saved = [];
  try {
    for (const f of checked) {
      const nama_file = `${crypto.randomUUID()}${f.ext}`;
      await fs.writeFile(path.join(config.uploadDir, nama_file), f.buffer, { flag: 'wx' });
      saved.push({ nama_file, nama_asli: f.nama_asli, mime: f.mime, ukuran: f.ukuran });
    }
  } catch (err) {
    await removeFiles(saved);
    throw err;
  }
  return saved;
}

async function removeFiles(saved) {
  await Promise.all(saved.map((f) => fs.unlink(path.join(config.uploadDir, f.nama_file)).catch(() => {})));
}

const filePath = (nama_file) => path.join(config.uploadDir, path.basename(nama_file));

module.exports = { receiptUpload, checkFiles, saveFiles, removeFiles, filePath };
