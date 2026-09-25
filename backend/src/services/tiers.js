const { audit } = require('./audit');
const { notFound, unprocessable } = require('../utils/http');

const TIER_DEFINITION_LOCK = 'tier_definitions';

async function lockTierDefinitions(db) {
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [TIER_DEFINITION_LOCK]);
}

async function lockTierEvaluation(db) {
  await db.query('SELECT pg_advisory_xact_lock_shared(hashtext($1))', [TIER_DEFINITION_LOCK]);
}

async function lifetimePoints(db, memberId) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'masuk'), 0)::int
           - COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'koreksi'), 0)::int AS total
       FROM points_ledger WHERE member_id = $1`,
    [memberId]
  );
  return rows[0].total;
}

async function listTiers(db) {
  const { rows } = await db.query('SELECT * FROM tiers ORDER BY urutan, id');
  return rows;
}

function sameId(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) return left == null && right == null;
  return String(left) === String(right);
}

function orderedTiers(tiers) {
  return [...tiers].sort((a, b) => Number(a.urutan) - Number(b.urutan));
}

function tierForPoints(tiers, poin) {
  const eligible = orderedTiers(tiers).filter((tier) => Number(poin) >= Number(tier.min_poin));
  return eligible[eligible.length - 1] || null;
}

function progress(tiers, poin, { currentTierId, manual = false } = {}) {
  const ordered = orderedTiers(tiers);
  const otomatis = tierForPoints(ordered, poin);
  const current = manual ? ordered.find((tier) => sameId(tier.id, currentTierId)) || otomatis : otomatis;
  const currentIndex = current ? ordered.findIndex((tier) => sameId(tier.id, current.id)) : -1;
  const next = ordered[currentIndex + 1] || null;
  const points = Number(poin || 0);
  let percent = ordered.length ? 100 : 0;

  if (next) {
    const start = manual ? 0 : Number(current?.min_poin || 0);
    const target = Number(next.min_poin);
    percent = target > start ? Math.max(0, Math.min(100, Math.round(((points - start) / (target - start)) * 100))) : 0;
  }

  return {
    tier_saat_ini: current,
    tier_berikutnya: next,
    tier_otomatis: otomatis,
    tier_manual: Boolean(manual && current),
    poin_saat_ini: points,
    poin_dibutuhkan: next ? Math.max(Number(next.min_poin) - points, 0) : 0,
    persen: percent,
  };
}

async function getMemberTierProgress(db, memberId) {
  const [tiers, poin, member] = await Promise.all([
    listTiers(db),
    lifetimePoints(db, memberId),
    db.query('SELECT current_tier_id, manual_tier_id FROM members WHERE id = $1', [memberId]),
  ]);
  if (!member.rows.length) throw notFound('Member tidak ditemukan');
  return {
    ...progress(tiers, poin, {
      currentTierId: member.rows[0].current_tier_id,
      manual: member.rows[0].manual_tier_id !== null,
    }),
    semua_tier: tiers,
  };
}

async function validateTierDefinition(db, definition, id = null) {
  await lockTierDefinitions(db);
  const tiers = await listTiers(db);
  const candidate = { ...definition, id: id || 'candidate' };
  const ordered = orderedTiers([...tiers.filter((tier) => !sameId(tier.id, id)), candidate]);
  for (let index = 1; index < ordered.length; index += 1) {
    if (Number(ordered[index].min_poin) <= Number(ordered[index - 1].min_poin)) {
      throw unprocessable('Urutan tier harus diikuti minimum poin yang semakin tinggi.', {
        min_poin: `Minimum poin harus lebih besar dari tier “${ordered[index - 1].nama}”.`,
      });
    }
  }
  return ordered;
}

async function insertHistory(client, { memberId, fromTierId, toTierId, cause, reason = null, adminId = null }) {
  await client.query(
    `INSERT INTO member_tier_history (member_id, dari_tier_id, ke_tier_id, sebab, alasan, diubah_oleh)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [memberId, fromTierId, toTierId, cause, reason, adminId]
  );
}

async function reevaluateWithTiers(client, memberId, tiers) {
  const { rows } = await client.query(
    'SELECT current_tier_id, manual_tier_id FROM members WHERE id = $1 FOR UPDATE',
    [memberId]
  );
  if (!rows.length) throw notFound('Member tidak ditemukan');
  if (rows[0].manual_tier_id !== null) {
    return tiers.find((tier) => sameId(tier.id, rows[0].manual_tier_id)) || null;
  }

  const poin = await lifetimePoints(client, memberId);
  const next = tierForPoints(tiers, poin);
  const currentId = rows[0].current_tier_id;
  const nextId = next?.id || null;
  if (sameId(currentId, nextId)) return next;

  await client.query('UPDATE members SET current_tier_id = $2, updated_at = now() WHERE id = $1', [memberId, nextId]);
  await insertHistory(client, { memberId, fromTierId: currentId, toTierId: nextId, cause: 'otomatis' });
  await audit(client, {
    pelakuTipe: 'sistem',
    aksi: 'tier.naik_turun',
    objekTipe: 'member',
    objekId: memberId,
    detail: { dari: currentId, ke: nextId, poin },
  });
  return next;
}

async function reevaluate(client, memberId) {
  await lockTierEvaluation(client);
  return reevaluateWithTiers(client, memberId, await listTiers(client));
}

async function reevaluateAll(client) {
  await lockTierDefinitions(client);
  const tiers = await listTiers(client);
  const { rows: members } = await client.query(
    `WITH balances AS (
       SELECT m.id AS member_id, m.current_tier_id,
              COALESCE(SUM(l.jumlah) FILTER (WHERE l.jenis = 'masuk'), 0)
              - COALESCE(SUM(l.jumlah) FILTER (WHERE l.jenis = 'koreksi'), 0) AS poin
         FROM members m
         LEFT JOIN points_ledger l ON l.member_id = m.id
        WHERE m.manual_tier_id IS NULL
        GROUP BY m.id, m.current_tier_id
     )
     SELECT b.member_id AS id
       FROM balances b
       LEFT JOIN LATERAL (
         SELECT t.id
           FROM tiers t
          WHERE t.min_poin <= b.poin
          ORDER BY t.urutan DESC, t.id DESC
          LIMIT 1
       ) target ON true
      WHERE b.current_tier_id IS DISTINCT FROM target.id
      ORDER BY b.member_id`
  );
  for (const member of members) await reevaluateWithTiers(client, member.id, tiers);
  return members.length;
}

async function assignTier(client, { memberId, tierId = null, reason, adminId }) {
  await lockTierEvaluation(client);
  const { rows } = await client.query(
    'SELECT id, nama, current_tier_id, manual_tier_id FROM members WHERE id = $1 FOR UPDATE',
    [memberId]
  );
  if (!rows.length) throw notFound('Member tidak ditemukan');

  const normalizedTierId = tierId == null ? null : String(tierId);
  let targetTier = null;
  if (normalizedTierId !== null) {
    const target = await client.query('SELECT * FROM tiers WHERE id = $1', [normalizedTierId]);
    if (!target.rows.length) throw notFound('Tier tujuan tidak ditemukan');
    targetTier = target.rows[0];
  }

  const tiers = await listTiers(client);
  const poin = await lifetimePoints(client, memberId);
  const otomatis = tierForPoints(tiers, poin);
  const nextId = targetTier?.id || otomatis?.id || null;
  const currentId = rows[0].current_tier_id;
  const currentManualId = rows[0].manual_tier_id;
  const tierChanged = !sameId(currentId, nextId);
  const modeChanged = !sameId(currentManualId, normalizedTierId);

  if (tierChanged || modeChanged) {
    await client.query(
      'UPDATE members SET current_tier_id = $2, manual_tier_id = $3, updated_at = now() WHERE id = $1',
      [memberId, nextId, normalizedTierId]
    );
    await insertHistory(client, {
      memberId,
      fromTierId: currentId,
      toTierId: nextId,
      cause: 'manual',
      reason,
      adminId,
    });
  }

  await audit(client, {
    pelakuTipe: 'admin',
    pelakuId: adminId,
    aksi: normalizedTierId === null ? 'tier.kembalikan_otomatis' : 'tier.manual',
    objekTipe: 'member',
    objekId: memberId,
    detail: { dari: currentId, ke: nextId, alasan: reason, poin_lifetime: poin },
  });

  return {
    id: String(memberId),
    nama: rows[0].nama,
    ...progress(tiers, poin, { currentTierId: nextId, manual: normalizedTierId !== null }),
    semua_tier: tiers,
  };
}

module.exports = {
  listTiers,
  lifetimePoints,
  tierForPoints,
  progress,
  getMemberTierProgress,
  lockTierDefinitions,
  lockTierEvaluation,
  validateTierDefinition,
  reevaluate,
  reevaluateAll,
  assignTier,
};
