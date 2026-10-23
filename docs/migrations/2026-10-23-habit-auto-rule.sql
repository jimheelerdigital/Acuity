-- 1.9.6: habit auto-complete from Apple Health.
-- Additive and nullable: existing rows read as "no rule". Must be applied
-- BEFORE the web deploy that adds Habit.autoRule to the Prisma schema
-- (Prisma selects every scalar column on create/update without a select).
ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "autoRule" JSONB;
