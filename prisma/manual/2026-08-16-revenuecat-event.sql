-- RevenueCatEvent — webhook idempotency ledger.
--
-- ⚠️ APPLY THIS FILE. DO NOT RUN `prisma db push` FOR THIS CHANGE.
--
-- Why: on 2026-08-16, `prisma migrate diff` against the live database showed
-- that `prisma db push` from this branch would ALSO drop 13 columns from
-- "CarouselPost" — comments, instagramUrl, lane, likes, metricsAt, mood,
-- saves, shares, storyTheme, storyVideoUrl, tiktokUrl, views, withheldReason.
--
-- Those columns exist in production but NOT in this branch's schema.prisma:
-- they were added by the carousel / content-factory work and prod is AHEAD of
-- this branch. `db push` reconciles the DB *to* the local schema, so it would
-- REVERT them. A read-only count confirmed "storyVideoUrl" holds 5 real
-- values, so this is live data loss, not just schema churn.
--
-- This file is therefore the additive-only subset: it creates the one new
-- table and touches nothing else.
--
-- Reversal:  DROP TABLE IF EXISTS "RevenueCatEvent";
-- Safe to run more than once (IF NOT EXISTS).
--
-- Nothing reads or writes this table while RC_SOURCE_OF_TRUTH is off — the
-- webhook runs in observer mode and never reaches the dedup path. Creating it
-- early is inert; it only needs to exist BEFORE that flag is flipped.

CREATE TABLE IF NOT EXISTS "RevenueCatEvent" (
    "id"          TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueCatEvent_pkey" PRIMARY KEY ("id")
);
