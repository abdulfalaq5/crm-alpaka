// Pembuat file bukti dummy (PDF & PNG valid) tanpa dependensi, agar preview struk tampil saat demo.
const zlib = require('zlib');

const rupiah = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;
const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, '\\$&');

/** PDF satu halaman berisi teks struk (font Helvetica bawaan viewer). */
function makeReceiptPdf({ toko, nomor, tanggal, total }) {
  const items = [
    ['Tas Alpaka Urban', Math.round(total * 0.6)],
    ['Aksesoris & Perlengkapan', total - Math.round(total * 0.6)],
  ];
  const lines = [
    { text: toko, size: 16, y: 380 },
    { text: 'STRUK PEMBELIAN (DUMMY / DEMO)', size: 8, y: 366 },
    { text: `No. transaksi : ${nomor}`, size: 10, y: 340 },
    { text: `Tanggal       : ${tanggal}`, size: 10, y: 326 },
    { text: '------------------------------------------', size: 10, y: 312 },
    ...items.map(([n, v], i) => ({ text: `${n}`.padEnd(26) + rupiah(v).padStart(14), size: 9, y: 296 - i * 16 })),
    { text: '------------------------------------------', size: 10, y: 262 },
    { text: `TOTAL  ${rupiah(total)}`, size: 14, y: 240 },
    { text: 'Terima kasih telah berbelanja di Alpaka', size: 8, y: 200 },
  ];
  const content = `BT\n${lines.map((l) => `/F1 ${l.size} Tf 1 0 0 1 24 ${l.y} Tm (${ascii(l.text)}) Tj`).join('\n')}\nET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 420] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** PNG bergaya foto struk (kertas putih, baris teks abu-abu) — deterministik per seed. */
function makeReceiptPng(seedText) {
  const W = 300;
  const H = 420;
  let s = [...seedText].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
  const raw = Buffer.alloc((W * 3 + 1) * H, 255);
  const paint = (x0, x1, y0, y1, [r, g, b]) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * (W * 3 + 1) + 1 + x * 3;
        raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
      }
    }
  };
  for (let y = 0; y < H; y++) raw[y * (W * 3 + 1)] = 0; // filter: none
  paint(0, W, 0, H, [246, 244, 240]);
  paint(20, W - 20, 20, 60, [40, 40, 40]); // kepala struk
  for (let y = 84; y < 300; y += 16) paint(24, 24 + Math.round(60 + rnd() * 150), y, y + 6, [120 + Math.round(rnd() * 40), 120, 120]);
  paint(24, W - 24, 320, 322, [90, 90, 90]);
  paint(24, 150, 338, 352, [30, 30, 30]); // total
  paint(W - 110, W - 24, 338, 352, [30, 30, 30]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { makeReceiptPdf, makeReceiptPng };
