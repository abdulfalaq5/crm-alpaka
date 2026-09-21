// Draf syarat program & kebijakan privasi (OI-15). WAJIB ditinjau/diganti oleh Alpaka lewat
// Admin → Pengaturan Program sebelum go-live; seeder tidak menimpa teks yang sudah diubah.
const DRAFT = `SYARAT PROGRAM LOYALTY ALPAKA (DRAF — menunggu persetujuan pihak Alpaka)

1. Keanggotaan
Program terbuka bagi pelanggan yang mendaftar dengan data yang benar. Satu email atau nomor HP hanya untuk satu akun.

2. Perolehan poin
Poin diberikan atas struk/invoice pembelian produk Alpaka yang sah, diunggah dalam masa klaim, dan disetujui oleh tim Alpaka. Struk yang sama tidak dapat diklaim lebih dari sekali. Alpaka berhak menolak struk yang tidak jelas, tidak lengkap, atau tidak sah, dengan alasan yang disampaikan kepada member.

3. Penukaran poin
Poin dapat ditukar dengan reward yang tersedia. Poin ditahan sejak pengajuan dan dipotong setelah disetujui; bila ditolak atau dibatalkan, poin dikembalikan.

4. Perubahan program
Alpaka dapat mengubah aturan konversi poin, daftar reward, atau syarat program dengan pemberitahuan kepada member.

KEBIJAKAN PRIVASI (DRAF)

Data yang kami kumpulkan: nama, email/nomor HP, kata sandi (disimpan dalam bentuk terenkripsi/hash), serta struk dan riwayat transaksi yang Anda unggah. Data digunakan untuk menjalankan program loyalty: verifikasi struk, pencatatan poin, penukaran reward, dan pengiriman notifikasi. Data tidak dijual kepada pihak ketiga. Anda dapat meminta perubahan atau penghapusan data melalui kontak resmi Alpaka.`;

async function run(db) {
  await db.query(
    `INSERT INTO app_settings (key, value) VALUES ('terms_text', $1) ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify(DRAFT)]
  );
  return 'draf syarat & kebijakan privasi';
}

module.exports = { run };
