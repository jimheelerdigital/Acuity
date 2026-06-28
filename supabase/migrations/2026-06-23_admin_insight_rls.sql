-- 2026-06-23 — AdminInsight RLS (MRI diagnostic dashboard, PR #10)
--
-- Stores Claude-generated business analysis (revenue patterns, churn risks,
-- MRI findings) for the admin dashboard. Business-sensitive, so RLS must be on
-- — same posture as the other admin/sensitive tables.
--
-- Baseline pattern (matches 2026-06-23_user_notification_preferences_rls.sql /
-- 2026-06-03_consent_record.sql): enable RLS + a single RESTRICTIVE "Deny all
-- for non-service" policy. The admin API + the generate-insights cron use the
-- service-role Prisma client, which bypasses RLS; anon/authenticated roles are
-- denied all access. No per-row auth.uid() policy — Acuity has no
-- Supabase-Auth end-users; nothing connects to the DB directly except the
-- service role. (AdminInsight has no userId — it's admin-generated aggregate
-- analysis, not user-owned — so there is no per-user row scoping to express.)
--
-- Idempotent: ENABLE RLS is idempotent; DROP POLICY IF EXISTS precedes CREATE.
-- Run AFTER `prisma db push` creates the table.

ALTER TABLE "AdminInsight" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "AdminInsight";
CREATE POLICY "Deny all for non-service"
  ON "AdminInsight"
  AS RESTRICTIVE
  FOR ALL
  USING (false);
