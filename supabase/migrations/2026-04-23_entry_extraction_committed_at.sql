-- 2026-04-23 — Add Entry.extractionCommittedAt for review-before-commit flow
--
-- The extraction pipeline no longer auto-creates Task / Goal rows from the
-- Claude extraction. Instead, the user reviews the extracted tasks + goals
-- on the entry detail page and commits only the ones they want to keep.
-- This column tracks whether the user has reviewed — null means the review
-- banner should render, set means the user has already decided (either
-- committed some items, or hit "Skip all" which commits zero).
--
-- Backfill: every EXISTING entry gets extractionCommittedAt = createdAt so
-- legacy entries don't suddenly sprout review banners. Only new entries
-- (created after this migration) will have the null default.
--
-- Idempotent: IF NOT EXISTS on the add; backfill UPDATE is guarded by IS
-- NULL so re-running is safe.

ALTER TABLE "Entry"
  ADD COLUMN IF NOT EXISTS "extractionCommittedAt" TIMESTAMP(3);

UPDATE "Entry"
  SET "extractionCommittedAt" = "createdAt"
  WHERE "extractionCommittedAt" IS NULL;
