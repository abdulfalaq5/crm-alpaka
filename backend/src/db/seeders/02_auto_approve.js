// Kriteria auto-approve (OI-05). Default NONAKTIF: semua struk masuk antrean manual sampai admin mengaktifkan.
async function run(db) {
  await db.query(
    `INSERT INTO auto_approve_criteria (kode, kriteria, nilai) VALUES
       ('channel', 'Channel transaksi termasuk daftar terpercaya', '{"channels": []}'),
       ('batas_nominal', 'Nominal transaksi tidak melebihi batas', '{"maks": 500000}')
     ON CONFLICT (kode) DO NOTHING`
  );
  return 'kriteria auto-approve';
}

module.exports = { run };
