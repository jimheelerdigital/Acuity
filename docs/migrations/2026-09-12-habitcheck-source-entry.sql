-- Debrief → habit auto-check-off: provenance on HabitCheck.
--
-- Additive and safe: new columns are defaulted/nullable, plus one index and
-- one SetNull FK. No data rewrite, no lock beyond a brief catalog update on
-- Postgres 11+. Every existing HabitCheck row reads source='MANUAL'.
--
-- Apply either by running `prisma db push` at deploy (schema.prisma already
-- carries these) OR by running this file directly. Idempotent — safe to
-- re-run.

ALTER TABLE "HabitCheck" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "HabitCheck" ADD COLUMN IF NOT EXISTS "entryId" TEXT;

CREATE INDEX IF NOT EXISTS "HabitCheck_entryId_idx" ON "HabitCheck" ("entryId");

-- FK to Entry with ON DELETE SET NULL so removing a debrief clears its
-- auto-checks without touching the user's manual streak history. Guarded so
-- a re-run doesn't error on the existing constraint.
DO $$ BEGIN
  ALTER TABLE "HabitCheck"
    ADD CONSTRAINT "HabitCheck_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "Entry" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
