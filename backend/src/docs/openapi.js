/**
 * Spesifikasi OpenAPI 3.0 untuk API Sistem Loyalty Alpaka.
 * Ditampilkan sebagai Swagger UI di /api/docs (JSON: /api/docs.json).
 * Bila menambah/mengubah endpoint di routes/, perbarui juga file ini.
 */
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const str = (extra = {}) => ({ type: 'string', ...extra });
const int = (extra = {}) => ({ type: 'integer', ...extra });
const num = (extra = {}) => ({ type: 'number', ...extra });
const bool = (extra = {}) => ({ type: 'boolean', ...extra });
const obj = (properties, required) => ({ type: 'object', properties, ...(required ? { required } : {}) });
const arr = (items) => ({ type: 'array', items });
const json = (schema, example) => ({ 'application/json': { schema, ...(example ? { example } : {}) } });
const data = (schema) => obj({ data: schema });
const page = (schema, extraMeta = {}) => obj({ data: arr(schema), meta: obj({ page: int(), limit: int(), total: int(), ...extraMeta }) });

const idParam = (name = 'id', description = 'ID') => ({ name, in: 'path', required: true, description, schema: str({ example: '1' }) });
const q = (name, description, schema = str()) => ({ name, in: 'query', description, schema });
const pagingParams = [q('page', 'Halaman (mulai 1)', int({ default: 1 })), q('limit', 'Jumlah per halaman (maks 100)', int({ default: 20 }))];

const errorResponses = {
  400: { description: 'Permintaan tidak valid', content: json(ref('Error')) },
  401: { description: 'Belum login / sesi berakhir / token dicabut', content: json(ref('Error')) },
  403: { description: 'Tidak memiliki akses (role salah)', content: json(ref('Error')) },
  404: { description: 'Data tidak ditemukan', content: json(ref('Error')) },
  409: { description: 'Konflik status (mis. sudah diputuskan, duplikat)', content: json(ref('Error')) },
  422: { description: 'Validasi gagal — `error.details` berisi pesan per field', content: json(ref('Error')) },
};
const errs = (...codes) => Object.fromEntries(codes.map((c) => [c, errorResponses[c]]));

/** Bangun satu operation. auth: 'member' | 'admin' | 'any' | undefined (publik). */
function op({ tag, summary, description, auth, params = [], body, multipart, ok = { 200: 'OK' }, schema, errors = [] }) {
  const security = auth ? [{ bearerAuth: [] }] : [];
  const roleNote = { member: 'Hanya role **member**.', admin: 'Hanya role **admin**.', any: 'Member atau admin.' }[auth];
  const responses = {};
  for (const [code, desc] of Object.entries(ok)) {
    responses[code] = { description: desc, ...(schema ? { content: json(schema) } : {}) };
  }
  Object.assign(responses, errs(...(auth ? [401, 403, ...errors] : errors)));
  return {
    tags: [tag],
    summary,
    description: [description, roleNote].filter(Boolean).join('\n\n') || undefined,
    security,
    parameters: params.length ? params : undefined,
    requestBody: body
      ? { required: true, content: json(body.schema, body.example) }
      : multipart
        ? { required: true, content: { 'multipart/form-data': { schema: multipart } } }
        : undefined,
    responses,
  };
}

const receiptForm = obj(
  {
    channel: str({ example: 'Retail' }),
    nomor_transaksi: str({ example: 'INV-2609-0001' }),
    tanggal_transaksi: str({ format: 'date', example: '2026-09-20' }),
    nominal: num({ example: 250000 }),
    files: arr(str({ format: 'binary' })),
  },
  ['channel', 'nomor_transaksi', 'tanggal_transaksi', 'nominal', 'files']
);
const reasonBody = (example = 'Foto struk buram, nominal tidak terbaca.') => ({ schema: obj({ alasan: str({ minLength: 3, maxLength: 500, example }) }, ['alasan']) });

const paths = {
  // ------------------------------------------------------------------ Sistem
  '/health': { get: op({ tag: 'Sistem', summary: 'Cek kesehatan server', schema: obj({ status: str({ example: 'ok' }) }) }) },

  // -------------------------------------------------------------------- Auth
  '/auth/register': {
    post: op({
      tag: 'Auth', summary: 'Registrasi member (REG-01..03, REG-08)',
      description: 'Minimal salah satu dari `email` / `no_hp`. Identifier unik lintas format (no. HP dinormalisasi ke 62xxx). Wajib menyetujui syarat.',
      body: { schema: ref('RegisterRequest'), example: { nama: 'Sari Wulandari', email: 'sari@example.com', no_hp: '0812-3456-7890', password: 'rahasia123', setuju_syarat: true } },
      ok: { 201: 'Terdaftar & langsung login' }, schema: ref('AuthResponse'), errors: [409, 422],
    }),
  },
  '/auth/login': {
    post: op({
      tag: 'Auth', summary: 'Login member (REG-04, REG-05)',
      description: 'Identifier = email atau nomor HP. 5x gagal berturut-turut mengunci akun 15 menit (429). Token berlaku sesuai `SESSION_IDLE_MINUTES` dan diperpanjang otomatis lewat header `X-Refresh-Token` selama aktif.',
      body: { schema: ref('LoginRequest'), example: { identifier: 'demo@alpaka.local', password: 'Demo-Alpaka-2026' } },
      schema: ref('AuthResponse'), errors: [403, 422],
    }),
  },
  '/auth/admin/login': {
    post: op({
      tag: 'Auth', summary: 'Login admin — terpisah dari member (REG-06)',
      body: { schema: ref('LoginRequest'), example: { identifier: 'admin@alpaka.local', password: '<ADMIN_PASSWORD di .env>' } },
      schema: ref('AuthResponse'), errors: [403, 422],
    }),
  },
  '/auth/me': { get: op({ tag: 'Auth', summary: 'Profil akun yang sedang login', description: 'Bila header `X-Keepalive: 1` dikirim, sesi selalu diperpanjang (header `X-Refresh-Token`).', auth: 'any', schema: obj({ user: ref('User') }) }) },
  '/auth/forgot-password': {
    post: op({
      tag: 'Auth', summary: 'Minta tautan pemulihan kata sandi (REG-07)',
      description: 'Respons selalu sama baik akun ada maupun tidak. Tautan dikirim lewat email bila SMTP dikonfigurasi (di development juga dicatat di log server).',
      body: { schema: obj({ identifier: str({ example: 'demo@alpaka.local' }) }, ['identifier']) },
      schema: obj({ message: str() }), errors: [422],
    }),
  },
  '/auth/reset-password': {
    post: op({
      tag: 'Auth', summary: 'Atur kata sandi baru dengan token pemulihan',
      description: 'Semua sesi lama dicabut setelah kata sandi diganti.',
      body: { schema: obj({ token: str({ description: 'Token 64 hex dari tautan email' }), password: str({ minLength: 8 }) }, ['token', 'password']) },
      schema: obj({ message: str() }), errors: [422],
    }),
  },

  // ------------------------------------------------------------------ Publik
  '/public/terms': { get: op({ tag: 'Publik', summary: 'Syarat program & kebijakan privasi (OI-15)', description: 'Dipakai halaman registrasi; teks diatur admin.', schema: data(obj({ teks: str() })) }) },
  '/public/rewards/{id}/image': {
    get: {
      tags: ['Publik'], summary: 'Gambar reward (publik)', parameters: [idParam()],
      responses: { 200: { description: 'Gambar JPG/PNG/WebP', content: { 'image/*': { schema: str({ format: 'binary' }) } } }, ...errs(404) },
    },
  },
  '/config': { get: op({ tag: 'Publik', summary: 'Konfigurasi program untuk form (channel, batas file, masa klaim, aturan poin, kanal notifikasi tersedia)', auth: 'any', schema: ref('Config') }) },

  // ------------------------------------------------------------ Member: struk
  '/receipts': {
    post: op({
      tag: 'Member — Struk', summary: 'Ajukan struk/invoice (UPL-01..05)',
      description: 'Multipart. Setelah tersimpan, validasi otomatis berjalan (kelengkapan, duplikat, tanggal, nominal). Gagal → status `ditolak` otomatis dengan alasan. Lolos → cek auto-approve; bila tidak terpenuhi → `menunggu_review`. File: JPG/PNG/PDF (dicek isi file), batas ukuran & jumlah dari pengaturan.',
      auth: 'member', multipart: receiptForm, ok: { 201: 'Struk tercatat (lihat `status`)' }, schema: data(ref('Receipt')), errors: [422],
    }),
    get: op({ tag: 'Member — Struk', summary: 'Riwayat struk milik sendiri (UPL-06, DSH-02)', auth: 'member', params: [...pagingParams, q('status', 'Filter status', str({ enum: ['menunggu_review', 'disetujui', 'ditolak'] }))], schema: page(ref('Receipt')) }),
  },
  '/member/receipts': { get: op({ tag: 'Member — Struk', summary: 'Alias dari GET /receipts', auth: 'member', params: [...pagingParams, q('status', 'Filter status')], schema: page(ref('Receipt')) }) },
  '/receipts/{id}': { get: op({ tag: 'Member — Struk', summary: 'Detail struk milik sendiri termasuk alasan penolakan (UPL-07, DSH-04)', auth: 'member', params: [idParam()], schema: data(ref('Receipt')), errors: [404] }) },
  '/receipts/{id}/resubmit': {
    post: op({
      tag: 'Member — Struk', summary: 'Ajukan ulang struk yang ditolak (UPL-07, BR-02)',
      description: 'Hanya untuk struk berstatus `ditolak` milik sendiri yang belum diajukan ulang.',
      auth: 'member', params: [idParam()], multipart: receiptForm, ok: { 201: 'Pengajuan ulang tercatat' }, schema: data(ref('Receipt')), errors: [404, 409, 422],
    }),
  },
  '/receipts/{id}/files/{fileId}': {
    get: {
      tags: ['Member — Struk'], summary: 'Unduh file bukti milik sendiri (akses dibatasi pemilik & admin, NFR-02)', security: [{ bearerAuth: [] }],
      parameters: [idParam(), idParam('fileId', 'ID file')],
      responses: { 200: { description: 'Isi file', content: { 'image/png': { schema: str({ format: 'binary' }) }, 'application/pdf': { schema: str({ format: 'binary' }) } } }, ...errs(401, 403, 404) },
    },
  },

  // ------------------------------------------------- Member: poin & dashboard
  '/member/dashboard': { get: op({ tag: 'Member — Poin', summary: 'Ringkasan dashboard (DSH-01)', auth: 'member', schema: data(obj({ points: ref('Balance'), struk_terbaru: arr(ref('Receipt')), redeem_terbaru: arr(ref('Redeem')), notifikasi_belum_dibaca: int() })) }) },
  '/member/points': { get: op({ tag: 'Member — Poin', summary: 'Saldo poin: total, ditahan, tersedia (PNT-04)', description: 'Dihitung dari ledger, tidak disimpan sebagai angka statis.', auth: 'member', schema: data(ref('Balance')) }) },
  '/member/points/mutations': { get: op({ tag: 'Member — Poin', summary: 'Mutasi poin: masuk / hold / terpakai / lepas / koreksi (DSH-06)', auth: 'member', params: pagingParams, schema: page(ref('Mutation')) }) },

  // ------------------------------------------------------ Member: reward/redeem
  '/rewards': { get: op({ tag: 'Member — Redeem', summary: 'Katalog reward aktif (RDM-07)', auth: 'member', schema: data(arr(ref('Reward'))) }) },
  '/redeem': {
    post: op({
      tag: 'Member — Redeem', summary: 'Ajukan redeem (RDM-01..03, BR-09)',
      description: 'Saldo **tersedia** dicek, lalu poin di-hold dalam transaksi atomik (aman terhadap request bersamaan). Saldo kurang → 422 tanpa entri hold.',
      auth: 'member', body: { schema: obj({ reward_id: int({ example: 1 }) }, ['reward_id']) }, ok: { 201: 'Menunggu persetujuan' }, schema: data(ref('Redeem')), errors: [404, 422],
    }),
  },
  '/redeem/{id}/cancel': { post: op({ tag: 'Member — Redeem', summary: 'Batalkan redeem yang belum diproses; hold dilepas (RDM-08)', auth: 'member', params: [idParam()], schema: data(ref('Redeem')), errors: [404, 409] }) },
  '/member/redeems': { get: op({ tag: 'Member — Redeem', summary: 'Riwayat redeem (DSH-03)', auth: 'member', params: [...pagingParams, q('status', 'Filter status')], schema: page(ref('Redeem')) }) },
  '/member/redeems/{id}': { get: op({ tag: 'Member — Redeem', summary: 'Detail redeem termasuk detail pemberian (RDM-05)', auth: 'member', params: [idParam()], schema: data(ref('Redeem')), errors: [404] }) },

  // --------------------------------------------------- Member: akun & notifikasi
  '/member/notifications': { get: op({ tag: 'Member — Akun', summary: 'Riwayat notifikasi in-app (NTF-04)', auth: 'member', params: pagingParams, description: 'Header `X-Background: 1` dapat dikirim untuk polling agar tidak memperpanjang sesi.', schema: page(ref('Notification'), { belum_dibaca: int() }) }) },
  '/member/notifications/read': { post: op({ tag: 'Member — Akun', summary: 'Tandai notifikasi dibaca (kosongkan `ids` = semua)', auth: 'member', body: { schema: obj({ ids: arr(int()) }), example: {} }, schema: obj({ message: str() }) }) },
  '/member/notification-prefs': { patch: op({ tag: 'Member — Akun', summary: 'Preferensi kanal notifikasi (OI-08); in-app selalu aktif', auth: 'member', body: { schema: obj({ notif_email: bool(), notif_whatsapp: bool() }, ['notif_email', 'notif_whatsapp']) }, schema: data(obj({ notif_email: bool(), notif_whatsapp: bool() })), errors: [422] }) },
  '/member/profile': { patch: op({ tag: 'Member — Akun', summary: 'Ubah profil dasar (REG-07)', auth: 'member', body: { schema: obj({ nama: str(), email: str({ nullable: true }), no_hp: str({ nullable: true }) }, ['nama']) }, schema: obj({ user: ref('User') }), errors: [409, 422] }) },
  '/member/password': { post: op({ tag: 'Member — Akun', summary: 'Ganti kata sandi', description: 'Semua sesi lama dicabut; respons memuat token baru untuk sesi ini.', auth: 'member', body: { schema: obj({ password_lama: str(), password_baru: str({ minLength: 8 }) }, ['password_lama', 'password_baru']) }, schema: obj({ message: str(), token: str() }), errors: [422] }) },

  // ------------------------------------------------------------- Admin: struk
  '/admin/summary': { get: op({ tag: 'Admin — Struk', summary: 'Jumlah antrean struk & redeem per status', auth: 'admin', schema: data(obj({ struk: obj({ menunggu_review: int(), disetujui: int(), ditolak: int() }), redeem: obj({ menunggu_persetujuan: int(), selesai: int(), ditolak: int(), dibatalkan: int() }) })) }) },
  '/admin/receipts': {
    get: op({
      tag: 'Admin — Struk', summary: 'Antrean struk dengan filter & pencarian (ADM-01)',
      description: 'Struk `menunggu_review` diurutkan paling lama dulu. `meta.ringkasan` = jumlah per status.',
      auth: 'admin', params: [...pagingParams, q('status', 'Status', str({ enum: ['menunggu_review', 'disetujui', 'ditolak'] })), q('channel', 'Channel'), q('from', 'Diajukan dari (YYYY-MM-DD)', str({ format: 'date' })), q('to', 'Diajukan sampai (YYYY-MM-DD)', str({ format: 'date' })), q('q', 'Cari no. transaksi / nama / email / no. HP')],
      schema: page(ref('Receipt'), { ringkasan: obj({ menunggu_review: int(), disetujui: int(), ditolak: int() }) }),
    }),
  },
  '/admin/receipts/{id}': { get: op({ tag: 'Admin — Struk', summary: 'Detail struk: bukti, data transaksi, hasil validasi, data member, riwayat koreksi (ADM-02)', auth: 'admin', params: [idParam()], schema: data(ref('ReceiptAdmin')), errors: [404] }) },
  '/admin/receipts/{id}/files/{fileId}': {
    get: {
      tags: ['Admin — Struk'], summary: 'Unduh file bukti', security: [{ bearerAuth: [] }], parameters: [idParam(), idParam('fileId', 'ID file')],
      responses: { 200: { description: 'Isi file', content: { 'image/png': { schema: str({ format: 'binary' }) }, 'application/pdf': { schema: str({ format: 'binary' }) } } }, ...errs(401, 403, 404) },
    },
  },
  '/admin/receipts/{id}/approve': { post: op({ tag: 'Admin — Struk', summary: 'Setujui struk (ADM-03)', description: 'Poin dicatat idempotent (sekali per struk). Struk terkunci setelah diputuskan — request berikutnya 409 `ALREADY_DECIDED`.', auth: 'admin', params: [idParam()], schema: data(ref('ReceiptAdmin')), errors: [404, 409] }) },
  '/admin/receipts/{id}/reject': { post: op({ tag: 'Admin — Struk', summary: 'Tolak struk — alasan wajib (ADM-03, BR-08)', auth: 'admin', params: [idParam()], body: reasonBody(), schema: data(ref('ReceiptAdmin')), errors: [404, 409, 422] }) },
  '/admin/receipts/{id}/correct': {
    post: op({
      tag: 'Admin — Struk', summary: 'Koreksi keputusan yang sudah final (ADM-06, OI-12)',
      description: 'Membalik keputusan: `disetujui → ditolak` (poin dibalik; **409 `POINTS_IN_USE`** bila poin sudah dipakai/ditahan redeem) atau `ditolak → disetujui` (poin dicatat sesuai aturan saat ini; **409 `DUPLICATE`** bila struk sama masih aktif). Tercatat di `receipt_corrections` dan log audit; member diberi notifikasi.',
      auth: 'admin', params: [idParam()], body: reasonBody('Struk terbukti milik orang lain.'), schema: data(ref('ReceiptAdmin')), errors: [404, 409, 422],
    }),
  },

  // ------------------------------------------------------------ Admin: redeem
  '/admin/redeems': { get: op({ tag: 'Admin — Redeem', summary: 'Antrean redeem', auth: 'admin', params: [...pagingParams, q('status', 'Status', str({ enum: ['menunggu_persetujuan', 'selesai', 'ditolak', 'dibatalkan'] })), q('q', 'Cari nama member / email / reward')], schema: page(ref('Redeem'), { ringkasan: obj({ menunggu_persetujuan: int(), selesai: int(), ditolak: int(), dibatalkan: int() }) }) }) },
  '/admin/redeems/{id}': { get: op({ tag: 'Admin — Redeem', summary: 'Detail redeem', auth: 'admin', params: [idParam()], schema: data(ref('Redeem')), errors: [404] }) },
  '/admin/redeems/{id}/approve': { post: op({ tag: 'Admin — Redeem', summary: 'Setujui redeem: hold → terpakai, catat detail pemberian (RDM-04, RDM-05)', auth: 'admin', params: [idParam()], body: { schema: obj({ detail_pemberian: str({ example: 'Kode voucher: ALP-50K-8F3A2' }) }) }, schema: data(ref('Redeem')), errors: [404, 409] }) },
  '/admin/redeems/{id}/reject': { post: op({ tag: 'Admin — Redeem', summary: 'Tolak redeem — alasan wajib; hold dilepas (RDM-04)', auth: 'admin', params: [idParam()], body: reasonBody('Stok voucher habis.'), schema: data(ref('Redeem')), errors: [404, 409, 422] }) },

  // ------------------------------------------------------- Admin: pengaturan
  '/admin/auto-approve': {
    get: op({ tag: 'Admin — Pengaturan', summary: 'Kriteria auto-approve (ADM-04)', auth: 'admin', schema: data(arr(ref('AutoApproveCriteria'))) }),
    put: op({
      tag: 'Admin — Pengaturan', summary: 'Ubah kriteria auto-approve',
      description: 'Struk lolos validasi disetujui otomatis hanya bila ada ≥1 kriteria aktif dan SEMUA kriteria aktif terpenuhi.',
      auth: 'admin', body: { schema: obj({ channel: obj({ aktif: bool(), channels: arr(str()) }), batas_nominal: obj({ aktif: bool(), maks: num() }) }, ['channel', 'batas_nominal']), example: { channel: { aktif: true, channels: ['E-commerce'] }, batas_nominal: { aktif: true, maks: 500000 } } },
      schema: data(arr(ref('AutoApproveCriteria'))), errors: [422],
    }),
  },
  '/admin/settings': {
    get: op({ tag: 'Admin — Pengaturan', summary: 'Pengaturan program (aturan poin, masa klaim, batas file, channel, syarat)', auth: 'admin', schema: data(ref('Settings')) }),
    put: op({ tag: 'Admin — Pengaturan', summary: 'Ubah pengaturan program', description: '`terms_text` opsional — bila tidak dikirim, teks yang ada tidak diubah.', auth: 'admin', body: { schema: ref('Settings') }, schema: data(ref('Settings')), errors: [422] }),
  },
  '/admin/rewards': {
    get: op({ tag: 'Admin — Reward', summary: 'Semua reward (aktif & nonaktif)', auth: 'admin', schema: data(arr(ref('RewardAdmin'))) }),
    post: op({ tag: 'Admin — Reward', summary: 'Tambah reward (RDM-07)', auth: 'admin', body: { schema: ref('RewardInput') }, ok: { 201: 'Dibuat' }, schema: data(ref('RewardAdmin')), errors: [422] }),
  },
  '/admin/rewards/{id}': { put: op({ tag: 'Admin — Reward', summary: 'Ubah reward / nonaktifkan (reward tidak dihapus agar riwayat redeem utuh)', auth: 'admin', params: [idParam()], body: { schema: ref('RewardInput') }, schema: data(ref('RewardAdmin')), errors: [404, 422] }) },
  '/admin/rewards/{id}/image': {
    post: op({ tag: 'Admin — Reward', summary: 'Unggah/ganti gambar reward (JPG/PNG/WebP, maks 2 MB; isi file dicek)', auth: 'admin', params: [idParam()], multipart: obj({ image: str({ format: 'binary' }) }, ['image']), schema: data(ref('RewardAdmin')), errors: [404, 422] }),
    delete: op({ tag: 'Admin — Reward', summary: 'Hapus gambar reward', auth: 'admin', params: [idParam()], schema: obj({ message: str() }), errors: [404] }),
  },

  // ------------------------------------------------------- Admin: pengguna
  '/admin/admins': {
    get: op({ tag: 'Admin — Pengguna', summary: 'Daftar admin (OI-13)', auth: 'admin', schema: data(arr(ref('AdminAccount'))) }),
    post: op({ tag: 'Admin — Pengguna', summary: 'Tambah admin', auth: 'admin', body: { schema: obj({ nama: str(), email: str({ format: 'email' }), password: str({ minLength: 8 }) }, ['nama', 'email', 'password']) }, ok: { 201: 'Dibuat' }, schema: data(ref('AdminAccount')), errors: [409, 422] }),
  },
  '/admin/admins/{id}': {
    patch: op({
      tag: 'Admin — Pengguna', summary: 'Aktif/nonaktifkan admin atau reset kata sandi',
      description: 'Sesi admin tersebut dicabut seketika. Tidak dapat menonaktifkan diri sendiri (`SELF_DEACTIVATE`) maupun admin aktif terakhir (`LAST_ADMIN`).',
      auth: 'admin', params: [idParam()], body: { schema: obj({ status: str({ enum: ['aktif', 'nonaktif'] }), password: str({ minLength: 8 }) }) }, schema: data(ref('AdminAccount')), errors: [404, 409, 422],
    }),
  },
  '/admin/members': { get: op({ tag: 'Admin — Pengguna', summary: 'Daftar member beserta saldo', auth: 'admin', params: [...pagingParams, q('q', 'Cari nama / email / no. HP'), q('status', 'Status akun', str({ enum: ['aktif', 'nonaktif'] }))], schema: page(ref('MemberRow')) }) },
  '/admin/members/{id}': { patch: op({ tag: 'Admin — Pengguna', summary: 'Aktif/nonaktifkan akun member (sesi dicabut seketika)', auth: 'admin', params: [idParam()], body: { schema: obj({ status_akun: str({ enum: ['aktif', 'nonaktif'] }) }, ['status_akun']) }, schema: data(ref('MemberRow')), errors: [404, 422] }) },
  // --------------------------------------------------------- Admin: Tier & Progress
  '/admin/tiers': {
    get: op({ tag: 'Admin — Tier', summary: 'Daftar tier (tambahan.md poin 1)', auth: 'admin', schema: data(arr(ref('Tier'))) }),
    post: op({ tag: 'Admin — Tier', summary: 'Tambah tier — hanya super_admin', auth: 'admin', body: { schema: ref('TierInput') }, ok: { 201: 'Dibuat' }, schema: data(ref('Tier')), errors: [409, 422] }),
  },
  '/admin/tiers/{id}': {
    put: op({ tag: 'Admin — Tier', summary: 'Ubah tier — hanya super_admin', auth: 'admin', params: [idParam()], body: { schema: ref('TierInput') }, schema: data(ref('Tier')), errors: [404, 409, 422] }),
    delete: op({ tag: 'Admin — Tier', summary: 'Hapus tier — hanya super_admin; ditolak bila masih dipakai member (409 `TIER_IN_USE`)', auth: 'admin', params: [idParam()], schema: obj({ message: str() }), errors: [404, 409] }),
  },
  '/admin/tiers/growth': { get: op({ tag: 'Admin — Tier', summary: 'Pertumbuhan tier per bulan (naik/turun)', auth: 'admin', params: [q('months', 'Jumlah bulan ke belakang', int({ default: 6 }))], schema: data(arr(obj({ bulan: str({ example: '2026-09' }), tier: str(), jumlah: int() }))) }) },
  '/member/tier': { get: op({ tag: 'Member — Poin', summary: 'Tier saat ini & progress ke tier berikutnya (tambahan.md poin 1)', description: 'Basis default: total poin lifetime (masuk − koreksi), tidak berkurang saat redeem.', auth: 'member', schema: data(ref('TierProgress')) }) },

  // --------------------------------------------------------- Admin/Member: Voucher
  '/admin/vouchers': { get: op({ tag: 'Admin — Voucher', summary: 'Daftar voucher (tambahan.md poin 3)', auth: 'admin', params: [...pagingParams, q('status', 'Status', str({ enum: ['active', 'reserved', 'used', 'expired', 'void'] })), q('q', 'Cari kode / nama member / email')], schema: page(ref('Voucher')) }) },
  '/admin/vouchers/{id}/void': { post: op({ tag: 'Admin — Voucher', summary: 'Void voucher manual (belum dipakai)', auth: 'admin', params: [idParam()], body: reasonBody('Kesalahan input redeem.'), schema: data(ref('Voucher')), errors: [404, 409, 422] }) },
  '/member/vouchers': { get: op({ tag: 'Member — Redeem', summary: 'Voucher milik sendiri (aktif & riwayat)', auth: 'member', params: [...pagingParams, q('status', 'Status')], schema: page(ref('Voucher')) }) },

  // --------------------------------------------------------- Admin: aturan poin per channel & manual adjustment
  '/admin/point-rules/channel': {
    get: op({ tag: 'Admin — Pengaturan', summary: 'Aturan konversi poin per channel (override dari aturan global)', auth: 'admin', schema: data(arr(ref('ChannelPointRule'))) }),
    put: op({ tag: 'Admin — Pengaturan', summary: 'Tambah/ubah aturan poin untuk satu channel — hanya super_admin', auth: 'admin', body: { schema: obj({ channel: str(), rupiah_per_poin: int({ minimum: 1 }), pembulatan: str({ enum: ['bawah', 'atas', 'terdekat'] }), minimal_transaksi: num() }, ['channel', 'rupiah_per_poin', 'pembulatan', 'minimal_transaksi']) }, schema: data(arr(ref('ChannelPointRule'))), errors: [422] }),
  },
  '/admin/point-rules/channel/{channel}': { delete: op({ tag: 'Admin — Pengaturan', summary: 'Hapus override channel (kembali memakai aturan global) — hanya super_admin', auth: 'admin', params: [{ name: 'channel', in: 'path', required: true, schema: str() }], schema: obj({ message: str() }), errors: [404] }) },
  '/admin/members/{id}/points': { post: op({ tag: 'Admin — Pengguna', summary: 'Penyesuaian poin manual (Admin Dashboard poin 6)', description: 'Jumlah boleh negatif; pengurangan ditolak bila melebihi saldo tersedia (422 `INSUFFICIENT_BALANCE`).', auth: 'admin', params: [idParam()], body: { schema: obj({ jumlah: int({ example: 20 }), alasan: str({ minLength: 3 }) }, ['jumlah', 'alasan']) }, schema: data(ref('Balance')), errors: [404, 422] }) },
  '/admin/members/{id}/points/mutations': { get: op({ tag: 'Admin — Pengguna', summary: 'Mutasi poin member (sudut pandang admin)', auth: 'admin', params: [idParam(), ...pagingParams], schema: page(ref('Mutation')) }) },
  '/admin/members/{id}/tier-history': { get: op({ tag: 'Admin — Pengguna', summary: 'Riwayat perubahan tier member', auth: 'admin', params: [idParam()], schema: data(arr(obj({ id: str(), dari: str({ nullable: true }), ke: str({ nullable: true }), sebab: str({ enum: ['otomatis', 'manual'] }), created_at: str({ format: 'date-time' }) }))) }) },

  // --------------------------------------------------------- Admin: Dashboard (metrics, log integrasi, export)
  '/admin/metrics': { get: op({ tag: 'Admin — Dashboard', summary: 'Metrik dasar: member aktif, poin beredar, redemption rate, top reward, sebaran tier (Admin Dashboard poin 6)', auth: 'admin', schema: data(ref('Metrics')) }) },
  '/admin/integration-logs': { get: op({ tag: 'Admin — Dashboard', summary: 'Log request integrasi More (audit & troubleshooting)', auth: 'admin', params: [...pagingParams, q('endpoint', 'Filter endpoint, mis. `/transaction`')], schema: page(ref('IntegrationLog')) }) },
  '/admin/export/members.csv': { get: { tags: ['Admin — Dashboard'], summary: 'Export member ke CSV', security: [{ bearerAuth: [] }], responses: { 200: { description: 'File CSV', content: { 'text/csv': { schema: str() } } }, ...errs(401, 403) } } },
  '/admin/export/redeems.csv': { get: { tags: ['Admin — Dashboard'], summary: 'Export redeem ke CSV', security: [{ bearerAuth: [] }], responses: { 200: { description: 'File CSV', content: { 'text/csv': { schema: str() } } }, ...errs(401, 403) } } },
  '/admin/export/receipts.csv': { get: { tags: ['Admin — Dashboard'], summary: 'Export struk ke CSV', security: [{ bearerAuth: [] }], responses: { 200: { description: 'File CSV', content: { 'text/csv': { schema: str() } } }, ...errs(401, 403) } } },

  // --------------------------------------------------------- Integrasi More by Morello
  '/integrations/more/transaction': {
    post: {
      tags: ['Integrasi More'],
      summary: 'Webhook transaksi selesai → poin otomatis (tambahan.md poin 4)',
      description: 'Implementasi DEFAULT — sesuaikan payload begitu kontrak resmi dari tim More tersedia. Autentikasi: header `X-Api-Key` (bukan JWT). `external_id` dipakai sebagai idempotency key: request dengan `external_id` yang sama tidak diproses dua kali (200 `sudah_diproses`). Member yang belum terdaftar ditolak secara default (`MEMBER_NOT_FOUND`) — ubah lewat `MORE_AUTO_REGISTER` di `.env`.',
      parameters: [{ name: 'X-Api-Key', in: 'header', required: true, schema: str() }],
      requestBody: { required: true, content: json(obj({ external_id: str(), email: str({ format: 'email' }), no_hp: str(), channel: str({ default: 'More by Morello' }), nominal: num(), tanggal_transaksi: str({ format: 'date' }) }, ['external_id', 'nominal', 'tanggal_transaksi']), { external_id: 'MORE-TX-000123', email: 'demo@alpaka.local', nominal: 150000, tanggal_transaksi: '2026-09-20' }) },
      responses: { 201: { description: 'Diterima & poin dicatat', content: json(obj({ status: str({ example: 'diterima' }), receipt_id: str(), poin_diberikan: int() })) }, 200: { description: 'Sudah pernah diproses (idempotent)', content: json(obj({ status: str({ example: 'sudah_diproses' }), message: str() })) }, ...errs(401, 403, 422) },
    },
  },
  '/integrations/more/voucher/validate': {
    post: {
      tags: ['Integrasi More'],
      summary: 'Validasi voucher saat checkout (tambahan.md poin 5)',
      description: 'Voucher direservasi (`reserved`) selama `MORE_VOUCHER_RESERVE_MINUTES` menit agar tidak dipakai dua kali; otomatis kembali `active` bila checkout tidak dikonfirmasi. Panggilan ulang dengan `order_id` yang sama bersifat idempotent.',
      parameters: [{ name: 'X-Api-Key', in: 'header', required: true, schema: str() }],
      requestBody: { required: true, content: json(obj({ kode: str({ example: 'ALP-7K3QX9M2' }), order_id: str() }, ['kode', 'order_id'])) },
      responses: { 200: { description: 'Voucher valid & direservasi', content: json(obj({ valid: bool(), kode: str(), reward: str(), berlaku_sampai: str({ format: 'date-time' }) })) }, ...errs(401, 403, 404, 409, 422) },
    },
  },
  '/integrations/more/voucher/redeem': {
    post: {
      tags: ['Integrasi More'],
      summary: 'Konfirmasi voucher terpakai setelah checkout sukses (tambahan.md poin 5)',
      description: 'Hanya berhasil bila voucher sedang `reserved` untuk `order_id` yang sama (dari panggilan `validate` sebelumnya). Idempotent untuk `order_id` yang sama.',
      parameters: [{ name: 'X-Api-Key', in: 'header', required: true, schema: str() }],
      requestBody: { required: true, content: json(obj({ kode: str(), order_id: str() }, ['kode', 'order_id'])) },
      responses: { 200: { description: 'Voucher ditandai terpakai', content: json(obj({ status: str({ example: 'used' }), kode: str(), used_at: str({ format: 'date-time' }) })) }, ...errs(401, 403, 404, 409, 422) },
    },
  },

  '/admin/audit-logs': {
    get: op({
      tag: 'Admin — Audit', summary: 'Log audit — hanya baca (ADM-05, BR-12, NFR-06)',
      description: 'Tidak ada endpoint ubah/hapus; tabel dilindungi trigger database sehingga UPDATE/DELETE/TRUNCATE ditolak.',
      auth: 'admin', params: [...pagingParams, q('pelaku_tipe', 'Pelaku', str({ enum: ['admin', 'member', 'sistem'] })), q('aksi', 'Awalan aksi, mis. `struk.`'), q('objek_tipe', 'Tipe objek'), q('from', 'Dari tanggal', str({ format: 'date' })), q('to', 'Sampai tanggal', str({ format: 'date' }))], schema: page(ref('AuditLog')),
    }),
  },
};

const statusReceipt = str({ enum: ['menunggu_review', 'disetujui', 'ditolak'] });
const statusRedeem = str({ enum: ['menunggu_persetujuan', 'selesai', 'ditolak', 'dibatalkan'] });

const schemas = {
  Error: obj({ error: obj({ code: str({ example: 'VALIDATION_ERROR' }), message: str(), details: { type: 'object', additionalProperties: str(), nullable: true } }) }),
  Balance: obj({ total: int({ example: 275 }), ditahan: int({ example: 60 }), tersedia: int({ example: 215 }) }),
  User: obj({ id: str(), nama: str(), email: str({ nullable: true }), no_hp: str({ nullable: true }), role: str({ enum: ['member', 'admin'] }), notif_email: bool(), notif_whatsapp: bool() }),
  AuthResponse: obj({ token: str({ description: 'JWT — kirim sebagai `Authorization: Bearer <token>`' }), user: ref('User') }),
  RegisterRequest: obj({ nama: str(), email: str({ format: 'email', nullable: true }), no_hp: str({ nullable: true }), password: str({ minLength: 8, maxLength: 72 }), setuju_syarat: bool({ description: 'Harus true' }) }, ['nama', 'password', 'setuju_syarat']),
  LoginRequest: obj({ identifier: str({ description: 'Email atau nomor HP (admin: email)' }), password: str() }, ['identifier', 'password']),
  Config: obj({ claim_window_days: int(), min_nominal: num(), max_file_size_mb: int(), max_files: int(), channels: arr(str()), point_rule: obj({ rupiah_per_poin: int(), pembulatan: str({ enum: ['bawah', 'atas', 'terdekat'] }), minimal_transaksi: num() }), notification_channels: obj({ in_app: bool(), email: bool(), whatsapp: bool() }) }),
  FileInfo: obj({ id: str(), nama_asli: str(), mime: str(), ukuran: int() }),
  Receipt: obj({
    id: str(), member_id: str(), channel: str(), nomor_transaksi: str(), tanggal_transaksi: str({ format: 'date' }), nominal: num(), status: statusReceipt,
    mode_persetujuan: str({ enum: ['otomatis', 'manual'], nullable: true }), alasan_penolakan: str({ nullable: true }), waktu_keputusan: str({ format: 'date-time', nullable: true }),
    resubmit_of: str({ nullable: true }), created_at: str({ format: 'date-time' }), poin_diperoleh: int({ nullable: true, description: 'Netto setelah koreksi' }), bisa_diajukan_ulang: bool(), files: arr(ref('FileInfo')),
  }),
  ReceiptAdmin: {
    allOf: [ref('Receipt'), obj({
      hasil_validasi: obj({ lulus: bool(), checks: { type: 'object', additionalProperties: obj({ lulus: bool(), pesan: str() }) } }),
      member_nama: str(), member_email: str({ nullable: true }), member_no_hp: str({ nullable: true }), diputuskan_oleh_nama: str({ nullable: true }),
      koreksi: arr(obj({ id: str(), dari_status: statusReceipt, ke_status: statusReceipt, alasan: str(), poin_delta: int(), created_at: str({ format: 'date-time' }), admin_nama: str() })),
    })],
  },
  Redeem: obj({ id: str(), member_id: str(), reward_id: str(), reward_nama: str(), jumlah_poin: int(), status: statusRedeem, alasan_penolakan: str({ nullable: true }), detail_pemberian: str({ nullable: true }), waktu_keputusan: str({ format: 'date-time', nullable: true }), created_at: str({ format: 'date-time' }), member_nama: str(), member_email: str({ nullable: true }) }),
  Reward: obj({ id: str(), nama: str(), deskripsi: str({ nullable: true }), poin_dibutuhkan: int(), gambar_url: str({ nullable: true }) }),
  RewardAdmin: obj({ id: str(), nama: str(), deskripsi: str({ nullable: true }), poin_dibutuhkan: int(), aktif: bool(), gambar_url: str({ nullable: true }), created_at: str({ format: 'date-time' }) }),
  RewardInput: obj({ nama: str(), deskripsi: str({ nullable: true }), poin_dibutuhkan: int({ minimum: 1 }), aktif: bool({ default: true }) }, ['nama', 'poin_dibutuhkan']),
  Mutation: obj({ id: str(), jenis: str({ enum: ['masuk', 'hold', 'terpakai', 'lepas', 'koreksi'] }), jumlah: int(), referensi_tipe: str({ enum: ['receipt', 'redeem', 'koreksi'] }), referensi_id: str(), keterangan: str({ nullable: true }), created_at: str({ format: 'date-time' }) }),
  Notification: obj({ id: str(), jenis_kejadian: str({ enum: ['struk_disetujui', 'struk_ditolak', 'redeem_diajukan', 'redeem_disetujui', 'redeem_ditolak'] }), isi: str(), kanal: str({ example: 'in_app' }), referensi_tipe: str({ nullable: true }), referensi_id: str({ nullable: true }), dibaca_at: str({ format: 'date-time', nullable: true }), created_at: str({ format: 'date-time' }) }),
  AutoApproveCriteria: obj({ id: str(), kode: str({ enum: ['channel', 'batas_nominal'] }), kriteria: str(), nilai: { type: 'object' }, aktif: bool(), updated_at: str({ format: 'date-time' }) }),
  Settings: obj({
    point_rule: obj({ rupiah_per_poin: int({ minimum: 1 }), pembulatan: str({ enum: ['bawah', 'atas', 'terdekat'] }), minimal_transaksi: num() }, ['rupiah_per_poin', 'pembulatan', 'minimal_transaksi']),
    claim_window_days: int(), min_nominal: num(), max_file_size_mb: int({ maximum: 20 }), max_files: int({ maximum: 10 }), channels: arr(str()), terms_text: str(),
  }, ['point_rule', 'claim_window_days', 'min_nominal', 'max_file_size_mb', 'max_files', 'channels']),
  AdminAccount: obj({ id: str(), nama: str(), email: str(), status: str({ enum: ['aktif', 'nonaktif'] }), created_at: str({ format: 'date-time' }) }),
  MemberRow: obj({ id: str(), nama: str(), email: str({ nullable: true }), no_hp: str({ nullable: true }), status_akun: str({ enum: ['aktif', 'nonaktif'] }), created_at: str({ format: 'date-time' }), total: int(), tersedia: int(), jumlah_struk: int() }),
  Tier: obj({ id: str(), nama: str(), urutan: int(), min_poin: int(), benefit: str({ nullable: true }), created_at: str({ format: 'date-time' }) }),
  TierInput: obj({ nama: str(), urutan: int({ minimum: 1 }), min_poin: int({ minimum: 0 }), benefit: str({ nullable: true }) }, ['nama', 'urutan', 'min_poin']),
  TierProgress: obj({ tier_saat_ini: { allOf: [ref('Tier')], nullable: true }, tier_berikutnya: { allOf: [ref('Tier')], nullable: true }, poin_saat_ini: int(), poin_dibutuhkan: int(), persen: int(), semua_tier: arr(ref('Tier')) }),
  Voucher: obj({ id: str(), kode: str({ example: 'ALP-7K3QX9M2' }), member_id: str(), reward_id: str(), reward_nama: str(), redeem_id: str(), status: str({ enum: ['active', 'reserved', 'used', 'expired', 'void'] }), issued_at: str({ format: 'date-time' }), expires_at: str({ format: 'date-time' }), reserved_until: str({ format: 'date-time', nullable: true }), used_at: str({ format: 'date-time', nullable: true }), void_reason: str({ nullable: true }) }),
  ChannelPointRule: obj({ channel: str(), rupiah_per_poin: int(), pembulatan: str({ enum: ['bawah', 'atas', 'terdekat'] }), minimal_transaksi: num(), updated_at: str({ format: 'date-time' }) }),
  Metrics: obj({ member_total: int(), member_aktif: int(), poin_beredar: int(), redemption_rate: int({ description: 'Persen' }), top_reward: arr(obj({ nama: str(), jumlah: int() })), tier: arr(obj({ nama: str(), jumlah_member: int() })), voucher: { type: 'object', additionalProperties: int() } }),
  IntegrationLog: obj({ id: str(), integrasi: str(), arah: str({ enum: ['masuk', 'keluar'] }), endpoint: str(), request_id: str({ nullable: true }), status_kode: int({ nullable: true }), payload: { type: 'object' }, hasil: { type: 'object' }, error: str({ nullable: true }), created_at: str({ format: 'date-time' }) }),
  AuditLog: obj({ id: str(), pelaku_tipe: str({ enum: ['admin', 'member', 'sistem'] }), pelaku_id: str({ nullable: true }), pelaku_nama: str({ nullable: true }), aksi: str({ example: 'struk.setujui' }), objek_tipe: str(), objek_id: str({ nullable: true }), detail: { type: 'object' }, created_at: str({ format: 'date-time' }) }),
};

function buildSpec({ serverUrl } = {}) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Alpaka Loyalty API',
      version: '1.0.0',
      description: [
        'REST API Sistem Loyalty Alpaka — Fase 1 (struk → validasi → approval → poin → redeem → notifikasi).',
        '',
        '**Cara mencoba:** panggil `POST /auth/login` (member) atau `POST /auth/admin/login` (admin), salin `token`, klik **Authorize** lalu tempel token (tanpa kata "Bearer").',
        '',
        '**Format:** sukses `{ data, meta? }`; galat `{ error: { code, message, details? } }`. Semua ID dikirim sebagai string. Sesi berakhir bila tidak aktif; token diperbarui lewat header respons `X-Refresh-Token`.',
        '',
        '**Data demo:** setelah `npm run seed:demo` → member `demo@alpaka.local` / `Demo-Alpaka-2026`.',
      ].join('\n'),
    },
    servers: [{ url: serverUrl || '/api', description: 'API' }],
    tags: [
      'Sistem', 'Auth', 'Publik', 'Member — Struk', 'Member — Poin', 'Member — Redeem', 'Member — Akun',
      'Admin — Struk', 'Admin — Redeem', 'Admin — Pengaturan', 'Admin — Reward', 'Admin — Pengguna', 'Admin — Audit',
      'Admin — Tier', 'Admin — Voucher', 'Admin — Dashboard', 'Integrasi More',
    ].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas,
    },
  };
}

module.exports = { buildSpec };
