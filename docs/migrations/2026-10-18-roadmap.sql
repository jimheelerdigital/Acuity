-- Public roadmap (2026-10-18). Additive: two new tables, no changes to
-- existing ones. Applied to production as Supabase migration `roadmap`.
CREATE TABLE IF NOT EXISTS "RoadmapItem" (
  "id"             TEXT PRIMARY KEY,
  "title"          TEXT NOT NULL,
  "summary"        TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'considering',
  "sortOrder"      INTEGER NOT NULL DEFAULT 0,
  "shippedVersion" TEXT,
  "shippedAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "RoadmapItem_status_sortOrder_idx" ON "RoadmapItem"("status", "sortOrder");

CREATE TABLE IF NOT EXISTS "RoadmapVote" (
  "itemId"    TEXT NOT NULL REFERENCES "RoadmapItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId"    TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("itemId", "userId")
);
CREATE INDEX IF NOT EXISTS "RoadmapVote_userId_idx" ON "RoadmapVote"("userId");

-- RLS parity with the rest of the schema (server uses the service role;
-- nothing reads these through PostgREST).
ALTER TABLE "RoadmapItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoadmapVote" ENABLE ROW LEVEL SECURITY;
