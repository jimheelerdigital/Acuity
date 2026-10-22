-- 2026-10-22 — CreatorCode (custom + retired referral codes). Same posture as
-- 2026-10-22_creator_platform_rls.sql. Run AFTER db:push.
ALTER TABLE "CreatorCode" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "CreatorCode";
CREATE POLICY "Deny all for non-service"
  ON "CreatorCode"
  AS RESTRICTIVE
  FOR ALL
  USING (false);
