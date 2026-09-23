/** Export CSV sederhana (Admin Dashboard: "nilai tambah kalau ada waktu"). */
function escapeCsv(v) {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows, columns) {
  const header = columns.map((c) => c.label).join(',');
  const body = rows.map((r) => columns.map((c) => escapeCsv(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(',')).join('\n');
  return `${header}\n${body}\n`;
}

function sendCsv(res, filename, rows, columns) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`﻿${toCsv(rows, columns)}`); // BOM agar Excel membaca UTF-8 dengan benar
}

module.exports = { toCsv, sendCsv };
