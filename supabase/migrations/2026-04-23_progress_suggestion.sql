-- 2026-04-23 — ProgressSuggestion model
--
-- Surfaces AI-detected progress on existing goals (e.g. user says "we
-- closed our first $100k deal" against a "close $1M" goal → suggestion
-- for progress 0 → 10%). User reviews + accepts/dismisses from the
-- goal detail page before anything writes to Goal.progress.
--
-- Idempotent: IF NOT EXISTS on the table + indexes. Safe to re-run.

CREATE TABLE IF NOT EXISTS "ProgressSuggestion" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "goalId" TEXT NOT NULL,
  "suggestedProgressPct" INTEGER NOT NULL,
  "priorProgressPct" INTEGER NOT NULL,
  "rationale" TEXT NOT NULL,
  "sourceEntryId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProgressSuggestion_pkey" PRIMARY KEY ("id")
);

-- Match the CASCADE on Goal relation from the Prisma schema.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ProgressSuggestion_goalId_fkey'
  ) THEN
    ALTER TABLE "ProgressSuggestion"
      ADD CONSTRAINT "ProgressSuggestion_goalId_fkey"
      FOREIGN KEY ("goalId") REFERENCES "Goal"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ProgressSuggestion_userId_status_idx"
  ON "ProgressSuggestion" ("userId", "status");
CREATE INDEX IF NOT EXISTS "ProgressSuggestion_goalId_status_idx"
  ON "ProgressSuggestion" ("goalId", "status");

-- RLS — follow the baseline pattern: enable RLS, deny all for
-- anon/authenticated (the service-role client bypasses RLS, which
-- is what Prisma uses). Matches the 2026-04-23_rls_close_gaps.sql
-- policy style.
ALTER TABLE "ProgressSuggestion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all for non-service" ON "ProgressSuggestion";
CREATE POLICY "Deny all for non-service"
  ON "ProgressSuggestion"
  AS RESTRICTIVE
  FOR ALL
  USING (false);
