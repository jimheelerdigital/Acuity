# Revenue Accuracy — Fix Plan

**Date:** 2026-06-28 · **Status:** Plan (no code) · **Owner:** Jimmy
**Source audit:** admin shows **$74.85**; lifetime net cash is **~$209.68** → admin reflects **~36% of reality**.

---

## Ground truth (from this audit + Stripe/Apple pulls)

| Source | Amount | Notes |
|---|---|---|
| Stripe **gross** lifetime | **$258.82** | |
| Stripe **net** (after refunds) | **$166.73** | → **$92.09 refunded = 35.6% refund rate** ⚠️ |
| Apple **net** proceeds (after commission) | **$42.95** | $34.47 "App" line (**unexplained — P0**) + $8.48 "Pro Monthly IAP" |
| Google Play | **$0.00** | |
| **TOTAL NET CASH (lifetime)** | **~$209.68** | |
| **Admin currently displays** | **$74.85** | mislabeled MRR run-rate (15 Stripe subs × $4.99) |

**Subscriber reality (DB, live mirror):** 15 Stripe PRO (13 monthly + 2 annual) + 3 Apple PRO (2 real: stefanie, thelma; 1 internal: jim@) + 2 PAST_DUE annual (paid-through-2027) + 2 FREE-but-in-paid-period. Admin counts **only the 15 Stripe**. The 3 null-source PRO (jim+applereview, jim+slice2pro, demo@example.com) are test/demo — correctly excluded.

**Pricing fact-check:** Acuity has **always been a free download** (`docs/APP_STORE_PRICING.md`: "Free — no paid download"); monetization went web-Stripe → native IAP. The $34.47 Apple "App" line is therefore **not** a former paid-app price.

---

## Root causes (priority-ordered)

| RC | Issue | Direction | Priority |
|---|---|---|---|
| **RC3** | "Total Revenue"/"Revenue This Month" are a **placeholder = current MRR**, not actual cash collected. No table stores real amounts. | ↓↓↓ (biggest) | **P0** |
| **RC6** | **No refund tracking.** 35.6% Stripe refund rate is invisible. | n/a (missing metric) | **P0** |
| **P0-INV** | **Apple "App" line $34.47 unexplained** — blocks any Apple revenue mirror (double-count risk). Investigation, not code. | — | **P0 (blocker)** |
| **RC1** | **Apple/Google IAP revenue invisible** — `stripeSubscriptionId IS NOT NULL` filter drops all IAP subs. | ↓↓ | **P1** |
| **RC2** | **PAST_DUE excluded** from MRR/paying even when paid-ahead. | ↓ | **P1** |
| **RC4** | **No annual normalization** — annuals valued at $4.99 not $3.33. | ↑ (minor over-count) | **P1** |
| **RC5** | **Daily snapshot cron dead** — filters status `"ACTIVE"` (never written) + hardcoded `999¢` → snapshot MRR always $0. | ↓ | **P2** |
| **RC7** | **Failed-payment recovery** (PAST_DUE dunning) — feature, not a metric. | n/a | **P2** |

---

## P0 work

### P0-INV — Explain the Apple "App" $34.47 line *(do first; blocks RC1/RC3 Apple mirror)*
- **Repo already rules out "was a paid app."** So investigate: (a) **report grouping / double-count** — is $34.47 a parent-SKU aggregate that *includes* the $8.48 IAP, or genuinely separate? (b) **product type** of that row in the ASC Sales/Proceeds report; (c) **tax/adjustment** artifact (Apple sometimes surfaces withheld territory tax as a proceeds line).
- **Checks (Jim/Keenan, ASC):** Pricing & Availability → Price Schedule (confirms never priced); Sales & Trends / Payments & Financial Reports → product-level breakdown for the $34.47.
- **Deliverable:** one sentence — "the $34.47 is `<X>`" — before any Apple number is mirrored.
- **Estimate:** investigation only (~30 min in ASC). **No code.**

### RC3 — Real "Total Revenue" with source breakdown
- **Goal:** replace the `mrrCents` placeholder with **actual collected cash**, displayed as: **Stripe gross · Stripe net · Apple net · Google net · Total combined (net)** — lifetime + this-month.
- **Source of truth — new `RevenueEvent` table (LOCKED, day one).** Single table for all revenue, all sources; unblocks time-series for the Executive Dashboard (on-read can't do history). Additive to the existing webhook pattern (`StripeEvent` already exists).
  - **Stripe webhook ingestion:** subscribe to `charge.succeeded`, `charge.refunded`, `charge.failed`, `invoice.paid`, `invoice.payment_failed` → write a `RevenueEvent` row per event (amount, fee/net, currency, source='stripe', type, stripeId, occurredAt, userId if resolvable).
  - **One-time backfill:** pull all historical Stripe charges via the API → populate `RevenueEvent` (so lifetime gross/net is real, not just go-forward).
  - **Apple/Google:** Tier 1 **manual monthly entry** writes into the **same** table (`source='apple'|'google_play'`, month-snapshot rows: grossCents/netCents/periodMonth).
- **Keep MRR separate** — MRR is a valid run-rate metric; just stop labeling it "Total Revenue." Active MRR is confidence-weighted (see RC2).
- **Schema/ops:** new `RevenueEvent` model → **`prisma db push` + RLS** (`RevenueEvent rls` in the allowlist + deny-all migration, the PR #15 pattern — business-sensitive amounts). If it carries `userId`, add the cascade FK per the cascade-gap convention.
- **Touches:** new `RevenueEvent` model + RLS migration; Stripe webhook handler; a backfill script; `metrics/route.ts` `getBusinessMetrics`/`getRevenue`; `RevenueSection.tsx`, `BusinessMetricsTab.tsx`; `lib/stripe.ts`.
- **Complexity: L.** **Estimate: ~1.5–2 days** (table + RLS + webhook ingestion + historical backfill + breakdown UI + manual-entry plumbing).

### RC6 — Refund tracking + refund-rate metric
- **Goal:** surface refunds (count, $, **refund rate %**) — 35.6% is a P0 business signal.
- **Source:** Stripe refunds (same on-read aggregate as RC3, `charge.refunded`/`refunds.list`), and capture `charge.refunded` webhook events going forward.
- **Display:** refund $ + rate on Revenue/Business tabs; feeds Stripe **net** in RC3.
- **Complexity: M.** **Estimate: ~0.5 day** (largely shares RC3's Stripe-read work; +1 metric + webhook event capture). *Strongly coupled to RC3 — build together.*

---

## P1 work (small mechanical fixes)

### RC1 — Apple/Google IAP visibility (Tier 1: manual) (LOCKED)
- Apple revenue is **$42.95 / 365d = ~$0.12/day** — **do not automate.** Tier 1 = manual monthly Apple/Google net proceeds typed into the `RevenueEvent` table (source='apple'/'google_play', month-snapshot).
- Separately, **count** IAP subscribers in paying/active counts (drop the `stripeSubscriptionId` requirement for the *count*; $ via manual entry). Makes "paying users" = 17, not 15.
- **Automation trigger (LOCKED):** revisit only when **Apple OR Google monthly proceeds exceed $200/mo, sustained for 2 consecutive months** (~3+ subs — worth automating; 2-month rule ignores one-time spikes). Same threshold for Google post-Android-launch.
- **Complexity: S.** **Estimate: ~2–3 hrs** (manual-entry UI into `RevenueEvent` + the count-query change).

### RC2 — PAST_DUE as a separate "At Risk" line (LOCKED)
- **Do NOT fold PAST_DUE into active MRR.** They're paid-ahead annuals (collected cash, but next-year renewal is uncertain) — counting them in MRR overstates renewal confidence.
- **Active MRR = confidence-weighted** (PRO only, annual-normalized — RC4), and **"At Risk: $X (Y users)"** is a separate callout (the 2 paid-through-2027 annuals) that makes the recovery action obvious. Surface both on the Revenue/Business tabs + the Executive Dashboard.
- **Complexity: S.** **Estimate: ~1 hr** (a second count/sum query + a callout component).

### RC4 — Annual normalization in headline MRR
- Port the **already-written** plan inference from `drilldown/route.ts:300-310` (`stripeCurrentPeriodEnd > 35d ⇒ annual ⇒ ANNUAL_AS_MONTHLY_CENTS 333`) into `getRevenue`/`getBusinessMetrics` headline MRR. Logic exists; just surface it.
- **Complexity: S.** **Estimate: ~1–2 hrs** (refactor the inference into a shared helper + use in 2 call sites).

---

## P2 work

### RC5 — Fix the dead daily snapshot cron
- `compute-daily-snapshot.ts:33` `"ACTIVE"` → `"PRO"`; `:62` `999` → `MONTHLY_PRICE_CENTS`. Trivial, but verify nothing downstream relied on the (always-zero) snapshot.
- **Complexity: S.** **Estimate: ~30 min.** *(Do alongside RC4 since both touch the MRR formula — keep them consistent or have the cron call the shared helper.)*

### RC7 — Failed-payment recovery (dunning)
- Out of scope for *accuracy*; it's a revenue-*recovery* feature (email the 2 PAST_DUE, retry, etc.). Track separately.
- **Complexity: M.** **Estimate: ~1 day.** Defer.

---

## Complexity ranking (smallest → largest)
1. RC5 — 30 min (P2)
2. RC2 — 1 hr (P1)
3. RC4 — 1–2 hrs (P1)
4. RC1 — 2–3 hrs (P1, on top of RC3's table)
5. RC6 — 0.5 day (P0, coupled to RC3)
6. RC7 — 1 day (P2, deferred)
7. RC3 — 1.5–2 days (P0, the anchor — RevenueEvent table + webhook + backfill)

**P0-INV (Apple $34.47):** ~30 min ASC investigation, **blocks** RC1/RC3 Apple numbers.

## Locked decisions (2026-06-28)

1. **RC3 Stripe source — `RevenueEvent` table from day one** (not on-read). Single source of truth for all revenue going forward; unblocks time-series revenue for the upcoming **Executive Dashboard** (on-read can't do history). Additive to the existing webhook pattern (`StripeEvent` already exists). Webhooks (`charge.succeeded`/`charge.refunded`/`charge.failed`/`invoice.paid`/`invoice.payment_failed`) → `RevenueEvent`; one-time API backfill of historical charges; Apple/Google Tier-1 manual rows in the same table. *(Trade-off accepted: a small upfront backfill cost vs. months of missing revenue history.)*
2. **RC2 — PAST_DUE shown as a separate "At Risk" line, NOT in active MRR.** Paid-ahead annuals = collected cash but uncertain renewal; active **MRR stays confidence-weighted**, **"At Risk: $X (Y users)"** is a distinct callout that makes the recovery action obvious.
3. **RC1 — revisit Apple/Google automation only when Apple OR Google monthly proceeds exceed $200/mo, sustained 2 consecutive months.** At ~$0.12/day, manual entry is ~5 min/month; the threshold (~3+ subs) is when automation pays for itself; the 2-month rule ignores one-time spikes. Same threshold for Google post-Android-launch.

## LOCKED FINAL SEQUENCE

1. **P0-INV — Investigate the Apple "App" $34.47 line.** *Jim's action* (ASC: Price Schedule + Sales/Proceeds product-type column). Blocks nothing technical → Step 2 proceeds in parallel.
2. **RC3 + RC6 together** — build `RevenueEvent` table + Stripe webhook ingestion + historical backfill + admin **"True Revenue"** (Stripe gross/net · Apple net · Google · total combined) + **"Refund Rate"** displays. **Hard prerequisite for any Executive Dashboard work.**
3. **Mechanical batch (one PR)** — RC1 (Apple manual entry into `RevenueEvent`) + RC2 (PAST_DUE "At Risk" separation) + RC4 (annual normalization) + RC5 (dead snapshot cron fix). Ships independently after Step 2, or alongside.
4. **RC7 (dunning / failed-payment recovery)** — later, with retention work.

**Sequence dependencies:**
- Step 1 is Jim's manual investigation; it gates the *interpretation* of Apple numbers but blocks no code → Step 2 starts in parallel.
- Step 2 must land **before** any Executive Dashboard work (it provides the time-series revenue source).
- Step 3 can ship independently after Step 2, or alongside it.

**Status: LOCKED, pending — (A) Jim's $34.47 findings, (B) Jim's sign-off after reading this doc. No code begins until both.**
