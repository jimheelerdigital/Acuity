# Calendar Integration — Phase 1 Scoping (v1.1)

**Status:** Phase 1 scoping doc only. **No code, schema, entitlement, prompt, or feature-flag changes from this turn.**

**Product decisions (locked, this doc implements against them):**
- Two use cases — (1) read-only calendar context augments AI extraction; (2) one-way Acuity → calendar task sync.
- Out of scope — showing calendar events in Acuity UI, two-way sync, conflict resolution.
- Sync direction — Acuity → calendar only. Calendar-side edits are ignored.
- Provider order — **Phase A:** Apple EventKit on iOS (proxies Google + Outlook + iCloud automatically through the OS calendar database). **Phase B (post-launch):** Google OAuth on web. **Phase C (later):** Outlook OAuth on web.
- Tier — PRO + TRIAL get both features. FREE does not. Post-trial loss is intentional conversion lever.

---

## What's already in tree

Anchor everything against existing scaffolding so v1.1 is a layer, not a fresh-start.

- **`prisma/schema.prisma:CalendarConnection`** — has `provider`, `providerAccountId`, encrypted `accessToken`/`refreshToken`/`tokenExpiresAt`, `lastSyncedAt`, `lastErrorAt`. Cascades on user delete. **Sized for OAuth web providers; NOT used by iOS EventKit.** Phase A doesn't need this row at all (EventKit doesn't issue tokens). Keep the model — Phase B will use it.
- **`/api/integrations/calendar/connect`** — 501 stub gated by `calendar_integrations` flag. URL reserved.
- **`apps/web/src/app/account/integrations-section.tsx`** — three `Coming soon` cards. Phase B repurposes these.
- **`apps/web/src/lib/feature-flags.ts:calendar_integrations`** — registered, currently `enabled=false`. Phase A flips this on with `requiredTier: "PRO"`.
- **`docs/CALENDAR_INTEGRATION_PLAN.md`** — older design from when the plan was Google-OAuth-first. Substantially superseded by this doc; keep for the OAuth + KMS sections that still apply to Phase B.

**Key architectural insight:** Phase A's choice of iOS EventKit is a major simplification. EventKit reads (and writes to) **whatever calendars the user's iOS already aggregates** — Google via the OS account integration, Outlook via the OS account integration, iCloud natively. We get all three providers without writing any OAuth code, refresh-token plumbing, or KMS envelope encryption. The complexity moves to the iOS permission UX and the mobile→server upload route, both of which are smaller surface area.

---

## 1. Permission model

### iOS EventKit (Phase A)

**iOS 17 split the calendar permission key.** There is no read-only key — even read access requires what Apple calls "Full Access" on iOS 17+:

| Old (≤ iOS 16) | New (iOS 17+) | Granted access |
|---|---|---|
| `NSCalendarsUsageDescription` | deprecated, runtime fallback unpredictable | — |
| — | **`NSCalendarsFullAccessUsageDescription`** | Read + write existing events |
| — | `NSCalendarsWriteOnlyAccessUsageDescription` | Create new events only, can't read |

**We need full access for both use cases:**
- Use case 1 (AI context) — read existing events.
- Use case 2 (task sync) — create new events (write), update on task edit (write), update title on completion (write), delete on task delete (write). Write-only would technically work for use case 2 alone, but use case 1 forces full.

So we request `NSCalendarsFullAccessUsageDescription` once, at the moment the user taps Connect. This is the single biggest reviewer trip-wire (see §7).

#### Recommended `NSCalendarsUsageDescription` string

For belt-and-suspenders compatibility we set both keys (deprecated `NSCalendarsUsageDescription` for ≤ iOS 16 fallback, `NSCalendarsFullAccessUsageDescription` for iOS 17+) with the same text:

```
"Acuity needs calendar access to: (1) surface your real meeting load
alongside your reflections — so it can ask 'you had 4 meetings today,
anything stand out?' — and (2) optionally add your Acuity tasks with
due dates to your calendar so they show up where you already plan
your day. Acuity never reads attendee email addresses, locations, or
event notes. You control which calendar tasks sync to, and you can
disconnect any time."
```

Why this draft works:
- States both use cases by name (5.1.1 specificity requirement).
- Discloses what we *don't* read (preempts reviewer's "but you have full access" objection).
- States user agency (calendar choice, disconnect any time).
- 388 chars — well within Apple's soft limit, and readers actually read it.

#### iOS 17 permission states to handle

`expo-calendar`'s `requestCalendarPermissionsAsync()` returns one of:
- `granted` — full access, all calendars.
- `granted` with `accessPrivileges = "restricted"` — iOS 17 "Selected Calendars". User picked a subset. Honor it.
- `denied` — graceful "Connect later in Settings" surface.
- `undetermined` — should never reach app code post-prompt, but treat as denied.

**Pre-prompt screen (recommended):** before the OS prompt, show a short Acuity-styled screen explaining what we'll do with access ("show meeting load in your reflections + add Acuity tasks to your calendar — never read your notes, locations, or attendee emails"). User taps Continue → OS prompt fires. This avoids the "Acuity wants to access your calendar" feeling cold and uncontextualized.

#### Re-permission flow

If `Calendar.getCalendarPermissionsAsync()` returns `denied` (user previously denied, or revoked in Settings → Privacy):
- `/account/integrations` shows a Reconnect CTA that opens iOS Settings via `Linking.openSettings()`.
- A foreground listener (`AppState` `change` → `active`) re-checks permissions when the user comes back from Settings.
- On regain, kick off the same connect flow as first-time.

### Web Google Calendar (Phase B, deferred)

Documented for completeness; not built in v1.1.

- Read scope: `https://www.googleapis.com/auth/calendar.events.readonly` (more conservative than `calendar.readonly`).
- Write scope: `https://www.googleapis.com/auth/calendar.events` (per-event create/update/delete, not full calendar metadata).
- Two scopes combined: `calendar.events` (writeable read+write to events) — Google grants both with this single scope.
- OAuth 2.0 + PKCE. Refresh token stored encrypted at rest using KMS envelope (decision deferred to Phase B).
- Refresh-token lifecycle: 6-month inactivity expiry, plus user-revoke-in-Google-account-settings = `invalid_grant`. Surface "Reconnect" CTA via existing `CalendarConnection.lastErrorAt`.

### Web Outlook / Microsoft Graph (Phase C, deferred)

- Microsoft Identity Platform v2.0.
- Scopes: `Calendars.ReadWrite offline_access`.
- Microsoft refresh tokens have a 90-day sliding window — same notification-on-failure UX as Google.

### Re-permission flow when user revokes

For all providers, the design is the same:
1. Sync attempt fails with auth error → `CalendarConnection.lastErrorAt` set.
2. Background queue logs the failure, does NOT delete the row (preserves user's calendar prefs).
3. `/account/integrations` UI flips to Reconnect state.
4. After 3 consecutive failures, send a notification email ("Your calendar disconnected — Acuity tasks aren't syncing").
5. On reconnect, replay any queued task-sync operations from the failure window.

---

## 2. Sync engine design

### When does Acuity push tasks to calendar?

**Trigger:** any write to a Task with `dueDate != null`, gated by user's `autoSendTasks` setting. Specifically:

| Event | Action |
|---|---|
| Task created with `dueDate` and `autoSendTasks=true` | enqueue `calendar.task.upsert` |
| Task updated (title / dueDate / status) and previously synced | enqueue `calendar.task.upsert` |
| Task `status` changes to `DONE` | enqueue `calendar.task.complete` (rewrites event title to `~Acuity: Buy birthday gift~`) |
| Task `status` changes from `DONE` back to `OPEN` (rare, but supported) | enqueue `calendar.task.upsert` (un-strikethrough) |
| Task deleted | enqueue `calendar.task.delete` |
| Task created/updated with `autoSendTasks=false` | no enqueue. Manual "Send to calendar" button on the task row. |

**Implementation:** Inngest function `sync-task-to-calendar`, triggered by an Inngest event emitted from the API routes that mutate Tasks (`POST /api/tasks`, `PATCH /api/tasks/[id]`, `DELETE /api/tasks/[id]`, the extraction-commit route).

Why Inngest + event-driven, not inline:
- Calendar API failures shouldn't fail the task save.
- Inngest's retry semantics + dead-letter handling are already wired for our other async work.
- Idempotency keys are first-class.

### Idempotency

The dedup key is `Task.calendarEventId`. Three states:

| `calendarEventId` | Operation | Behavior |
|---|---|---|
| `null` | upsert | EventKit `createEventAsync` → write returned id back to Task |
| set, exists in calendar | upsert | EventKit `updateEventAsync(id, ...)` |
| set, but not found in calendar (user deleted it) | upsert | clear `calendarEventId`, recreate fresh, write new id back |
| set | complete | EventKit `updateEventAsync(id, { title: strikethrough })` |
| set | delete | EventKit `deleteEventAsync(id)` then null the field |

The "user deleted it externally" case is the failure mode that requires a probe: try `getEventAsync(id)`; if not found, fall through to create. Handles the case where users tidy up their calendar.

For Phase B (Google), Google's `events.insert` doesn't have a built-in idempotency token, but each successful response returns a stable `eventId`. Same state machine, just with HTTP retries instead of EventKit native calls.

### State tracking — Task model fields

```prisma
calendarEventId       String?
calendarProviderId    String?   // "ios_eventkit" | "google" | "outlook"
calendarSyncedAt      DateTime?
calendarSyncStatus    String    @default("NOT_SYNCED")
                                 // "NOT_SYNCED" | "PENDING" | "SYNCED" | "FAILED"
calendarSyncError     String?   // last error message, for UI debugging
```

`calendarProviderId` matters because (a) it tells the sync engine which provider's API to use, (b) when a user changes target calendar/provider, we know whether to migrate (see §9).

`calendarSyncStatus` drives the per-task UI badge (synced / pending / failed). Indexed lightly: `@@index([userId, calendarSyncStatus])` for "show me failed syncs" queries (rare).

### Failure modes

| Failure | Symptom | UI surface |
|---|---|---|
| EventKit not authorized | first sync attempt fails with `EKErrorCodeUnauthorized` | inline toast + flip integration UI to "Reconnect" |
| OAuth token expired (Phase B) | API 401 | retry refresh; if refresh fails → mark `CalendarConnection.lastErrorAt`, flip task to FAILED |
| Provider API 5xx / network | retryable | Inngest exponential backoff up to 3 attempts; mark FAILED after |
| User disconnected calendar | bulk failure across all queued ops | mark all in-flight tasks FAILED, surface single "Reconnect" CTA, no per-task toasts |
| Calendar API rate limit | 429 / quota exceeded | exponential backoff with jitter; after 5 retries, surface FAILED |

The per-task UI badge: **synced** = green check, **pending** = pulsing dot, **failed** = small red icon with hover/tap → toast with one-line error + Retry button.

### Retry queue

Inngest's built-in retry (3 attempts, exponential) handles transient failures. For OAuth token refresh failures, we use a separate Inngest cron (`*/15 min`) that picks up `CalendarConnection` rows where `lastErrorAt < now - 1h` and attempts a soft re-sync of any tasks left in PENDING state. This handles the "user reconnected, replay queued ops" case.

---

## 3. Storage model

### Use case 1 — AI context (read-only)

**Recommendation: query on-demand at extraction time, do NOT mirror.**

Rationale:
- iOS EventKit reads are local (~ms). Pulling 7-day window is cheap.
- Phase B (Google) returns ~50 events/user/week — also cheap on a per-extraction basis.
- Mirroring would mean: a separate Inngest sync, a `CalendarEvent` table, a 180-day retention cron, KMS implications. The earlier `CALENDAR_INTEGRATION_PLAN.md` chose mirror because it scoped a separate Calendar Insight surface; we explicitly defer that surface to v1.2.
- Privacy footprint: nothing stored in our DB for use case 1. Big win.

The trade-off: extraction-time fetch fails if the calendar API/EventKit is unavailable. Mitigation: graceful degradation — if the calendar fetch errors or times out (>2s budget), proceed with extraction sans calendar context, log it as a Sentry breadcrumb, never fail the entry.

For Phase A specifically: the mobile app fetches the day's events from EventKit just before it uploads the audio recording, attaches the `calendarContext` JSON to the multipart form, and the server's extract step reads it directly from the request body. No server→provider fetch needed at all.

For Phase B: the server fetches via Google API at extraction time (no mirror). 30s timeout, 2s SLA budget. Refresh token failures fall through to "no calendar context this run" — never block extraction.

### Use case 2 — task sync

**Recommendation: only store `calendarEventId` per Task, no event mirror.**

For task sync we don't need to know what's in the user's calendar — we just need to keep our pointer to the events we created. The single nullable string per Task is the entire storage cost.

This also means task sync works without storing any event content from the user's calendar. The only data we ever "have" about their calendar is "Acuity created event with id X" — fully reconstructable.

### Combined picture

For Phase A (iOS EventKit, v1.1 launch):
- DB stores: `User` settings (provider, target calendar, auto-send, default duration); `Task.calendarEventId` per synced task. **No event mirror, no token storage** (EventKit doesn't issue tokens).

For Phase B (Google OAuth, post-launch):
- Adds: `CalendarConnection` row per user (already in schema). KMS-wrapped tokens.
- Still no event mirror.

This is dramatically less surface area than the original plan.

---

## 4. AI integration (use case 1)

### Where calendar data enters the prompt

In `apps/web/src/lib/pipeline.ts:extractFromTranscript`, prepend a `calendarBlock` alongside the existing `memoryContext` / `goalBlock` / `dimensionBlock` / `taskGroupsBlock`. **No modification to the V5 dispositional prompt body** — calendar context is just another input the existing prompt reads.

### Prompt format

Concise, structured, dated. Example:

```
Today's calendar (from the user's connected calendar):
- 09:00–09:30 Standup (4 attendees, work)
- 10:00–11:00 Quarterly review (12 attendees, work)
- 14:00–15:00 Sales sync (2 attendees, work)
- 16:00–17:00 Focus block (1 attendee, work)
Day summary: 4 work meetings, 0 personal events, ~50% of day in meetings.

Yesterday's calendar (for comparative context):
- (3 events, 2.5 hrs of meetings)

Past week meeting load: 23 meetings total, peak day Tuesday (7).
```

The day-summary line gives Claude the digested-form metric it can immediately reference ("you had 4 meetings today"). The week roll-up sets up "this week was meeting-heavy" patterns. Per-event lines give the surface-event grounding the V5 prompt's two-step extraction can pivot off (without becoming the theme themselves).

### Privacy field projection (enforced server-side)

Pulled into the prompt:
- `title` (event summary)
- `start`, `end`, `isAllDay`
- `attendeesCount` (just `attendees.count`, never the array)
- `calendarSource` (work / personal / shared) — derived from EventKit's `calendar.source.title` or Google's `calendarId` mapped to a label

NOT pulled:
- `location` (privacy footprint, not needed)
- `notes` / `description` body (high PII risk, marginal analysis value)
- `attendees[].emailAddress` / `attendees[].name` (separate workstream, defer to v1.3+)

The mobile route handler (`/api/record` for Phase A) re-validates the projection: even if a malicious or buggy client sends `location` or `attendees[].email`, the server discards them before they enter the prompt. Defense in depth.

### Latency

**Run in parallel with transcription, not blocking it.** The current pipeline is:
```
upload → transcribe (Whisper) → extract (Claude w/ memoryContext)
```

After v1.1:
```
upload → transcribe (Whisper) ┐
                              ├→ extract (Claude w/ memoryContext + calendarContext)
       fetch calendarContext ─┘
```

For Phase A, calendar fetch is on-mobile and happens before upload — zero added server latency. The mobile client packages the events into the multipart form alongside the audio.

For Phase B, the server kicks off the Google fetch in parallel with transcription. Whisper takes 2-5s; Google Calendar API responds in ~200ms; we never block. If the calendar fetch is still pending when extraction needs it (rare), we cap at a 2s wait then proceed without it.

---

## 5. UI surfaces

### Connect flow

**Where:** mobile `Profile → Integrations` (new screen) for Phase A; `/account/integrations` for Phase B (already shipped as stubs).

**Not in onboarding** — calendar connect is opt-in, not a launch step. Forcing it in onboarding hurts activation, and the iOS full-access prompt is heavy to throw at someone who hasn't yet experienced the core product.

**Discoverable from Tasks tab CTA:** when a user creates a Task with a `dueDate` and they have no calendar connected, surface a one-line banner above the task list: "Want this on your calendar? **Connect Apple Calendar →**". Contextual, non-blocking.

### Settings UI

Single new screen at `apps/mobile/app/integrations.tsx` (web equivalent in `apps/web/src/app/account/integrations`):

```
┌── Calendar ───────────────────────────────────────────┐
│  Connected: Apple Calendar (iOS) — connected 3 days ago│
│                                          [ Disconnect ]│
│                                                       │
│  Target calendar                                      │
│    [ Work ▾ ]    Tasks sync to this calendar.         │
│                                                       │
│  Auto-send tasks with due dates                       │
│    [● ON / ○ OFF ]                                     │
│    When off, each task gets a "Send to calendar"      │
│    button.                                            │
│                                                       │
│  Default event duration                               │
│    ( ) All-day event                                  │
│    (●) Timed event (1 hour, starting at due time)     │
│    (●) Timed event (30 minutes, starting at due time) │
│                                                       │
│  AI context                                           │
│    [● ON / ○ OFF ]                                     │
│    Acuity reads your day's calendar to enrich         │
│    reflection prompts and weekly insights.            │
└───────────────────────────────────────────────────────┘
```

Two toggles, not one — `autoSendTasks` and `aiContext` are separate concerns. A user can want their tasks on the calendar without wanting Acuity to read their calendar (or vice versa). Default: both on at connect.

### Per-task UI

In the task list (`apps/web/src/app/tasks/task-list.tsx` and the mobile equivalent):

| State | Visual |
|---|---|
| Task has no `dueDate` | nothing |
| `dueDate` set, calendar not connected | small calendar icon, gray, hover/tap → "Connect a calendar to sync this" |
| `dueDate` set, calendar connected, `autoSendTasks=false`, not synced | small "Send to calendar" button |
| `calendarSyncStatus=PENDING` | small calendar icon with pulsing dot |
| `calendarSyncStatus=SYNCED` | green calendar icon with check |
| `calendarSyncStatus=FAILED` | red calendar icon with retry button on hover/tap |

### Disconnect flow

**Already-synced events stay in the user's calendar.** This is a deliberate one-way property of the integration. Disconnecting means:
- `User.calendarConnectedProvider` cleared.
- `User.targetCalendarId` cleared.
- All `Task.calendarSyncStatus` flipped to `NOT_SYNCED`, `calendarEventId` and `calendarProviderId` cleared.
- The events persist in the user's calendar — Acuity has no ability to clean them up post-disconnect (we'd need write access, which we just lost). User can manually delete or filter them by the `Acuity:` title prefix.

Confirmation dialog at disconnect time spells this out: "You have 47 Acuity tasks synced to your calendar. They'll stay where they are when you disconnect — Acuity won't be able to update or delete them. Continue?"

---

## 6. Privacy & data handling

### What's stored DB-side vs on-device/in-provider

| Data | DB-side | On-device / in-provider |
|---|---|---|
| User integration prefs (provider, target calendar, toggles) | ✅ | — |
| `Task.calendarEventId` per synced task | ✅ | — |
| `CalendarConnection` rows (Phase B only) | ✅ | — |
| KMS-wrapped OAuth tokens (Phase B only) | ✅ | — |
| Calendar event titles, times, attendee counts | ❌ | ✅ on device (iOS) / in provider (Google) |
| Attendee emails/names, location, notes | ❌ | ✅ stays where it was |

**Acuity does not persistently store any user calendar event content.** The events flow into the prompt, into Claude's response, and the only artifact is the extraction result (themes, summaries) — which is the same shape we already store. Calendar event titles never appear in the DB.

### GDPR / CCPA

- **Lawful basis (GDPR Art. 6):** consent (explicit Connect action).
- **CCPA disclosures:** add to "categories of data we collect" — "Calendar event metadata, used in-memory only and not stored, while the integration is connected. We may store an event id we created in your calendar so we can update or delete it later."
- **New consent surface required.** Two layers:
  1. **Pre-prompt screen** before the iOS OS dialog (recommended in §1) — explains use cases and the not-list.
  2. **Connect-confirmation modal** in `/account/integrations` (web) / mobile equivalent at first connect — same content, plus a checkbox or explicit Continue affirmation that records consent timestamp on `User.calendarConnectedAt`.

### Privacy policy update — drafted language

Add a new section under "Third-party integrations":

> **Calendar integrations.** When you connect a calendar (Apple Calendar on iOS, Google Calendar, or Outlook), Acuity reads your event titles, start/end times, attendee counts, all-day status, and which calendar each event belongs to (work, personal, shared). Acuity uses this in two ways:
>
> 1. To enrich AI reflection prompts and weekly insights with your real meeting load. This data is read at the time of analysis and not stored.
> 2. To create calendar events for Acuity tasks with due dates, when you opt in. We store only the calendar event identifier we receive back so we can update or delete the event later.
>
> Acuity never reads attendee email addresses or names, event locations, or event notes. You can disconnect at any time in Settings; existing synced events stay in your calendar. Disconnecting does not delete events Acuity created — you can manually filter or delete them by their "Acuity:" title prefix.

### Account deletion behavior

Existing `User.delete` cascade already drops `CalendarConnection`. Adding columns to `User` and `Task` doesn't change this — Postgres cascades follow the row.

**What we don't and can't do:** retroactively delete the events we created in the user's calendar. Once they're synced, they're the user's data, not ours, and we lose access at disconnect. Account deletion = data deletion in Acuity, but the sync events persist in the user's third-party calendar.

This is documented prominently in the disconnect modal AND in the delete-account modal:

> "Acuity tasks synced to your calendar will remain in your calendar. Acuity cannot remove them after deletion. To clean them up, filter or delete events with the 'Acuity:' title prefix in your calendar app."

---

## 7. Apple review risk

### Risks specific to Phase A (EventKit on iOS)

**The single highest-risk piece of v1.1.** EventKit + write access has higher reviewer scrutiny than read-only EventKit. Mitigations below.

#### iOS 17 full-access requirement

We need full access (no read-only key exists). The recommended `NSCalendarsFullAccessUsageDescription` (§1) addresses each known rejection pattern:
- Names both use cases explicitly (5.1.1).
- Discloses what we *don't* read.
- States user agency.

**Document the iOS 17 read-only-key constraint in `docs/APP_STORE_REVIEW_NOTES.md` at v1.1 ship time:**

> Acuity requests `NSCalendarsFullAccessUsageDescription` because Apple's iOS 17 EventKit API does not provide a read-only key. Acuity uses both read access (for AI reflection prompts and weekly insights) and write access (to create/update/delete calendar events for user-created tasks). The Info.plist purpose string explicitly names both use cases.

#### Write-access scrutiny

Write-access EventKit triggers more careful review than read-only. Specific reviewer concerns we'll get:

1. **"Why does this app need to write to my calendar?"** Mitigation: the use case is direct and user-initiated — every event Acuity creates corresponds to a user-created task with a due date. The Info.plist string says so. The pre-prompt screen says so.

2. **"What happens to events when I disconnect?"** Mitigation: covered in §5 (events persist, user manually cleans up). Document this in App Review Notes.

3. **"Does this app spam my calendar?"** Mitigation: title format `Acuity: [task]` is consistent and filterable. Auto-send is a user toggle. The default doesn't have to be ON — actually let's recommend default OFF for review. User opts into auto-send explicitly. (Decision: default OFF for first ~50 reviews; flip to default ON after we have a track record.)

4. **"Does this app pre-populate the calendar with events the user didn't create?"** Mitigation: no. Every synced event has a 1:1 correspondence with a user-created Task with a `dueDate`. We don't propose recurring events, generic prompts, or anything synthetic.

#### Recent rejection patterns I'm aware of

- Generic purpose strings ("App uses calendar.") — reject. Our string is specific.
- `NSCalendarsUsageDescription` only on iOS 17+ — reject. We set both keys.
- Calendar prompt at app launch — reject. We prompt only at user-initiated Connect.
- Apps that write to calendar without user knowing each write is happening — reject. Each Task→Event is initiated by a user action (creating/editing the task).

Apple does not (publicly) maintain a recent-rejections database I can cite verbatim. The list above is best-known-practices.

### Risks specific to Phase B (web OAuth)

Not applicable for v1.1 launch.

### Other 3.1.x trip wires

- **3.1.1 (IAP):** calendar integration is not a digital good. No conflict.
- **3.1.3(b) (Multiplatform Service):** Option C compliance unchanged. Calendar data is read+written through the user's own provider; no payment flow.
- **4.0 (Design):** no concerns.

---

## 8. Schema changes needed

**This section documents the proposed schema for Phase 2; no migration runs from this Phase 1 doc.**

### `User` model — additions

```prisma
calendarConnectedProvider  String?   // "ios_eventkit" | "google" | "outlook"
calendarConnectedAt        DateTime? // timestamp of consent capture
targetCalendarId           String?   // EventKit calendar id, Google calendarId, etc.
targetCalendarTitle        String?   // human-readable for UI ("Work")
autoSendTasks              Boolean   @default(false)
calendarAiContextEnabled   Boolean   @default(true)  // separate toggle from sync
defaultEventDuration       String    @default("TIMED_60")
                                     // "ALL_DAY" | "TIMED_30" | "TIMED_60"
calendarLastSyncAt         DateTime? // newest successful task push
```

**`autoSendTasks` defaults to false** — opt-in at connect time, per §7's reviewer-friendly default. **`calendarAiContextEnabled` defaults to true** — once a user has connected, the read flow is the lower-friction half.

### `Task` model — additions

```prisma
calendarEventId       String?
calendarProviderId    String?   // "ios_eventkit" | "google" | "outlook"
calendarSyncedAt      DateTime?
calendarSyncStatus    String    @default("NOT_SYNCED")
                                 // "NOT_SYNCED" | "PENDING" | "SYNCED" | "FAILED"
calendarSyncError     String?

@@index([userId, calendarSyncStatus])
```

### `CalendarConnection` model — keep as-is

Already in schema. Phase A doesn't write rows here (EventKit issues no tokens). Phase B repurposes the existing model. No schema changes needed for this.

### Migration plan for existing tasks

`Task.calendarSyncStatus` default = `"NOT_SYNCED"` — every existing row gets it on `prisma db push`. No backfill needed. No data loss risk; all new columns are nullable except the status string which has a safe default.

`Task.calendarEventId` etc. all nullable, default null. Standard Prisma migration.

**Decision: do NOT auto-sync existing tasks at connect time.** When user connects, all 1000 of their open tasks are still `NOT_SYNCED`. We surface a one-time prompt: "You have 47 open tasks with due dates. Send them all to your calendar now? [Send all] [Skip]". Skip is the default. If they Send all, we batch-enqueue with rate limiting (~10/sec to avoid hammering the calendar API). See §9 for failure handling.

### Migration ordering (for v1.1 ship plan)

1. Schema migration (new User + Task columns) — `prisma db push` from Jim's home network.
2. Seed-feature-flags update: flip `calendar_integrations` to `enabled=false, requiredTier="PRO", rolloutPercentage=0`. Stays off until UI ships.
3. Server code (Inngest fns, API routes, mobile→server upload route).
4. Mobile code (expo-calendar, integration screens, sync hook).
5. Privacy policy + ToS update.
6. App Review Notes update.
7. EAS build → TestFlight → App Review submission.
8. Flag flip per cohort: enable=true, ramp rolloutPercentage 10/25/50/100.

---

## 9. Failure / edge cases

| Case | Behavior |
|---|---|
| Task created with `dueDate` but no calendar connected | `calendarSyncStatus = NOT_SYNCED`. No-op. UI banner on Tasks tab if user has any unsynced tasks with `dueDate` (gentle nudge to connect). |
| Task created without `dueDate` | Never synced regardless of calendar state. `dueDate` is the trigger. |
| Task synced, then user changes target calendar | **Decision:** delete event from old calendar, create in new. Both calendars are the user's, and "Acuity tasks live in this calendar" is the mental model. Inngest fn handles atomically: create-new-then-delete-old, with `calendarEventId` swap last. Failure mid-step → SYNCED with old id (worst case: event in two calendars; user can dedup once). |
| Task synced, user disconnects calendar entirely | All synced tasks flip to `NOT_SYNCED`, `calendarEventId`/`calendarProviderId` cleared. **Events persist in calendar** — Acuity loses ability to manage them. Disconnect modal warns. |
| User has 1000 existing tasks at connect | One-time post-connect prompt: "Send all 47 open tasks with due dates to your calendar? [Send all] [Skip]." Default Skip. If Send all, batch with rate limiter. (Closed/done tasks excluded from the prompt.) |
| OAuth refresh failure mid-sync (Phase B) | Per-task retry queue, exponential backoff, 3 attempts. After all attempts fail, `calendarSyncStatus = FAILED`. Notification email after 3 consecutive `CalendarConnection.lastErrorAt` updates. |
| Single task fails to sync (e.g. provider 4xx on this specific event) | `calendarSyncStatus = FAILED`, `calendarSyncError` populated. Per-task UI shows red icon + Retry. Doesn't affect other tasks. |
| User edits event in calendar (changes title, time, deletes it) | Acuity ignores. One-way sync. Task in Acuity stays as-is; the event in the calendar drifts. (Documented in connect modal: "Acuity won't pick up changes you make in your calendar.") |
| Task's `dueDate` removed after it was synced | Acuity deletes the event. `calendarEventId` cleared, status flips to `NOT_SYNCED`. |
| User completes task → uncompletes task → completes again | Each transition triggers a sync. Sync engine is idempotent on the resulting event title (strikethrough vs no-strikethrough). |
| Network drop during EventKit write (mobile) | EventKit is local; "network" is the disk. Won't happen. The next-tier failure is OS denying the write — same path as token-expired. |
| Calendar permission revoked while sync queue has items | Pre-flight permission check on each Inngest invocation. If revoked: mark all queued items FAILED, surface "Reconnect" CTA, send notification email. |

---

## 10. Implementation effort

### Phase A only (iOS EventKit, v1.1 launch)

| Slice | Effort | Notes |
|---|---|---|
| 10.1 Schema migration (User + Task new columns) | 0.5 d | Standard `prisma db push`. Manual step from Jim's home network. |
| 10.2 Mobile: expo-calendar wrapper + permission flow | 1 d | Pre-prompt screen, permission state machine, Settings deep-link for revoke recovery. |
| 10.3 Mobile: Integrations settings screen | 1 d | Target calendar picker, toggles, default duration radio. |
| 10.4 Mobile: foreground hook + on-demand calendar fetch (use case 1) | 0.5 d | Pre-recording hook that packages day's events into multipart. |
| 10.5 Server: `/api/integrations/calendar/connect` + `/api/integrations/calendar/sync-task` endpoints | 1 d | API layer for mobile to register provider + sync task ops. |
| 10.6 Server: Inngest `sync-task-to-calendar` fn + retry semantics | 1.5 d | The idempotency state machine. The actual `EventKit` write happens on mobile (since EventKit is iOS-only); server enqueues, mobile executes via a remote-trigger hook OR synchronously when the user is foreground. **See risk note below.** |
| 10.7 Server: pipeline.ts calendarBlock augmentation | 0.5 d | Drop-in alongside memoryContext / goalBlock. Reads `calendarContext` from the multipart upload. |
| 10.8 Mobile: per-task UI badges + manual "Send to calendar" buttons | 1 d | task-list updates, sync status badges, retry button. |
| 10.9 Mobile: post-connect "Send all open tasks?" one-time prompt | 0.5 d | Modal + batched sync. |
| 10.10 Privacy policy update, ToS, App Review Notes, Info.plist additions | 1 d | Parallel with code work. |
| 10.11 Entitlements wiring (PRO + TRIAL gate) | 0.5 d | Adds `canSyncCalendar` to entitlementsFor; gates connect endpoint + UI. **Sequencing dep — see §11.** |
| 10.12 EAS TestFlight build + Apple Review submission | 1 d | Real-time. Apple review queue is 1-3 days separately. |
| **Total** | **~9.5 dev-days** | end-to-end |

Realism factor 1.4× for unknowns → **~13 calendar days** to v1.1 ship-ready, plus Apple Review queue.

### Riskiest piece

**Phase A's biggest unknown: where does the EventKit write actually run?**

EventKit is iOS-native, accessible only on the device. Two options:

**Option α: Mobile executes EventKit writes directly.** Server enqueues a "sync needed" signal; mobile picks it up next foreground and executes. Pros: no remote-trigger plumbing, mobile is single-source-of-truth for permissions. Cons: events don't reach the calendar until the user opens Acuity again (latency 0–24h for inactive users).

**Option β: Mobile maintains a websocket / push-token that lets the server tell it "execute this task sync now."** Pros: faster propagation. Cons: significantly more infra (push reliability, token management, fallback when push fails).

**Recommendation: Option α for v1.1.** The latency is acceptable (calendar events are about future tasks, not instant notifications). Defer Option β if user feedback flags lag.

Risk vector: if a user creates a task on web (not mobile), the sync requires the user to open the mobile app at some point to flush. Documented behavior: web-created tasks queue with `calendarSyncStatus = PENDING` until mobile next opens. Web-side UI shows the pending state and a "open mobile to sync" hint when relevant.

This is the architectural call that most shapes Phase A. Worth Jim's explicit sign-off before slicing into implementation.

### Second-riskiest piece

**iOS 17 full-access UX + reviewer scrutiny.** Mitigations are (a) the reviewer-friendly purpose string, (b) pre-prompt context screen, (c) default `autoSendTasks=false` for first ~50 reviews, (d) explicit App Review Notes documentation.

### Recommended slicing for Phase 2 (implementation)

Match the free-tier redesign's slice cadence. **Each slice ships independently behind the existing `calendar_integrations` flag at 0% rollout, ramps after the next slice lands:**

- **Slice C1 — Schema + entitlement.** User + Task column migrations, `canSyncCalendar` entitlement, no UI. Closes the schema-first principle and unblocks parallel work.
- **Slice C2 — Read-only context (use case 1) end-to-end.** Mobile EventKit permission, pre-prompt, multipart upload of `calendarContext`, server-side `calendarBlock` in pipeline.ts. Tests against real EventKit data. **Ships alone — does not include task sync.** Validates the AI augmentation hypothesis from `theme-extraction-phase2.md` § 4 in production.
- **Slice C3 — Task sync engine (use case 2).** Inngest fn, mobile-side EventKit write executor (Option α), per-task UI badges, manual "Send" button, settings toggles.
- **Slice C4 — Integrations settings screen + connect/disconnect flow polish.** Including the post-connect "Send all 47 tasks?" prompt.
- **Slice C5 — Apple Review submission.** TestFlight, App Review Notes update, privacy policy update.
- **Slice C6 — Cohort flag ramp.** 10/25/50/100% over a week, watching `safeLog` for sync failures.

---

## 11. Overlap-clean check

Confirming this scoping does not collide with the two parallel workstreams.

### Free-tier redesign (parallel)

The free-tier redesign is touching `apps/web/src/lib/entitlements.ts:entitlementsFor` and the related gate helpers. Calendar integration adds a new gate:

```typescript
canSyncCalendar: subscriptionStatus === "PRO" || subscriptionStatus === "TRIAL"
```

**Sequencing rule:** calendar Phase 2 slice C1 (schema + entitlement) waits until the free-tier redesign's entitlement-shape changes have landed. The exact field in `entitlementsFor` that gates calendar should match whatever convention the free-tier work settles on (if it introduces a new shape, calendar adopts it; if it stays as today's flat boolean fields, we add `canSyncCalendar` flat).

**No file conflict** — calendar Phase 1 (this doc) doesn't touch `entitlements.ts`, `paywall.ts`, or any gate handler. Phase 2 slice C1 picks up after free-tier's slices have merged, so we add a flag to the shape free-tier defined.

### Theme extraction (parallel, V5 just shipped)

Theme extraction's Phase 2 (V5 prompt) is live behind `v1_1_dispositional_themes`. Calendar integration proposes adding a `calendarBlock` to `pipeline.ts:extractFromTranscript` — **next to** the existing context blocks (`memoryContext`, `goalBlock`, `dimensionBlock`, `taskGroupsBlock`).

**No conflict with V5:**
- The V5 prompt body itself is unchanged. Calendar context is just another input sentence the existing prompt reads.
- The `extractFromTranscript` signature gains an optional `calendarContext?: string` parameter alongside the existing optional ones.
- The `useDispositionalThemes` flag and `v1_1_dispositional_themes` feature flag are independent of the calendar flag.
- Both flags can be on or off independently — a user can have V5 themes + no calendar (most users initially), V5 themes + calendar (PRO users post-connect), legacy themes + calendar (legacy cohort post-connect, briefly), or neither.

**Sequencing rule:** calendar Phase 2 slice C2 doesn't merge until V5 has been at 100% rollout for at least a week. This avoids confounding the V5 production data with calendar-augmentation effects.

**No file conflict** — calendar's pipeline.ts addition is additive (a new `if (calendarContext) { ...prepend }` block alongside the existing ones). Theme extraction's V5 changes are in different parts of the same file.

### Summary

Both parallel workstreams are clean. Calendar Phase 2 sequencing:
1. Free-tier redesign lands its entitlement-shape decisions → calendar slice C1 picks the matching shape.
2. Theme extraction V5 reaches 100% rollout → calendar slice C2 merges and the production cohort gets calendar+V5 together.
3. Calendar slices C3-C6 follow their own cadence behind `calendar_integrations` flag.

---

## Out of scope for Phase 2 (Phase 3+ deferred)

- Outlook / Microsoft Graph (Phase C — at least 6 weeks post-launch).
- Google Calendar OAuth on web (Phase B — first post-launch addition; ~2 weeks of work after Phase A is stable).
- Two-way sync (calendar→Acuity). Hard problem (conflict resolution, change-detection). v1.3+.
- Calendar-derived theme nodes in Theme Map. v1.2 at earliest, after Phase 3 entity tier lands.
- People-level enrichment ("you met with Sarah 4×"). Requires people-resolution layer. v1.3+.
- Recurrence-rule analysis. v1.2.
- Real-time push from Google (Events.watch). v1.2 if users complain about staleness.
- Background fetch on iOS (BGTaskScheduler). Not needed; foreground-on-open is sufficient.

---

## Standing by

For Phase 1 review. Single-page summary at `docs/v1-1/calendar-integration-summary.md` for quick decision review.
