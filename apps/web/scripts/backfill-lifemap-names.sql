-- Bug 2 (2026-05-24): LifeMapArea.name backfill to canonical V2 labels.
--
-- Database state before this script ran:
--   * 5 LifeMapArea rows for V1-era axes (CAREER, MONEY, FAMILY,
--     GROWTH, PHYSICAL_HEALTH) carried stale V1 strings in `name`
--     ("Relationships", "Personal Growth", "Health", "Finances" —
--     left over from when the migration populated `area` but didn't
--     refresh the display label).
--   * 5 LifeMapArea rows for V2-only axes (FUN, MENTAL_HEALTH,
--     PURPOSE, FRIENDS, ROMANCE) had `name = NULL` because the
--     bootstrap-user.ts seeder doesn't set it (relies on the
--     `LIFE_AREA_DISPLAY` constant at render time).
--
-- Web render code now reads `lifeAreaDisplayLabel(area.area)` from
-- @acuity/shared (commit X), so this backfill is technically not
-- required for correct rendering — but `LifeMapArea.name` is also
-- exported by `/api/lifemap/history` and could leak stale values
-- into other consumers. Fixing the column at the source.
--
-- Source of truth: packages/shared/src/constants.ts → LIFE_AREA_DISPLAY.
--
-- One transactional UPDATE per row (CASE expression matches `area`
-- enum to canonical label). Safe to re-run; idempotent (no-op on
-- already-correct rows).
--
-- REVIEW BEFORE RUNNING. Then:
--   1. Open Supabase SQL editor for the prod project
--   2. Paste this script
--   3. Run BEGIN; → preview SELECT (see commented block below)
--   4. Inspect the rows
--   5. Run the UPDATE
--   6. SELECT again to confirm
--   7. COMMIT (or ROLLBACK if anything looks wrong)

BEGIN;

-- Preview: what's in the column today?
-- (Uncomment to inspect before running the UPDATE.)
-- SELECT area, name, COUNT(*) AS row_count
--   FROM "LifeMapArea"
--  GROUP BY area, name
--  ORDER BY area;

UPDATE "LifeMapArea"
   SET name = CASE area
     WHEN 'CAREER'          THEN 'Career'
     WHEN 'MONEY'           THEN 'Money'
     WHEN 'ROMANCE'         THEN 'Romance'
     WHEN 'FAMILY'          THEN 'Family'
     WHEN 'FRIENDS'         THEN 'Friends & Community'
     WHEN 'PHYSICAL_HEALTH' THEN 'Physical Health'
     WHEN 'MENTAL_HEALTH'   THEN 'Mental Health'
     WHEN 'GROWTH'          THEN 'Growth & Learning'
     WHEN 'FUN'             THEN 'Fun'
     WHEN 'PURPOSE'         THEN 'Purpose & Meaning'
     -- Legacy V1-era areas (HEALTH, RELATIONSHIPS, FINANCES,
     -- PERSONAL, OTHER) shouldn't exist in LifeMapArea post-Phase D
     -- migration. If any remain, keep their existing name unchanged
     -- via ELSE — they're orphaned and should be cleaned up
     -- separately, not pretended into a V2 label.
     ELSE name
   END
 WHERE area IN (
   'CAREER', 'MONEY', 'ROMANCE', 'FAMILY', 'FRIENDS',
   'PHYSICAL_HEALTH', 'MENTAL_HEALTH', 'GROWTH', 'FUN', 'PURPOSE'
 );

-- Post-update verification:
-- SELECT area, name, COUNT(*) AS row_count
--   FROM "LifeMapArea"
--  GROUP BY area, name
--  ORDER BY area;

-- COMMIT;  -- uncomment after preview verification
