# Anchor People — manual migration SQL

Each slice that needs a schema change lands SQL here. Jim applies via Supabase MCP.

## Slice 1 — Person + EntityMention + Entry.peopleExtractedAt (2026-05-25)

```sql
CREATE TABLE "Person" (
  "id"                TEXT PRIMARY KEY,
  "userId"            TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "canonicalName"     TEXT NOT NULL,
  "displayName"       TEXT NOT NULL,
  "aliases"           TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  "firstMentionedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "mentionCount"      INTEGER NOT NULL DEFAULT 0,
  "archived"          BOOLEAN NOT NULL DEFAULT false,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "Person_userId_canonicalName_key"
  ON "Person"("userId", "canonicalName");

CREATE INDEX "Person_userId_mentionCount_idx"
  ON "Person"("userId", "mentionCount");

CREATE TABLE "EntityMention" (
  "id"            TEXT PRIMARY KEY,
  "entryId"       TEXT NOT NULL REFERENCES "Entry"("id") ON DELETE CASCADE,
  "personId"      TEXT NOT NULL REFERENCES "Person"("id") ON DELETE CASCADE,
  "mentionText"   TEXT NOT NULL,
  "startIndex"    INTEGER NOT NULL,
  "endIndex"      INTEGER NOT NULL,
  "context"       TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "EntityMention_entryId_idx" ON "EntityMention"("entryId");
CREATE INDEX "EntityMention_personId_idx" ON "EntityMention"("personId");

ALTER TABLE "Entry"
  ADD COLUMN "peopleExtractedAt" TIMESTAMP(3);
```

**Notes:**
- `Person.canonicalName` stores the lowercase normalized form; `displayName` is preserved case. The unique constraint is on `(userId, canonicalName)` so two users can each have an "Erin" without colliding.
- `EntityMention` carries the raw `mentionText`, `startIndex` / `endIndex` (positions in `Entry.transcript`), and a ~50-char `context` window so the UI can show what was said without re-fetching the whole transcript.
- `Entry.peopleExtractedAt` is the NER idempotency stamp — slice 2 + slice 7 both gate on `IS NULL` so reprocess + backfill don't double-write mentions.
- Cascade deletes mean: deleting an Entry removes its EntityMentions; deleting a Person removes its EntityMentions; deleting a User cascades through Person → EntityMention.
- No env vars required for this slice.
