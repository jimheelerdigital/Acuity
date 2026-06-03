-- 2026-06-03 — ConsentRecord model (v1.4 GDPR slice)
--
-- Append-only ledger of explicit consents we must be able to evidence
-- under UK/EU GDPR Art. 7(1):
--   - 'special_category_processing'              (Art. 9(2)(a), onboarding)
--   - 'distance_contract_immediate_performance'  (Consumer Contracts Regs
--      2013 Reg. 36–37 / EU Dir. 2011/83 Art. 16(m), checkout / IAP)
--
-- Append-only: a withdrawal/decline inserts a new row with granted=false;
-- it never updates or deletes the prior grant. Current state for a
-- (userId, consentType) pair = the latest row by createdAt.
--
-- NOTE: deliberately NO foreign key to "User". These records are a
-- compliance tombstone that must survive account deletion (Privacy §6);
-- they hold only the wording + metadata the user saw, never content.
--
-- Idempotent: IF NOT EXISTS on the table + index. Safe to re-run.

CREATE TABLE IF NOT EXISTS "ConsentRecord" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "consentType"    TEXT NOT NULL,
  "granted"        BOOLEAN NOT NULL,
  "consentText"    TEXT NOT NULL,
  "wordingVersion" TEXT NOT NULL,
  "policyVersion"  TEXT NOT NULL,
  "platform"       TEXT NOT NULL,
  "appVersion"     TEXT,
  "plan"           TEXT,
  "region"         TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- Current consent state = latest row per (userId, consentType) by createdAt.
CREATE INDEX IF NOT EXISTS "ConsentRecord_userId_consentType_createdAt_idx"
  ON "ConsentRecord" ("userId", "consentType", "createdAt");

-- RLS — baseline pattern: enable RLS, deny all for anon/authenticated.
-- Prisma uses the service-role client, which bypasses RLS. Matches the
-- 2026-04-23_progress_suggestion.sql / rls_close_gaps.sql policy style.
ALTER TABLE "ConsentRecord" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "ConsentRecord";
CREATE POLICY "Deny all for non-service"
  ON "ConsentRecord"
  AS RESTRICTIVE
  FOR ALL
  USING (false);

-- Product-analytics opt-out (same slice). POST-AUTH product/funnel
-- events in /api/onboarding-events are dropped when this is false;
-- /api/user/product-analytics reads + writes it. Default true so
-- existing users stay measured. Additive + idempotent — safe to re-run.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "productAnalyticsEnabled" BOOLEAN NOT NULL DEFAULT true;
