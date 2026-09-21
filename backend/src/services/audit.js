// Catat aksi ke audit_logs. Tabel ini immutable (trigger di schema.sql) — tidak ada fungsi update/delete.
async function audit(client, { pelakuTipe, pelakuId = null, aksi, objekTipe, objekId = null, detail = {} }) {
  await client.query(
    `INSERT INTO audit_logs (pelaku_tipe, pelaku_id, aksi, objek_tipe, objek_id, detail)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [pelakuTipe, pelakuId, aksi, objekTipe, objekId, JSON.stringify(detail)]
  );
}

module.exports = { audit };
