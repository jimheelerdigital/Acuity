-- 2026-10-06 — UGC creator outreach RLS
--
-- Creator emails and handles (third-party PII), outreach bodies, and an
-- encrypted Gmail refresh token (UgcMailbox). Same posture as
-- 2026-06-23_admin_insight_rls.sql: enable RLS + one RESTRICTIVE
-- "Deny all for non-service" policy. The admin API and the ugc-* Inngest
-- jobs use the service-role Prisma client, which bypasses RLS.
--
-- Idempotent. Run AFTER `npm run db:push` creates the tables.
ALTER TABLE "UgcCreator" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "UgcCreator";
CREATE POLICY "Deny all for non-service"
  ON "UgcCreator"
  AS RESTRICTIVE
  FOR ALL
  USING (false);

ALTER TABLE "UgcStatusEvent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "UgcStatusEvent";
CREATE POLICY "Deny all for non-service"
  ON "UgcStatusEvent"
  AS RESTRICTIVE
  FOR ALL
  USING (false);

ALTER TABLE "UgcOutreach" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "UgcOutreach";
CREATE POLICY "Deny all for non-service"
  ON "UgcOutreach"
  AS RESTRICTIVE
  FOR ALL
  USING (false);

ALTER TABLE "UgcBrief" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "UgcBrief";
CREATE POLICY "Deny all for non-service"
  ON "UgcBrief"
  AS RESTRICTIVE
  FOR ALL
  USING (false);

ALTER TABLE "UgcVideo" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "UgcVideo";
CREATE POLICY "Deny all for non-service"
  ON "UgcVideo"
  AS RESTRICTIVE
  FOR ALL
  USING (false);

ALTER TABLE "UgcRun" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "UgcRun";
CREATE POLICY "Deny all for non-service"
  ON "UgcRun"
  AS RESTRICTIVE
  FOR ALL
  USING (false);

ALTER TABLE "UgcDoNotContact" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "UgcDoNotContact";
CREATE POLICY "Deny all for non-service"
  ON "UgcDoNotContact"
  AS RESTRICTIVE
  FOR ALL
  USING (false);

ALTER TABLE "UgcMailbox" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "UgcMailbox";
CREATE POLICY "Deny all for non-service"
  ON "UgcMailbox"
  AS RESTRICTIVE
  FOR ALL
  USING (false);

