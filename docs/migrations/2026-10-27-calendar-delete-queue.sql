-- 2026-10-27: queue of phone-calendar events to delete when their task is
-- dismissed (fix/calendar-delete-on-dismiss). Additive. Apply BEFORE
-- deploying the code: the dismiss route writes this table (non-fatally, but
-- the drain/sync-result paths read it).
CREATE TABLE IF NOT EXISTS "CalendarDeletion" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarDeletion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CalendarDeletion_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CalendarDeletion_userId_providerEventId_key"
  ON "CalendarDeletion"("userId", "providerEventId");
CREATE INDEX IF NOT EXISTS "CalendarDeletion_createdAt_idx"
  ON "CalendarDeletion"("createdAt");
ALTER TABLE public."CalendarDeletion" ENABLE ROW LEVEL SECURITY;
