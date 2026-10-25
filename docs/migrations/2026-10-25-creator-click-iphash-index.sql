-- Referral suggestion lookup (GET /api/creators/suggest): newest link tap
-- from an IP hash within 24h. Additive, safe to apply any time.
CREATE INDEX IF NOT EXISTS "CreatorReferralClick_ipHash_createdAt_idx"
  ON "CreatorReferralClick" ("ipHash", "createdAt");
