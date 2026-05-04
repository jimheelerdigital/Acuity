# IAP-Shape Apple Reviewer Account — Credentials + Runbook

**Status:** Ready to seed when v1.1.x (the IAP-enabled build) goes for App Review.

This account is for the **post-SBP-enrollment** Apple submission — when the iOS app surfaces the dual-CTA layout (`Subscribe in app` alongside `Continue on web →`). The reviewer can choose either path and verify both flow correctly.

Prior reviewer accounts:
- `jim+applereview@heelerdigital.com` — v1.0 (PRO tier, Stripe-side experience)
- `jim+applereview-v11@heelerdigital.com` — v1.1 base (FREE post-trial without IAP option)
- **`jim+applereview-iap@heelerdigital.com` — this account (FREE post-trial WITH dual-CTA layout when iapEnabled=true)**

---

## Credentials

```
Email:    jim+applereview-iap@heelerdigital.com
Password: m6d&s9DWdVn%fLKU
```

The email is allowlisted in `apps/web/scripts/seed-iap-reviewer.ts`. The script refuses any other address.

---

## Seed command

```bash
set -a && source apps/web/.env.local && set +a && \
  npx tsx apps/web/scripts/seed-iap-reviewer.ts \
    --email jim+applereview-iap@heelerdigital.com \
    --password 'm6d&s9DWdVn%fLKU'
```

Add `--force` to recreate (between submission rounds).

---

## What the seed creates

- **User row:** `subscriptionStatus = "FREE"`, `subscriptionSource = null`, `trialEndsAt = 7 days ago`, all Apple receipt fields explicitly null, no `stripeCustomerId`. The exact PRE-purchase state the reviewer needs to demonstrate the dual-CTA flow.
- **UserOnboarding** complete (no onboarding redirect on first sign-in).
- **8 Entry rows** spanning the prior 30 days — same content as the v1.1 base reviewer for consistency. Status COMPLETE on all 8.
- **ThemeMention rows** so the locked Theme Map preview has data behind the blur.
- **6 LifeMapArea rows** (CAREER / HEALTH / RELATIONSHIPS / FINANCES / PERSONAL / OTHER) so the locked Life Matrix preview shows a populated radar.
- **2 Goal rows** + **3 Task rows** + **1 WeeklyReport row.**

Crucially, the seed leaves the account on the FREE side with NO subscription source. When the reviewer signs in:

- **Profile menu** shows BOTH "Subscribe" (in-app, when `iapEnabled = true`) AND "Manage plan on web" (Continue-on-web link).
- **Locked-state cards on /home, /life-matrix, /goals, /tasks, /insights, /entries/[id]** all show DUAL CTAs — "Subscribe in app" alongside "Continue on web →".
- **Paywall modal** (post-record on cap or trial-end) shows "Subscribe in app" as primary, "Continue on web" as secondary, plus "Restore Purchases" link.

The reviewer can:
1. Pick "Continue on web →" → opens Safari to https://getacuity.io → verify the web upgrade flow → sign in on web with the same credentials → verify Pro unlocks there.
2. Pick "Subscribe in app" → StoreKit purchase sheet → complete with a sandbox tester or real Apple ID → verify backend processes via /api/iap/verify-receipt → app unlocks Pro features.
3. Sign into both web and iOS with the same account at any state and verify entitlement consistency.

---

## Pre-seed checklist (before this account is useful)

This account is only useful when ALL of the following are true. Verify before seeding:

- [ ] **`iapEnabled = true`** in `apps/mobile/app.json`'s `extra` section. (Currently `false` for production safety.)
- [ ] **EAS rebuild has shipped to TestFlight** with the IAP code paths active.
- [ ] **SBP shows Enrolled** in App Store Connect → Agreements, Tax, and Banking.
- [ ] **IAP product `com.heelerdigital.acuity.pro.monthly` is `Ready to Submit`** in App Store Connect.
- [ ] **Vercel env vars set:** `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_PRIVATE_KEY` (per `docs/v1-1/iap-app-store-connect-setup.md §13`).
- [ ] **Webhook URL registered:** `https://www.getacuity.io/api/iap/notifications` in App Store Connect → App Information → App Store Server Notifications, V2.
- [ ] **Phase 4 schema fully applied** (User has all the Apple receipt fields). Per the W4 Sentry retro, Jim still owes a `prisma db push` — confirm before submission.

If any item is missing, the reviewer's "Subscribe in app" CTA either won't render OR will render but fail at runtime. Both are bad reviewer outcomes.

---

## Reviewer notes addendum (paste into ASC for v1.1.x submission)

This stacks onto the v1.0 + v1.1 review notes. Add a new paragraph:

```
What changed in v1.1.x
----------------------
v1.1.x adds the in-app subscription option ("Subscribe in app")
alongside the existing "Continue on web →" link. Both options are
presented on every locked-state card per 3.1.3(b) Multiplatform
Service compliance — neither has been removed in favor of the other.

The in-app subscription uses StoreKit 2 with the product
"com.heelerdigital.acuity.pro.monthly" at $12.99/month, matching
the web price. After purchase, the receipt is verified via Apple's
App Store Server API, and the user's account on the web at
https://getacuity.io reflects the active Pro subscription —
demonstrating the multiplatform service shape.

Demo account for v1.1.x (FREE, dual-CTA pre-purchase state):
   Email:    jim+applereview-iap@heelerdigital.com
   Password: m6d&s9DWdVn%fLKU

Sign-in: tap "Sign in with email", paste the above, tap Continue.

Surfaces to verify (3.1.3(b) compliance):
- Profile menu shows "Subscribe" AND "Manage plan on web" as
  separate items.
- Every locked-state card shows TWO buttons: "Subscribe in app"
  and "Continue on web →".
- Tap "Continue on web →" → opens Safari (NOT a WebView),
  external URL, no purchase pathway in the app.
- Tap "Subscribe in app" → StoreKit purchase sheet appears.
  Complete with a sandbox tester account.
- After purchase: the app reflects Pro state, AND signing into
  https://getacuity.io with the same credentials shows the same
  Pro state — demonstrating cross-platform multiplatform service.

Restore Purchases link is present on Subscribe / Profile / Paywall
screens per Apple App Review requirement.

Contact: jim@heelerdigital.com
```

---

## Verification checklist (run after seed, before pasting creds into ASC)

1. **Sign in via web** at https://getacuity.io/signin and confirm the dashboard shows the locked-state experience (this is unchanged from v1.1 base; no IAP affordances on web).

2. **Sign in via iOS TestFlight** with the same credentials and confirm:
   - Profile menu has BOTH "Subscribe" and "Manage plan on web" as separate items.
   - Locked cards show DUAL CTAs.
   - Tapping "Subscribe in app" presents the Apple StoreKit purchase sheet.
   - Tapping "Continue on web →" opens Safari (verify via the system tab indicator).
   - Restore Purchases link is visible on Subscribe / Profile / Paywall.

3. **Database check** (from a Supabase SQL editor or a tsx probe):
   ```sql
   SELECT
     "subscriptionStatus",
     "subscriptionSource",
     "trialEndsAt",
     "stripeCustomerId",
     "appleOriginalTransactionId"
   FROM "User"
   WHERE email = 'jim+applereview-iap@heelerdigital.com';
   ```
   Expected: `FREE`, `null`, `<now - 7 days>`, `NULL`, `NULL`.

4. **Cap-flag check:** confirm `featureFlag.enabled = false` for `key = "free_recording_cap"`. The reviewer hitting the FREE cap mid-review would surface an unexpected modal.

---

## What the seed deliberately omits

- **No prior Apple receipt fields.** The point is to demonstrate the pre-purchase IAP state. Reviewer makes the purchase live during review.
- **No `stripeCustomerId` either.** Symmetric: reviewer can choose either path with no prior state biasing the experience.
- **No `LifeAudit`.** Day-14 audit is locked behind `canExtractEntries`; seeding a completed one would misrepresent the FREE experience.
- **No `extracted = true` on any seeded Entry.** Same as the v1.1 base reviewer — entries mirror the FREE-tier "recorded but not extracted" shape.

---

## Cross-references

- IAP Apple-side runbook: `docs/v1-1/iap-app-store-connect-setup.md`
- v1.1 review notes addendum: `docs/v1-1/app-review-notes-v1-1.md`
- v1.1 base reviewer (FREE without IAP): `docs/v1-1/reviewer-account-v1-1.md`
- v1.0 base reviewer (PRO via Stripe): `docs/APP_STORE_REVIEW_NOTES.md`
- Seed script: `apps/web/scripts/seed-iap-reviewer.ts`
- Phase 1 Apple-side runbook: `docs/v1-1/iap-app-store-connect-setup.md §13.5` (pre-launch readiness checklist)
