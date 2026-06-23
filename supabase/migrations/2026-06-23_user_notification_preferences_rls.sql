-- 2026-06-23 — UserNotificationPreferences RLS
--
-- Smart-notifications engagement preferences (1:1 with User), created via
-- `prisma db push` on 2026-06-23 (PR #15). Holds userId + per-user
-- notification settings — user data, so RLS must be on.
--
-- Baseline pattern (matches 2026-06-03_consent_record.sql /
-- 2026-04-23_rls_close_gaps.sql): enable RLS + a single RESTRICTIVE
-- "Deny all for non-service" policy. The app + the (future) notification
-- cron use the service-role Prisma client, which bypasses RLS; the
-- anon/authenticated roles (e.g. the public key) are denied all access.
-- Acuity has no Supabase-Auth end-users — nothing connects to the DB
-- directly except the service role — so there is deliberately NO per-row
-- auth.uid() policy; deny-all is the correct, audited shape here.
--
-- Idempotent: ENABLE RLS is idempotent; DROP POLICY IF EXISTS precedes
-- CREATE so re-running is safe. (Prod already had RLS enabled with zero
-- policies after the db push; this adds the explicit restrictive policy.)

ALTER TABLE "UserNotificationPreferences" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "UserNotificationPreferences";
CREATE POLICY "Deny all for non-service"
  ON "UserNotificationPreferences"
  AS RESTRICTIVE
  FOR ALL
  USING (false);
