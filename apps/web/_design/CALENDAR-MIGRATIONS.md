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
