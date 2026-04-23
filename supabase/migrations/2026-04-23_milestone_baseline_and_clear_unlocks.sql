-- 2026-04-23 — Phase 2 Run 2: streak milestones baseline + clear unlock backlog
--
-- Two prod-cleanliness migrations bundled because they run together at
-- the same deploy:
--
-- 1) Add User.milestoneBaselineStreak Int DEFAULT 0, then backfill each
--    existing user's baseline = their current streak at this moment.
--    This prevents the retroactive-dump where a user at streak 35 would
--    suddenly see 3+7+14+30 milestone cards stack up on their first
--    post-deploy snapshot. New milestones fire only if threshold >
--    baseline (AND > lastStreakMilestone — both guards active).
--
-- 2) Clear `recentlyUnlocked` inside any existing
--    User.progressionSnapshot. Phase 1 populated the diff but never
--    rendered it; the stored snapshots can carry stale unlock keys
--    that would fire as cards on the first render. Setting them to
--    [] at deploy makes unlock cards fire going forward only.
--    (Note: in the current userProgression pure function, stored
--    recentlyUnlocked is inert — the diff only reads
--    previousProgression.unlocked. But updating this defensively
--    means future read paths can't accidentally re-surface stale
--    keys. Idempotent via JSONB set-if-exists pattern.)
--
-- Idempotent. Safe to re-run.

-- ─── (1) Baseline streak ──────────────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "milestoneBaselineStreak" INTEGER NOT NULL DEFAULT 0;

-- Backfill ONCE — only when the column is still at its default (0)
-- AND the user has a streak > 0. Idempotent: re-running won't
-- overwrite a user whose baseline is already non-zero, which means
-- a second apply after a real milestone celebration won't mis-set
-- the baseline higher than the deploy moment.
UPDATE "User"
  SET "milestoneBaselineStreak" = "currentStreak"
  WHERE "milestoneBaselineStreak" = 0
    AND "currentStreak" > 0;

-- ─── (2) Clear recentlyUnlocked backlog in snapshots ──────────────
-- jsonb_set with create_missing=false: only updates when the key
-- already exists. Snapshot shape includes `recentlyUnlocked`
-- (see apps/web/src/lib/userProgression.ts::serializeSnapshot).
-- Users with a null snapshot are untouched.
UPDATE "User"
  SET "progressionSnapshot" =
    jsonb_set(
      "progressionSnapshot"::jsonb,
      '{recentlyUnlocked}',
      '[]'::jsonb,
      false
    )
  WHERE "progressionSnapshot" IS NOT NULL
    AND jsonb_typeof("progressionSnapshot"::jsonb -> 'recentlyUnlocked') = 'array'
    AND jsonb_array_length("progressionSnapshot"::jsonb -> 'recentlyUnlocked') > 0;
