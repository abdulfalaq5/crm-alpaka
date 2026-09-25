ALTER TABLE members ADD COLUMN IF NOT EXISTS manual_tier_id BIGINT REFERENCES tiers (id);
ALTER TABLE member_tier_history ADD COLUMN IF NOT EXISTS alasan TEXT;
ALTER TABLE member_tier_history ADD COLUMN IF NOT EXISTS diubah_oleh BIGINT REFERENCES admins (id);

WITH balances AS (
  SELECT m.id AS member_id,
         COALESCE(SUM(l.jumlah) FILTER (WHERE l.jenis = 'masuk'), 0)
         - COALESCE(SUM(l.jumlah) FILTER (WHERE l.jenis = 'koreksi'), 0) AS poin
    FROM members m
    LEFT JOIN points_ledger l ON l.member_id = m.id
   GROUP BY m.id
), targets AS (
  SELECT b.member_id,
         (
           SELECT t.id
             FROM tiers t
            WHERE t.min_poin <= b.poin
            ORDER BY t.urutan DESC, t.id DESC
            LIMIT 1
         ) AS tier_id
    FROM balances b
)
UPDATE members m
   SET current_tier_id = targets.tier_id
  FROM targets
 WHERE m.id = targets.member_id
   AND m.manual_tier_id IS NULL
   AND m.current_tier_id IS DISTINCT FROM targets.tier_id;

CREATE INDEX IF NOT EXISTS members_current_tier_idx ON members (current_tier_id);
CREATE INDEX IF NOT EXISTS members_manual_tier_idx ON members (manual_tier_id);

ALTER TABLE members DROP CONSTRAINT IF EXISTS members_manual_tier_chk;
ALTER TABLE members ADD CONSTRAINT members_manual_tier_chk
  CHECK (manual_tier_id IS NULL OR current_tier_id = manual_tier_id) NOT VALID;
ALTER TABLE members VALIDATE CONSTRAINT members_manual_tier_chk;
