# Calendar Integration — manual migration SQL

Each slice that needs a schema change lands SQL here. Jim applies via Supabase MCP.

## Slice 1 — User calendar columns (2026-05-25)

```sql
ALTER TABLE "User"
  ADD COLUMN "googleCalendarRefreshToken" TEXT,
  ADD COLUMN "googleCalendarEmail"        TEXT,
  ADD COLUMN "googleCalendarConnectedAt"  TIMESTAMP(3),
  ADD COLUMN "googleCalendarLastSyncedAt" TIMESTAMP(3);
```

**Notes:**
- `googleCalendarRefreshToken` stores an AES-256-GCM ciphertext blob (base64) — see `apps/web/src/lib/calendar/encryption.ts`. Plaintext is never persisted.
- All four columns nullable. Users who never connect calendar have all four = NULL.

**Manual step (Jim):** add these redirect URIs to the existing Google Cloud Console OAuth client (the same one used by NextAuth Google sign-in):

- `https://getacuity.io/api/calendar/callback`
- `http://localhost:3000/api/calendar/callback`

The calendar OAuth flow uses the same `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` env vars NextAuth already reads, so no new credentials needed.

**Env vars required:** `NEXTAUTH_SECRET` (already present — used to derive the encryption key + sign state HMAC).

---

## Slice 2 — CalendarEvent table (2026-05-25)

```sql
CREATE TABLE "CalendarEvent" (
  "id"              TEXT PRIMARY KEY,
  "userId"          TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "externalEventId" TEXT NOT NULL,
  "summary"         TEXT,
  "description"     TEXT,
  "startTime"       TIMESTAMP(3) NOT NULL,
  "endTime"         TIMESTAMP(3),
  "attendees"       JSONB,
  "location"        TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "CalendarEvent_userId_externalEventId_key"
  ON "CalendarEvent"("userId", "externalEventId");

CREATE INDEX "CalendarEvent_userId_startTime_idx"
  ON "CalendarEvent"("userId", "startTime");
```

**Notes:**
- `externalEventId` is the Google `events.list` event id. Unique per `(userId, externalEventId)` so re-syncs upsert in place.
- `attendees` stored as JSONB; shape is `Array<{ email, displayName, responseStatus }>`. Normalized at read time so Outlook/iCloud variants can land in the same column later.
- The cron + on-demand sync require **no extra env vars** beyond what slice 1 already needs.

---

## Slice 3 — Entry.linkedEventIds (2026-05-25)

```sql
ALTER TABLE "Entry"
  ADD COLUMN "linkedEventIds" TEXT[] NOT NULL DEFAULT '{}'::TEXT[];
```

**Notes:**
- Array of `CalendarEvent.id` (our local row ids, NOT Google's externalEventId). Manual link/unlink in slice 6 mutates this column directly.
- Default `'{}'` makes the migration safe for every existing Entry row (no backfill needed).
- The auto-linking matcher in `apps/web/src/lib/calendar/context.ts` writes this column after the persist-extraction step inside the process-entry pipeline. It only fires for users with a connected calendar AND with events in the recording window, so most entries keep the default empty array.


---

## Entry editing — Entry.lastEditedAt + reprocessingStartedAt (2026-05-25)

(Filed here because Calendar migrations doc is the active per-workstream notes file — this isn't a Calendar change but it sits next to it.)

```sql
ALTER TABLE "Entry"
  ADD COLUMN "lastEditedAt"          TIMESTAMP(3),
  ADD COLUMN "reprocessingStartedAt" TIMESTAMP(3);
```

**Notes:**
- Both nullable, no default. `lastEditedAt` is set by `PATCH /api/entries/[id]` on transcript edits; never updated on the original create.
- `reprocessingStartedAt` is set by PATCH and cleared by the persist-extraction step in `process-entry.ts` when status flips back to COMPLETE. Drives the "Re-processing…" UI on /entries/[id] (web) and the equivalent mobile state (slice 3).
