# Sentry Pass — 2026-05-02

**Window:** 2026-04-30 (start of this session's deploys) through 2026-05-02 (this report).
**Scope:** apps/web Sentry project. Mobile (`@sentry/react-native`) is out of scope for tonight.
**Format:** code-level observability audit + explicit "what to query in the Sentry UI" runbook.

> **Important caveat upfront — read this first.**
> No Sentry CLI auth or DSN is present in `.env.local`, so I cannot pull events directly from the API. This report is a **diagnostic of WHAT Sentry sees and HOW to query it**, plus what I can derive from code-level observability. The actual event frequency / user-impact grouping needs to be done from the Sentry UI by Jim using the queries below.

---

## §0 — A finding that changes how to read the rest of the report

`safeLog.warn` and `safeLog.error` (the structured logger added during slice 5's observability fix) call `console.warn` / `console.error` only — they do **not** route to Sentry as separate events. The slice 5 PROGRESS narrative said "safeLog.warn instead of console.warn so Sentry catches them"; that wording is technically wrong.

**What Sentry actually sees in apps/web:**

| Event source                                                                                                  | Captured? | Notes                                                                                                              |
|---------------------------------------------------------------------------------------------------------------|-----------|--------------------------------------------------------------------------------------------------------------------|
| Uncaught exception in a Next.js route handler                                                                  | YES       | Auto-instrumented by `@sentry/nextjs`. Surfaces as an Error event tagged with the route path.                       |
| Uncaught exception in a server component                                                                       | YES       | Same auto-instrumentation; bubbles to `app/global-error.tsx` which `Sentry.captureException` and re-renders.       |
| `app/global-error.tsx` render-tree errors                                                                      | YES       | Explicit `Sentry.captureException(error)`.                                                                          |
| `lib/auth.ts:230` (events.createUser bootstrap failure)                                                        | YES       | Explicit `Sentry.captureException` with tag `auth_route=true`.                                                       |
| `safeLog.warn(...)` / `safeLog.error(...)` / `safeLog.info(...)` calls                                         | **NO**    | These are `console.warn` / `console.error` / `console.log`. Show in Vercel logs only.                                |
| `console.warn(...)` / `console.error(...)` direct calls                                                        | **NO**    | Same. Caveat: `@sentry/nextjs` does include a default console-integration that captures these as **breadcrumbs** attached to the **next event** in scope — but they are not standalone events. |
| Caught-and-handled errors (e.g. the `enqueue-sync` P2022 short-circuit, the audio upload retry loop)           | NO        | Intentional — the catch swallows them.                                                                              |
| Inngest function failures                                                                                      | YES       | Inngest has its own retry / dead-letter UI separate from Sentry. The thrown error inside a step IS still captured by `@sentry/nextjs` if it surfaces uncaught at the route handler — but inside `step.run` Inngest's retry catches first, so Sentry rarely sees them. |
| `bootstrap-user.ts` `console.error` for welcome-email + founder-notif failures (lines 176, 195)                | NO        | Plain console.error — observable in Vercel logs only.                                                                |

**Implication for tonight:** when this report says "check Sentry for X", that means querying for X **only when** X actually surfaces as an uncaught throw or an explicit `captureException`. Anything in the `safeLog` / `console.warn` family lives in Vercel runtime logs, which need a different query.

---

## §1 — What to query in the Sentry UI (manual runbook)

These are the queries Jim should run against the apps/web Sentry project to populate the frequency / user-impact data this report doesn't have.

### 1.1 Top-level error volume since 2026-04-30

```
Issues → Search:
  is:unresolved
  age:-3d
  level:[error,fatal]
```

Sort by **users affected** desc. Triage anything with > 5 users, or anything with a stack pointing into:
- `src/app/api/record/route.ts`
- `src/inngest/functions/process-entry.ts`
- `src/app/home/page.tsx`
- `src/app/entries/[id]/page.tsx`
- `src/app/api/tasks/route.ts`
- `src/app/api/integrations/calendar/**`
- `src/app/api/backfill/**`

### 1.2 P2022 / 42703 schema-vs-DB drift errors

```
Issues → Search:
  is:unresolved
  message:"P2022" OR message:"42703" OR message:"column"
  age:-3d
```

Slice 6 + slice C3 both added schema; if the production DB push is fully aligned this should be empty. If anything appears, the column name in the message is the smoking gun.

### 1.3 /home and /entries/[id] 5xx since slice 4

```
Issues → Search:
  is:unresolved
  url:*/home* OR url:*/entries/*
  age:-3d
  level:[error,fatal]
```

The slice 4 deploy introduced new dashboard surfaces; any 5xx here is most likely a query-shape regression on the locked-state surfaces. Group by URL.

### 1.4 Auth flow errors

```
Issues → Search:
  is:unresolved
  tag:auth_route:"true"
  age:-3d
```

The `auth.ts:230` `Sentry.captureException` tags everything `auth_route=true`. Anything here is a bootstrap failure (DeletedUser drift, email collision, etc.).

### 1.5 Inngest function failures (cross-check)

The Inngest dashboard (https://app.inngest.com) is the canonical source for function-level retries / dead-letters. Sentry only sees the throws that escape `step.run`. Check Inngest's "Functions" tab for:
- `process-entry` — failure rate vs success rate
- `backfill-extractions` — should be near-zero invocations (slice 5 just shipped)
- `free-cap-evaluator` — first cron tick is Sunday 06:00 UTC; should be exactly zero invocations until then
- `drain-pending-calendar-tasks` — slice C3-era; flag-gated short-circuit means low volume
- `auto-blog-generate` — should be running its scheduled cron

### 1.6 Vercel runtime logs (where safeLog actually lives)

```
Vercel Project → Logs → filter:
  process-entry.embedding-failed
  pipeline.embedding-failed
  calendar.enqueue.failed
  backfill.embedding-failed
  backfill.extract-failed
  paywall.user_missing
  free-cap-evaluator.tick
```

Each of these is a `safeLog.warn` or `safeLog.info` event tag. Vercel's log search returns the structured JSON the safeLog wrapper emits. Counts there are the answer to "how often does X fire."

---

## §2 — Code-level signal map for the events this sweep called out

For each signal Jim asked about, I've mapped the call site, the conditions that trigger it, and where to look for occurrences.

### 2.1 `process-entry.embedding-failed`

- **Site:** `apps/web/src/inngest/functions/process-entry.ts:591`
- **Triggers:** OpenAI `embeddings.create` throws (most commonly: 429 rate limit, 500 transient, request-aborted).
- **Severity:** non-fatal. The catch block sets `embedding=[]` so the rest of the pipeline persists; the entry has no semantic-search vector but is otherwise complete.
- **Where it lands:** Vercel runtime logs only (safeLog.warn → console.warn). Not Sentry.
- **Query pattern (Vercel):** filter for `process-entry.embedding-failed`. If the count is non-trivial, run `apps/web/scripts/backfill-entry-embeddings.ts` (it sweeps any Entry with `embedding=[]` and re-embeds).
- **Expected pre-fix volume since slice 4:** unknown. Was the trigger for the 2026-05-02 observability fix (aec0ec8). Post-fix, the call site emits proper structured logs; the fix did NOT add Sentry capture, so Vercel logs remain the only signal.

### 2.2 `calendar.enqueue.failed`

- **Sites:** `apps/web/src/app/api/tasks/route.ts:177` (POST creator) and `:344` (PATCH updater).
- **Triggers:** Prisma P2022 for missing calendar columns, OR any other thrown error during the task→calendar enqueue helper call.
- **Severity:** non-fatal. The catch swallows; the task creates/updates fine; calendar event just doesn't enqueue.
- **Slice C5b short-circuit:** `lib/enqueue-sync.ts:144` now silently swallows P2022 specifically. So this safeLog.warn should fire **rarely** (only on actual non-P2022 errors). If the count went UP after slice C5b deployed, something is wrong.
- **Query pattern (Vercel):** filter `calendar.enqueue.failed`. Read the `errorCode` field — if it's `"P2022"` something is off (the short-circuit should have caught it before this safeLog fired). If it's anything else, that's a real bug to investigate.
- **Expected pre-fix volume since slice C5b:** near-zero. Slice C5b's whole point.

### 2.3 `backfill.*` events from slice 5

- **Sites:**
  - `inngest/functions/backfill-extractions.ts:121` (`backfill.empty`) — info-level when a user opts in but the WHERE filter returns 0 entries (already-backfilled or none in window).
  - `:212` (`backfill.embedding-failed`) — embedding step threw on a per-entry basis.
  - `:234` (`backfill.extract-failed`) — Claude extraction threw on a per-entry basis. Sets `partialReason="backfill-extract-failed"` and skips that entry.
  - `:306` (`backfill.email-failed`) — completion email failed. Run finishes successfully regardless.
  - `:313` (`backfill.complete`) — info-level success log with tally.
- **Severity:** non-fatal across the board. The fn has fail-soft semantics by design (slice 5 §A.4).
- **Where it lands:** Vercel runtime logs. NOT Sentry.
- **Expected volume:** very low. The fn fires only when a user explicitly opts in to "Process my history." Slice 5 just shipped 2026-05-02 — only the seeded TRIAL test user (`jim+slice2trial@heelerdigital.com`) and any opt-in from real users have run it.
- **Query pattern (Vercel):** filter for any `backfill.*` event. Use the userId to triage per-user.

### 2.4 `free-cap.*` events from slice 6

- **Sites:**
  - `inngest/functions/free-cap-evaluator.ts:202` (`free-cap-evaluator.tick`) — info-level once per Sunday cron.
  - There is NO `free-cap-recording.*` or `free-cap-recording-blocked.*` event today. The /api/record cap-check at line 84 returns a structured 402 response without writing a safeLog event. **Surface as a finding** — see §3.
- **Severity:** info only. The cron's flip-flag transaction is structured to fail loudly via the un-caught throw if the DB write fails, in which case Inngest retries.
- **Expected volume:** exactly zero ticks until the first Sunday after deploy (2026-05-03 06:00 UTC if seeded today). Any tick before then would be unexpected.
- **Query pattern (Vercel):** filter `free-cap-evaluator.tick`. Verify metrics are sensible (freeUserCount > 0 since launch, medianCadence and conversionRate are floats).

### 2.5 P2022 / column-drift errors

- **Likely surfaces (ranked by probability of having tripped):**
  1. **slice 6 columns:** `User.freeRecordingsThisMonth`, `User.freeRecordingsResetAt`, `FreeCapEvaluation`, `FreeCapAuditLog`. Pushed from home network earlier today per slice 6 PROGRESS entry. The `/api/record` cap-check is gated by the off-flag, so the new columns are read but never written today. Risk: low.
  2. **slice 5 columns:** `Entry.extracted`, `User.backfillPromptDismissedAt`, `User.backfillStartedAt`, `User.backfillCompletedAt`, the `Entry @@index([userId, extracted, createdAt])`. Pushed from home network 2026-05-02. /home reads `backfillPromptDismissedAt` for every authenticated user — if the column wasn't pushed, /home would 5xx for everyone. Slice 5 PROGRESS confirms push completed.
  3. **slice C3 columns:** `Task.calendarEventId`, `Task.calendarSyncedAt`, etc. Already hotfixed via the `enqueue-sync` short-circuit + the explicit-select sweep on Task queries.
  4. **slice 1 columns from much earlier:** `User.canExtractEntries` derivation columns, etc. Should be stable — no recent changes there.
- **Where it lands:** **Sentry events** (uncaught throw from a Next.js route hits `@sentry/nextjs` auto-instrumentation).
- **Query pattern (Sentry):** §1.2 above.

### 2.6 /home and /entries/[id] 5xx since slice 4

- **Likely failure modes:**
  - Slice 4 added new locked-state cards on /home (`ProLockedCard`) and /entries/[id]. Server-rendered. Schema reads include calendar columns + the new backfill columns + the slice 6 freeRecordings columns.
  - The 2026-05-01 dashboard outage was caused by exactly this pattern (default Prisma projection picking up calendar columns that didn't exist in prod). Hotfix swept explicit `select` clauses; should be stable.
  - New risk: any `entitlementsFor` consumer that imports `@/lib/entitlements` server-side and reads a User field that shifted in shape. Slice 7 moved `isFreeTierUser` to `@acuity/shared`, but `entitlementsFor` itself is unchanged.
- **Query pattern (Sentry):** §1.3 above.

---

## §3 — Findings

### 3.1 `safeLog.*` does not reach Sentry — observability gap

**Severity:** medium-but-now-low-impact.

The slice 5 narrative implied safeLog routes to Sentry. It doesn't. Anything previously believed to be a Sentry-visible signal via safeLog — `process-entry.embedding-failed`, `calendar.enqueue.failed`, `backfill.*`, `free-cap-evaluator.tick`, `paywall.reject`, etc. — is Vercel-logs-only.

**Why now low-impact:** the structured-log format that safeLog enforces (single-key event name + sanitized payload) makes Vercel log search highly grep-able. So the actual signal isn't lost; it just lives in a different UI. Recommended fix is to plug a Sentry transport into the safeLog `error` and `warn` methods (the `error` method has a clear case; `warn` is debatable). Estimate: 30 minutes of code, 0 schema, 0 deploy risk.

**Recommendation:** **backlog candidate** — not "needs fix this session" because no actual signal is missing, just routed. Add an entry to `docs/v1-1/backlog.md`.

### 3.2 No `/api/record` block-event log when cap fires

**Severity:** low.

The slice 6 cap-check at `/api/record` returns a 402 with structured body when blocked, but does NOT call `safeLog.warn("free-cap.recording-blocked", …)`. When the flag eventually flips on, we'll have no count of "how many users hit the cap on day N" in either Vercel logs or Sentry — only inferred from `User.freeRecordingsThisMonth` field reads.

**Recommendation:** **backlog candidate** — add a `safeLog.info("free-cap.recording", { userId, state, count })` immediately after `checkAndIncrementFreeCap` so we observe ok/grace/blocked transitions when the flag is on. Trivial change, but cap is currently flag-off so this isn't urgent.

### 3.3 Two sites still use plain `console.error` for non-fatal pipeline failures

**Severity:** low.

`pipeline.ts:478` (uploadAudio non-fatal in async path), `:533`/`:575` (memory + lifemap update non-fatal), `:772`/`:784`/`:832` (similar), and `bootstrap-user.ts:176`/`:195` (welcome-email + founder-notification failures) all use raw `console.error`. They should at minimum be `safeLog.warn` for the structured event-name search; arguably `safeLog.error` so they hit the Sentry transport once §3.1 is implemented.

**Recommendation:** **backlog** — sweep cleanup. Same observability tier as §3.1.

### 3.4 No findings that "need fix this session"

Nothing in the code-level audit suggests a hot bug needing a hotfix tonight. The Sentry queries in §1 will produce the actual answer. Until those are pulled, treat this as **all-clear modulo the manual queries**.

---

## §4 — Triage table

| Finding | Severity | Action category | Owner | Estimate |
|---------|----------|-----------------|-------|----------|
| §3.1 safeLog → Sentry | medium → low | Backlog | Jim | 30 min |
| §3.2 /api/record block-event log | low | Backlog | Jim | 10 min |
| §3.3 plain console.error sites | low | Backlog | Jim | 30 min |
| §1.2 P2022 query | unknown | **Manual query needed** | Jim | 5 min |
| §1.3 /home /entries/[id] 5xx | unknown | **Manual query needed** | Jim | 5 min |
| §1.6 Vercel safeLog query | unknown | **Manual query needed** | Jim | 10 min |

No items are categorized "needs fix this session" until the manual queries return data.

---

## §5 — One-line summary

Code-level audit clean. The actionable surface tonight is three Sentry queries (§1.2, §1.3, §1.4) and three Vercel-log queries (§1.6) that need to be run against the running production project. The biggest finding from the code path is that `safeLog` doesn't reach Sentry — slice 5's narrative was wrong about that — but the events still land in Vercel logs in a structured form, so it's a routing question, not a signal-loss question.

---

## Cross-references

- safeLog source: `apps/web/src/lib/safe-log.ts`
- Sentry server config: `apps/web/sentry.server.config.ts`
- Slice 5 observability incident (the wrong-narrative one): PROGRESS.md 2026-05-02 entry, commit `aec0ec8`
- Slice C5b enqueue-sync short-circuit: `apps/web/src/lib/enqueue-sync.ts`
- Free-cap evaluator: `apps/web/src/inngest/functions/free-cap-evaluator.ts`
