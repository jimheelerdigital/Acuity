# Onboarding v2 (pain-first) — manual migration SQL

Each slice that needs a schema change lands SQL here. Jim applies via Supabase MCP.

## Slice 1 — TrySession.anonDeviceId (2026-05-25)

```sql
ALTER TABLE "TrySession" ADD COLUMN "anonDeviceId" TEXT;
CREATE INDEX "TrySession_anonDeviceId_idx" ON "TrySession"("anonDeviceId");
```

**Notes:**
- Nullable. Web rows stay NULL — the web try flow doesn't have a stable per-device identifier; it relies on the `acuity_try_session` cookie + IP rate limit. Mobile rows carry the device UUID stored in AsyncStorage under `acuity.anon_session_id`.
- The index supports per-device funnel analytics + a potential future per-device rate limit. Today only the IP-based limiter is wired (mobile gets its own 3/hour bucket, separate from web's 5/hour).
- The `sessionToken` column stays the unique single-use claim handle. `anonDeviceId` is the stable device-side identifier — re-used across multiple try attempts, while each TrySession row owns its own sessionToken.
