-- Session revocation marker for the signup account-takeover fix (2026-10-18).
-- Additive, nullable. Applied to production as Supabase migration
-- `user_sessions_invalid_before`.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionsInvalidBefore" TIMESTAMP(3);
