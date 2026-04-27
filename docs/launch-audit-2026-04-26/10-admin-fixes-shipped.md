# 10 — Admin fixes shipped (Slice 1)

**Date:** 2026-04-27
**Status:** Slice 1 of 6. Pure code changes — no schema, no env, no destructive ops.

## What this slice fixes

Slice 1 is the safe surface layer of the broader Priority 1–5 plan. It ships the four "lying numbers" fixes that don't require new infrastructure: status-string drift, hardcoded prices, the misleading Ads chart label, and the misleading Funnel waitlist→account drop-off. The rest of P1 (real Stripe-driven MRR, period deltas via MetricSnapshot, waitlist email matching, Slack signup notifier, Health tab, mobile signup-source) lands in Slices 2–6 as scheduled.

### Important diagnostic correction

The 09-audit said Revenue / Overview / Funnel "render real data from production." That was wrong. The Stripe webhook writes `subscriptionStatus = "PRO"` (and `"FREE"` on cancel, `"PAST_DUE"` on failed payment, `"TRIAL"` for new signups). The metrics route was filtering on `"ACTIVE"` and `"CANCELED"` — strings the webhook never writes. So the entire admin metrics layer for paying-sub counts has been returning **zero** in production. The status-pill issue surfaced in the audit was the visible tip of a much bigger query-layer mismatch.

This slice fixes the queries. Numbers on Revenue, Overview, Funnel, and AI-Costs-relative-to-MRR will flip from "always zero" to actual values on the next deploy.

## Changes

### Code
- **New: `apps/web/src/lib/pricing.ts`** — single source of truth for admin price displays. Exports `MONTHLY_PRICE_CENTS = 1299`, `ANNUAL_PRICE_CENTS = 9900`, `ANNUAL_AS_MONTHLY_CENTS`, `formatDollars`, `formatDollarsRounded`, and a `SUBSCRIPTION_STATUS` enum mirroring exactly the four strings the Stripe webhook writes (`TRIAL | PRO | PAST_DUE | FREE`). Does not duplicate Stripe price IDs (those stay in env vars `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY`). Marketing copy is intentionally out of scope.
- **`apps/web/src/app/api/admin/metrics/route.ts`** — replaced every `subscriptionStatus: "ACTIVE"` with `SUBSCRIPTION_STATUS.PRO`, every `"CANCELED"` with `SUBSCRIPTION_STATUS.FREE`, every `"TRIAL"` / `"PAST_DUE"` literal with the constant. Replaced hardcoded `1299` cents in MRR calc with `MONTHLY_PRICE_CENTS`. Trial-to-paid denominator simplified to "all signups in range" (was filtering on a hardcoded status list that included the wrong strings).
- **`apps/web/src/app/admin/components/MetricCard.tsx`** — added optional `title` prop so we can attach hover tooltips to "awaiting data" tiles without changing layout.
- **`apps/web/src/app/admin/tabs/OverviewTab.tsx`** — MRR card now uses `formatDollarsRounded(payingSubs * MONTHLY_PRICE_CENTS)` (was hardcoded `× 999`, which is $9.99 — disagreed with the API's $12.99). Blended CAC tile gets `title="Awaiting ad attribution. Lights up after User.signupSource ships in Slice 3."`
- **`apps/web/src/app/admin/tabs/RevenueTab.tsx`** — paying-users table row now renders `formatDollars(MONTHLY_PRICE_CENTS)` instead of literal `"$12.99"`.
- **`apps/web/src/app/admin/tabs/AdsTab.tsx`** — chart title `"Customer Acquisition Cost (CAC) by Campaign"` → `"Spend by Campaign"`. Added a 1-line caption explaining true CAC needs Slice 3 attribution. The data was always raw spend; only the label was lying.
- **`apps/web/src/app/admin/tabs/FunnelTab.tsx`** — added an amber callout above the funnel explaining that the Waitlist row and the Account Created row are independent populations (not joined by email), so the drop-off percent between those two rows is not meaningful until Slice 3 ships. Steps from Account Created downward join correctly.

### Churn query — bonus fix
The Revenue tab churn-in-period query was filtering `subscriptionStatus = "CANCELED"` — a string nothing writes, so churn always rendered zero. Now filters `subscriptionStatus = FREE` AND `stripeCustomerId IS NOT NULL`. The customer-ID filter is what distinguishes real churn (was paying, now isn't) from trial-expired-without-converting (also FREE but never paid). Without that filter, churn would balloon to include every expired free trial.

### Schema
None.

### Env
None.

## Priority 5 — per-user drilldown audit (no code change)

Read `apps/web/src/app/api/admin/users/[id]/route.ts` and the modal in `UsersTab.tsx`. The exclusion side of the spec is **already correct by design**:
- Header comment: "NEVER returns entry content, transcripts, goals, tasks, AI observations, or audio URLs."
- Select clause is explicit: only metadata + counts + timestamps + plan.
- Latest-entry query is restricted to `createdAt` only.

**No "View entry content" gate exists, and per spec the default is denied — which is what the code does today.** No change needed.

The inclusion side has small operational gaps that are *not bugs*, just nice-to-haves. Tracked here for a future slice (most need a `select` widening, not new tables):
- `User.name` is not surfaced (modal shows email only).
- Sign-in method (Google / Apple / email) is not derivable from the User row alone — would need to inspect `Account.provider` from the NextAuth tables.
- Total recording time (sum of `Entry.duration`) is not computed.
- Onboarding answers (age range, gender, country, target cadence, "what brings you here") are stored on `User` but not selected.

These do not block launch and don't belong in this slice.

## Verification

- ✅ `npx tsc --noEmit` from `apps/web/` — only pre-existing error (`landing.tsx:1311`, unrelated `prefix` property issue), zero errors in slice-1 files.
- ✅ `npm run build` — clean Next build, all routes compile.
- ⏳ **Production verification on Jimmy** after Vercel auto-deploy:
  1. `/admin?tab=overview`: MRR card shows non-zero (= paying-sub count × $12.99). Previous deploy showed `$0` because PRO query returned 0.
  2. `/admin?tab=revenue`: Paying Subs > 0 if any prod users are PRO. Past Due alerts and Recent Paying tables populate.
  3. `/admin?tab=funnel`: "Converted to Paid" row at the bottom shows non-zero. Amber banner visible above the funnel explaining the waitlist join issue.
  4. `/admin?tab=ads`: Chart titled "Spend by Campaign" with caption.
  5. Hover on Overview "Blended CAC" tile → tooltip "Awaiting ad attribution…"
  6. Spot-check one paying-user row in `/admin?tab=users` modal — Stripe customer link works, no entry content exposed.

## Open issues / next slices

- **Slice 2** — `MetricSnapshot` table + nightly Inngest snapshot fn + Overview `prevPayingSubs` wiring. Blocked on Jimmy running `npx prisma db push` from home network.
- **Slice 3** — real Stripe-driven MRR (sum active subs by price ID, not flat `× $12.99`); `User.signupSource / signupCampaign` columns + UTM capture on web; `Waitlist.userId` link + nightly matcher fn (unblocks Funnel waitlist→account join + Ads per-campaign CAC + Growth source mix).
- **Slice 4** — Slack + Resend signup notifier. Waiting on Jimmy to set `SLACK_SIGNUP_WEBHOOK_URL` + `SIGNUP_NOTIFICATION_EMAILS` env vars.
- **Slice 5** — Health tab. Need Jimmy to confirm the web Sentry project slug (org `heeler-digital`, mobile project `react-native`, web project TBD — likely `javascript-nextjs` or similar) + set `SENTRY_AUTH_TOKEN`.
- **Slice 6** — mobile signup-source capture + OTA.
- **Future micro-slice** — widen the user-detail modal to include name, sign-in method, total recording time, onboarding answers (P5 inclusion-side gaps).

## Notes

- The "ACTIVE" string was almost certainly a leftover from an earlier subscription model. Worth grepping the rest of the codebase post-slice for any other place reading `subscriptionStatus` against `"ACTIVE"`. Slice 1 only touched the admin tree.
- The Overview tile previously showed `× 999` (i.e. $9.99/sub) while the API computed `× 1299` ($12.99/sub) — these disagreed on the same screen. Now both go through `MONTHLY_PRICE_CENTS`.
- "All signups in range" as the trial-conversion denominator is correct for our model (every signup starts a trial). If we ever ship a "skip trial / pay immediately" flow, revisit.
- Funnel D7 retention math is still using a 2-day window around D6–D8 (legacy). Real D7 cohort retention lands later, not this slice.
