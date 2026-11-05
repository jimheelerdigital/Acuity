-- 2026-10-28: Google Calendar direct sign-in (feat/gcal-direct). Additive.
--
-- Reuses the existing (empty, RLS-locked) "CalendarConnection" table for the
-- server-side "google" calendar provider. Two nullable columns; no backfill.
-- accessToken / refreshToken already exist on the table and will hold
-- AES-256-GCM ciphertext only.
--
-- Apply BEFORE deploying the code. The code is also behind the
-- calendar_google_direct feature flag (no FeatureFlag row = off), so nothing
-- writes these columns until the flag is turned on.
ALTER TABLE "CalendarConnection" ADD COLUMN IF NOT EXISTS "accountEmail" TEXT;
ALTER TABLE "CalendarConnection" ADD COLUMN IF NOT EXISTS "grantedScopes" TEXT;

-- Already enabled by supabase/migrations/2026-04-23_rls_close_gaps.sql
-- (plus a restrictive deny-all policy and column REVOKEs on the token
-- columns); repeated here so this file is safe on its own.
ALTER TABLE public."CalendarConnection" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CalendarConnection" FROM anon, authenticated;

-- Feature flag row, OFF. Turn on per user with a UserFeatureOverride, or
-- globally by setting enabled = true / rolloutPercentage.
-- The row must exist for a per-user override to apply (isEnabled returns
-- false when there is no row at all).
INSERT INTO "FeatureFlag" ("id", "key", "name", "description", "enabled", "rolloutPercentage", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'calendar_google_direct', 'Google Calendar direct sign-in',
        'Server writes task events straight to Google Calendar through the Calendar API (no phone needed)',
        false, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
