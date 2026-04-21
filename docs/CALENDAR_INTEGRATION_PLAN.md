# Calendar Integration Plan

**Status:** Foundation only — OAuth flows and event ingestion ship
post-beta. What's in-tree today:

- `CalendarConnection` schema stub (one row per (user, provider))
- `/api/integrations/calendar/connect` returning `501 Not Implemented`
- `/account` → "Integrations" section with three disabled cards
  (Google, Outlook, Apple) each surfacing "Coming soon"

Everything else in this document describes the shape of the work
when it's picked back up. Treat it as a spec, not as deployed code.

## Why calendars (at all)

Voice debriefs describe time: "met with Sarah today", "the Tuesday
1:1 went sideways", "I'm burned out from back-to-back calls this
week." Today that signal is floating — Claude extracts themes + mood
but has no structure to attach them to. Pulling calendar events lets
us:

1. **Attribute mood / energy to meetings.** Low-energy Tuesdays +
   a 4-meeting Tuesday block → a pattern worth surfacing.
2. **Answer "what did I do this week"** without the user retyping.
   Weekly report can cite actual events instead of only user-narrated
   ones.
3. **Set anchor points for recurring themes.** "Tension with
   finance team" mentioned across 6 entries → correlated with 6
   appearances of "finance-sync" on the calendar.

## Providers + auth

Three targets, in priority order:

### 1. Google Calendar (first to ship)
- OAuth 2.0 + PKCE (same flow as NextAuth's Google provider, but with
  the Calendar API read scope added — `https://www.googleapis.com/auth/calendar.readonly`).
- Refresh token stored encrypted at rest; we'll wrap it with a KMS
  envelope (AWS KMS or Google KMS — pick one, don't mix).
- Incremental sync via `sync_token` from the Events API. First fetch
  grabs the trailing 90 days; subsequent fetches use the sync token
  to pull only deltas.

### 2. Outlook / Microsoft 365 (second)
- OAuth 2.0 via Microsoft Identity Platform v2.0 endpoint.
- Scopes: `Calendars.Read offline_access`.
- Delta queries on `/me/calendarview` (the standard approach for
  change tracking).

### 3. Apple Calendar / CalDAV (third, last, maybe)
- No OAuth — CalDAV with app-specific passwords.
- Painful UX (user has to generate an app-specific password in
  Apple ID settings and paste it in). Only ship if we get strong
  demand; realistically most Apple users keep their cal on iCloud
  and we can skip this in favor of a future iOS-native calendar
  read via EventKit.

## Data model (what changes when we ship)

The current stub has connection metadata. The ingest path adds:

```prisma
model CalendarEvent {
  id                String   @id @default(cuid())
  userId            String
  connectionId      String
  providerEventId   String   // stable across deltas
  title             String
  startAt           DateTime
  endAt             DateTime
  attendeeCount     Int
  // raw-ish blob for prompt grounding
  descriptionSnippet String? @db.Text
  updatedAt         DateTime @updatedAt

  @@unique([connectionId, providerEventId])
  @@index([userId, startAt])
}
```

Retention: keep trailing 180 days. Older events get pruned by a
weekly Inngest cron — calendars full of years of history balloon
quickly.

## Ingestion pipeline

Inngest function `sync-calendar-connection`:
- Triggers: `calendar/connection.created` (first sync),
  cron `*/30 * * * *` (polling the set of connections with
  `lastSyncedAt < now - 30min`).
- Steps: load tokens → refresh if expired → call provider's delta
  endpoint with the stored sync token → upsert events → update
  `lastSyncedAt` / `sync_token`.
- Rate limit: respect provider quotas (Google: 1M QPD, Outlook: 10K
  QPM per app). At beta scale we won't come close; still write the
  limiter so we don't self-DDOS on a bug.

## Privacy + deletion

- Tokens decrypt only in-memory on the worker that needs them. Never
  log them, never return them from an API.
- Account deletion cascades CalendarConnection → CalendarEvent.
- User can disconnect without deleting their account from
  `/account/integrations`; we keep the connection row with tokens
  zeroed + `lastErrorAt` stamped.

## Out of scope for beta

- Writing to the calendar (creating events, modifying). Read-only
  until privacy / UX implications are scoped.
- Calendar-wide permissions (shared calendars, subscribed
  calendars). Primary calendar only to start.
- Attendee-level enrichment (e.g. "you met with Sarah 4x this
  week"). Needs a people-resolution layer that's a separate
  workstream.

## Hand-off checklist when implementation picks up

- [ ] Pick KMS provider, wire envelope-encryption helper
- [ ] Add Google OAuth scopes to NextAuth provider config
- [ ] Build `/api/integrations/calendar/google/start` + callback
- [ ] Add `sync-calendar-connection` Inngest function
- [ ] Expand `/account` integrations section with real connect CTAs
- [ ] Wire CalendarEvent into the weekly-report prompt context
- [ ] Retention cron (prune events older than 180d)
