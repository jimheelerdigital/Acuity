# Implementation Plan — Soft-Transition Paywall

**Decision logged:** 2026-04-17 in `PROGRESS.md` under *Decisions Made*.
**Status (2026-04-18, rev 3):** All pre-flight questions resolved. Plan is execution-ready. Inngest migration remains the hard prerequisite. No code changes in this task.
**Related audit:** `AUDIT.md` (2026-04-17).

**Changelog:**
- **rev 3 (2026-04-18)** — All five pre-flight questions resolved by Jim. Analytics = PostHog (with iOS privacy-questionnaire flag). Tests = Vitest confirmed. No backfill (no real users exist; test accounts only). Mobile keeps web redirect; `?src=mobile_profile` instrumented regardless. Degraded audit is full-template with no Claude call; hard-coded closing paragraph drafted inline in §7.3. Sequencing updated to drop the backfill step.
- **rev 2 (2026-04-17)** — Jim approved plan with modifications: all §5 recommendations accepted except §5.5 (overridden — interstitial, not disabled button); §4.1 prompt rewritten to include hand-crafted example as a few-shot inside the prompt; added §7 rollback, §8 analytics events, §9 entitlements test coverage, §10 deferred items; §5.8 sequencing updated to make Inngest a hard prerequisite; pricing uses `{{PRICE_PER_MONTH}}` template variable until resolved.

---

## 0. Up-front findings that reshape this plan

Two pieces of ground-truth shifted the shape of what I'm proposing; worth flagging before the plan itself.

### 0.1 The paywall effectively does not exist yet

`subscriptionStatus` is **written** by the Stripe webhook (`apps/web/src/app/api/stripe/webhook/route.ts:45, 61, 82, 92`) but **never read as a gate**. I grepped every `.ts`/`.tsx` in the monorepo and the only reads are:

- `apps/mobile/lib/auth.ts:11` — typed on the `User` interface
- `apps/mobile/app/(tabs)/profile.tsx:37` — displayed as a label on the profile screen

No API route, middleware, or server component checks `subscriptionStatus` or `trialEndsAt` before letting a user record, generate a weekly report, or view insights. So "soft transition, not cliff" is not about **changing** a hard cliff — it's about **building the gate soft the first time it exists**.

### 0.2 The Day 14 Life Audit is not built

There is no Life Audit generator in `apps/web/src/lib/`, no `/api/life-audit` route, and no `"life_audit"` entity in the schema. The phrase "Life Audit" appears only in marketing copy (`apps/web/src/lib/drip-emails.ts:370` — "Email 5 — Day 14: Doors opening soon") and blog posts. The Monthly Memoir referenced in spec §1.9 is also not built.

So the "Life Audit closing paragraph" that the decision says should transition into Month 2 is greenfield work. The plan treats it that way.

### 0.3 Trial-length conflict

Three numbers are in production right now that don't agree:

- `apps/web/src/app/api/stripe/checkout/route.ts:34` — `trial_period_days: 7`
- `apps/web/src/app/upgrade/page.tsx:65` — "14-day free trial. Cancel anytime."
- `prisma/schema.prisma:55` — `subscriptionStatus String @default("TRIAL")`; `trialEndsAt` (line 56) is never populated.

The decision says "the 14-day free trial model is unchanged," so Stripe's `trial_period_days` needs to move to 14, or the trial needs to be decoupled from Stripe (see §5 risks).

### 0.4 `trialEndsAt` is dead

The column exists but nothing writes to it. That's the cleanest place to put the trial clock (see §2).

---

## 1. Files that need to change

File paths are absolute to the repo root. Line numbers are at the time of writing.

### 1.1 New: Life Audit generator

**New files:**

- `apps/web/src/lib/prompts/life-audit.ts` — system prompt for the Day 14 Life Audit, Day 90 Quarterly Audit, and the shared prompt scaffolding. Follow the pattern in `apps/web/src/app/api/weekly/route.ts:105-120` (system-prompt string + structured JSON return).
- `apps/web/src/app/api/life-audit/route.ts` — `POST` generates, `GET` returns the latest for the user. Mirrors `/api/weekly/route.ts` in structure; differs in data window (full trial period, not just 7 days) and in output (includes a "closing letter" field that houses the Month 2 transition).
- `apps/web/src/app/insights/life-audit/[id]/page.tsx` — renders the audit. The closing letter is styled as body copy, not a modal or CTA block — the soft-transition belongs **inside** the letter, not around it.

**Schema (see §2):** new `LifeAudit` model.

### 1.2 `/upgrade` page — copy rewrite + framing

**File:** `apps/web/src/app/upgrade/page.tsx`

- Line 18: emoji + title — replace "Upgrade to {PLAN_PRO_NAME}" with journey-continuation framing (draft in §4.2).
- Line 22–24: subheadline — replace "Unlock the full power of your daily debriefs" with Month-2 framing.
- Lines 34–42: feature list — reframe each item from "unlocks X" to "continues X into month 2". See §4.2 for draft.
- Line 65: "14-day free trial. Cancel anytime." — if the user lands here *after* trial end, this line is wrong. Branch on `trialEndsAt` + `subscriptionStatus`: show "14-day free trial" only for users who haven't started a subscription; for post-trial users, show "Continue your journey. Cancel anytime."
- Line 43 (`upgrade-button.tsx`): button label "Start Free Trial" is wrong for post-trial users — change to "Continue the journey" when trial has ended.

### 1.3 Paywall gating — new helper + enforcement

Because there is no existing gate, we're adding one. Recommended approach:

**New file:** `apps/web/src/lib/entitlements.ts` — single source of truth. Exports:

```ts
export type Entitlement = {
  canRecord: boolean;               // gate on /api/record POST
  canGenerateNewWeeklyReport: boolean;   // gate on /api/weekly POST
  canGenerateNewLifeAudit: boolean;      // gate on /api/life-audit POST
  canGenerateMonthlyMemoir: boolean;
  canRefreshLifeMap: boolean;        // gate on /api/lifemap/refresh
  canViewHistory: true;              // always true — soft transition
  isTrialing: boolean;
  trialDaysRemaining: number | null;
  isPostTrialFree: boolean;          // the "soft-locked" state
  isActive: boolean;
  isPastDue: boolean;
};

export function entitlementsFor(user: User): Entitlement;
```

The rule is the decision: *view history always; generate new forward-looking output only while trialing or subscribed.* Exact if/else is in §3.

**Call sites that must check entitlements (none of these exist today):**

- `apps/web/src/app/api/record/route.ts` — top of the `POST` handler, right after the auth check (currently line 26-30). If `!canRecord`, return `402 Payment Required` with a JSON body the mobile + web clients can pattern-match to show the continue-your-journey screen.
- `apps/web/src/app/api/weekly/route.ts` — `POST` handler, right after auth (currently line 28-31). If `!canGenerateNewWeeklyReport`, return 402. `GET` remains open.
- `apps/web/src/app/api/life-audit/route.ts` (new) — same pattern.
- `apps/web/src/app/api/lifemap/refresh/route.ts` — gate the refresh; reading the existing life map stays open.

`/api/entries`, `/api/entries/[id]`, `/api/tasks` (GET/PATCH on existing tasks), `/api/goals` (GET/PATCH on existing goals), `/api/lifemap` (GET) **do not gate** — that's the point of the soft transition. Users keep access to everything they already created.

### 1.4 Middleware — do NOT gate here

**File:** `apps/web/src/middleware.ts`

The instinct is to gate at middleware, but that would kick post-trial users off `/dashboard`, which is the opposite of the decision. Middleware stays as-is (auth only). All paywall checks live at write-endpoint boundaries.

### 1.5 Stripe checkout — remove `trial_period_days`

**File:** `apps/web/src/app/api/stripe/checkout/route.ts:34`

**Decision (2026-04-17):** Remove the `subscription_data.trial_period_days` block entirely. Acuity's `trialEndsAt` on the User model is the canonical trial clock. Stripe subscription starts paid immediately when the user subscribes — whether they're mid-trial in Acuity or post-trial. The in-app experience owns "is this user still in their free window?"; Stripe owns "is this user a paying customer?"

Consequence: a user who subscribes on day 3 of their Acuity trial will be charged on day 3 (not day 17). They keep the rest of their trial-era UI state but the subscription begins now. Fine — subscribing is an explicit act of commitment; the trial's purpose is to earn that commitment, not to extend it.

### 1.6 `createUser` event — set `trialEndsAt`

**File:** `apps/web/src/lib/auth.ts:93-108`

In the `createUser` event, set `trialEndsAt = now() + 14 days` and leave `subscriptionStatus` at its schema default of `"TRIAL"`. Without this, every new user has a null `trialEndsAt` and the entitlement helper can't distinguish "trialing" from "post-trial free."

### 1.7 Stripe webhook — status nuance

**File:** `apps/web/src/app/api/stripe/webhook/route.ts`

Current webhook writes `"PRO" | "PAST_DUE" | "FREE"` and the schema default is `"TRIAL"`. That's four states. For the soft-transition rule to work we need one more distinction: **user who never subscribed and trial expired** vs **user who subscribed and canceled**. They're both `"FREE"` today but should be treated the same for entitlements, so we can keep it simple:

- `"TRIAL"` — schema default, `trialEndsAt` in the future
- `"PRO"` — active paying subscriber (includes Stripe's trial period)
- `"PAST_DUE"` — payment failed, in grace
- `"FREE"` — canceled, expired, or trial-ended-no-sub

The entitlement function derives the "post-trial free" state from `subscriptionStatus === "FREE" || (subscriptionStatus === "TRIAL" && trialEndsAt < now())`. That single derived flag drives all gating.

Optional later: add a `customer.subscription.updated` handler (flagged in `AUDIT.md` §3.6) — not required for soft transition but worth the same PR.

### 1.8 Cliff-style CTAs to soften

Searched for existing upgrade CTAs/nudges in the app. Because the paywall doesn't exist, there aren't many. What's there:

- `apps/web/src/app/upgrade/upgrade-button.tsx:43` — "Start Free Trial" copy needs post-trial variant ("Continue the journey").
- `apps/mobile/app/(tabs)/profile.tsx` (around line 100–112 per `AUDIT.md` §2) — the mobile "Upgrade to Pro" button that opens the web upgrade URL. Same copy change. **Add `?src=mobile_profile` to the URL** — this instruments cross-surface conversion regardless of IAP status; the metric is meaningful today (mobile → web checkout) and carries over once IAP lands (mobile → native sheet). Logged in §10.3.
- `apps/web/src/app/dashboard/page.tsx` — no cliff today, but **do not add an "Upgrade" banner** when trial ends. The entire point of soft transition is that post-trial users still see their dashboard; the prompt lives inside the Life Audit letter, not as a banner.

### 1.9 Drip emails — Day 14 email re-anchor

**File:** `apps/web/src/lib/drip-emails.ts:370` — "Email 5 — Day 14: Doors opening soon."

This is currently waitlist-focused ("doors opening soon"), not a post-trial email. We'll need a **separate** in-app email campaign keyed off `trialEndsAt`, not off waitlist signup date. Copy draft in §4.3.

---

## 2. Data model changes

### 2.1 `User` — no new columns required

The existing columns are enough:

- `subscriptionStatus` (String, default `"TRIAL"`) — already there.
- `trialEndsAt` (DateTime?) — already there, currently never written. Write it in `createUser` (see §1.6).
- `stripeSubscriptionId`, `stripeCurrentPeriodEnd`, `stripeCustomerId` — already there, already populated by webhook.

No column is needed to tag "trial-era" vs "post-trial" entries/reports. The soft transition says trial-era artifacts stay fully accessible regardless of current subscription state; **we never need to ask "was this generated during trial?"** Every row is always viewable. We only gate *creation* of new rows.

### 2.2 New: `LifeAudit` model

Proposed Prisma addition:

```prisma
model LifeAudit {
  id             String   @id @default(cuid())
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  kind           String   // "TRIAL_DAY_14" | "QUARTERLY_90" | "ANNUAL_365"
  periodStart    DateTime
  periodEnd      DateTime
  entryCount     Int
  narrative      String   @db.Text  // the full letter, with embedded Month-2 transition
  closingLetter  String   @db.Text  // the transition paragraph, duplicated here for easy re-render
  themesArc      Json     // { starting: [...], emerging: [...], fading: [...] }
  lifeAreaDeltas Json     // per-area score change across the period
  moodArc        String
  status         String   @default("GENERATING")  // GENERATING | COMPLETE | FAILED
  createdAt      DateTime @default(now())

  @@index([userId, createdAt])
  @@index([userId, kind])
}
```

And add the reverse relation on `User`:

```prisma
lifeAudits LifeAudit[]
```

Mind the existing `AUDIT.md §3.5` findings — new models should include `onDelete: Cascade` and indexes from day one.

### 2.3 New: `MonthlyMemoir` model (Day 30 / 60 / 180 / 365)

Because the proposed journey roadmap has four memoir-style artifacts (Day 30, 60, 180, 365) and one audit (Day 90), either:

- **Option A**: one `Memoir` model with a `kind` discriminator (`"MONTHLY" | "BIMONTHLY" | "HALF_YEAR" | "ANNUAL"`). Recommended — they all share the same shape: a period, a narrative, a set of deltas, a comparison block.
- **Option B**: four separate models. Overkill.

Proposed:

```prisma
model Memoir {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  kind          String   // "MONTHLY" | "FIRST_TWO_MONTHS" | "HALF_YEAR" | "ANNUAL"
  periodStart   DateTime
  periodEnd     DateTime
  entryCount    Int
  narrative     String   @db.Text
  comparisonBlock Json?  // used by FIRST_TWO_MONTHS: { day1Themes, day60Themes, day1Goals, day60Goals, languageDrift }
  status        String   @default("GENERATING")
  createdAt     DateTime @default(now())

  @@index([userId, createdAt])
  @@index([userId, kind])
}
```

These four are **not in scope for the soft-transition PR** — they're the proposed roadmap. Include them in the plan so the `LifeAudit` model doesn't get over-specialized and then fragmented later.

### 2.4 Push steps

This is additive: new models only. No rename, no backfill, no drop. Safe to `prisma db push`.

`AUDIT.md` already flags the need to move off `db push` to `prisma migrate dev` — that shift is a separate decision but should happen **before** this PR if possible. If not, `db push` is safe for this change.

---

## 3. The exact paywall rule

Derived from the decision. Write it once in `entitlementsFor(user)` and check it everywhere.

Let `postTrialFree = subscriptionStatus === "FREE" || (subscriptionStatus === "TRIAL" && trialEndsAt != null && trialEndsAt < now())`.

```
IF user.subscriptionStatus === "PRO":
  // active subscriber, including Stripe's own trial period
  → full access to everything
  → no trial countdown shown
  → upgrade page not shown

ELSE IF user.subscriptionStatus === "TRIAL" AND (trialEndsAt === null OR trialEndsAt > now()):
  // in active Acuity trial
  → full access to everything (record, weekly, life-audit, lifemap refresh, history, memoirs)
  → trial countdown visible in UI ("Day X of 14")
  → upgrade page shown with "Start Free Trial"-style copy only if no prior Stripe subscription

ELSE IF postTrialFree AND !PAST_DUE:
  // trial-ended-no-sub, or canceled subscriber
  → GET-only access to ALL historical data: entries, tasks, goals, insights, weekly reports, life audits, memoirs, life map
  → CANNOT generate: new recordings (/api/record POST), new weekly reports (/api/weekly POST),
    new life audits, new monthly memoirs, lifemap refresh
  → Day 14 Life Audit is generated the one final time when trial expires (cron job — §5.1) — users
    arrive at post-trial state already holding the audit letter
  → upgrade page shown with "Continue the journey" copy
  → existing tasks and goals can still be completed/updated (PATCH) — they're user-created artifacts,
    not AI-generated forward-looking output
  → UI shows a gentle "Your trial ended. Continue the journey →" chip in the nav, not a full-bleed cliff modal

ELSE IF user.subscriptionStatus === "PAST_DUE":
  // payment failed, in Stripe's grace window
  → full access to everything (same as PRO) — don't punish users for a card decline that may auto-recover
  → UI shows a persistent "Update payment method" banner linking to Stripe billing portal
  → AFTER Stripe moves them to canceled (customer.subscription.deleted), they drop to FREE
    and the soft-lock rule above applies
  → Stripe's retry window is ~3 weeks; during that window everything keeps working
```

**What "view history" means, concretely:** every `GET` API route, every insights page, every dashboard card, every entry/task/goal list. Tasks and goals are PATCH-able because they're manual edits, not AI generations.

**What "generate new output" means, concretely:** anything that spends a Whisper or Claude token for this user.

**Edge cases the rule covers:**

- Brand-new user, no `trialEndsAt` set: treated as trialing. Fixes via §1.6 so this is a narrow window.
- User who subscribes mid-trial: webhook writes `PRO`, the `trialEndsAt` column becomes informational.
- User who subscribes, cancels, subscribes again: each transition goes through the webhook; we always trust `subscriptionStatus`.
- User whose card fails then recovers: `PAST_DUE` → back to `PRO` via `invoice.payment_succeeded`. No access change either way.

---

## 4. Concrete copy drafts

### 4.1 Life Audit closing paragraph — transition into Month 2

The closing paragraph lives inside the generated letter. The model writes the preceding narrative about the user's 14 days; this closing is a templated coda that the prompt explicitly asks for.

**Prompt fragment to append to the Life Audit system prompt (few-shot, not just instructed):**

Describing "great" to the model is weaker than showing it. Below is the exact block to paste at the end of the Life Audit system prompt. The `<example>` block is a few-shot that the model should treat as a stylistic target, not data to copy — pattern, voice, length, and cadence come from the example; content comes from the user's entries.

```
Every Life Audit ends with a section titled "What comes next." This closing has four jobs,
in this order:

  1. Name the single pattern that most defines the user's 14 days, in one sentence.
  2. Observe that this pattern is only legible because they have been honest for two
     weeks, and that the next month is where it either deepens or quietly breaks.
  3. Preview Month 2 concretely — their first Monthly Memoir on day 30, weekly reports
     that sharpen because they have something to compare against, and a 60-day
     retrospective that puts Day 1 and Day 60 side by side.
  4. Close with an invitation framed as a continuation, not a gate. End with the literal
     phrase "Continue it →" on its own line.

Style rules (inviolate):
  - Do not use the words "subscribe", "upgrade", "paywall", "plan", or "$".
  - Do not use bullet points anywhere in this section.
  - Do not use exclamation marks.
  - Do not describe features. Describe what the user would experience.
  - Do not use second-person imperatives ("Keep going!", "Don't stop now"). The tone
     is a thoughtful friend reflecting, not a coach pushing.

Use the example below as a pattern for voice, cadence, and length. Do NOT reuse its
specific content (the blocker-naming observation is from a different user). Write the
closing from THIS user's actual entries.

<example user_pattern="The days they name the blocker out loud are the days they move">
**What comes next**

The thing that kept surfacing across your 14 days is that the days you name the
blocker out loud are the days you move. That's only visible because you sat with
this every night for two weeks — and it's the sort of pattern that either deepens
or quietly breaks in the next thirty days.

If you keep going, Month 2 is where the model starts to know your rhythm. Day 30
is your first Monthly Memoir — the long-form version of what you just read. Weekly
reports get sharper because they have something to compare against. Day 60 is a
retrospective: Day 1 beside Day 60, your themes then and now, the words you've
started using that you didn't two months ago.

This was the beginning of the record.

Continue it →
</example>
```

**Why few-shot, not just instructed:** instructions alone produce closings that drift into coach voice (imperatives, exclamations, feature lists) even with explicit prohibitions. The example anchors voice in ~350 tokens and costs roughly nothing at inference time given the length of the rest of the audit. If outputs still drift, add a second `<example>` with a different pattern to widen the style cone.

**Rendering:** "Continue it →" is rendered as body copy that soft-links to `/upgrade?src=life_audit_body`, not a button. The `src` query parameter drives the `upgrade_page_viewed` analytics event (see §8).

**CTA instrumentation and A/B trigger:** body-copy CTA ships for MVP. We instrument the click-through rate as `upgrade_page_cta_clicked { ctaVariant: 'continue_it_body' }` (see §8). If click-through from the Life Audit view to `/upgrade` is **<15%** over a meaningful sample (at least 50 post-trial users with a viewed Life Audit), we A/B test a button variant of the same copy. The threshold is deliberately low — body-copy CTAs always underperform buttons on raw click rate; the bet is that the user who *does* click is more committed, and that the body-copy framing increases subscribe-conversion among clickers. We need both numbers (click-through and post-click conversion) before deciding.

### 4.2 `/upgrade` page — headline, subhead, feature list

All monetary values use the `{{PRICE_PER_MONTH}}` template variable. Jim resolves ($12.99 vs $19) before ship; see §10.

**Headline (trialing or first-time):**
> Continue the record.

**Headline (post-trial, canceled, etc.):**
> Pick the journal back up.

**Subhead:**
> You've got 14 days in. Month 2 is where the pattern either deepens or breaks.

**Price line:**
> `{{PRICE_PER_MONTH}}` / month

**Feature list — rewritten as journey continuation, not unlocks:**

- Your first **Monthly Memoir** on day 30 — the long-form cousin of the Life Audit you just read.
- **Weekly reports** that sharpen as the model learns your rhythm, not resets every week.
- The **60-day retrospective** — Day 1 beside Day 60, your themes then and now.
- **Goal tracking** that keeps running across months instead of starting over.
- The **Life Map** continues to evolve — week-over-week and month-over-month deltas.
- Future **Quarterly Life Audits** at day 90, 180, and the annual memoir at day 365.

**Primary button:**
- Trialing or first-time: *Start Free Trial* (unchanged)
- Post-trial: *Continue the journey* → links to the same Stripe checkout.

**Fine print:**
- First-time: *14-day free trial. Cancel anytime.*
- Post-trial: *Your 14 days and everything you wrote stays yours. Cancel anytime.*

### 4.3 "Trial ended, continue your journey" email

Sent on `trialEndsAt` day, after (or with) the Day 14 Life Audit. Drop-in draft for `apps/web/src/lib/drip-emails.ts` or a new `lib/post-trial-emails.ts`:

**Subject:** Your 14 days — and what comes next

**Preheader:** The record is yours either way.

**Body:**

> You've got 14 days of the record. That's enough data for the model to see the first real pattern — and your Day 14 Life Audit is waiting for you in the app.
>
> Here's the part worth reading twice: the first two weeks are the hardest. If the pattern the audit names is going to deepen (or break) in a useful way, it happens in Month 2. That's where the Monthly Memoir, the 60-day retrospective, and the first real week-over-week comparisons live.
>
> Everything you wrote during the trial is yours. It will stay in your account whether you continue or not.
>
> When you're ready: **Continue the journey →** [link to /upgrade]

No urgency, no "offer expires in 24 hours," no scarcity copy. The soft transition dies the moment the email sounds like a cart-abandonment flow.

---

## 5. Resolutions and spec conflicts

Most of what was "open questions" in rev 1 is now decided. Sub-sections marked **RESOLVED (2026-04-17)** record Jim's decision and brief rationale; sub-sections marked **OVERRIDE** record a decision that changed from my prior recommendation.

### 5.1 Day 14 Life Audit generation — RESOLVED (2026-04-17)

**Decision:** Daily cron fires at ~22:00 user-local, one day before `trialEndsAt`, and generates the audit for every user whose trial expires in the next ~24h and who does not already have a `LifeAudit { kind: 'TRIAL_DAY_14', status: 'COMPLETE' }`.

**Hard prerequisite:** Inngest migration must be complete before this cron can ship reliably. Synchronous Vercel functions with the current `maxDuration = 120` ceiling cannot run a batch audit-generation job for the whole expiring cohort. See updated §5.8 sequencing.

**Failure path:** see new §7 (rollback plan) — users never hit the paywall without having read their Life Audit.

### 5.2 Weekly reports for post-trial free users — RESOLVED (2026-04-17)

**Decision:** Strict rule. `canGenerateNewWeeklyReport = false` for post-trial free users. The Day 14 Life Audit is the final free forward-looking artifact; all subsequent forward-looking output is subscription-gated. The post-trial email in §4.3 names this explicitly so it doesn't feel like a bait-and-switch.

### 5.3 Trial length — RESOLVED (2026-04-17)

**Decision:** Remove `subscription_data.trial_period_days` from the Stripe checkout entirely. Acuity's `trialEndsAt` column on the User model is the canonical trial clock. Stripe subscriptions start paid immediately on subscribe. See updated §1.5.

Follow-on: `/upgrade` page copy for first-time users keeps "14-day free trial" language because the Acuity trial is 14 days. Post-trial users see "Continue the journey. Cancel anytime." — no trial language, since there isn't one to offer.

### 5.4 Product Spec conflicts — deferred with template variable

Price ($12.99 vs $19/mo) remains unresolved per PROGRESS.md *Open Decisions*. All copy drafts in §4.2 use the `{{PRICE_PER_MONTH}}` template variable; the actual value is substituted before ship. Push notifications remain v2 per §10 — the post-trial email in §4.3 carries the Day 14 touchpoint for v1.

### 5.5 Life Matrix refresh — OVERRIDE (2026-04-17)

**Prior recommendation:** render "Last updated: N days ago" with a disabled refresh button.

**Overridden. New decision:** Keep the refresh button **visually enabled** (same styling as for trial/PRO users). On tap, post-trial free users see a full-screen "Month 2 lives here" interstitial explaining what subscribing unlocks and linking to `/upgrade?src=lifemap_interstitial`. The tap is the intent signal — convert on intent, not on passive guilt.

**Rationale (Jim):** a greyed-out button is a guilt prompt that sits in the UI forever. The user feels the loss every time they open the Life Map. A tap-to-interstitial pattern is the opposite — feel nothing until you actively reach for the thing; at that moment we meet the user with a clear, single-option CTA. That's the soft-transition pattern at the interaction level.

**Implementation notes:**
- Refresh button in the post-trial state is a plain button that triggers a client-side interstitial component, NOT a call to `/api/lifemap/refresh`. The backend endpoint still 402s on the rule in §3; the client should never hit it for post-trial users.
- Interstitial is full-screen (modal-style takeover), dismissible (X in the top-right + back-swipe on mobile), and has exactly two CTAs: "Continue the journey →" (primary, → `/upgrade`) and "Not now" (secondary, closes the interstitial).
- Fires `upgrade_page_viewed { source: 'lifemap_interstitial' }` on CTA click (not on interstitial open; we want intent signal, not exposure).

### 5.6 Tasks, goals, and the soft transition — RESOLVED (2026-04-17)

Rule is unchanged: PATCH stays open, no new tasks or goals are born without a new recording. **Added:** name this explicitly in the post-trial email (§4.3) — "Your tasks and goals keep working. You can mark what you've done and edit what matters. What won't happen without a subscription: new recordings, new weekly reports, new audits." Users should not be surprised by either direction of this rule.

### 5.7 "View history" ghost states — RESOLVED (2026-04-17)

**Decision:** Render ghost-state annotations on all time-series aggregates (mood trend, life map history, theme frequency) at the `trialEndsAt` boundary. The annotation reads: *"Trial ended — new entries resume with subscription."* No silent gaps. The chart continues past the boundary visually (muted styling) so the user sees the shape of what would have been tracked.

**Implementation note:** this is a render-time concern, not a data concern. The API responses are the same (no data post-trial); the client knows `trialEndsAt` and renders the annotation and muted tail.

### 5.8 Order of operations — UPDATED with Inngest prerequisite

**Inngest migration is a HARD PREREQUISITE** for step 3 and everything downstream. The Day 14 cron cannot ship reliably on the current sync pipeline (120s Vercel cap, no retries, no dead-letter queue). If the Inngest migration is not yet done when this plan begins, do that first. The Inngest migration is already on PROGRESS.md "Next Up" as step 6; this plan depends on it.

**Sequence:**

0. **PREREQUISITE — Inngest migration** (PROGRESS.md step 6): migrate `/api/record`, `/api/weekly`, and any Claude-calling endpoint to Inngest background jobs. Verify with staging load that a batch job for the expiring-trial cohort can run without timeouts. No steps below can begin until this is green.
1. Set `trialEndsAt` in `createUser` (§1.6) and remove `trial_period_days` from Stripe checkout (§1.5). No user-facing change. **No backfill needed** — decided 2026-04-18; there are no existing real users, only test accounts. Test accounts are manually updated or deleted and recreated post-deploy.
2. Add `LifeAudit` + `Memoir` models (+ `degraded` column, + `trialEndsAtExtendedBy` on User) via `prisma db push` (or migrate — `AUDIT.md` §2).
3. Wire PostHog SDKs (web + mobile + server) and fire `trial_started` from the `createUser` event. Analytics infrastructure must exist before any feature ships — the funnel is the feature's eval.
4. Build the Life Audit generator, route, and view page (§1.1). Initially rendered to trial users only. Still no gating. Fire `life_audit_generated` + `life_audit_viewed`.
5. Add `entitlementsFor()` helper (§1.3) + §9 Vitest unit tests. Tests must pass before enforcement lands.
6. Enforce entitlements at the 4 write endpoints. Ghost-state annotations on history views (§5.7). Life Map interstitial for post-trial users (§5.5).
7. Rewrite `/upgrade` copy (§1.2 + §4.2) with the two variants. Wire `upgrade_page_viewed` + `upgrade_page_cta_clicked` + `subscription_started` (on Stripe webhook).
8. Cron to pre-generate Day 14 audits (§5.1). Wire the §7 rollback path (defer + re-attempt + degraded template fallback with hard-coded closing) in the same PR — the cron is not shippable without it.
9. Post-trial email campaign (§1.9, §4.3).

Shipping in that order means soft transition is observable on staging step-by-step without shipping a half-gated product. Each step is a separate PR; steps 5 and 6 can be a single PR if §9 tests are in step 5. Backfill has been deliberately dropped — confirm on the first deploy that any pre-existing test accounts either get manually updated (`UPDATE "User" SET "trialEndsAt" = now() + interval '14 days' WHERE "trialEndsAt" IS NULL;`) or deleted.

---

## 7. Rollback plan — Day 14 Life Audit failures

The soft transition depends on the user reading their Life Audit *before* they hit the paywall. If the audit hasn't rendered, the soft transition degrades to a hard cliff — the exact failure mode this decision was made to prevent. Treat a missing audit as a blocker to paywall enforcement, not a footnote.

### 7.1 Trigger

At the moment enforcement would kick in (a write-endpoint receives a request from a user whose `trialEndsAt < now()`), check: does this user have a `LifeAudit { kind: 'TRIAL_DAY_14', status: 'COMPLETE' }` row?

- **Yes:** proceed with enforcement (the rule in §3).
- **No:** enter rollback mode.

This check belongs inside `entitlementsFor(user)` — if a user is "post-trial free" but doesn't have a completed audit, entitlements reports `isPostTrialFree: false, inAuditRollback: true` and the write endpoints treat them as trialing for the rollback window.

### 7.2 Rollback mode behavior

When a user is in rollback mode:

1. **Extend `trialEndsAt` by 48 hours.** This is a real write to the User row; the extension is not implicit. A `trialEndsAtExtendedBy` flag (or a side table — see §7.5) records that the extension happened and why, so later introspection can tell "this user got 14+2 days" from "this user got 16 days."
2. **Re-attempt audit generation every 6 hours during the 48h window.** Inngest schedules this; the job keys off `(userId, kind: 'TRIAL_DAY_14')` with exponential backoff on Claude errors.
3. **Treat the user as trialing for all entitlements.** They can record, generate reports, refresh Life Map — full access. No UI change on their end; from their perspective, nothing has gone wrong.
4. **Do not send the post-trial email (§4.3) until the audit is complete.** The email links to the audit; an email that points at an empty page is worse than no email.

### 7.3 After 48 hours

If the audit is still not `COMPLETE`:

1. **Generate a full-template fallback audit. No Claude call.** Pulls entirely from deterministic data already on the user's records — entry count, top themes from `Entry.themes` across the 14 days, mood average from `Entry.moodScore`, top Life Map deltas, goal-mention counts. Template-filled prose for the narrative sections; the **closing paragraph is hard-coded copy** (drafted below). Store it with `kind: 'TRIAL_DAY_14'`, `status: 'COMPLETE'`, and `degraded: true` so we can filter these out of quality metrics later. Users should never know they got the fallback — the voice and length should feel consistent with a Claude-generated audit.
2. **Enforce the paywall.** `trialEndsAt` is not extended again. The user gets the degraded audit and the soft-transition copy.
3. **Alert.** A degraded audit ship is a production signal — Claude availability or our prompt has a problem. Post to a Slack webhook / log an error to Sentry / whatever observability is in place. Daily dashboard of degraded audits generated.

**Rationale for full-template (no Claude in fallback):** the whole point of the rollback is to survive the scenario where Claude is down, rate-limited, or returning garbage. If the fallback still depends on Claude for the closing paragraph, we haven't actually mitigated the failure mode — we've just delayed it. A hard-coded closing is resilient to every failure mode above the database layer.

**Hard-coded degraded-audit closing paragraph (ship this copy verbatim):**

> **What comes next**
>
> Across your fourteen days, a few things kept coming up — you can see them in the themes above. That's the thing about two weeks of honest notes: patterns start to surface whether you're looking for them or not. The next month is where those patterns either deepen into something you can work with, or quietly break apart.
>
> If you keep going, Month 2 is where the record starts to compound. Day 30 is your first Monthly Memoir — a longer-form version of what you just read. Weekly reports get sharper because they have something to compare against. And on Day 60, there's a retrospective that puts your first day beside your sixtieth, side by side.
>
> This was the beginning of the record.
>
> Continue it →

**Voice notes for future sessions:** the degraded closing deliberately avoids naming a single specific pattern (because the template can't know which one) but gestures toward the themes list rendered above it. The sentence rhythm, length, and prohibitions (no exclamations, no "subscribe/upgrade/plan/$", no imperatives) match the few-shot closing in §4.1 so a user comparing two audits (if they ever did) wouldn't notice a voice discontinuity. The copy is intentionally drafted once, here, so it doesn't drift during implementation — use it verbatim.

### 7.4 The invariant

**A user never hits the paywall without having read their Life Audit.** The 48h window + degraded fallback is the plan to preserve this invariant even under cascading failures (Claude API down, Inngest queue stuck, schema drift). If the fallback itself fails, `entitlementsFor()` keeps the user in rollback mode indefinitely until a human intervenes — we'd rather serve a few extra free days than break the emotional arc.

### 7.5 Minor schema additions

To support this, add to the `LifeAudit` model:

```prisma
degraded Boolean @default(false)  // true for template-fallback audits
```

And to the User model:

```prisma
trialEndsAtExtendedBy Int?  // null for normal users, 48 for rollback extensions (hours)
```

Both additive, safe to `db push`.

---

## 8. Analytics events

### 8.1 Current state

Only client-side marketing analytics exist today:

- Google Analytics 4 — wired in `apps/web/src/app/layout.tsx` via `apps/web/src/components/google-analytics.tsx`.
- Meta Pixel — hardcoded ID in `apps/web/src/app/layout.tsx:90`, event firings via `apps/web/src/components/meta-pixel-events.tsx`, `fbq("track", ...)` calls in `waitlist/page.tsx`, `auth/signin/page.tsx`, `upgrade/upgrade-button.tsx`.
- Hotjar / Contentsquare — hardcoded script in `apps/web/src/app/layout.tsx:79`.

**No server-side events infrastructure.** No PostHog, Mixpanel, Segment, Amplitude, or in-house `AnalyticsEvent` table. `subscription_started` cannot fire from the Stripe webhook today because there is nowhere to send it.

### 8.2 Decision: PostHog (2026-04-18)

Covers both client and server with a single SDK. Rationale:

- Single SDK for web, mobile (React Native), and server (Node) — one event schema, one dashboard.
- Event-first model fits the funnel we're measuring (trial_started → life_audit_viewed → upgrade_page_viewed → subscription_started) better than GA4's session/pageview model.
- Cohort analysis and retention curves are first-class — we'll need these to judge whether the soft-transition is beating the cliff on month-2 retention.
- Reusable for general product analytics beyond this feature.
- Free tier (1M events/mo) covers the first several months; self-host if cost becomes a problem later.

**iOS App Store privacy questionnaire — flag for submission (§10.3 / App Store Connect listing):** PostHog collects identifiers (distinct_id, optional IP), usage data (event names, properties), and (if wired) session replay. When the iOS listing is prepared, the App Privacy section must declare:

- **Data Linked to You** → *Identifiers* (User ID), *Usage Data* (Product Interaction), *Diagnostics* (Crash Data, if PostHog exception autocapture is on)
- **Data Not Linked to You** → likely *Usage Data* depending on how we configure identification
- **Used for Tracking** → `false` for PostHog per their docs (we're not sharing across apps/websites for ad targeting), but this needs to be re-read at submission time because Apple's definition is tight.

Add PostHog to the eventual privacy-policy page (required by Apple before submission) and flag it in the `app.json` / App Store Connect privacy questionnaire during the TestFlight / App Store prep step. Logged in §10.4.

### 8.3 Required events (must ship with this plan)

These are non-optional. The paywall's soft-transition thesis is measurable only with this funnel. Missing any one of them makes the feature un-evaluatable.

| Event | Where it fires | Properties |
|---|---|---|
| `trial_started` | `createUser` event in `lib/auth.ts` (same place `trialEndsAt` is set) | `{ userId, trialEndsAt, signupSource }` |
| `life_audit_generated` | Life Audit generator, on `status → COMPLETE` transition | `{ userId, entryCount, generationTimeMs, status, kind, degraded }` |
| `life_audit_viewed` | Audit view page (`/insights/life-audit/[id]`), on mount + unmount for duration | `{ userId, auditId, timeOnPageSeconds }` |
| `upgrade_page_viewed` | `/upgrade` page, on mount | `{ userId, source: 'life_audit_body_link' \| 'email_cta' \| 'direct' \| 'paywall_redirect' \| 'lifemap_interstitial' }` |
| `upgrade_page_cta_clicked` | `/upgrade` primary button | `{ userId, ctaVariant: 'continue_it_body' \| 'continue_the_journey_button' \| 'start_free_trial_button' }` |
| `subscription_started` | Stripe webhook `checkout.session.completed` handler | `{ userId, source, daysSinceSignup, daysIntoTrial }` |

`source` on `upgrade_page_viewed` is carried via `?src=` query param on every link to `/upgrade`:

- Life Audit body copy: `/upgrade?src=life_audit_body_link`
- Post-trial email CTA: `/upgrade?src=email_cta`
- Mobile upgrade button: `/upgrade?src=mobile_profile`
- Life Map interstitial CTA: `/upgrade?src=lifemap_interstitial`
- Paywall 402 redirect: `/upgrade?src=paywall_redirect`
- No `?src=`: counted as `direct`

`source` on `subscription_started` is passed through from Stripe Checkout metadata — add `src` to `session.metadata` in `apps/web/src/app/api/stripe/checkout/route.ts` when creating the session.

### 8.4 Funnel this feeds

This is the retention thesis in five steps:

1. `trial_started` → `life_audit_generated` (how many trialists reach Day 14)
2. `life_audit_generated` → `life_audit_viewed` (do we actually deliver the audit to the user?)
3. `life_audit_viewed` → `upgrade_page_viewed` with `source: 'life_audit_body_link'` (does the soft CTA convert reader → considerer?)
4. `upgrade_page_viewed` → `upgrade_page_cta_clicked` (standard upgrade-page conversion)
5. `upgrade_page_cta_clicked` → `subscription_started` (checkout completion)

Each stage has a separate intervention if it underperforms. Without these events, we'd be flying blind on the whole decision.

---

## 9. Test coverage — `entitlements.ts`

`entitlementsFor()` is the single source of truth for every gate in this system. One bug here leaks free access, charges the wrong users, or locks out paying subscribers. It cannot ship without tests. Required before enforcement lands (§5.8 step 4).

### 9.1 Test framework — Vitest (confirmed 2026-04-18)

There is no test suite in the repo today (flagged in `AUDIT.md` §1 and PROGRESS.md). Setting one up is part of shipping this. Vitest confirmed — faster than Jest, native ESM, trivial to configure for Next.js 14 + TypeScript. Single `entitlements.test.ts` file at `apps/web/src/lib/entitlements.test.ts` is the scope for this PR; broader test infrastructure is follow-on.

### 9.2 Required test cases — the full matrix

Every branch of the §3 rule. Rows are `subscriptionStatus`, columns are `trialEndsAt` vs `now()`. The cell is the expected `Entitlement.isPostTrialFree` / `isTrialing` / `isActive` / `canRecord` assertion.

| subscriptionStatus | trialEndsAt | Expected |
|---|---|---|
| `"TRIAL"` | `null` | `isTrialing: true, canRecord: true` (edge case, see §3) |
| `"TRIAL"` | `now() + 7 days` | `isTrialing: true, canRecord: true, trialDaysRemaining: 7` |
| `"TRIAL"` | `now() - 1 hour` | `isPostTrialFree: true, canRecord: false` (trial just expired, no sub) |
| `"TRIAL"` | `now() - 10 days` | `isPostTrialFree: true, canRecord: false` (long-expired trial, no sub) |
| `"PRO"` | `null` | `isActive: true, canRecord: true, no countdown` |
| `"PRO"` | `now() + 3 days` | `isActive: true, canRecord: true` (trialEndsAt is informational after subscribe) |
| `"PRO"` | `now() - 30 days` | `isActive: true, canRecord: true` (trialEndsAt long past; subscription is what matters) |
| `"PAST_DUE"` | `null` | `isPastDue: true, canRecord: true` (grace) |
| `"PAST_DUE"` | `now() + 3 days` | `isPastDue: true, canRecord: true` |
| `"FREE"` | `null` | `isPostTrialFree: true, canRecord: false` (canceled mid-trial somehow) |
| `"FREE"` | `now() + 3 days` | `isPostTrialFree: true, canRecord: false` (canceled before trial ended — §3 treats all FREE as locked) |
| `"FREE"` | `now() - 30 days` | `isPostTrialFree: true, canRecord: false` (expired or canceled long ago) |

Plus rollback-mode tests (§7):

| Scenario | Expected |
|---|---|
| `subscriptionStatus: "TRIAL"`, `trialEndsAt: now() - 1h`, no `LifeAudit(COMPLETE)` | `inAuditRollback: true, canRecord: true` |
| `subscriptionStatus: "TRIAL"`, `trialEndsAt: now() - 1h`, `LifeAudit` exists but `status: "GENERATING"` | `inAuditRollback: true, canRecord: true` |
| `subscriptionStatus: "TRIAL"`, `trialEndsAt: now() - 1h`, `LifeAudit(COMPLETE)` exists | `isPostTrialFree: true, canRecord: false` |
| `subscriptionStatus: "TRIAL"`, `trialEndsAt: now() - 72h`, still no audit | `isPostTrialFree: true, canRecord: false` (48h rollback window exceeded — fallback audit should have been generated; if it wasn't, a human handles it) |

Plus per-entitlement checks — each boolean (`canRecord`, `canGenerateNewWeeklyReport`, `canGenerateNewLifeAudit`, `canGenerateMonthlyMemoir`, `canRefreshLifeMap`, `canViewHistory`) has a positive and negative assertion for each row above.

### 9.3 Property-based sanity check

A small property test: for any valid (status, trialEndsAt) pair, exactly one of `isTrialing`, `isActive`, `isPastDue`, `isPostTrialFree`, `inAuditRollback` should be true. These five states are the partition; the test prevents a bug where two become true simultaneously (e.g., a user who is both trialing and post-trial-free).

### 9.4 Integration test (stretch)

Not required for this PR but worth noting: once the 4 write endpoints are gated, a route-level integration test that hits `/api/record` POST with a post-trial-free user and asserts a 402 response with the expected JSON shape. Vitest + `next-test-api-route-handler` pattern. Defer to post-MVP unless it's trivial.

---

## 10. Deferred — locked in behind template variables

These are known variables that are not resolved yet but whose shape is known. Each has a placeholder in the plan; substitution happens at ship time.

### 10.1 Price

- `{{PRICE_PER_MONTH}}` appears in §4.2 (upgrade page price line) and anywhere the per-month price is mentioned.
- Jim resolves ($12.99 per Product Brief / Personas vs $19 per Product Spec / Onboarding Spec) before the `/upgrade` copy PR merges.
- The corresponding Stripe price ID (`STRIPE_PRO_PRICE_ID` env var) must match — changing the price means a new Stripe Price object and updating the env var across environments.

### 10.2 Push notifications

- Remain v2 per PROGRESS.md *Open Decisions*.
- The post-trial email in §4.3 carries the Day 14 touchpoint for v1. If push lands earlier than planned, a "Your Life Audit is ready" notification on day 14 morning is the natural addition — but the email is sufficient.
- Decision deferred until push is scoped; no placeholder needed in copy.

### 10.3 Apple IAP / RevenueCat

- Remains open per PROGRESS.md; blocks iOS App Store submission.
- Affects the **transport** of the paywall, not its **shape**. When IAP lands, the server-side `entitlementsFor()` is still the source of truth; the mobile client reconciles IAP receipts through a Stripe-parallel webhook path and writes the same `subscriptionStatus` values. This plan does not need to change for IAP to ship later.
- **For this PR (2026-04-18 decision):** mobile keeps the web redirect to `/upgrade` — the mobile "Upgrade to Pro" button in `apps/mobile/app/(tabs)/profile.tsx` opens `/upgrade?src=mobile_profile` in the system browser. The `?src=mobile_profile` instrumentation ships regardless of IAP status so we can measure cross-surface conversion once IAP lands. Do not gate on IAP being decided; ship this as-is.

### 10.4 PostHog iOS App Store privacy declarations

- Carry-over from §8.2. When the iOS TestFlight / App Store Connect listing is prepared (PROGRESS.md Next Up step 19), the App Privacy questionnaire must declare PostHog's data collection: *Identifiers*, *Usage Data*, *Diagnostics* (if exception autocapture is on). `Used for Tracking` is false per PostHog's docs — re-read Apple's definition at submission time.
- Privacy policy page (also required by Apple) must name PostHog as a sub-processor.
- Neither is a blocker for the paywall PR — these are App Store–submission-time concerns. Flagged here so they don't get lost.

---

## 11. Things this plan deliberately does not include

- RevenueCat / Apple IAP on mobile. That's still an open decision (PROGRESS.md §*Open Decisions*) and affects the **transport** of the paywall, not its **shape**. Once IAP is chosen, the mobile client calls the same `entitlementsFor` logic server-side — everything in §3 still applies.
- Grandfather / discount / win-back offers for expired users. Out of scope for the soft-transition PR; revisit after retention data exists.
- Onboarding flow. PROGRESS.md flags it as the biggest chunk of remaining work; it's upstream of this plan. If onboarding collects commitment signals ("journal every night for 14 days"), those signals should feed the Life Audit prompt — but that's a handoff, not a dependency.
- The Day 30 / 60 / 90 / 180 / 365 generators themselves. The proposed journey roadmap is logged in PROGRESS.md as a proposal. The `Memoir` model is pre-declared so we don't fragment later, but the generators are follow-on work.

---

*End of plan. See `PROGRESS.md` for the living task log.*
