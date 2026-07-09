-- 2026-07-09 — RevenueEvent table + RLS (revenue-accuracy rebuild, Stage 1)
--
-- Event-sourced revenue ledger. Replaces the admin's DB-derived revenue
-- placeholder (`subscriptionStatus = PRO × $4.99`) with actual collected cash.
-- See docs/specs/revenue-accuracy-fix-plan.md (RC3 + RC6).
--
-- Column/constraint names below are exactly what Prisma generates for the
-- `RevenueEvent` model, so a subsequent `prisma db push` is a no-op (verified
-- with `prisma migrate diff`). Do not rename anything here without updating
-- prisma/schema.prisma to match.
--
-- Idempotency (see the model doc-comment for the full rationale):
--   * RevenueEvent_stripeEventId_key      → a redelivered webhook can't double-write
--   * RevenueEvent_stripeChargeId_type_key → the same charge can't be booked twice by
--     two different event types (charge.succeeded AND invoice.paid both fire), and
--     makes the historical backfill safe to re-run.
--
-- RLS: business-sensitive amounts. Same posture as AdminInsight /
-- ConsentRecord — enable RLS + a single RESTRICTIVE deny-all policy. The admin
-- API and the backfill script use the service-role Prisma client, which
-- bypasses RLS; anon/authenticated roles get nothing. No per-row auth.uid()
-- policy: RevenueEvent is admin-facing aggregate financial data, and Acuity has
-- no Supabase-Auth end-users connecting to the DB directly.
--
-- Idempotent: every statement is IF NOT EXISTS / DROP-then-CREATE.

CREATE TABLE IF NOT EXISTS "RevenueEvent" (
  "id"             TEXT NOT NULL,
  "source"         TEXT NOT NULL,
  "type"           TEXT NOT NULL,
  "stripeEventId"  TEXT,
  "stripeChargeId" TEXT,
  "customerEmail"  TEXT,
  "userId"         TEXT,
  "amountCents"    INTEGER NOT NULL,
  "currency"       TEXT NOT NULL DEFAULT 'usd',
  "plan"           TEXT,
  "occurredAt"     TIMESTAMP(3) NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RevenueEvent_pkey" PRIMARY KEY ("id")
);

-- Guard 1: webhook redelivery. NULL for backfill/manual rows; Postgres treats
-- NULLs as distinct so those never collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS "RevenueEvent_stripeEventId_key"
  ON "RevenueEvent" ("stripeEventId");

-- Guard 2: same money, different event. Also the key the backfill upserts on.
CREATE UNIQUE INDEX IF NOT EXISTS "RevenueEvent_stripeChargeId_type_key"
  ON "RevenueEvent" ("stripeChargeId", "type");

CREATE INDEX IF NOT EXISTS "RevenueEvent_occurredAt_idx"
  ON "RevenueEvent" ("occurredAt");

CREATE INDEX IF NOT EXISTS "RevenueEvent_source_idx"
  ON "RevenueEvent" ("source");

-- SET NULL, not CASCADE: deleting a user must never erase the record that they
-- paid us. customerEmail survives as the durable handle.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RevenueEvent_userId_fkey'
  ) THEN
    ALTER TABLE "RevenueEvent"
      ADD CONSTRAINT "RevenueEvent_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "RevenueEvent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "RevenueEvent";
CREATE POLICY "Deny all for non-service"
  ON "RevenueEvent"
  AS RESTRICTIVE
  FOR ALL
  USING (false);
