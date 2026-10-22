-- 2026-10-22 — Creator platform (referrals, commission ledger, payouts) RLS
--
-- Hashed click data, captured emails (third-party PII), customer → creator links,
-- money rows and payout records. Same posture as 2026-10-06_ugc_outreach_rls.sql:
-- enable RLS + one RESTRICTIVE "Deny all for non-service" policy. All access is
-- through the service-role Prisma client (API routes + creators-* Inngest jobs).
--
-- Idempotent. Run AFTER `npm run db:push` (from main) creates the tables.
ALTER TABLE "CreatorReferralClick" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "CreatorReferralClick";
CREATE POLICY "Deny all for non-service"
  ON "CreatorReferralClick"
  AS RESTRICTIVE
  FOR ALL
  USING (false);

ALTER TABLE "CreatorReferral" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "CreatorReferral";
CREATE POLICY "Deny all for non-service"
  ON "CreatorReferral"
  AS RESTRICTIVE
  FOR ALL
  USING (false);

ALTER TABLE "CreatorRevenueEvent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "CreatorRevenueEvent";
CREATE POLICY "Deny all for non-service"
  ON "CreatorRevenueEvent"
  AS RESTRICTIVE
  FOR ALL
  USING (false);

ALTER TABLE "CreatorLedgerEntry" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "CreatorLedgerEntry";
CREATE POLICY "Deny all for non-service"
  ON "CreatorLedgerEntry"
  AS RESTRICTIVE
  FOR ALL
  USING (false);

ALTER TABLE "CreatorPayout" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "CreatorPayout";
CREATE POLICY "Deny all for non-service"
  ON "CreatorPayout"
  AS RESTRICTIVE
  FOR ALL
  USING (false);

ALTER TABLE "CreatorFlag" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "CreatorFlag";
CREATE POLICY "Deny all for non-service"
  ON "CreatorFlag"
  AS RESTRICTIVE
  FOR ALL
  USING (false);

ALTER TABLE "CreatorPost" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "CreatorPost";
CREATE POLICY "Deny all for non-service"
  ON "CreatorPost"
  AS RESTRICTIVE
  FOR ALL
  USING (false);
