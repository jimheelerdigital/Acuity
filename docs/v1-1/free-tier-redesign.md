---
title: Acuity v1.1 — Free-Tier Redesign (Journaling Loop Stays Alive)
status: design — not yet implemented
audience: Jim
author: Claude (Opus 4.7)
date: 2026-04-30
supersedes_in_part: IMPLEMENTATION_PLAN_PAYWALL.md §3 (FREE = read-only)
---

## TL;DR

Today's FREE post-trial state is a graveyard: `entitlementsFor()` flips every `can*` flag false, so users can read but cannot record. The new shape splits the product into a **journaling loop** (FREE) and an **intelligence layer** (PRO). FREE keeps the nightly recording habit alive — Whisper transcript plus a one-sentence summary — while every Claude-driven extraction (themes, goals, tasks, life-area scoring, weekly synthesis, audits, theme map) becomes a PRO surface. Cost is bounded (~$0.013 per FREE recording, well inside acquisition budget); compliance is unchanged (Spotify-shape: free consume / paid create-of-value); and the redesign creates 4–5 new conversion surfaces inside the app where today there is exactly one (the paywall modal).

I recommend a single new entitlement flag (`canExtractEntries`) plus a small refactor of `entitlementsFor()` from a binary partition to a per-flag rule, gated by the existing `subscriptionStatus` enum — no schema migration. PRO unchanged. The Inngest pipeline branches at step 3 (after transcribe-and-persist, before extract). On upgrade, FREE entries are NOT auto-extracted retroactively — they're left as `summary`-only rows, with a one-tap opt-in backfill from settings if Jim wants it later.

---

## 1. Entitlement redesign

### 1.1 Per-flag table

Currently every gate flag in `apps/web/src/lib/entitlements.ts:142-148` flips together — the partition is enforced by `entitlementSet()` and asserted by the property test at `apps/web/src/lib/entitlements.test.ts:295-312`. The redesign breaks that partition.

| Flag | Today's FREE value | Proposed FREE value | Rationale |
|---|---|---|---|
| `canRecord` (`entitlements.ts:21`) | `false` | **`true`** | The journaling loop. FREE must be able to capture audio. This is the entire pivot. |
| `canExtractEntries` (NEW) | n/a | `false` | Gates the Claude extraction step — themes, goals, tasks, lifeAreaMentions, subGoalSuggestions, progressSuggestions. The single flag every PRO surface inside the pipeline checks. |
| `canGenerateNewWeeklyReport` (`entitlements.ts:23`) | `false` | `false` | PRO. Already gated by `requireEntitlement` at `api/weekly/route.ts:58`. |
| `canGenerateNewLifeAudit` (`entitlements.ts:25`) | `false` | `false` | PRO. Existing audits remain readable (`canViewHistory`). New ones blocked at `api/life-audit/route.ts:76`. |
| `canGenerateMonthlyMemoir` (`entitlements.ts:27`) | `false` | `false` | PRO. Same shape. |
| `canRefreshLifeMap` (`entitlements.ts:29`) | `false` | `false` | PRO. Existing scores remain visible (read), but no refresh — see §3 for the "frozen radar vs locked card" decision. |
| `canViewHistory` (`entitlements.ts:34`) | `true` | `true` | Invariant. Test at `entitlements.test.ts:252-269` enforces it across every status. |

### 1.2 New flag semantics

**`canExtractEntries: boolean`** — true when the user is entitled to have new audio entries run through the Claude extraction step (themes/goals/tasks/lifeAreaMentions/embeddings). Consumed by the Inngest `processEntryFn` (`apps/web/src/inngest/functions/process-entry.ts:172-212`) and the sync-path `processEntry()` orchestrator (`apps/web/src/lib/pipeline.ts:435-442`). When false, the pipeline runs through `transcribe-and-persist-transcript` (step 2 at line 129), generates a one-sentence summary (new step 2.5), and short-circuits before step 3 (`build-memory-context`). PRO + TRIAL + PAST_DUE → true. FREE → false.

I considered a second flag `canBasicSummary`, but it's redundant with `canRecord`: a recording without a summary is just a transcript blob, which is hostile UX. Bundling the one-sentence summary into the FREE record path keeps the surface coherent without another flag to thread.

### 1.3 `entitlementsFor()` refactor

Today the function is a clean partition (`entitlements.ts:135-141`) — every active-side branch yields the same set, every locked branch yields the same set. The redesign breaks the partition but doesn't break the function — we just stop using `entitlementSet()` and inline the per-status overrides. The four state flags (`isActive`, `isTrialing`, `isPastDue`, `isPostTrialFree`) and the partition test at `entitlements.test.ts:271-293` are unchanged.

Concretely: `entitlementSet({ isPostTrialFree: true })` currently yields `canRecord=false`. After the change, it yields `canRecord=true, canExtractEntries=false`, with every other `can*` flag still false. The test at `entitlements.test.ts:295-312` ("active-side flags entail full generate permissions") needs to be loosened to allow `canRecord=true` on the post-trial-free side — recommend renaming the test from "active-side flags entail full generate permissions" to "PRO-only flags require active side" and excluding `canRecord` + `canExtractEntries` from the all-or-nothing assertion. `canExtractEntries` follows the same active/inactive partition the other PRO flags do.

### 1.4 Schema changes

**None required.** The `subscriptionStatus` enum (`pricing.ts:35-40`) already encodes TRIAL/PRO/PAST_DUE/FREE; the new tier semantics are derived from those existing values. `User.subscriptionStatus` is already a String column (not a Postgres enum — see `prisma/schema.prisma` line ~63: `subscriptionStatus String @default("TRIAL")`), so we don't need a Prisma migration to add a new state.

If we later want to distinguish "FREE-with-extraction-quota-left" from "FREE-quota-exhausted" (the cap-vs-uncap question, §5), that's a counter on `User` (e.g. `freeRecordingsThisMonth Int @default(0)` + `freeRecordingsResetAt DateTime?`). Recommend deferring — see §5 for why uncapped is the right v1.1 default.

---

## 2. Server pipeline branching

### 2.1 Current `/api/record` flow

Walking the sync path at `apps/web/src/app/api/record/route.ts` and the orchestrator at `apps/web/src/lib/pipeline.ts:364`:

| Step | File:line | What it costs (USD per recording, ~2 min audio, ~300-word transcript) |
|---|---|---|
| 1. Auth | `route.ts:45-48` | $0 |
| 2. Rate limit | `route.ts:57-64` | $0 (Upstash) |
| 3. Paywall (`canRecord`) | `route.ts:67-68` | $0 |
| 4. Parse + validate audio | `route.ts:70-127` | $0 |
| 5. Upload to Supabase | `pipeline.ts:46-76` | ~$0 (storage; trivial vs LLM) |
| 6. Whisper transcribe | `pipeline.ts:80-102` (model `whisper-1` per `packages/shared/src/constants.ts:196`) | **~$0.012** ($0.006/min × 2 min) |
| 7. Build memory context | `pipeline.ts:409-410` | $0 (Prisma read) |
| 8. Claude extract | `pipeline.ts:435-442` (model `claude-sonnet-4-6` per `constants.ts:206`, max 2048 out) | **~$0.011** (~3k input tokens × $3/MTok + ~1k output × $15/MTok = $0.009 + $0.015 ≈ $0.024 worst case; typical ~$0.011) |
| 9. Persist transaction | `pipeline.ts:448-571` | $0 (Prisma writes) |
| 10. Update memory + lifemap | `pipeline.ts:601-607` | small Claude call inside `updateLifeMap` if it fires; usually $0 incremental on a single entry |
| 11. Embed | `pipeline.ts:614-629` (model `text-embedding-3-small` per `embeddings.ts:15`) | **~$0.00002** (negligible) |

The Inngest path (`process-entry.ts`) is structurally identical — same Whisper call (`process-entry.ts:141-146`), same Claude call (`process-entry.ts:202-211`), same embedding (`process-entry.ts:417-432`). The branching point is the same in both paths.

**Pricing references (verified 2026-04-30):**
- OpenAI Whisper-1: $0.006 per minute (audio.openai.com/pricing).
- Claude Sonnet 4-6: ~$3 per MTok input / $15 per MTok output (anthropic.com/pricing — Sonnet generation pricing tier).
- Claude Haiku (Haiku 4-x): ~$0.80 per MTok input / $4 per MTok output.
- OpenAI `text-embedding-3-small`: $0.02 per MTok ($0.00002 for a 1k-token entry).
- GPT-4o-mini: $0.15 per MTok input / $0.60 per MTok output.

Numbers are the prices Anthropic + OpenAI public-list as of 2026-04-30 — Jim should verify against the live billing dashboard before locking the unit-economics commitment. Cite the date in any downstream forecasting deck.

### 2.2 Where to branch

**Recommendation: branch inside the Inngest orchestrator at the boundary between step 2 (`transcribe-and-persist-transcript`, `process-entry.ts:129`) and step 3 (`build-memory-context`, `process-entry.ts:162`).** Same endpoint, same event, same Inngest function — a single `if (!entitlement.canExtractEntries) { … short-circuit … }` after the transcript has persisted.

Concretely, after `transcribe-and-persist-transcript` updates `Entry.status = "EXTRACTING"`, branch:

- **PRO branch** (current behavior): runs steps 3–8 unchanged.
- **FREE branch** (new): runs a tiny Claude Haiku call ("In one short sentence, summarize this transcript") to populate `Entry.summary`, then sets `Entry.status = "COMPLETE"` and skips memory/lifemap/embedding/streak's lifemap-bump. Streak update (`process-entry.ts:486-528`) still runs — keeping the streak alive on FREE is critical to the journaling-loop pitch. The `update-recording-stats` block (`process-entry.ts:356-409`) also still runs — `firstRecordingAt`, `totalRecordings`, and the `first_recording_completed` PostHog event drive trial-onboarding emails which we want firing on FREE-tier first recordings too.

**Alternatives considered and rejected:**

- *Two separate Inngest functions* (`process-entry-pro` + `process-entry-free`, dispatched conditionally from the route). Cleaner separation but doubles the surface area we have to maintain in lockstep — every change to step 1 (download), step 2 (transcribe), step 8 (streak) has to land in both functions. The retry/concurrency configs (`process-entry.ts:31-35`) would also fork. Not worth it for the size of the FREE-branch delta.
- *Branching in the `/api/record` route itself* (sync-path FREE, async-path PRO). Ties the FREE/PRO split to an unrelated infrastructure flag (`ENABLE_INNGEST_PIPELINE`). The migration plan is to remove the sync path entirely (per `route.ts:38-41`); we should not pile new branching onto it.

A `requireEntitlement("canRecord", userId)` check stays at `route.ts:67-68` — both PRO and FREE pass it. The `canExtractEntries` check happens inside the Inngest function once it has the userId, where it's already doing other DB reads. (Adding it to the route would require a redundant DB read; the function already fetches the entry + does memory I/O, so `entitlementsFor()` against the same User row is free.)

### 2.3 Cost per entry: PRO vs FREE

**PRO recording:** Whisper $0.012 + Claude Sonnet $0.011 + embedding $0.00002 + memory/lifemap occasional Claude ~$0.005 amortized = **~$0.028 per recording** (round to $0.03 for budgeting).

**FREE recording:** Whisper $0.012 + Haiku one-sentence summary (~600 input tokens × $0.80/MTok + 50 output tokens × $4/MTok ≈ $0.0007) + nothing else = **~$0.013 per recording** (round to $0.015 for budgeting).

The Whisper call dominates FREE cost. Switching to GPT-4o-mini for the summary would push the summary line to ~$0.0005 (5% cheaper); the Haiku-vs-mini choice is below noise on FREE economics. Pick whichever has the lower latency at the prompt size we'll hand it (~one-sentence output, ~300-word transcript input) — this is an open question for Jim (§9).

### 2.4 Retroactive backfill on upgrade

A FREE user records 50 entries, each with `summary` populated and everything else NULL: no `themes`, no `wins`, no `blockers`, no `rawAnalysis.tasks`, no `lifeAreaMentions`. They upgrade to PRO. What happens to those 50?

**Recommendation: (b) only extract from new entries going forward. Do NOT auto-backfill.** Reasoning, in order of weight:

1. **Cost.** 50 entries × $0.011 Claude per entry = $0.55 burned the moment a single user upgrades. At a cohort scale of 1000 upgrades from "I journaled all month on free, now I'm in" each carrying 30+ entries, that's ~$300 of Claude burn in a deferred-cost cliff that Stripe shows up to bill us for in arrears, not at the time of the conversion event. Bad economics shape.
2. **Stale context.** Themes/goals/lifeAreaMentions are most useful when they're current. A 30-day-old transcript getting goals extracted today produces goals against a memory context that doesn't reflect the rest of that month's journal. The extractor's use of `buildMemoryContext` (`pipeline.ts:409-410`, also `process-entry.ts:163-165`) means freshly-backfilled entries would be extracted with too-thin or too-current context.
3. **User expectation.** "Pro turns your journal into prompts that match what you've been writing" sets the expectation that the *next* prompt is informed. It does not promise that the past 30 days suddenly resolve into themes.
4. **The escape hatch already exists.** `canRefreshLifeMap` triggers `generateLifeMapInsights` (`api/lifemap/refresh/route.ts:67`), which compresses memory + recomputes scores from whatever entries exist. A new PRO user can hit "refresh" and get something — even without per-entry extraction — within hours.

**Alternatives considered:**

- (a) *Auto-backfill on upgrade* — see cost concerns above. If we do it, gate it to the most-recent-N entries (e.g. last 14 days) to bound cost. Even bounded, this complicates the upgrade event handler in the Stripe webhook and adds an Inngest function we don't need.
- (c) *Opt-in backfill from settings* — defensible, but it adds a settings UI surface (no spec for it), bills the user-visible "let me upgrade my history" promise we haven't tested, and would be net-new mobile UI on top of the existing one-day v1.1 budget. Defer to v1.2 if there's pull from upgraded users asking for it.

If we ever build (c), the surface lives at `/account` (web) under "Backfill journal extractions" and dispatches a `backfill-extractions/requested` Inngest event with `userId` + `cutoffDate`. The function paginates 50 entries at a time through the existing `extractFromTranscript` call (`pipeline.ts:171`). Cost cap: bound to last 60 days at most.

---

## 3. Mobile UI for FREE users

### 3.1 Tab-by-tab audit

The mobile tabs are at `apps/mobile/app/(tabs)/`: `index.tsx`, `entries.tsx`, `tasks.tsx`, `goals.tsx`, `insights.tsx`, `profile.tsx`. There is no separate `life-matrix` tab — Life Matrix lives inside the `insights` tab (`insights.tsx:236-309`). Record is a modal opened from `index.tsx:199` (`router.push("/record")`).

| Tab | Today (FREE post-trial) | v1.1 FREE | Upgrade affordance |
|---|---|---|---|
| `index.tsx` (Home) | Read-only. Greeting + record CTA visible but tapping it eventually 402s on the API. `TrialBanner` (lines 303-329) hides post-trial. | Greeting + streak chip + Record CTA (works). Recent sessions list. **No** Today's Prompt card (it's a PRO card; see §3.2). | New "Pro pulse" card replaces Today's Prompt slot, copy in §7.1. Below recent sessions. |
| `entries.tsx` | Full search + mood filter + delete. | **Unchanged.** This tab is pure history + management. PARTIAL/COMPLETE badges (line 388) become moot — FREE entries land in COMPLETE with no themes; the chips block at line 401 stays empty without breaking layout. | None inline. Avoid littering search results with upgrade CTAs — Apple has historically flagged this (§8). |
| `tasks.tsx` | Read-only existing tasks; no new tasks extracted post-trial. | **No tasks ever extracted on FREE.** Tab still renders. Empty state copy changes from "No tasks yet" / "Record a session and Acuity will extract them for you" (line 783) to a Pro-aware variant (§7.2). | Empty-state CTA card, full-bleed when tasks list is empty. Above-fold when populated with pre-trial tasks. |
| `goals.tsx` | Read-only existing goals + sub-goals; pending suggestions banner can never grow. | Read-only existing goals. **No new goals from extraction, no new suggestions.** The "Add sub-goal" sheet (`goals.tsx:980`) still works manually — it's user-typed text, not extraction. | The `LockedFeatureCard` for `goalSuggestions` (line 565) already exists and renders when `progression.unlocked.goalSuggestions` is false. Reuse: when on FREE, set `unlocked.goalSuggestions = false` in the progression unlock logic. |
| `insights.tsx` | Read-only Life Matrix + locked theme map / weekly report cards already render via `LockedFeatureCard`. | Same locked treatment, broadened — see §3.2 for the radar question. The `LockedFeatureCard` mechanism (lines 237-242, 466-471, 542-546, 646-651) is exactly the right primitive. Wire it to entitlements, not just to user-progression milestones. | `LockedFeatureCard` already supports CTA copy + Safari deep link. Pass an `upgradeReason` prop (new) that overrides the milestone copy when the user is on FREE. |
| `profile.tsx` | "Manage plan on web" already conditional on `!isPro` (line 126-144). | **Unchanged.** The current copy ("Manage plan on web", `profile.tsx:139`) is already 3.1.3(b) compliant per the audit at `APPLE_IAP_DECISION.md:144-149`. The "Free Plan" badge (line 119) is fine. | Existing menu item. |

The Record screen (`apps/mobile/app/record.tsx`) stays unchanged. Confirm: yes — recording is the FREE primary action and nothing about the UI of recording cares whether extraction is happening downstream. The status badge progression (PENDING → TRANSCRIBING → EXTRACTING → COMPLETE) is fine to render even though FREE skips EXTRACTING in the Inngest function — we set status to COMPLETE directly after the summary call.

### 3.2 The Life Matrix question — frozen, hidden, or locked-with-CTA?

Three options:

1. **Hide entirely on FREE.** The radar disappears from `insights.tsx` until the user upgrades.
2. **Show frozen radar at trial-end values + locked CTA card overlaid.** Data already exists in `LifeMapArea` rows from trial period. Render those scores, dim them, overlay an upgrade CTA.
3. **Show a locked stub card** (no scores rendered, just "Pro turns your journal into a Life Matrix → see what you've actually been writing about"). Same `LockedFeatureCard` UX as the existing `progression.unlocked.lifeMatrix === false` state.

**Recommendation: (3) the locked stub card, NOT the frozen-radar.** Reasoning:

- **Apple Review risk on (2).** A frozen radar reads as "data exists in the app but we deliberately stop updating it to make you pay." Apple has rejected apps for "deliberately broken" surfaces — a screen that shows real numbers but stops them from being current is precisely that pattern. See §8 for the full argument; the conservative read here is to not make the existence-but-frozen claim.
- **(1) is hostile to recall.** A user who lived with the radar during trial, then upgrades, then loses it for two weeks of FREE before coming back and seeing it again — that's a worse re-entry experience than always-locked.
- **(3) is honest.** "You used to see this. It's a Pro thing. Here's why it'd be useful." This matches the `LockedFeatureCard` precedent already in the codebase and is consistent with the Spotify/Kindle compliance shape (see §8).

For the trial cohort that lands in FREE: they keep the data in `LifeMapArea` (we don't delete it), but the card surface is locked. If they upgrade, the existing scores re-appear immediately — `LifeMapSection` (`apps/web/src/app/home/_sections/life-matrix.tsx:13-21`) reads `LifeMapArea` rows directly; the only thing changing is whether the locked card or the live radar is rendered, gated by the new `canExtractEntries` flag (we treat extraction-entitled = matrix-entitled; they're the same upstream).

This same logic applies to:
- Theme Map card (`insights.tsx:466-493`) — already has `LockedFeatureCard` precedent.
- Pattern Insights card (`insights.tsx:646-655`) — already has `LockedFeatureCard` precedent.
- Today's Prompt — replace with new "Pro pulse" affordance, since it doesn't have a locked-card precedent yet.

---

## 4. Web UI parity

The web routes (`apps/web/src/app/`) parallel mobile and reuse most of the same gating idioms. Audit:

| Route | Today (FREE post-trial) | v1.1 FREE | Upgrade affordance |
|---|---|---|---|
| `/home` (`home/page.tsx`) | Dashboard renders. PAST_DUE banner at line 124-144. No FREE-specific banner. | Dashboard renders. Record button works. Today's Prompt section (`home/_sections/todays-prompt.tsx`) replaced with "Pro pulse" stub. Life Matrix Section (`home/_sections/life-matrix.tsx`) renders as locked card on FREE — extends the existing `unlocked` flag (line 28) to also flip false on `canExtractEntries === false`. Goals Snapshot, Open Tasks, Recent Sessions: render as-is from history. Weekly Insight: locked card with §7 copy. | New banner above the dashboard grid: "Free tier — your entries land but Pro turns them into themes / tasks / goals. [Continue on web]" Suppress on TRIAL/PRO. |
| `/entries` (`entries/page.tsx`) | List + search. Read-only. | Unchanged — pure history surface. | None inline. |
| `/entry/[id]` (`entries/[id]/`) | Existing extraction renders if present, partial review banner if needed. | For FREE-recorded entries: the extraction banner (raw `tasks` from `Entry.rawAnalysis.tasks`, raw new goals from `extraction.goals`) is empty. Show a one-sentence summary + a small "Themes/tasks unlock with Pro" inline footer. | Inline footer on the entry detail. Single CTA, single per-page placement. |
| `/tasks` (`tasks/page.tsx`) | Read-only. Existing tasks visible; no new ones extracted. | Same. Empty state copy updated. | Empty-state card. |
| `/goals` (`goals/page.tsx`) | Read-only tree + suggestions banner stays empty on FREE. | Same. | Inline lock card on the suggestions row when `pendingSuggestionsCount === 0` AND user is FREE. |
| `/life-matrix` (`life-matrix/page.tsx`) | Renders the deep-detail drill-down view. | Locked-card variant as a redirect-or-render: page renders a centered locked card for FREE. Don't 404 — that breaks back-button navigation from the dashboard. | Page-center CTA. |
| `/insights/theme-map` (`insights/theme-map/`) | Renders existing theme map (read-only). | For FREE who never had themes extracted (post-v1.1 cohort): empty state with locked-card CTA. For trial-cohort users with pre-existing themes: render the historical theme map but disable the "refresh" affordance. | Locked card or refresh-disabled toolbar. |
| `/insights` (`insights/page.tsx`) | Reuses the same insights view as mobile — separate web file but parallel structure. | Same broad treatment as mobile insights tab — locked subsections for theme map, weekly report, pattern insights, life matrix. | Reuse `LockedFeatureCard` web equivalent. |
| `/account` (`account/`) | Settings, manage subscription. | Unchanged for FREE. | Existing Stripe portal link / upgrade button. |
| `/admin/*` | Admin-only. | N/A for FREE users. | None. |

All web upgrade CTAs follow the existing pattern of in-page links to `/upgrade?src=<surface_id>` — already wired (e.g. `paywall.ts:80`). The `/upgrade` page is on web only; mobile opens it in Safari per `apps/mobile/app/paywall.tsx:40-49`.

---

## 5. Unit economics

### 5.1 FREE recording cost

From §2.3: ~$0.013 per FREE recording (Whisper-dominant).

### 5.2 At scale

| Scenario | Recordings/month | Total FREE cost/month |
|---|---|---|
| 1,000 FREE users × 1/day × 30 | 30,000 | **~$390/mo** |
| 1,000 FREE users × 0.5/day (more realistic post-trial) | 15,000 | **~$195/mo** |
| 5,000 FREE users × 0.5/day | 75,000 | **~$975/mo** |
| 10,000 FREE users × 0.3/day (real-world cadence drift) | 90,000 | **~$1,170/mo** |

Compare against PRO-tier ARR if the redesign converts even 5% of those 10k FREE users to PRO at $12.99/mo: 500 × $12.99 = $6,495 MRR, against $1,170 of FREE-tier infrastructure cost. ~5.5x revenue-to-FREE-cost ratio. The redesign pays for itself if conversion clears ~2% — well below industry benchmarks for journaling/wellness freemium (Calm/Headspace cite 5–8%).

**Worst-case attack scenario:** a single bad-faith FREE user records 100/day. Existing rate limiters (`route.ts:57-64`: `expensiveAi`, `recordDaily`, `recordMonthly`) already cap this at 30/day = $0.39/day = $11.70/month per user. We don't need extra protection.

### 5.3 Cap or no cap?

**Recommendation: NO CAP on FREE recording. Uncapped is correct for v1.1.**

Reasoning:

- **Math says we can afford it.** At 10k FREE users × 0.5 recordings/day, cost is ~$1k/mo — already under typical SaaS COGS thresholds at any plausible PRO ARR. The existing rate limiters already block abusive cases.
- **The pitch doesn't survive a cap.** "Free: keep journaling" with a footnote of "*5/month max" is a watered-down promise. The point is to keep the *habit* alive — a 5/month cap means the user hits the wall on Day 5 of a 30-day month and the FREE tier becomes another paywall, just one that fires at a different point.
- **A cap would create an explicit "deliberately broken" surface.** Attempting to record on Day 6 → toast saying "you've used your 5 free recordings — upgrade for more" is exactly the gate-on-existing-feature shape Apple Review flags (§8). The "free product is the journaling loop" framing falls apart if the loop is metered.
- **A cap doesn't necessarily lift conversion.** Spotify's free tier is uncapped on listening time; the conversion driver is feature differentiation (offline, ad-free), not artificial scarcity. Apply the same logic: drive conversion via the intelligence layer, not by metering the journaling.

**The alternative** (5–10/month cap) is defensible only if Whisper costs balloon (e.g. we move from 1k → 50k FREE users and the per-month bill exceeds, say, $5k). At that point reconsider — but ship v1.1 uncapped and revisit when cohort-level data warrants.

---

## 6. Data migration

### 6.1 Existing FREE-post-trial users (under old read-only rules)

Today's FREE-post-trial users have `subscriptionStatus = "FREE"` (see `apps/web/src/app/api/stripe/webhook/route.ts` for what writes "FREE" — typically a canceled subscription). They've been read-only since their trial ended.

**Recommendation:** they auto-inherit the new FREE behavior on the day v1.1 ships. **No backfill job needed** — this is purely a code-path change. The `subscriptionStatus` value stays "FREE"; the new `entitlementsFor()` rule simply yields different `can*` flags for that input. Their existing entries (with full extraction from when they were trialing) remain visible. New recordings post-deploy go through the FREE pipeline (transcribe + summary, no extraction).

This is a strict expansion of access — the user gains `canRecord` they didn't have yesterday — so there's no consent surface to manage and no risk of regression.

### 6.2 Trial users whose trial ends after v1.1 ships

Their trial ends → `subscriptionStatus` flips to FREE (existing behavior — see the trial-end cron / orchestrator at `apps/web/src/inngest/functions/trial-email-orchestrator.ts`). Under the new rule, FREE = the new shape. They keep `canRecord`. Their pre-trial-end extracted entries remain rich; their post-trial-end entries are summary-only. Same as §6.1, no backfill.

### 6.3 In-flight entries at the moment of v1.1 deploy

A QUEUED or PROCESSING entry from a FREE user, in-flight at deploy time, may have started before the new branching code shipped. Two cases:

- **Entry queued, function not yet picked it up:** the Inngest function picks the new branching code, runs FREE path. Correct.
- **Entry mid-extract:** the function has already passed step 2 and is inside `extract` (`process-entry.ts:172`). The Inngest function instance retains the old code until the run completes. The entry gets full extraction. Correct (and rare).

**No action required.** Inngest's at-least-once delivery + the Entry.status state machine are enough.

### 6.4 Communications

Trial-email-orchestrator (`apps/web/src/inngest/functions/trial-email-orchestrator.ts`) and the post-trial drip (`apps/web/src/lib/drip-emails.ts`) currently frame post-trial as "your dashboard freezes — continue on web to keep generating." That copy in `apps/mobile/app/paywall.tsx:84-97` and `apps/mobile/components/onboarding/step-8-trial.tsx:52-58` becomes inaccurate. Out-of-scope for the design doc but flag it: those strings need a v1.1 copy update at the same release.

The new trial-end framing should be: "Your trial wrapped up. Acuity stays free for journaling — record any time. Pro turns those entries into themes, tasks, and goals." Specific copy for those surfaces is §7 + an open question for Jim (§9).

---

## 7. Conversion hypotheses

Today there is exactly one in-app conversion surface: `apps/mobile/app/paywall.tsx`, hit only when the API 402s. The redesign creates 4–5 new surfaces inside the app, each tied to a specific PRO behavior the user just tried to do or just looked at.

All CTAs below are Option C compliant per `docs/APPLE_IAP_DECISION.md:166-169`: no "Subscribe", no "Upgrade", no "$", no "/mo". The CTA copy is journey/feature framed; the action opens Safari to `getacuity.io/upgrade?src=<surface_id>`.

### 7.1 Today's Prompt → Pro pulse card (Home, mobile + web)

- **Where:** The card slot currently rendered by `apps/mobile/app/(tabs)/index.tsx`'s recommendation block (lines 228-236) on mobile, and `apps/web/src/app/home/_sections/todays-prompt.tsx` on web.
- **What user sees on FREE:** A locked "Pro pulse" card. Eyebrow: "Pro". Title: "Today's prompts come from your journal." Body: "Free keeps the recordings going. Pro reads them back to you with the patterns it sees." CTA button: "Continue on web →"
- **CTA action:** Safari → `getacuity.io/upgrade?src=home_pulse`.
- **Hypothesis:** Highest-frequency surface (every dashboard load). Prompts are the most felt PRO benefit in normal use, so the locked-state framing maps directly onto "what the app could be doing for me right now."

### 7.2 Tasks empty state → Pro extraction CTA (mobile + web)

- **Where:** `tasks.tsx` empty state at line 779-808; web equivalent in `apps/web/src/app/tasks/task-list.tsx`.
- **What user sees on FREE:** Empty list. Subtitle replaces "Record a session and Acuity will extract them for you" (line 784) with "Acuity used to extract these from your recordings. Pro keeps that running." CTA: "Continue on web →"
- **CTA action:** Safari → `getacuity.io/upgrade?src=tasks_empty`.
- **Hypothesis:** Hits exactly the user who realized they expected tasks to appear. High intent, high context — they're holding the gap in their hand.

### 7.3 Goals suggestions → Pro detection CTA (mobile + web)

- **Where:** `apps/mobile/app/(tabs)/goals.tsx:565-571` (already wires `LockedFeatureCard` for `goalSuggestions`). Web equivalent in `apps/web/src/app/goals/goal-list.tsx` / `suggestions-modal.tsx`.
- **What user sees on FREE:** Locked card where the suggestions banner would live. Title: "Pro spots goals as you talk about them." Body: "When you mention something you're working toward, Acuity flags it as a candidate sub-goal. Free keeps the goals you set; Pro spots the ones you didn't know you set yet." CTA: "Continue on web →"
- **CTA action:** Safari → `getacuity.io/upgrade?src=goals_suggestions`.
- **Hypothesis:** Niche but high-converting: only fires for users actively managing goals. Already-built primitive (`LockedFeatureCard`) makes the cost trivial.

### 7.4 Life Matrix locked card (Insights tab + /life-matrix on web)

- **Where:** `apps/mobile/app/(tabs)/insights.tsx:237-242` (already has `LockedFeatureCard` for the `progression.unlocked.lifeMatrix` case); web `apps/web/src/app/home/_sections/life-matrix.tsx:28` (`unlocked` flag).
- **What user sees on FREE:** Locked card. Eyebrow: "Pro." Title: "Your six life areas." Body: "Pro reads your entries and scores Career, Health, Relationships, Finances, Personal, and Other from 1 to 10. Free keeps the journal; Pro keeps the read." CTA: "Continue on web →"
- **CTA action:** Safari → `getacuity.io/upgrade?src=life_matrix_lock`.
- **Hypothesis:** The Life Matrix is the "wow" feature for trial users (per the trial-step copy at `step-8-trial.tsx:67-69`). For FREE users who never saw it (post-v1.1 trial-end cohort), this is the first time they encounter the concept. For users who saw it during trial and lost it, this is the re-acquisition surface.

### 7.5 Entry detail "extracted: nothing" footer (mobile + web)

- **Where:** Below the transcript on `apps/mobile/app/entry/[id].tsx` and `apps/web/src/app/entries/[id]/`. Only shows for FREE-recorded entries (no themes, no extraction).
- **What user sees on FREE:** Below the one-sentence summary, a small inline footer. Copy: "Themes, tasks, and goal flags are a Pro thing." CTA link: "Continue on web →"
- **CTA action:** Safari → `getacuity.io/upgrade?src=entry_detail_lock`.
- **Hypothesis:** Subtle but persistent. Every FREE entry the user opens reminds them that there's a parallel-universe richer version. Don't make it loud or it reads as upgrade-spammy (§8 risk).

---

## 8. Apple Review (3.1.3(b)) risk check

### 8.1 The Multiplatform Services frame still holds

Per `docs/APPLE_IAP_DECISION.md:37-39`, Acuity is a Multiplatform Service: subscription sold on web, used across web + iOS. Apple permits the iOS app to sign in subscribers without offering IAP, provided the app does not push users toward an external purchase via in-app "buy" buttons.

**The redesign does not change this frame.** It adds locked feature cards and an "Continue on web" CTA pattern that already exists at `apps/mobile/app/paywall.tsx:128-130` and `apps/mobile/app/(tabs)/profile.tsx:135-144`. The new surfaces follow the same pattern: opens Safari, no in-app pricing, no "Subscribe" or "$" copy.

### 8.2 Comparison to precedent apps

| Precedent | Free shape | Paid shape | Acuity equivalent |
|---|---|---|---|
| Spotify | Free music + ads + skips capped | Paid offline, no ads, unlimited skips | Free recording + transcript / Paid extraction & insights |
| Netflix | Free trial then paid | Paid full catalog | Trial → Paid (legacy framing); v1.1 keeps history readable on free, which is a *softer* gating than Netflix |
| Kindle | Free reader + free book samples | Paid full books | Free recording + history / Paid extraction layer |

The shape holds. Acuity's free tier is closest to Kindle's: the *consumption surface* (recording, reading own entries) is free; the *value-added analysis* (extraction, themes, life matrix) is paid. Crucially: the app does not contain a feature-that-doesn't-work; it contains features that exist as paid surfaces with explanatory locked cards.

### 8.3 "Deliberately broken" risk audit

Apple has rejected apps for showing features that exist in the binary but don't function (the "deliberately crippled" pattern). I scanned each FREE surface in §3 + §4 against this lens:

- **Recording works.** Whisper transcribes; summary populates; entry persists. Not crippled.
- **Existing entries (pre-FREE recordings) render fully.** Not crippled.
- **Locked cards explicitly state "this is a Pro thing"** — they are not a feature failing to work. They're a labelled gate. Same shape as Spotify's "Listen offline (Premium)" toggle, which is allowed.
- **No error toasts on FREE feature taps.** A user on FREE who taps a locked card opens Safari — they don't get "Sorry, this didn't work." That's the line Apple cares about: graceful, signposted gates pass; broken-feature illusions fail.

### 8.4 The "frozen Life Matrix" specific concern

If Jim chose option (2) from §3.2 — show frozen-at-trial-end values + locked overlay — there's a real risk this reads as deliberately-broken. The data exists, the UI is rendering it, but a part of the UI is intentionally not refreshing it.

Two readings:

- **Defensible (pro):** "Read access to your historical Life Matrix scores, with Pro required to refresh." Maps to "Read free, write paid" — Spotify pattern. The user sees data they helped generate, accurate as of their last refresh; they can opt to pay to refresh it.
- **Risky (con):** From a reviewer's POV, an active-looking radar that doesn't update can read as "the app has the feature but is withholding it for upgrade pressure." Apple's reviewers don't always read code — they tap UI. A radar in the binary that visibly shows scores with a "refresh (Pro)" gate may read as a spec-broken feature, not as a clean read/write split.

**My call: the frozen-radar reading is too close to the line. Take option (3) — locked card, no historical scores rendered.** The locked card unambiguously says "this is a Pro feature" and removes the reviewer's ambiguity. The cost is a minor regression for ex-trial users who had the radar — but they had it for 14 days; the goodwill of seeing it again on a Pro upgrade is preserved. Don't squeeze that against an App Store rejection.

This is a real disagreement — Jim could reasonably argue (2). But (3) is more conservative and the difference in user value at the FREE-tier moment is small.

### 8.5 Specific surfaces to double-check before submission

- `tasks.tsx` empty-state CTA — confirm copy says "Continue on web", not "Upgrade".
- `goals.tsx` LockedFeatureCard copy — same check.
- Pro pulse card on home — confirm no $ symbol, no "/mo", no "Subscribe."
- The new banner at the top of `/home` web: same compliance check.

`docs/APPLE_IAP_DECISION.md:166-169` is the canonical phrase list. Audit every new surface against it before submission.

---

## 9. Open questions for Jim

1. **Summary model for the FREE branch — Claude Haiku or GPT-4o-mini?** Both clear $0.001 per call at our prompt size. Latency profile + provider-redundancy posture differ (Haiku keeps us on Anthropic infra alongside the rest of the extraction stack; mini diversifies). Pick one — affects the implementation slice, not the design.
2. **For mobile-only home: does the "Pro pulse" card replace the recommendation card outright, or live alongside it as a secondary "Pro insight"?** §7.1 assumes outright replacement on FREE. If you want the journal-prompt loop to keep producing prompts (low-LLM-cost ones from a static library) for FREE, that's a different design choice and changes the cost picture by ~$0.002 per dashboard load. Resolve before implementation.
3. **Is the trial-end-after-v1.1 cohort a marketing surface?** Right now they get a `paywall.tsx` modal. With the redesign, they don't even hit a paywall — they just transition to FREE. Do you want a one-time "your trial wrapped up — you're now on FREE; here's what changed" email/notification fire, or is the silent transition fine? §6.4 lays out the strings either way; the question is whether to send anything at all.
4. **Should we keep the streak / Apple Health / streak milestones on FREE?** The current plan keeps streak active on FREE (§2.2 — streak step still runs). But: streaks are a habit-loop reinforcement, and habit reinforcement is a premium-feeling thing in some products. Do we want streaks as a deliberate "Pro keeps your streak counted" gate (more conversion pressure, but reads more aggressive) or as a journaling-loop primitive that stays free (the recommendation in this doc)?
5. **Do we ship the §7.5 entry-detail footer at v1.1 launch, or hold it back to measure the impact of the four bigger surfaces alone?** Risk: too many CTAs at once dilute conversion attribution and start to read as upgrade-spammy in a single user session. Recommend holding the entry-detail footer to v1.1.1 unless cohort-level data is already aggregated on `src=` query params.

---

*Doc ends. Implementation slice belongs in a separate design — this is the architectural pivot, not the build plan.*
