-- Typed entries (2026-10-17). Additive, nullable, no backfill needed:
-- NULL means "voice" for every existing row.
-- Apply in the Supabase SQL editor before deploying the typed-entry
-- server code (the code only WRITES the column for typed entries, so
-- deploying first is harmless; the Prisma client just needs the column
-- to exist once a typed entry is created).
ALTER TABLE "Entry" ADD COLUMN IF NOT EXISTS "inputMode" TEXT;
