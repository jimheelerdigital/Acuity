# RevenueCat migration

**Status:** built, nothing live. All flags OFF in every environment.
**Branch:** `feat/revenuecat-migration`
**Strategy:** observer-mode-first — RevenueCat watches and we verify its data matches the DB before it controls anything.
**Companion doc:** [`REVENUECAT_ENTITLEMENT_AUDIT.md`](./REVENUECAT_ENTITLEMENT_AUDIT.md) — the full list of every place entitlement is decided or written today.

---

## 1. Flags

Defined once, in `packages/shared/src/revenuecat.ts`, consumed by both runtimes through thin adapters:

| Runtime | Adapter | Env var form |
|---|---|---|
| Web / server | `apps/web/src/lib/revenuecat/flags.ts` | `RC_OBSERVER` |
| Expo / mobile | `apps/mobile/lib/revenuecat/flags.ts` | `EXPO_PUBLIC_RC_OBSERVER` |

Parsing is strict and fail-closed: only `1` / `true` / `on` / `yes` (case-insensitive, trimmed) enable a flag. `0`, `false`, `""`, a typo like `ture`, or an unset var all mean OFF. A malformed value on a billing flag must never read as "go live".

| Flag | Default | What it does when ON |
|---|---|---|
| `RC_OBSERVER` | **off** | Mobile SDK configures with `purchasesAreCompletedBy: MY_APP`. RC observes the transactions `react-native-iap` makes and populates its own backend. Our purchase flow is untouched. Writes nothing to our DB. |
| `RC_SOURCE_OF_TRUTH` | **off** | The RC webhook is allowed to WRITE `subscriptionStatus` / `subscriptionSource`, and `lib/entitlements/resolve.ts` reads RC state. Until this is on, the webhook computes its full decision, logs it, and touches nothing. |
| `RC_SDK_PURCHASES` | **off** | Purchases go through RC (`getOfferings` → `purchasePackage`) instead of `react-native-iap`. |

Two independent, non-RC config switches live in `packages/shared/src/pricing-plans.ts`:

| Config | Default | Notes |
|---|---|---|
| `newPricingEnabled` | **false** | Turns on the $8.99 / $79.99 tier. Deliberately NOT one of the RC flags — the pricing change and the RC migration are separate decisions that happen to be scheduled together. Coupling them would make either rollback impossible without the other. |
| `grandfatherExisting` | **true** | Existing subscribers keep legacy pricing permanently. |

### Ordering constraint

**Never enable `RC_SDK_PURCHASES` before `RC_SOURCE_OF_TRUTH`.** A purchase would complete at the store with nothing on our side writing the entitlement — the user is charged and gets no access. `configureRevenueCat()` logs a loud warning if it sees that combination, but the ordering is on us.

---

## 2. Cutover order

Each step is independently reversible. Do not batch them.

### Phase 0 — prerequisites (blocked on Jim / Cowork)
1. Create the RC project; set entitlement identifier to exactly **`pro`**.
2. Connect App Store, Play Store, and Stripe in the RC dashboard.
3. Provision keys (§5).
4. **Create the `RevenueCatEvent` table — but NOT with `prisma db push`.** Apply `prisma/manual/2026-08-16-revenuecat-event.sql` instead. Required before step 3.3; harmless before then.

   > ⚠️ **`prisma db push` is currently destructive on this repo.** Verified 2026-08-16 via `prisma migrate diff`: it would drop 13 columns from `CarouselPost` (`comments`, `instagramUrl`, `lane`, `likes`, `metricsAt`, `mood`, `saves`, `shares`, `storyTheme`, `storyVideoUrl`, `tiktokUrl`, `views`, `withheldReason`). Those exist in prod but not in this branch's `schema.prisma` — prod is **ahead**, having been changed by the carousel / content-factory work — and `db push` reconciles the DB *to* the local schema. A read-only count confirmed `storyVideoUrl` holds **5 real values**. This is live data loss.
   >
   > This is a **pre-existing repo-wide hazard**, not specific to this migration: anyone running `db push` from a branch whose `schema.prisma` lags prod will revert prod. Fix properly by pulling the missing columns into `schema.prisma` (`prisma db pull` on a scratch branch, or re-adding them by hand) so schema and prod agree again. Until then, treat `db push` as unsafe and apply additive SQL by hand.
5. Cowork delivers the id→receipt mapping (§5).

### Phase 1 — observe (no user impact)
1.1. Deploy this branch with all flags off. Verify: suite green, `/api/revenuecat/webhook` returns 401 without the auth header.
1.2. Point the RC dashboard webhook at `https://goripple.io/api/revenuecat/webhook` with the `RC_WEBHOOK_AUTH` value. Send a TEST event; expect `{received: true, mode: "observer", applied: false}`.
1.3. Run the import script — **dry run first**, then `--limit 1` as a canary, then the full set:
```
export RC_SECRET_KEY=...            # never pass as an argument
npx tsx apps/web/scripts/rc-import-receipts.ts --file ~/rc-mapping.json
npx tsx apps/web/scripts/rc-import-receipts.ts --file ~/rc-mapping.json --limit 1 --apply
npx tsx apps/web/scripts/rc-import-receipts.ts --file ~/rc-mapping.json --apply
```
1.4. Turn on `EXPO_PUBLIC_RC_OBSERVER` in a **preview** EAS build only. Confirm RC records a sandbox purchase.
1.5. Let it run. Watch `revenuecat.webhook.observed` logs — specifically the `agrees` field, which compares RC's would-be decision against the current DB value.

### Phase 2 — verify (the gate)
2.1. `GET /api/admin/entitlement-drift?mode=rc-parity` must report `gate.ready === true`. That requires:
- RC credentials present,
- ≥1 user checked,
- **zero SEV1** (`rc_missing_entitlement` — a paying user who would LOSE access),
- **zero unreadable** rows (unverified ≠ passing).

2.2. Manually reconcile the expected counts:
- 17 paid (12 Stripe, 5 Apple, 0 Google) → RC should show 17 with `pro`.
- **2 comps → RC will NOT know about these.** Expected, not drift; the parity scan excludes them.
- **7 app-managed trials → RC will NOT know about these either.** Also expected — see §3.

2.3. Confirm the observed webhook log shows no `agrees: false` for any real user over at least one full renewal cycle.

### Phase 3 — cut over
3.1. Enable `RC_OBSERVER` in production.
3.2. Confirm parity still green.
3.3. **Enable `RC_SOURCE_OF_TRUTH`.** From here RC writes entitlement. The old handlers stay live (§4).
3.4. Watch for `entitlements.rc-source-fellback` (dual-read fallbacks) and `revenuecat.webhook.applied`. A rising fallback rate is the signal to roll back.
3.5. Only after a full renewal window: enable `RC_SDK_PURCHASES` in a new build.

### Phase 4 — retire
Only after one clean renewal window past 3.3: remove the Stripe/Apple/Google entitlement writers listed in the audit §2. **Not before.**

---

## 3. Trials — decision made

**Trials stay app-managed. They are NOT mapped into RC's trial model.**

Why this is not a preference: Ripple's 7-day trial requires **no payment method**, and that promise is made repeatedly in public copy (`app/page.tsx`, `landing.tsx` ×4 including the FAQ, `/for/*` landers, trial emails). Both Apple introductory offers and Google free trials **require a card**. Moving trials to store-managed offers would mean requiring a card up front — a fundamental funnel change for an audience (women ~40–50 carrying a heavy mental load) where the frictionless start is the pitch, not a detail.

So:
- RC owns **paid** entitlement.
- The app keeps owning the **trial clock** (`subscriptionStatus="TRIAL"`, `trialEndsAt`, `trial-expiration-cron`).
- `resolveEntitlement` **unions** the two.

### The overlay (and the bug it fixes)
RC has no record of a trialing user — there is no transaction to observe — so it correctly reports them `FREE`. Without an overlay, flipping `RC_SOURCE_OF_TRUTH` would have **instantly revoked access from all 7 users mid-trial**.

`apps/web/src/lib/entitlements/resolve.ts` therefore consults the DB for an active app-managed trial *only when RC reports no entitlement*. A real paid entitlement always wins, and the extra query never touches paying users. Regression-covered in `resolve.test.ts` § "app-managed trial overlay".

Consequence to remember: **the trial-expiration cron stays live after cutover.** It is not one of the writers retired in Phase 4.

If we ever do want store-managed trials, that is a separate product decision requiring a copy change across every surface listed above — not part of this migration.

---

## 4. Dual-read fallback plan

The property that makes cutover reversible: **an RC failure degrades to today's behavior instead of revoking access.**

When `RC_SOURCE_OF_TRUTH` is on, `resolveEntitlement`:
1. asks RC,
2. if RC **throws** (outage, bad key, timeout) → logs `entitlements.rc-source-failed`, falls back to the DB,
3. if RC returns **null** (unknown subscriber) → logs `entitlements.rc-source-fellback`, falls back to the DB,
4. if RC returns **FREE** → applies the trial overlay (§3),
5. marks the result `fellBack: true` so fallbacks are countable.

Because the old Stripe/Apple/Google handlers stay live and keep writing the DB for **one full renewal window** after cutover, that fallback is reading *fresh* data, not a stale snapshot. That is the entire reason Phase 4 waits.

### Rollback
Set `RC_SOURCE_OF_TRUTH=false` and redeploy. Nothing else. The DB is still current because the old handlers never stopped writing it. No data migration, no replay.

### Watch these
| Signal | Meaning |
|---|---|
| `entitlements.rc-source-fellback` | RC didn't know a user. A few is normal early; a rising rate means the import missed rows. |
| `entitlements.rc-source-failed` | RC erroring. Sustained → roll back. |
| `entitlements.app-trial-overlay` | Trial users being correctly preserved. Should ≈ the active-trial count. |
| `revenuecat.webhook.guard-matched-zero` | A comp guard or a source race blocked a write. Investigate each. |
| `paywall.reject` with `entitlementFellBack: true` | Someone was denied on fallback data. Investigate immediately. |

---

## 5. What's needed to proceed

### From Jim
| Item | Where | Blocks |
|---|---|---|
| `RC_IOS_KEY` / `RC_ANDROID_KEY` (public SDK keys) | EAS secrets as `EXPO_PUBLIC_RC_IOS_KEY` / `EXPO_PUBLIC_RC_ANDROID_KEY` | observer mode |
| `RC_SECRET_KEY` (server secret) | Vercel env | import script, RC reads, parity scan |
| `RC_WEBHOOK_AUTH` (we choose the value) | Vercel env **and** RC dashboard | webhook auth |
| `RC_PROJECT_ID` | Vercel env | some v2 endpoints |
| Apply `prisma/manual/2026-08-16-revenuecat-event.sql` (**not** `prisma db push` — see Phase 0.4) | Supabase SQL editor, or psql via `DIRECT_URL` | `RevenueCatEvent` table, needed before `RC_SOURCE_OF_TRUTH` |
| RC dashboard: entitlement `pro`, offerings `default` + `grandfathered`, store + Stripe connections | app.revenuecat.com | everything |

### From Cowork
The id→receipt mapping, as JSON array or JSONL:
```json
[
  { "app_user_id": "<our User.id>", "kind": "apple",  "receipt_or_sub_token": "<base64 receipt>" },
  { "app_user_id": "<our User.id>", "kind": "stripe", "receipt_or_sub_token": "sub_1abc..." }
]
```
`app_user_id` **must** be our `User.id` — that is what the mobile client aliases via `Purchases.logIn()` and what the webhook looks users up by. An email or Stripe customer id here would import the subscription against an id nothing ever queries. Keep the file **outside the repo**; it contains receipts.

---

## 6. Decisions needed before cutover

1. **`BILLING_ISSUE` → FREE immediately (no grace).** RC keeps entitlements active through billing retry and grace; Ripple does not (2026-06-12 no-grace spec, matching the current Stripe and Apple handlers). The webhook preserves *our* behavior. Confirm that's still what we want — adopting RC's model would be a silent product change bundled into an infra migration.
2. **StoreKit version for observer mode.** `purchasesAreCompletedBy: MY_APP` requires an explicit `storeKitVersion`, and it must match what `react-native-iap@15` actually uses on iOS or RC will mis-parse transactions. Currently defaults to `STOREKIT_2`, overridable via `EXPO_PUBLIC_RC_STOREKIT_VERSION`. **Verify against react-native-iap before enabling observer mode in production.**
3. **`feature-flags.ts:tierMatches` is a second entitlement authority.** It gates `requiredTier: "PRO"` on `status === "PRO"`, so TRIAL users fail PRO-gated flags even though `entitlementsFor` grants trials full access. Left unchanged (fixing it would alter live behavior). Decide whether to route it through the resolver — if not, flag-gated and paywall-gated features will diverge after cutover.
4. **V2 product IDs are placeholders** (`…pro.monthly.v2`, `acuity_pro_monthly_v2`) and V2 Stripe Prices don't exist. Real SKUs needed before `newPricingEnabled`.
5. **Apple price-consent risk.** Raising the price on an *existing* auto-renewable subscription triggers an Apple consent prompt that can cancel the sub if unanswered. This is why grandfathering routes existing subscribers to a separate offering on the *original* products rather than repricing theirs. Confirm before enabling new pricing.

---

## 7. Marketing copy NOT yet routed through pricing config

The functional price sites (checkout, analytics values, paywall display, terms, mobile fallbacks) now read from `packages/shared/src/pricing-plans.ts`. These remaining prose strings still hardcode `$4.99` / `$39.99` and need a **copy pass** against `docs/acuity-positioning.md`, not a mechanical substitution:

- `apps/web/src/components/landing.tsx:1691,1748`
- `apps/web/src/app/page.tsx:34,76`
- `apps/web/src/app/voice-journaling/page.tsx:115,451`
- `apps/web/src/app/for/sleep/page.tsx:267`
- `apps/web/src/app/for/therapy/page.tsx:158,294`
- `apps/web/src/app/for/weekly-report/page.tsx:306`
- `apps/web/src/app/for/founders/page.tsx:330,424`
- `apps/web/src/lib/drip-emails.ts:330,347,426` — includes "lock in $4.99/month — the lowest price Ripple will ever be", which becomes a **promise we'd be breaking** at $8.99. Needs Keenan's call.
- `apps/web/src/emails/trial/trial-ending.ts:41`
- `apps/web/src/inngest/functions/auto-blog.ts:1247`, `apps/web/src/lib/content-factory/generate.ts:30` — AI prompt context
- `apps/web/src/components/marketing/Pricing.tsx:3` (comment), `apps/mobile/app/subscribe.tsx:612` (comment), `apps/mobile/app/onboarding-new/paywall.tsx:41` (comment)

---

## 8. Files added / changed

**Added**
```
packages/shared/src/revenuecat.ts            flags, entitlement id, offerings, store→source map
packages/shared/src/pricing-plans.ts         legacy + V2 tiers, grandfathering
apps/web/src/lib/entitlements/resolve.ts     THE resolver + cutover switch + fallback + trial overlay
apps/web/src/lib/revenuecat/flags.ts         server flag adapter + credentials
apps/web/src/lib/revenuecat/client.ts        read-only REST client + pure subscriber→state mapping
apps/web/src/lib/revenuecat/webhook-events.ts  pure event→decision mapping (13 event types)
apps/web/src/app/api/revenuecat/webhook/route.ts  receiver (observer mode today)
apps/web/scripts/rc-import-receipts.ts       receipt import, dry-run by default
apps/mobile/lib/revenuecat/index.ts          SDK wrapper, lazy-loaded
apps/mobile/lib/revenuecat/flags.ts          mobile flag adapter (static env reads)
docs/REVENUECAT_ENTITLEMENT_AUDIT.md         the replacement target list
```

**Changed**
```
apps/web/src/lib/entitlements-fetch.ts       reads via the resolver
apps/web/src/lib/paywall.ts                  reads via the resolver
apps/web/src/lib/entitlement-drift.ts        + scanRcParity + rcParityReadyForCutover
apps/web/src/app/api/admin/entitlement-drift/route.ts  + ?mode=rc-parity
apps/web/src/lib/pricing.ts                  derives from shared catalog + planValueDollars
apps/mobile/lib/pricing.ts                   derives from shared catalog
apps/mobile/contexts/auth-context.tsx        RC identity aliasing on sign-in / reset on sign-out
prisma/schema.prisma                         + RevenueCatEvent (apply prisma/manual/*.sql, NOT db push)
```

**Not touched, by design:** the Stripe webhook's entitlement writers, Apple verify-receipt + ASSN, the Google RTDN handler, and the trial-expiration cron. They remain the source of truth until cutover.
