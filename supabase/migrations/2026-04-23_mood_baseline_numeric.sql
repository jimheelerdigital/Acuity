-- 2026-04-23 — Add UserOnboarding.moodBaselineNumeric for the 10-point slider
--
-- Mood selector redesigned from 5-emoji buttons (GREAT/GOOD/NEUTRAL/LOW/
-- ROUGH) to a 10-point therapy-app-style numerical slider. New onboarding
-- writes both the numeric value (1-10) AND the bucketed string (so legacy
-- consumers like the Life Audit prompt keep working). Null on users who
-- onboarded before this column existed.
--
-- Idempotent. Safe to re-run.

ALTER TABLE "UserOnboarding"
  ADD COLUMN IF NOT EXISTS "moodBaselineNumeric" INTEGER;
