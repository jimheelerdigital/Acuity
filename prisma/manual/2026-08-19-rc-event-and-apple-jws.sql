-- Additive-only migration, 2026-08-19.
--
-- ⚠️ APPLY THIS FILE. DO NOT RUN `prisma db push`.
--
-- Two changes:
--   1. RE-create "RevenueCatEvent". It was created on 2026-08-16 and has
--      since been DROPPED — something ran `prisma db push` from a branch
--      whose schema.prisma predates it. That same push added
--      CarouselPost.format / .storyVoiced and the CarouselFormat enum, which
--      is how we know which branch it came from.
--   2. Add User."appleSignedTransactionJws" — the Apple-signed StoreKit 2
--      JWSTransaction. RevenueCat's POST /v1/receipts accepts a
--      JWSTransaction as `fetch_token`; we previously decoded and DISCARDED
--      the signed original (apple-iap.ts decodeSignedTransactionInfo), so we
--      held nothing that could prove those purchases to RevenueCat.
--
-- Both statements are idempotent and safe to re-run.
--
-- Reversal:
--   DROP TABLE IF EXISTS "RevenueCatEvent";
--   ALTER TABLE "User" DROP COLUMN IF EXISTS "appleSignedTransactionJws";
--
-- NOTE: this file only ADDS. The recurring problem is the opposite
-- direction — `db push` from a branch whose schema lags prod silently drops
-- whatever that branch doesn't know about. schema.prisma has now been
-- reconciled with prod twice (2026-08-16 and 2026-08-19). Until out-of-band
-- SQL changes are back-declared as a rule, this will keep recurring.

CREATE TABLE IF NOT EXISTS "RevenueCatEvent" (
    "id"          TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueCatEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "appleSignedTransactionJws" TEXT;
