-- 2026-06-23 — NotificationLog RLS (smart-notifications PR 2)
--
-- Send log for the engagement-notification scheduler: one row per
-- notification sent/skipped, with userId + the exact rendered content.
-- User data, so RLS must be on.
--
-- Baseline pattern (matches 2026-06-23_user_notification_preferences_rls.sql /
-- 2026-06-03_consent_record.sql): enable RLS + a single RESTRICTIVE
-- "Deny all for non-service" policy. The scheduler cron + the Resend webhook
-- use the service-role Prisma client, which bypasses RLS; anon/authenticated
-- roles are denied all access. No per-row auth.uid() policy — Acuity has no
-- Supabase-Auth end-users; nothing connects to the DB directly except the
-- service role.
--
-- Idempotent: ENABLE RLS is idempotent; DROP POLICY IF EXISTS precedes CREATE.
-- Run AFTER `prisma db push` creates the table.

ALTER TABLE "NotificationLog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "NotificationLog";
CREATE POLICY "Deny all for non-service"
  ON "NotificationLog"
  AS RESTRICTIVE
  FOR ALL
  USING (false);
