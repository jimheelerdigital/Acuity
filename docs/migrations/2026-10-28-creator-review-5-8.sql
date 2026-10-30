-- 2026-10-28: creator payments review, findings 5-8. Additive only.
-- Apply BEFORE deploying the code (the RC webhook writes the new enum
-- values; email attribution reads the new column).

-- 5. A captured email only attributes once its owner opened the emailed link.
--    Rows captured before this change stay unverified and no longer attribute.
ALTER TABLE "CreatorReferralClick" ADD COLUMN IF NOT EXISTS "capturedEmailVerifiedAt" TIMESTAMP(3);

-- 8. RevenueCat Web Billing payments.
ALTER TYPE "CreatorRevenueStore" ADD VALUE IF NOT EXISTS 'rc_billing';

-- 7. App Store refund reversed (clawback undone).
ALTER TYPE "CreatorRevenueType" ADD VALUE IF NOT EXISTS 'refund_reversed';
