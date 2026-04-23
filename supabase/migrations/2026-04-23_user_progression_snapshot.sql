-- 2026-04-23 — Add User.progressionSnapshot for userProgression() diff
--
-- The userProgression() helper in packages/shared/src/userProgression.ts
-- returns a `recentlyUnlocked` array, which is the set of UnlockKeys that
-- flipped false → true since the last computation. The diff requires a
-- persisted baseline.
--
-- Using a Json column rather than a separate table because:
--   - 1:1 with User (no foreign-key overhead)
--   - Always read together with User (no extra round-trip)
--   - Shape will evolve (new unlock keys, new streak fields) — Json keeps
--     the migration-to-new-shape free
--   - Null-valued on users who've never hit /api/user/progression; the
--     helper treats null-previous as "no celebrations, just seed"
--
-- Idempotent: IF NOT EXISTS guards the add.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "progressionSnapshot" JSONB;
