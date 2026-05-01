---
status: ready for Jim's review → implementation
audience: Jim
author: Claude (Opus 4.7, 1M context)
date: 2026-04-30
parent: docs/v1-1/free-tier-redesign.md (approved 2026-04-30)
scope: phase-2 build plan for the FREE-tier redesign
out-of-scope: marketing copy on web /upgrade, post-launch instrumentation
---

# Acuity v1.1 — Free-Tier Phase 2 Implementation Plan

## TL;DR

The architectural pivot in `docs/v1-1/free-tier-redesign.md` resolved everything except three live tensions: (A) what happens to FREE-recorded summary entries when the user upgrades, (B) what locked-state UI we render across five surfaces given Apple Review constraints, (C) whether the cost math survives a 1% conversion floor. This doc closes all three, then maps the build into seven ordered slices with file-level scope. Estimated total scope: ~9 working days. The schema changes are the single load-bearing migration: one new boolean on `Entry`, three nullable timestamps on `User`, and two deferred columns for the soft-cap mechanism (added but unused at launch). Everything else is code paths, copy, and Inngest plumbing.

---

## Part I — Pushback resolutions

### Pushback A — Opt-in retroactive backfill on upgrade

**Decision:** Default behavior stays no-auto-backfill. Add an **opt-in "Process my history" affordance** that surfaces on first dashboard load post-upgrade. Single dismiss, persisted on `User`, re-triggerable from `/account`.

#### A.1 How we identify summary-only entries

Two options:

| Option | Mechanism | Pros | Cons |
|---|---|---|---|
| (1) New column `Entry.extracted Boolean @default(false)` | Set to `true` in `process-entry.ts` step `persist-extraction` (line 215). FREE branch leaves it `false`. Backfill historical PRO/TRIAL rows in the same migration: `UPDATE "Entry" SET extracted=true WHERE rawAnalysis IS NOT NULL`. | Explicit. No inference. Stable across schema evolution. One indexed query for the backfill scanner. | Schema change. |
| (2) Infer from `Entry.themes IS NULL AND Entry.rawAnalysis IS NULL` | No schema change. | No migration. | Brittle — `themes` is `String[]` not nullable (`schema.prisma:366`), so we'd actually be checking `themes = '{}' AND rawAnalysis IS NULL`, coupling backfill to two implementation details. |

**Recommendation: Option (1) — `Entry.extracted` boolean.** The schema spec said don't touch entitlements; this is a strictly-additive `Entry` column (default false, no read-path consumer changes), and the alternative is fragile. The `Entry` table already carries `extractionCommittedAt` + `partialReason` + `inngestRunId` (`schema.prisma:395-406`); one more boolean is in keeping with how this row is used as a status surface.

**Migration shape (slice 4):**

```sql
ALTER TABLE "Entry" ADD COLUMN "extracted" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Entry" SET "extracted" = true WHERE "rawAnalysis" IS NOT NULL;
```

The UPDATE is fast even at scale — `Entry` is per-user, indexed at `(userId, createdAt)` + `(userId, status, createdAt)`, `rawAnalysis` is JSONB so the IS NOT NULL check is single-tuple. Run inline with the migration.

#### A.2 Where the post-upgrade prompt lives

**Recommendation: a dismissible banner above the home dashboard grid (web + mobile), shown only when:**

1. `User.subscriptionStatus === "PRO"`, AND
2. The user has at least one `Entry` row where `extracted = false`, AND
3. `User.backfillPromptDismissedAt IS NULL`.

Web: insert above `LifeMatrixSection` in `apps/web/src/app/home/page.tsx`, parallel to the existing PAST_DUE banner pattern at lines 124-144. Mobile: insert in `apps/mobile/app/(tabs)/index.tsx`, above the recent sessions list and below the greeting.

#### A.3 Detection — the FREE→PRO transition

The transition lives at `apps/web/src/app/api/stripe/webhook/route.ts` (`checkout.session.completed` + `invoice.payment_succeeded` handlers). Both write `subscriptionStatus: "PRO"`. Two cases:

- **TRIAL→PRO direct** (user converts during trial): no FREE-recorded entries exist, so banner-eligibility returns 0 and nothing surfaces. Correct.
- **FREE→PRO** (user lapsed to FREE, journaled on FREE, came back): `Entry.extracted=false` rows exist. Banner shows.

We don't add a new "transition event" — the banner is computed lazily from User + Entry on dashboard render. This sidesteps webhook race conditions (mobile re-syncs auth before the webhook lands) and works whether the upgrade happened seconds or hours ago.

#### A.4 The Inngest backfill function — sketch only

- **Event:** `entry/backfill.requested`
- **Payload:** `{ userId: string, requestedAt: string }`
- **File (new):** `apps/web/src/inngest/functions/backfill-extractions.ts`
- **Concurrency:** `key: "event.data.userId", limit: 1` — one in-flight per user.
- **Step 1:** Fetch all `Entry` rows for `userId` where `extracted = false AND status = "COMPLETE" AND transcript IS NOT NULL AND createdAt > now - 60d`, ordered DESC.
- **Step 2:** For each entry, call existing `extractFromTranscript` from `apps/web/src/lib/pipeline.ts:171`, wrapped in `step.run("extract-entry-${entryId}")` for per-entry retry isolation. Persist via the same transaction shape as `process-entry.ts:215-348`.
- **Step 2.5 (added 2026-05-01 — slice 2 backlog):** After persist-extraction succeeds, also fire the equivalent of the `embed-entry` step at `process-entry.ts:570-588` (`buildEmbedText` + `embedText` → `prisma.entry.update({ embedding })`). Reason: FREE-tier entries skip `embed-entry` by design (slice 2's FREE branch early-returns before it), so backfilled entries land without embeddings. Without this step, an upgraded user's pre-PRO history is invisible to Ask-Your-Past-Self semantic search even after extraction succeeds. Wrap as its own `step.run("embed-entry-${entryId}")` so embedding failure doesn't block the extracted-flag flip below. Cost: +$0.00002 per entry (negligible vs the $0.011 Claude call already in step 2).
- **Step 3:** Set `extracted = true` regardless of extraction outcome. On failure, set `partialReason = "backfill-extract-failed"` and continue. (Rule: don't loop a broken transcript.)
- **Final step:** bump `User.lastLifeMapRefreshAt` so a refresh fires off the freshly-extracted lifeAreaMentions.

**Cost cap: 60 days.** A 60-day window covers virtually every realistic FREE-tier journaling streak (industry median FREE lifecycle is 30–45 days). Worst-case 60 entries × $0.011 = $0.66 per user, ~$660 per 1k-user upgrade cohort. Compare unbounded: 365+ entries possible, $4+/user, $4k+/cohort. Older entries are stale-context per design doc §2.4. If users want more, that's a v1.2 explicit `/account` "extract everything" surface.

**Batch granularity:** `step.run` per entry — Inngest's per-step retry isolation matters more than orchestration overhead at our latency profile (Claude call dominates).

#### A.5 User-facing flow

1. User upgrades on web (or mobile via Safari handoff).
2. Next /home load: banner renders above the dashboard grid.
3. Banner copy:
   - **Title:** "Process the entries you recorded on free?"
   - **Body:** "We'll process the last 60 days of your entries ({recentCount} total). Older entries stay as transcripts — you can process those later from /account."
   - **Primary button:** "Yes, process them"
   - **Secondary link:** "No thanks"

   The `{recentCount}` and "older" disambiguation address Jim's refinement A.1: scope is named explicitly so the user knows what's in vs. out before they tap. If `olderCount === 0` the body collapses to "We'll process your {recentCount} entries. Takes a few minutes."
4. **Yes flow:** Confirmation modal showing entry count ("We'll process the {recentCount} entries you recorded since [date]. Older entries ({olderCount}) can be processed later from /account.") and ETA ("Done within 5 minutes for most users"). **No cost shown** — tacky. Confirm → POST `/api/backfill/start` → dispatches `entry/backfill.requested` → toast: "We're processing {recentCount} entries — they'll appear in your dashboard within a few minutes." Banner disappears. `User.backfillPromptDismissedAt = now()`.
5. **No flow:** Banner disappears. `User.backfillPromptDismissedAt = now()`. No toast.
6. **Done:** No push notification — that reads as spam. Send one transactional email at backfill completion (per Jim's refinement A.3):

   ```
   Subject: Acuity processed your past entries
   Body:
   Hey {{name}},

   We extracted themes, tasks, and goal flags from {{recentCount}} of
   your recordings. They're live on your dashboard now.

   {{#if olderCount}}
   You have {{olderCount}} older entries (recorded more than 60 days
   ago) that we didn't process this round. If you'd like those
   extracted too, you can kick off a second pass from your account
   settings: getacuity.io/account
   {{/if}}

   — Acuity
   ```

   Email is sent once per backfill run. The `{{#if olderCount}}` block only appears when older entries remain — completes the user's mental model so they know both what got processed AND what's still available.

#### A.6 Edge cases

- **Re-trigger from /account.** Two permanent surfaces, not one (per Jim's refinement A.2):
  - "Process recent entries" — re-runs the 60-day window. Tappable any time. Idempotent via `WHERE extracted = false AND createdAt > now-60d`.
  - "Process older entries (N remaining)" — second backfill pass for entries older than 60 days. Surfaces only when `olderCount > 0`. Shows the live count so the user knows what's at stake before tapping. Dispatches the same Inngest event with `payload.window: "older"` to widen the WHERE clause to `createdAt <= now-60d`. Cost-warned in the modal: "Processing {olderCount} older entries — this can take 10-20 minutes." (No dollar amount shown.)
  Both surfaces re-run the Inngest event; the function's `WHERE extracted = false` filter is the natural idempotency guard.
- **Second upgrade after a downgrade.** Dismiss is sticky — `backfillPromptDismissedAt` doesn't clear on status change. They go to /account if they want it. Simpler rule, matches the spec.
- **User opens app while backfill running.** Entries appear with their summary; themes/tasks fill in as the function runs. No special UI.

#### A.7 Mobile vs web parity

Single banner component shape. Web renders it inline in `home/page.tsx`; mobile renders it inline in `index.tsx`. Both call the same `/api/backfill/start` endpoint. Mobile uses `Alert.alert` for confirmation — same copy.

#### A.8 Schema consolidated

```prisma
// Entry
extracted Boolean @default(false)

// User
backfillPromptDismissedAt DateTime?
backfillStartedAt         DateTime?
backfillCompletedAt       DateTime?
```

Four columns total. All defaulted/nullable; backfill is a no-op on read paths until populated.

---

### Pushback B — Locked-state UI per surface

#### B.1 Decision matrix

| Surface | File | Recommendation | Reasoning |
|---|---|---|---|
| **Life Matrix card** (home + insights) | `apps/web/src/app/home/_sections/life-matrix.tsx`, `apps/mobile/app/(tabs)/insights.tsx:236-309` | **Option (1) — empty/locked card.** Hexagon outline, no scores. | Design doc §3.2 + §8.4 already landed here. Frozen radar (2) reads as deliberately-broken to Apple. Marketing teaser (3) on a *radar chart* is creepy — radar charts are inherently personal-data-shaped. Reuses existing `LockedFeatureCard` precedent at `insights.tsx:237-242`. |
| **Goals tab locked state** | `apps/mobile/app/(tabs)/goals.tsx:565-571`, `apps/web/src/app/goals/goal-list.tsx` | **Option (1) — empty/locked card.** | Existing `progression.unlocked.goalSuggestions` machinery handles this exact UX. Wire `canExtractEntries === false` into the same gate. Manual goal creation still works on FREE — only suggestions banner is locked. Goals are too personal to mock. |
| **Tasks tab locked state** | `apps/mobile/app/(tabs)/tasks.tsx:779-808`, `apps/web/src/app/tasks/task-list.tsx` | **Option (1) — modified empty state.** Existing tasks (extracted during trial) still render. Only the empty-state copy changes. | A tasks-as-list mock looks like a screenshot of any to-do app — low signal for value-prop demonstration. Empty-state copy makes "the extraction is what you'd be paying for" explicit. |
| **Theme Map locked state** | `apps/mobile/app/(tabs)/insights.tsx:466-493`, `apps/web/src/app/insights/theme-map/page.tsx` | **Option (1) — empty/locked card.** | Force-directed graph keyed on user's themes — mocking is creepy, frozen-at-trial-end carries the same Apple Review concern. `LockedFeatureCard` precedent at `insights.tsx:466-471`. |
| **Pro pulse card on /home** | `apps/mobile/app/(tabs)/index.tsx:228-236`, `apps/web/src/app/home/_sections/todays-prompt.tsx` | **Option (3) — marketing teaser, alongside the existing recommendation card, smaller.** Generic mock prompt, secondary visual hierarchy. | Per Jim's open-question decision (alongside, smaller). Today's Prompt is the only surface where (a) the card is small enough that a mock fits, (b) prompt content is short and generic enough that a mock isn't creepy, (c) the user benefit is best demonstrated by *showing the shape*. Use a generic mock prompt — never real user data styled fake. |

**On the Pro pulse card specifics:**

- Mock content: a single grayscale prompt, italic. Generic: *"What would last week's you have wanted today's you to follow up on?"* Shape-correct but doesn't reference any personal data the user could mistake as theirs.
- Mock styling: ~50% opacity vs body, slightly grayed, visually marked as not-yours. The "Pro" eyebrow tag is full-contrast.
- CTA: "Continue on web →"
- Route: Safari → `getacuity.io/upgrade?src=home_pulse`

#### B.2 Verbatim copy per surface

**B.2.1 Pro pulse card (home, mobile + web)**

```
Eyebrow: Pro
Title:   Today's prompt, from your journal
Body:    [grayscale mock]
         "What would last week's you have wanted today's you to follow
         up on?"
Footer:  Pro reads your recordings and writes prompts that match what
         you've been working through.
Button:  Continue on web →
```

**B.2.2 Life Matrix locked card (insights tab + /home dashboard + /life-matrix)**

```
Eyebrow: Pro
Title:   Your six life areas
Body:    Career, Health, Relationships, Finances, Personal, Other —
         scored from 1 to 10, refreshed as you record. Free keeps
         the journal. Pro keeps the read.
Button:  Continue on web →
```

**B.2.3 Goals suggestions locked card (goals tab)**

```
Eyebrow: Pro
Title:   Goals you didn't know you set
Body:    When you mention something you're working toward, Acuity
         flags it as a candidate sub-goal. You stay in control —
         accept the ones that fit, dismiss the rest.
Button:  Continue on web →
```

**B.2.4 Tasks empty state (tasks tab)**

```
Title:   No tasks here yet
Body:    Acuity used to spot these in your recordings — "I should
         email Sarah", "I want to look into that course" — and
         queue them up. Pro keeps that running.
Button:  Continue on web →
```

(For FREE users with pre-existing trial-extracted tasks, empty-state only shows when filtered list is empty.)

**B.2.5 Theme Map locked card (insights tab + /insights/theme-map)**

```
Eyebrow: Pro
Title:   Your themes, mapped
Body:    Career, sleep, that side project — the threads running
         through your journal, sized by how often you return to
         them. Pro draws the map; Free keeps the entries.
Button:  Continue on web →
```

**B.2.6 Entry detail footer (mobile entry/[id] + web entries/[id])**

```
[below the one-sentence summary, small inline footer, single line]
Themes, tasks, and goal flags are a Pro thing. Continue on web →
```

#### B.3 Apple Review compliance notes

All five surfaces hold Option C compliance per `docs/APPLE_IAP_DECISION.md:166-169`: no "$", no "/mo", no "Subscribe", no "Upgrade". CTA "Continue on web →" only. Tap opens Safari to `getacuity.io/upgrade?src=<surface_id>`. Locked cards explicitly state "this is a Pro thing" — they are signposted gates, not broken features. Same shape as Spotify's "Listen offline (Premium)" toggle.

The Pro pulse card with mock content is the highest-risk surface. Mitigations: "Pro" eyebrow, grayscale-marked-as-mock body, no upgrade/subscribe button text. If Review flags it, fallback is option (1) empty card — single component swap, no schema/backend churn.

---

### Pushback C — Cost math at 1%, 2%, 3% conversion

#### C.1 The numbers

Same parameters as design doc §5: 10,000 FREE × 0.3 recordings/day × 30 days = 90,000 recordings/month × $0.013 = $1,170/mo FREE COGS; PRO at $12.99/mo:

| Conversion | PRO MRR | FREE COGS | Net |
|---|---|---|---|
| 0.5% | $649 | $1,170 | **−$521** |
| 1% | $1,299 | $1,170 | **+$129** |
| 2% | $2,598 | $1,170 | **+$1,428** |
| 3% | $3,897 | $1,170 | **+$2,727** |
| 5% | $6,495 | $1,170 | **+$5,325** |

**At 1% conversion at 10k FREE users, the redesign clears costs by $129/mo — barely.** Break-even is ~0.9% at this volume.

#### C.2 Scale stress test (50,000 FREE users)

| Conversion | PRO MRR | FREE COGS | Net |
|---|---|---|---|
| 0.5% | $3,247 | $5,850 | **−$2,603** |
| 1% | $6,495 | $5,850 | **+$645** |
| 2% | $12,990 | $5,850 | **+$7,140** |
| 3% | $19,485 | $5,850 | **+$13,635** |

At 50k FREE × 1%, surplus is razor-thin (~$645/mo, $0.013 per FREE user). One Stripe dispute, one Whisper price hike, one bad Inngest cycle and we're underwater.

#### C.3 Is 1% the realistic floor?

Industry benchmarks for journaling/wellness freemium:
- Calm / Headspace: 5-8% trial-to-paid; FREE-tier-to-paid much lower (~1-2%) because FREE self-selects for not-paying.
- Day One: ~3% FREE → paid annually (public reporting).
- Notion Personal Pro: ~4% FREE → paid (broader tool, looser comparison).

**Calibration: 1% is a defensible floor for direct-FREE-tier-to-paid. 0.5% is plausible if FREE is genuinely zero-friction and PRO doesn't feel essential.** Plan for 1% as floor, 2-3% as target.

#### C.4 Soft cap recommendation

**Do not ship a soft cap at v1.1.** Reasoning:

1. **The design doc §5.3 argument still holds.** A cap is the "deliberately broken" shape we're trying to avoid. Spotify isn't capped on listening time; conversion driver is feature differentiation, not metering.
2. **Existing rate limits already cap abuse.** `apps/web/src/app/api/record/route.ts:57-64` enforces per-user daily/monthly via Upstash. Worst-case attacker bounded at ~$11.70/month per user — below per-user PRO ARR of $12.99. Already protected.
3. **At 50k × 1%, the concern isn't FREE COGS — it's the conversion rate.** Soft cap doesn't materially shift conversion (Spotify ad-supported listening doesn't drive conversion via cap; it drives via ad fatigue). Cost-side fix is the wrong lever.
4. **Cohort data should drive the call.** Real-world FREE recording cadence post-v1.1 isn't known. Shipping a cap pre-data builds a UX rule based on a forecast. Wait 60 days post-launch, look at per-user-per-day distribution, then decide.

**Auto-flip trigger logic** (per Jim's refinement C):

Drop the "60 days post-launch" time condition. Replace with a weekly Inngest cron evaluation starting at v1.1 launch. The cron flips the cap on automatically when **all three** of these conditions hold for **7 consecutive evaluation cycles**:

- (a) `FREE_USER_COUNT > 25,000`
- (b) `MEDIAN_FREE_RECORDINGS_PER_USER_PER_DAY >= 0.7` over a trailing 14-day window
- (c) `FREE_TO_PRO_CONVERSION_RATE < 0.01` over a trailing 30-day window

The cron lives at `apps/web/src/inngest/functions/free-cap-evaluator.ts` (new file in slice 7), runs every Sunday at 06:00 UTC. Each tick:

1. Query the three metrics.
2. Append to a new `FreeCapEvaluation` table (one row per evaluation: timestamp, userCount, medianCadence, conversionRate, allConditionsMet boolean).
3. Check the trailing 7 evaluations: if all 7 have `allConditionsMet = true` AND the cap is currently off, flip the feature flag on. Persist the flip event to a new `FreeCapAuditLog` table (timestamp, action = "AUTO_ENABLED", evaluation IDs that triggered it).
4. **Sticky once flipped.** The cap does NOT auto-disable on subsequent oscillation. Manual disable via env-var override only — this avoids weekly thrash if the metrics drift back across the threshold.

The audit log is append-only and surfaced in /admin so we have a record of when and why the cap engaged. The 7-consecutive-cycle requirement = ~7 weeks of sustained pressure before the cap engages, which prevents a single bad-week metric blip from triggering it.

**The 30/month soft cap copy (deferred, do not ship at v1.1):**

```
[hits at recording 31 of 31]
Title:   You've recorded 30 times this month
Body:    That's a lot of journaling — nice. Free users get 30
         recordings a month; this one is on us. Pro removes the
         cap and turns these into themes, tasks, and goals.
Button:  Continue on web →
[Recording proceeds; 31st recording completes normally]
```

The "this one is on us" pattern: the recording on which the cap fires *still completes*. The 32nd recording is blocked. Avoids the in-the-moment toast that reads as gate-on-existing-feature for Apple Review and gives the user one grace recording to see the message before being capped.

**Decision: ship v1.1 uncapped. Add the cap mechanism as a feature flag (off by default) so we can flip it at v1.1.1 without a deploy if cohort data warrants. Schema:** `User.freeRecordingsThisMonth Int? @default(0)` + `User.freeRecordingsResetAt DateTime?` — both nullable, populated only when flag is on.

Defer the cap. Don't slow v1.1. Plan the toggle.

---

## Part II — Phase 2 implementation map

Seven slices, ordered. Each lists files touched, files created, schema changes, tests, complexity (S/M/L), and dependencies.

### Slice 1 — Entitlement flag refactor

**Goal:** Add `canExtractEntries`, loosen `entitlementsFor()` partition to allow `canRecord=true` on post-trial-free.

**Files touched:**
- `apps/web/src/lib/entitlements.ts:14-158` — add `canExtractEntries` to `Entitlement` interface (line 19); update `entitlementSet()` (line 129) to override `canRecord` and `canExtractEntries` independently from active-side derivation. Post-trial-free branch sets `canRecord: true, canExtractEntries: false`.
- `apps/web/src/lib/entitlements.test.ts:295-312` — loosen "active-side flags entail full generate permissions" test. Rename to "PRO-only flags require active side". Exclude `canRecord` + `canExtractEntries` from all-or-nothing assertion. Add new test: "FREE post-trial: canRecord=true, canExtractEntries=false".
- `apps/web/src/lib/paywall.ts` — extend `requireEntitlement` to accept `"canExtractEntries"` flag key (discriminated union add).
- `apps/web/src/lib/pricing.ts` — no change.

**Files created:** None.
**Schema changes:** None.
**Tests:** Partition loosening + new FREE-shape test + paywall flag-key test.
**Complexity:** **S.** (~0.5 day)
**Dependencies:** None — slice 1 is the foundation.

---

### Slice 2 — Inngest pipeline branch

**Goal:** Branch `processEntryFn` after step 2 (transcribe-and-persist) so FREE users get a Haiku one-sentence summary and skip extraction.

**Files touched:**
- `apps/web/src/inngest/functions/process-entry.ts:155-160` — after `transcribe-and-persist-transcript` updates `Entry.status = "EXTRACTING"`, fetch user, compute `entitlementsFor(user)`. If `canExtractEntries === false`, dispatch FREE branch. Else fall through to existing PRO path.
- `apps/web/src/inngest/functions/process-entry.ts` — new `summarize-free` step calling Claude Haiku with prompt "In one short sentence, summarize this transcript". Persist `Entry.summary` + `Entry.status = "COMPLETE"`. Skip `build-memory-context`, `extract`, `persist-extraction`, `embed-entry`, `update-user-memory`, `update-life-map`. **Keep** `update-recording-stats` (line 356-409) — fires `firstRecordingAt`, `totalRecordings`, `first_recording_completed` PostHog event. **Keep** `update-streak` (line 486-528) — streaks stay free per Jim's decision.
- `apps/web/src/lib/pipeline.ts:435-442` (sync path) — same branch. Sync path is being retired (per `route.ts:38-41`) but is still live. Mirror the branching for parity during cut-over.
- `packages/shared/src/constants.ts` — add `HAIKU_MODEL` constant alongside `WHISPER_MODEL` and Sonnet model constants (line 196-206).

**Files created:**
- `apps/web/src/lib/free-summary.ts` — wraps the Haiku call with prompt template, latency logging, error handling. ~40 lines vs the 600-line `extractFromTranscript`.

**Schema changes:** None for this slice (the `Entry.extracted` flag belongs to slice 4).
**Tests:** FREE branch correctly skips extract steps; `update-recording-stats` and `update-streak` still fire on FREE; `free-summary.ts` integration test against fixed transcript with mocked Anthropic client.
**Complexity:** **M.** Branching is ~50 LOC; tests for "FREE branch correctly skips steps 3-7" are the work. (~1.5 day)
**Dependencies:** Slice 1 (entitlements must expose `canExtractEntries`).

---

### Slice 3 — Day-14 transactional email

**Goal:** Send a one-time transactional email when a user transitions TRIAL → FREE.

**Files touched:**
- `apps/web/src/inngest/functions/trial-email-orchestrator.ts:82-86` — existing `trial_ending_day13` fires 24h before trial end. Add `trial_ended_day14` that fires 0–6h *after* `trialEndsAt`. Same orchestrator tick, same `TrialEmailLog` idempotency.
- `apps/web/src/emails/trial/registry.ts:38` — register alongside `trial_ending_day13`.
- `apps/web/src/emails/trial/types.ts` — add to `TrialEmailKey` union.

**Files created:**
- `apps/web/src/emails/trial/trial-ended-day14.ts` — new template:

```
Subject: Your trial wrapped up — Acuity stays free for journaling
Body:
Hey {{name}},

Your 14-day Pro trial ended. Acuity isn't going anywhere — you can
keep recording every day and we'll keep transcribing. Your past
themes, life matrix scores, and tasks stay where you left them.

What changed: new entries don't get extracted into themes, tasks,
or goal flags. That's the Pro layer.

When you're ready to turn the journal back into insights:
[Continue on web →]

— Acuity
```

**Schema changes:** None — `TrialEmailLog` is the existing idempotency surface.
**Tests:** Orchestrator selector logic for `trial_ended_day14` (gates on `trialEndsAt < now AND >= now-6h AND not in sentKeys`); template snapshot test (existing pattern in `apps/web/src/emails/trial/__tests__/`).
**Complexity:** **S.** (~0.5 day)
**Dependencies:** None on slices 1/2 — pure email plumbing.

---

### Slice 4 — Upgrade-time "process my history" affordance + opt-in backfill

**Goal:** Implement Pushback A in full. Banner on /home (web + mobile), opt-in flow, Inngest backfill function with 60-day cap.

**Files touched:**
- `apps/web/src/inngest/functions/process-entry.ts:215-238` — at persist-extraction, set `extracted: true` on Entry update.
- `apps/web/src/lib/pipeline.ts:448-571` (sync path) — same: set `extracted: true` on persist transaction.
- `apps/web/src/app/home/page.tsx` — add `BackfillBanner` above dashboard grid, parallel to PAST_DUE banner pattern.
- `apps/mobile/app/(tabs)/index.tsx:228-236` — add same banner above recommendation card.
- `apps/web/src/app/account/page.tsx` (and `account-client.tsx`) — add "Process my journal history" item, only when `subscriptionStatus === "PRO"` AND `extracted=false` entries exist.

**Files created:**
- `apps/web/src/inngest/functions/backfill-extractions.ts` — Inngest function. Event `entry/backfill.requested`. Concurrency 1 per userId. Iterates entries (last 60 days, `extracted=false`), runs `extractFromTranscript`, persists per `process-entry.ts:215-348` pattern. Failure-soft per entry (sets `partialReason="backfill-extract-failed"`, continues).
- `apps/web/src/app/api/backfill/start/route.ts` — POST. Validates ownership, requires `subscriptionStatus === "PRO"`, dispatches Inngest event, sets `User.backfillStartedAt = now()`.
- `apps/web/src/components/backfill-banner.tsx` — web banner UI.
- `apps/mobile/components/backfill-banner.tsx` — mobile banner UI (RN, mirror).
- Migration: `prisma/migrations/<timestamp>_add_backfill_columns/migration.sql` — adds `Entry.extracted`, `User.backfillPromptDismissedAt`, `User.backfillStartedAt`, `User.backfillCompletedAt`. Inline historical update: `UPDATE "Entry" SET extracted = true WHERE rawAnalysis IS NOT NULL`.

**Schema changes:**
```prisma
// Entry
extracted Boolean @default(false)

// User
backfillPromptDismissedAt DateTime?
backfillStartedAt         DateTime?
backfillCompletedAt       DateTime?
```

**Tests:**
- `backfill-extractions.test.ts` — mocked entries, 60-day window, per-entry-step independence, `extracted=true` flips even on failure.
- `api/backfill/start.test.ts` — auth, ownership, idempotency (second call after `backfillStartedAt` set returns 200).
- Banner unit test — renders only when conditions met.

**Complexity:** **L.** Inngest function + migration + two banners + API endpoint + /account surface. Largest slice. (~3 days)
**Dependencies:** Slice 1 (`canExtractEntries`); slice 2 (FREE branch sets `extracted=false` by default).

---

### Slice 5 — Five conversion surfaces (copy + wiring)

**Goal:** Land verbatim copy from §B.2 across all five surfaces.

**Files touched:**
- `apps/mobile/app/(tabs)/index.tsx:228-236` — add Pro pulse card (alongside, smaller). Generic mock prompt content.
- `apps/web/src/app/home/_sections/todays-prompt.tsx` — mirror Pro pulse card on web.
- `apps/mobile/app/(tabs)/tasks.tsx:779-808` — update empty-state copy.
- `apps/web/src/app/tasks/task-list.tsx` — same.
- `apps/mobile/app/entry/[id].tsx` — entry detail footer below summary.
- `apps/web/src/app/entries/[id]/` — same on web.
- `apps/mobile/app/(tabs)/goals.tsx:565-571` — wire `canExtractEntries === false` into existing `LockedFeatureCard` for `goalSuggestions`.
- `apps/web/src/app/goals/goal-list.tsx` — same.

**Files created:**
- `packages/shared/src/copy/free-tier.ts` — single source of truth for copy strings (§B.2). Web + mobile both import.

**Schema changes:** None.
**Tests:** Snapshot tests per surface; `src=` query param routing checks.
**Complexity:** **M.** Many small surfaces; mostly copy-driven, but six files × two platforms = twelve touchpoints. (~1.5 day)
**Dependencies:** Slice 1.

---

### Slice 6 — Locked-state UI for Life Matrix + Theme Map

**Goal:** Land Pushback B decisions for Life Matrix card + Theme Map card. Wire `canExtractEntries === false` into existing `LockedFeatureCard` machinery.

**Files touched:**
- `apps/mobile/app/(tabs)/insights.tsx:237-242` — extend gate. Today: `progression && !progression.unlocked.lifeMatrix`. After: `progression && (!progression.unlocked.lifeMatrix || !canExtractEntries)`. Same at lines 466-471 (theme map), 542-546 (weekly report), 646-651 (pattern insights).
- `apps/web/src/app/home/_sections/life-matrix.tsx:28` — extend `unlocked` flag.
- `apps/web/src/app/insights/theme-map/page.tsx` — same pattern.
- `apps/web/src/app/life-matrix/page.tsx` — render centered locked card for FREE; don't 404 (per design doc §4).

**Files created:** None — `LockedFeatureCard` exists at both `apps/mobile/components/locked-feature-card.tsx` and `apps/web/src/components/locked-feature-card.tsx`.
**Schema changes:** None.
**Tests:** Gate-logic unit test (four insights cards lock when `canExtractEntries === false`); snapshot test for `/life-matrix` page in FREE state.
**Complexity:** **M.** Repetitive but consistent — same gate, four spots. (~1 day)
**Dependencies:** Slice 1 (`canExtractEntries`); slice 5 (copy from `free-tier.ts`).

---

### Slice 7 — Soft cap (auto-evaluated / feature-flagged)

**Goal:** Build cap mechanism + the weekly auto-flip cron. Cap ships off; cron starts evaluating from launch day. When the three conditions in §C.4 hold for 7 consecutive Sundays, cron flips the flag on — sticky.

**Files touched:**
- `apps/web/src/app/api/record/route.ts:57-64` — add per-user-per-month FREE recording counter check, gated by `FREE_RECORDING_CAP_ENABLED` feature flag (read from `FeatureFlag` table, not env). Off by default at launch.

**Files created:**
- `apps/web/src/lib/free-cap.ts` — cap-check helper. Counts `Entry.createdAt > User.freeRecordingsResetAt` (or last calendar month start). On hit, returns "would-cap-but-grace" for 30th recording, hard-cap for 31st+.
- `apps/web/src/inngest/functions/free-cap-evaluator.ts` — Inngest cron. Runs weekly (Sunday 06:00 UTC). Queries the three metrics (FREE user count, median per-user-per-day cadence over trailing 14d, FREE→PRO conversion rate over trailing 30d). Persists evaluation to `FreeCapEvaluation`. If trailing 7 evaluations all met conditions AND cap is currently off, sets `FeatureFlag.FREE_RECORDING_CAP_ENABLED = true` AND writes to `FreeCapAuditLog` with action="AUTO_ENABLED".
- `apps/web/src/app/admin/tabs/FreeCapTab.tsx` (or section in existing admin) — surfaces the last 12 evaluations + the audit log so we can see why/when the cap engaged.

**Schema changes (added at launch even with flag off, so flip is config not deploy):**
```prisma
// User
freeRecordingsThisMonth Int?     @default(0)
freeRecordingsResetAt   DateTime?

// New table — evaluator's per-tick record
model FreeCapEvaluation {
  id                 String   @id @default(cuid())
  evaluatedAt        DateTime @default(now())
  freeUserCount      Int
  medianCadence      Float    // recordings per user per day, trailing 14d
  conversionRate     Float    // FREE→PRO over trailing 30d
  allConditionsMet   Boolean
  @@index([evaluatedAt])
}

// New table — append-only audit of flag state changes
model FreeCapAuditLog {
  id          String   @id @default(cuid())
  timestamp   DateTime @default(now())
  action      String   // "AUTO_ENABLED" | "MANUAL_ENABLED" | "MANUAL_DISABLED"
  triggeringEvaluationIds String[] // empty for manual actions
  notes       String?
  @@index([timestamp])
}
```

**Tests:**
- `free-cap.test.ts` — cap fires at 31st, grace 30th, resets monthly.
- `free-cap-evaluator.test.ts` — given mocked metrics arrays, asserts the 7-consecutive-cycle rule, asserts sticky-once-flipped (a subsequent failing evaluation does NOT flip the cap off).

**Complexity:** **M** (was S). Mechanism + cron + two new tables + admin surface. (~1 day)
**Dependencies:** None — additive.

---

## Part III — Roll-up

| Slice | Complexity | Days |
|---|---|---|
| 1. Entitlement flag refactor | S | 0.5 |
| 2. Inngest pipeline branch | M | 1.5 |
| 3. Day-14 transactional email | S | 0.5 |
| 4. Upgrade-time backfill affordance + Inngest function | L | 3.0 |
| 5. Five conversion surfaces (copy + wiring) | M | 1.5 |
| 6. Locked-state UI for Life Matrix + Theme Map | M | 1.0 |
| 7. Soft cap + auto-flip cron (feature-flagged) | M | 1.0 |
| **Total** | | **~9 working days** |

Plus a half-day QA pass on FREE / TRIAL / PRO transitions across web + mobile, plus a half-day Apple Review compliance copy validation on every new surface. **Round to ~9–10 working days end-to-end.**

## Part IV — Sequencing & deploy plan

1. Slice 1 lands first; nothing else runs until the entitlement flag exists.
2. Slices 2 and 3 land in parallel — no shared files.
3. Slice 4 lands after 2 (FREE branch sets `extracted=false` by default, which the migration depends on).
4. Slices 5 and 6 land in parallel after 1 (both consume `canExtractEntries`).
5. Slice 7 lands last, feature-flag off.

**Recommended deploy:** ship slices 1–6 together as v1.1. Slice 7 ships in same cut with feature flag off; flip-on happens via env-var change at v1.1.1 if cohort data warrants.

## Part V — Risk register

| Risk | Mitigation |
|---|---|
| Apple Review flags Pro pulse card (option 3) | Fallback to option 1 (empty/locked card) is single component swap, no schema/backend changes. |
| Backfill cost spikes on power-user upgrade event | 60-day cap caps worst-case at ~$0.66/user; concurrency=1 prevents per-user runaway; `extracted=true on failure` rule prevents retry storms. |
| Stripe webhook race vs. mobile sync at upgrade | Banner computed lazily from User+Entry on dashboard render — no race-prone event listener. |
| Soft cap copy reads as gate-on-existing-feature to Apple | Defer cap to v1.1.1+, ship feature-flag-off, re-validate copy with Apple Review notes if/when flipped on. |
| Migration on `Entry.extracted` slow on large tables | Single-pass UPDATE on indexed table; <30s on 1M-row table. Maintenance window if Entry count >5M (we're nowhere close). |

## Part VI — Out-of-scope notes

- Marketing copy on `getacuity.io/upgrade` — separate copy doc.
- Post-launch instrumentation dashboards (cohort-level conversion by `src=`) — separate analytics ticket.
- Static-library prompt on FREE Today's Prompt card (design doc §9 q2) — Jim chose "alongside, smaller" with Pro pulse; static-library path deferred to v1.2 if dual-card data shows pull.
- Re-extract / refresh affordance for already-extracted entries (different from backfill, which targets `extracted=false`) — out of scope; defer to v1.2.

---

*End of plan. Awaiting Jim's sign-off; on approval, begin slice 1.*
