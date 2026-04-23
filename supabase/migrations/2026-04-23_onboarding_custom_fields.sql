-- 2026-04-23 — Add freeform "Other" text fields on UserDemographics
--
-- Onboarding step 3 collects "What brings you here?" (chips: Career /
-- Relationships / Mental health / Productivity / Curiosity / Other) and
-- "Life stage" (chips including "Other" and "In transition"). When the
-- user picks one of the ambiguous options, render a text input so they
-- can elaborate — otherwise the long tail of motivations / transitions
-- gets collapsed into an "Other" bucket that's useless for analysis.
--
-- Idempotent. Safe to re-run.

ALTER TABLE "UserDemographics"
  ADD COLUMN IF NOT EXISTS "primaryReasonsCustom" TEXT,
  ADD COLUMN IF NOT EXISTS "lifeStageCustom" TEXT;
