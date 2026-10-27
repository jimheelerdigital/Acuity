-- PR #48 (per-entry reflection): adds Entry.reflection.
-- MUST be applied to production BEFORE #48 is merged/deployed: both
-- extraction paths (lib/pipeline.ts, inngest process-entry.ts) write this
-- column, and Prisma fails the whole entry write if it doesn't exist.
-- Additive and nullable, no backfill: safe to apply any time.
ALTER TABLE "Entry" ADD COLUMN IF NOT EXISTS "reflection" TEXT;
