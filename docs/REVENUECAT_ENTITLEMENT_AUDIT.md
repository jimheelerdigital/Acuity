# Entitlement-decision audit — RevenueCat replacement target list

**Date:** 2026-08-15
**Branch:** `feat/revenuecat-migration`
**Purpose:** enumerate every place entitlement is **decided** (read) or **written** today, so the RevenueCat cutover has an explicit, finite replacement list. Nothing in this document has been changed by the audit itself.

Line refs are against the commit at the base of `feat/revenuecat-migration`. They will drift — treat the symbol names as authoritative, the line numbers as a hint.

---

## 0. The shape of the current system

Entitlement today is **one column with four values**, written by four independent providers and read by one pure function plus a long tail of ad-hoc comparisons.

```
User.subscriptionStatus  : "TRIAL" | "PRO" | "PAST_DUE" | "FREE"   (default "TRIAL")
User.subscriptionSource  : "stripe" | "apple" | "google_play" | "comp" | null
```

Declared: `prisma/schema.prisma:85` (status), `prisma/schema.prisma:128` (source).
Vocabulary constant: `apps/web/src/lib/pricing.ts:89` `SUBSCRIPTION_STATUS`.

The critical asymmetry to preserve through cutover:

> **`entitlementsFor` reads `subscriptionStatus` ONLY.** `subscriptionSource` never gates access — it only routes UI ("Manage subscription" → Stripe portal vs "open iOS Settings") and decides *who is allowed to write*. A `PRO` row grants full access whether the source is `apple`, `stripe`, or `comp`.

That is why `comp` works at all, and it is the invariant that makes an RC cutover a source swap rather than a rewrite.

---

## 1. DECISION sites (reads) — what computes "can this user do X"

### 1.1 The canonical decision function

| Location | Symbol | Notes |
|---|---|---|
| `apps/web/src/lib/entitlements.ts:192` | `entitlementsFor(user, now)` | **The** entitlement rule. Pure, no I/O. Inputs: `subscriptionStatus`, `trialEndsAt`, `stripeFirstFailureAt`. Returns the 8 `can*` booleans + `isTrialing` / `trialDaysRemaining` / `isPostTrialFree` / `isActive` / `isPastDue`. |
| `apps/web/src/lib/entitlements.ts:261` | `entitlementSet(overrides)` | Builds the full Entitlement from the active/post-trial-free partition. |

Branch behavior as of today (**note: no PAST_DUE grace**):
- `PRO` → `isActive: true`, full access (`entitlements.ts:210`)
- `PAST_DUE` → `isPostTrialFree: true` — FREE-tier access **immediately**, no grace (`entitlements.ts:220`, 2026-06-12 spec)
- `TRIAL` + (`trialEndsAt === null` OR in future) → `isTrialing`, full access (`entitlements.ts:230`)
- everything else (incl. expired TRIAL, `FREE`, `CANCELED`, unknown strings) → post-trial-free, fail-closed (`entitlements.ts:252`)

`canRecord` is true on **both** sides of the partition; only `canExtractEntries` and the generate/sync flags are PRO-gated (`entitlements.ts:277-287`).

> ⚠️ `apps/web/src/lib/paywall.test.ts` currently has **2 failing tests** asserting `PAST_DUE` still allows `canExtractEntries` / `canSyncCalendar` ("Stripe grace"). Those tests are stale relative to the 2026-06-12 no-grace change; the code is correct. Pre-existing on `main` — not introduced by this migration.

### 1.2 The two I/O wrappers every caller should use

| Location | Symbol | Used by |
|---|---|---|
| `apps/web/src/lib/entitlements-fetch.ts:17` | `getUserEntitlement(userId)` | SSR / server components |
| `apps/web/src/lib/paywall.ts:26` | `requireEntitlement(flag, userId)` | API routes; returns 402 `SUBSCRIPTION_REQUIRED` |

Both select the same 3 columns and call `entitlementsFor`. **These two functions are the entire read surface that matters for cutover** — point them at the RC-backed resolver and every gated route follows.

### 1.3 A SECOND, independent tier decision (does NOT go through `entitlementsFor`)

| Location | Symbol | Risk |
|---|---|---|
| `apps/web/src/lib/feature-flags.ts:140` | `tierMatches(subscriptionStatus, requiredTier)` | Reads `subscriptionStatus` **directly**. `requiredTier === "PRO"` → `status === "PRO"`. A `TRIAL` user therefore FAILS a `requiredTier: "PRO"` flag, even though `entitlementsFor` grants trials full access. |

This is a genuine pre-existing inconsistency, not an RC problem — but it is a second entitlement authority and must be swapped too, or flag-gated features will diverge from paywalled features after cutover. Called from `feature-flags.ts:173`.

### 1.4 Source-routing helpers (do not gate access)

- `apps/web/src/lib/entitlements.ts:123` `isAppleSubscription()`
- `apps/web/src/lib/entitlements.ts:129` `isStripeSubscription()`

### 1.5 Ad-hoc status comparisons (the long tail)

These read `subscriptionStatus` directly rather than calling the resolver. Mostly display/analytics, so they are lower-risk, but each is a place where a post-cutover value mismatch shows up as a UI bug. Full list:

**Display / UI**
- `apps/web/src/components/acuity/SubscriptionPill.tsx:109,123`
- `apps/web/src/app/account/account-client.tsx:699,748,884,889,901,923,938`
- `apps/web/src/app/account/_components/trial-status-card.tsx:71`
- `apps/web/src/app/home/_sections/trial-home-banner.tsx:42,53`
- `apps/web/src/app/admin/components/DrilldownModal.tsx:291,299,301,308`
- `apps/web/src/components/onboarding-funnel.tsx:418`
- `apps/web/src/app/api/user/me/route.ts:191`
- `apps/web/src/app/api/onboarding/resume/route.ts:56`

**Admin / analytics aggregation** (bulk `where subscriptionStatus` counts — safe, but will silently under/over-count if RC introduces new values)
- `apps/web/src/app/api/admin/users/route.ts:140-150,240`
- `apps/web/src/app/api/admin/metrics/route.ts` — many (221,231,239,249,550,555,558,570,586,594,817,1391,1418,1450)
- `apps/web/src/app/api/admin/drilldown/route.ts:203,237,270,411`
- `apps/web/src/app/api/admin/acquisition-data/route.ts:52,77,141`
- `apps/web/src/app/api/admin/recovery-preview/route.ts:84,182`

**Provider-internal decision logic** (stays with the provider; see §2)
- `apps/web/src/lib/apple-iap.ts:686,702,812,824`
- `apps/web/src/lib/google-iap.ts:228,239`
- `apps/web/src/app/api/stripe/webhook/route.ts:206,246`

---

## 2. WRITE sites — everything that mutates `subscriptionStatus` / `subscriptionSource`

This is the list RevenueCat's webhook replaces. Grouped by writer, with the guard each one carries.

### 2.1 Stripe (web) — `apps/web/src/app/api/stripe/webhook/route.ts`

| Line | Event | Writes | Guard |
|---|---|---|---|
| `93` | (helper `relinkAndGrantPro`) | `PRO` + `source=stripe` + backfills customer/sub id | `recoverableOr()` — not-FREE **or** in-dunning; resolves by subId → email(unlinked only) → metadata.userId |
| `211` | `customer.subscription.created/.updated` → active/trialing | `PRO` + `source=stripe` | `proRecoveryWhere(customerId)` (`:65`), falls back to `relinkAndGrantPro` |
| `255` | same → past_due/unpaid/canceled/incomplete_expired | `FREE` + `source=stripe` | `NOT_IAP_SOURCE_WHERE` |
| `490` | `checkout.session.completed` | `PRO` + `source=stripe` + customer/sub id | `where: { id: userId }` from `metadata.userId`; on failure deletes the `StripeEvent` dedup row and 500s to force redelivery (`:505`) |
| `642` | `invoice.payment_succeeded` | `PRO` + `source=stripe`, clears `stripeFirstFailureAt` | `proRecoveryWhere` + relink fallback |
| `757` | `invoice.payment_failed` (anchor) | `stripeFirstFailureAt = now` | `not FREE` + `firstFailureAt: null` + `NOT_IAP_SOURCE_WHERE` |
| `768` | `invoice.payment_failed` (downgrade) | `FREE` | `not FREE` + `NOT_IAP_SOURCE_WHERE` |
| `845` | `customer.subscription.deleted` (case at `:843`) | `FREE`, nulls sub id / period end / failure anchor | `NOT_IAP_SOURCE_WHERE` |

Two behaviors here are load-bearing and easy to lose in a rewrite:

1. **Anchor-before-downgrade ordering** (`:740` comment). Both statements filter `subscriptionStatus: { not: "FREE" }`. If the downgrade runs first it falsifies the anchor statement's own WHERE, so `stripeFirstFailureAt` is never written — which silently kills both the recovery banner and the entire failed-then-recovered path. Regression-covered in `route.ts.test`.
2. **Idempotency**: `StripeEvent.id` row created at the *start* of processing (`:442`); P2002 → 200 + skip.

⚠️ **Null-source overwrite**: the FREE branch at `:255` and the PRO branches write `subscriptionSource: "stripe"` unconditionally. `NOT_IAP_SOURCE_WHERE` protects apple/google/comp rows, but a `null`-source row gets stamped `"stripe"`. Intentional today (null ≈ legacy Stripe/web) — but the RC webhook must make the same choice deliberately, not accidentally.

### 2.2 Apple (iOS IAP)

| Location | Writes | Guard |
|---|---|---|
| `apps/web/src/app/api/iap/verify-receipt/route.ts:210` | `PRO` + `source=apple` + `appleOriginalTransactionId` / `appleProductId` / `appleEnvironment` / `appleLatestReceiptInfo`; clears `trialEndsAt` + `stripeCurrentPeriodEnd` | decision fn `decideReceiptVerify` (`apple-iap.ts:780`) — product allow-list, expiry, another-owner 409, active-Stripe 409, idempotent-noop |
| `apps/web/src/app/api/iap/notifications/route.ts:225` | `decision.nextStatus`; stamps/clears `appleFirstFailureAt` | decision fn `decideNotificationAction` (`apple-iap.ts:651`) — skips `source==="stripe"` rows; user looked up **by `appleOriginalTransactionId`**, not by userId |

Apple notification → status map (`apple-iap.ts:670-750`): `DID_RENEW`→PRO; `DID_FAIL_TO_RENEW`/`GRACE_PERIOD_EXPIRED`/`EXPIRED`/`REFUND`/`REVOKE`→FREE; `DID_CHANGE_RENEWAL_STATUS`/`CONSUMPTION_REQUEST`→log-only.
Product allow-list: `apple-iap.ts:49`.

### 2.3 Google Play

| Location | Writes | Guard |
|---|---|---|
| `apps/web/src/app/api/iap/google/webhook/route.ts:265` | `PRO`/`FREE` + token/productId/receipt; stamps `googleFirstFailureAt` on `ON_HOLD`, clears on PRO | requeries Google (never trusts the RTDN payload); resolves user by `googlePurchaseToken` **or** `linkedPurchaseToken` (`:227`); hard-skips rows where `subscriptionSource !== "google_play"` (`:247`); no-ops when already in target state (`:260`) |
| `apps/web/src/app/api/iap/verify-receipt/route.ts:386,396,434` | `PRO` + `source=google_play` | mirrors the Apple verify decision path |

Note `subscriptionSource` is **not** re-written by the Google webhook — it only ever touches rows already `google_play`.

### 2.4 Non-provider writers (crons, admin, signup)

| Location | Writes | Guard |
|---|---|---|
| `apps/web/src/inngest/functions/trial-expiration-cron.ts:77` | `FREE` + `trialExpiredAt` | `TRIAL` + `trialEndsAt < cutoff` + `trialExpiredAt: null` + `NOT_IAP_SOURCE_WHERE`; WHERE re-asserted on the write to survive a mid-cron webhook race |
| `apps/web/src/app/api/admin/comp/route.ts:50` | `PRO` + `source="comp"`; clears `trialEndsAt` + `stripeFirstFailureAt` | admin session or `CRON_SECRET`; writes `AdminAuditLog` |
| `apps/web/src/lib/entitlement-drift.ts:325` | reconciler: `PRO` or `FREE` | **dry-run by default.** Demotions carry `NOT_IAP_SOURCE_WHERE`; grants carry a source-match guard (`:321`); every applied write logs `AdminAuditLog` |
| `apps/web/src/app/api/admin/stripe-sync/route.ts:92` | `expectedStatus` + `source=stripe` | admin-only manual reconcile |
| `apps/web/src/app/api/admin/users/[id]/extend-trial/route.ts:53` | `TRIAL` (unless already PRO) | admin-only |
| `apps/web/src/lib/bootstrap-user.ts:123` | `TRIAL` at account creation | signup path |
| `apps/web/src/app/api/auth/signup/route.ts:144` | `TRIAL` | signup |
| `apps/web/src/app/api/auth/mobile-signup/route.ts:107` | `TRIAL` | signup |
| `apps/web/src/app/api/auth/mobile-magic-link/route.ts:78` | `TRIAL` | signup |
| `apps/web/src/app/api/auth/mobile-callback/route.ts:258` | `TRIAL` | OAuth signup |
| `apps/web/src/app/api/auth/mobile-callback-apple/route.ts:256` | `TRIAL` | Apple signup |

Seed/maintenance scripts also write status (not production paths): `scripts/seed-test-user.ts`, `scripts/seed-app-store-reviewer.ts`, `scripts/merge-duplicate-account.ts`, `apps/web/scripts/seed-*.ts`, `apps/web/scripts/backfill-stripe-state.ts`.

---

## 3. The cross-source demotion guard (must survive cutover verbatim)

Defined `apps/web/src/lib/entitlements.ts:139-182`:

```ts
IAP_SUBSCRIPTION_SOURCES = ["apple", "google_play"]
COMP_SUBSCRIPTION_SOURCE = "comp"
NON_DEMOTABLE_SOURCES    = [...IAP, comp]
NOT_IAP_SOURCE_WHERE     = { OR: [ {source: null}, {source: {notIn: NON_DEMOTABLE}} ] }
```

**The `null` branch is load-bearing.** SQL `NOT IN (…)` evaluates to NULL — i.e. excludes the row — for a NULL column. A bare `notIn` would therefore *protect* null-source rows from a legitimate downgrade. The explicit `{ source: null }` disjunct keeps null- and stripe-source rows demotable while skipping apple/google_play/comp.

Scope rule (from the same comment block): **cross-source demoters only.** The Apple ASSN and Google RTDN handlers demote their OWN source and guard by exact-source match — they must not use `NOT_IAP_SOURCE_WHERE`.

Consumers today: stripe webhook (`:253,733,757,768,~836`), trial-expiration-cron (`:63,82`), drift reconciler (`entitlement-drift.ts:323`).

Also excluded from the drift scan: `subscriptionSource === "comp"` (`entitlement-drift.ts:120`), `@heelerdigital.com` / `@example.com` emails, and `appleEnvironment === "sandbox"` — filtered **in code, not in the Prisma WHERE**, for the same SQL-NULL-in-negation reason (`:108-113`).

---

## 4. Replacement plan (what RC takes over, what stays)

| Layer | Today | After cutover |
|---|---|---|
| Decision fn | `entitlementsFor` | **unchanged** — still maps a status to `can*` flags |
| Status source | `User.subscriptionStatus` written by 4 providers | `User.subscriptionStatus` written by **RC webhook only** |
| Read wrappers | `getUserEntitlement`, `requireEntitlement` | route through `lib/entitlements/resolve.ts` (§5) — one-line source swap |
| Tier check | `feature-flags.ts:tierMatches` | must also route through the resolver |
| Stripe webhook | authoritative | **kept, inert** — one renewal window of dual-read, then retired |
| Apple verify-receipt / ASSN | authoritative | kept, inert |
| Google RTDN | authoritative | kept, inert |
| Trial cron | authoritative for TRIAL→FREE | see trials decision (`docs/REVENUECAT_MIGRATION.md` §Trials) |
| Comp | `source="comp"`, non-demotable | **unchanged** — RC has no concept of it; the guard must be re-implemented in the RC webhook |
| Drift monitor | provider-vs-DB | + RC-vs-DB parity mode |

### 4.1 Ordered replacement target list

1. `lib/entitlements/resolve.ts` — introduce, wrap existing sources (no behavior change).
2. Point `entitlements-fetch.ts` + `paywall.ts` at it.
3. Point `feature-flags.ts:tierMatches` at it (fixes the TRIAL-vs-PRO flag inconsistency as a side effect — **verify this is intended before shipping**).
4. Build the RC webhook writing the same 4 values with the same guards.
5. Flip the resolver's source to RC behind `RC_SOURCE_OF_TRUTH`.
6. Leave 1–8 in §2.1–2.3 live but inert for one renewal window.
7. Retire.

---

## 5. Invariants any RC implementation must preserve

Each of these exists because of a specific past incident. Losing one silently re-opens it.

1. **Never demote a comp.** `source="comp"` is `PRO` forever until an admin says otherwise.
2. **Never cross-source demote.** A provider's event may only demote a row that provider owns; `null`-source rows stay demotable (the `NOT_IAP_SOURCE_WHERE` null branch).
3. **Never resurrect a clean cancel.** `recoverableOr()` — a paid signal may re-grant PRO only when the row is not-FREE *or* still in a dunning window.
4. **Anchor before downgrade.** Stamp the failure timestamp before setting FREE, or the anchor write's own WHERE is falsified.
5. **Grant-vs-demote asymmetry.** A provider read that *fails* is never a demotion signal (`resolveProviderActive` returns `ok:false`, caller skips).
6. **Idempotency by provider event id.** Stripe: `StripeEvent.id`. RC: `event.id` needs the same dedup table.
7. **Fail closed on unknown status**, fail *open* on a missing dunning anchor (`entitlements.ts:21-25`) — we would rather not lock out a paying customer over a missing field.
8. **Entitlement reads status only.** Do not start gating on `subscriptionSource`.

---

## 6. Counts (for cutover verification)

Live paid base to reconcile: **17 subs** (12 Stripe, 5 Apple, 0 Google) + **2 comps** + **7 app-managed trials**.
Post-cutover parity check: RC customer count for entitlement `pro` should equal DB `subscriptionStatus="PRO"` **minus** the 2 comps (RC will not know about comps) — see the drift monitor's RC-parity mode.
