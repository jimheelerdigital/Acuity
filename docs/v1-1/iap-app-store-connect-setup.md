# IAP — App Store Connect Setup Runbook (v1.1)

**Status:** Draft 2026-05-03 (Phase 1 of dual-source subscription pivot)
**Audience:** Jim (Apple Developer account holder; Phase 1 actions are all on Apple's side)
**Outcome:** by the end of this doc, Apple has been told about the new subscription product and a sandbox tester exists for TestFlight verification. The codebase change for receipt verification + StoreKit wiring is a separate phase (Phase 2/3) and waits on Phase 1 + Apple's 24–48h SBP activation.

---

## §0 — Why we're doing this

Apple rejected v1.0 twice under §3.1.1 despite our 3.1.3(b) Multiplatform Service defense. Pivoting to add **native iOS IAP under the Apple Small Business Program (15% commission)** in parallel with the existing web Stripe path. Both paths converge on the same `User.subscriptionStatus` so cross-platform access works either way.

**This doc covers Apple-side setup only.** The codebase change for `User.subscriptionSource` + `appleOriginalTransactionId` lives in Phase 4 (already shipped in this same sweep).

---

## §1 — Eligibility check (do this first)

Before enrolling in the Small Business Program, confirm:

- [ ] **Total proceeds across all your Apple Developer accounts in the previous calendar year (2025) was less than $1M USD.** Acuity has no IAP revenue on Apple yet, so this is a yes by definition. If you have OTHER apps under the same Apple ID earning IAP revenue, sum them.
- [ ] **You are not part of a larger entity that exceeds the threshold.** Heeler Digital is a sole-prop / single-LLC; the threshold is per-developer-account, not per-app. You're a yes.
- [ ] **You agree to the SBP terms** — Apple makes you re-attest every January.

Reference: https://developer.apple.com/app-store/small-business-program/

If any of the above is uncertain, do NOT enroll until clarified — withdrawing from SBP later forfeits the reduced rate for the rest of the calendar year.

---

## §2 — Enroll in Small Business Program

1. Sign in to https://developer.apple.com/account
2. Top nav → "Agreements, Tax, and Banking" (the gear icon under your name)
3. Find **Apple Developer Program License Agreement** — confirm you're already on the standard agreement.
4. Find **Apple Small Business Program** card → click **Enroll**.
5. Form fields:
   - **Developer Account holder:** Jim Cunningham / Heeler Digital (auto-filled).
   - **Did your apps earn ≥ $1M last year?** No.
   - **Are you part of a parent company or larger entity that did?** No.
   - **Tax/banking info matches your existing developer account?** Yes.
6. Submit.

**Activation timeline:** Apple states 24-48h. In practice it's usually <24h on weekdays, longer if submitted Friday afternoon or near a holiday.

**You'll know it activated when:** "Apple Small Business Program: Enrolled" appears in Agreements, Tax, and Banking. Commission rate drops from 30% → 15% retroactive to the enrollment-effective date for ALL paid IAP transactions on this developer account.

**Do NOT submit the v1.1 build to App Review until SBP is active.** Submitting a paid IAP product before the 15% rate kicks in means the first transactions are billed at 30% (Apple does not retroactively re-rate transactions issued before SBP activation date).

---

## §3 — Pricing decision (READ BEFORE creating the product)

**Web pricing today** (verified 2026-05-03 in `apps/web/src/app/upgrade/upgrade-plan-picker.tsx`):
- Monthly: **$12.99 / mo**
- Annual: **$99 / yr** ($8.25/mo effective, saves $56.88 vs monthly = ~36% off)

**The prompt that scoped this workstream said $9.99/mo. That's wrong** — web is $12.99. Recommend matching $12.99 on iOS for cross-platform parity. Diverging would create confusion (a user who upgrades on iOS at $9.99 and later hits the web `/upgrade` page sees $12.99 — looks like a price hike). Apple's price tiers include both $9.99 (Tier 10) and $12.99 (Tier 13), so we have flexibility either way.

**Recommendation: $12.99/mo to match web.**

The 15% SBP commission on $12.99 → Apple takes $1.95, we keep $11.04. On a notional 1k iOS subs, the price-parity-vs-cut tradeoff is roughly:
- $12.99 @ 15% → $11,040/mo net
- $9.99 @ 15% → $8,491/mo net

Price parity is worth $2.5k/mo on this volume. Hold at $12.99.

---

## §4 — Annual product? (READ BEFORE creating the product)

The prompt asks: do we need a separate "Acuity Pro Annual" product at launch?

**Recommendation: monthly only at launch. Add annual after 2-4 weeks of stable IAP runtime.**

Reasoning:

1. **Single product = single review surface.** Apple reviews every IAP product separately (review screenshot, review notes, sandbox-tested flow). Two products at launch = double the work + more rejection vectors.
2. **Web stays the conversion-optimized funnel.** The marketing copy around "save 36%" lives on `/upgrade` and works because annual is the visible default there. Replicating that copy on iOS adds StoreKit-side complexity (showing two products + computed savings strings + selected default) that's not worth it on the launch path.
3. **Receipt-verification logic is simpler with one product.** When we add annual, the verifier needs to know which `productId` mapped to which `stripeCurrentPeriodEnd` equivalent (28-31 days vs 365-366 days). Defer that until v1.2.
4. **Apple users who want annual can use web.** The cross-platform model means a user who wants the annual discount upgrades on web; their access works on iOS via the same `subscriptionStatus = "PRO"` flag.

**Add annual in v1.2 when:** monthly IAP has been live for at least 14 days with zero P1 receipt-verification incidents, and we have data on what % of iOS conversions are reaching the manage-subscription screen looking for an annual option.

---

## §5 — Create the auto-renewable subscription product

Once SBP is **active** (per §2), create the product:

1. App Store Connect → **My Apps → Acuity** (App ID `6762633410`)
2. Left sidebar → **In-App Purchases** (under "Monetization")
3. **Create a Subscription Group** first (subscriptions live inside a group; required even for a single product):
   - Reference Name: `Acuity Pro`
   - Localization (English U.S.):
     - Subscription Group Display Name: `Acuity Pro`
     - Custom App Name: leave blank (uses app name)
   - The group's display name shows in the iOS Settings → Subscriptions UI.
4. Inside the group → **Create Subscription**:
   - Reference Name (internal, never user-facing): `Acuity Pro Monthly`
   - Product ID: `com.heelerdigital.acuity.pro.monthly`
     - **Match exactly** — this string is hard-coded in the StoreKit client + the receipt-verification server. A typo here = silent runtime failure.
   - Subscription Duration: **1 Month**
   - Price: **$12.99 USD** (Tier 13). Confirm "Apple Small Business Program: 15% commission" is shown on the price preview before saving — if you see 30%, SBP isn't active yet; **do not save**.
   - Family Sharing: **Off** (optional; users may expect this on, but it complicates entitlement attribution. Defer to v1.2.)
   - Localizations (English U.S.):
     - **Display Name (max 30 chars):** `Acuity Pro` (used on iOS Settings → Subscriptions screen)
     - **Description (max 45 chars):** `Full debriefs, weekly reports, calendar`
   - **Review Information**:
     - **Screenshot:** required. See §6.
     - **Review Notes:** see §7.
5. Status will be `Missing Metadata` until the screenshot lands. Once metadata is complete, status becomes `Ready to Submit` and ships with the next app build review.

---

## §6 — Review screenshot (required by Apple)

Apple wants a screenshot of the paywall/purchase surface — they look for the price, the auto-renewing language, and the terms link. Take this on iOS device (or Simulator) AFTER the StoreKit Phase 3 client lands.

Spec:
- 1290 × 2796 (iPhone 15 Pro Max) OR any of the listed accepted sizes — 16:9-ish portrait.
- Show: product display name, the price ($12.99/month), "auto-renews" language, and a Terms / Privacy footer link. Apple rejects screenshots that crop these.
- Format: PNG, no transparency.
- Filename: free-form; suggest `iap-review-screenshot-acuity-pro-monthly.png`.

**Important: this screenshot blocks IAP product approval.** If Phase 3 (StoreKit client) hasn't shipped yet, you can ship a static mock that LOOKS like the eventual paywall — Apple just wants to see what users will see — but the mock must accurately match what Phase 3 will render. Lower risk: wait until Phase 3 ships, then take a real screenshot.

---

## §7 — IAP product review notes

Paste this into App Store Connect → In-App Purchases → Acuity Pro Monthly → Review Information → Review Notes. **Separate from the app-level review notes** — this is product-specific.

```
Acuity Pro Monthly is the iOS-acquired subscription tier for the
Acuity voice-journaling app. It unlocks the same Pro features
that web subscribers get:

- AI-extracted themes, tasks, goals, and life-area mentions
  from each recording
- Weekly Sunday report (90-day retrospective)
- Calendar integration (planned post-launch)
- Full memoir export (planned post-launch)

Free recording is unchanged — every user can record nightly
voice entries forever; this tier unlocks the AI debrief layer.

Cross-platform: a user with this subscription can sign into
the Acuity web app at https://getacuity.io and access the same
Pro features. The reverse also works — web Stripe subscribers
get Pro access on iOS without re-purchasing.

Conflict policy: a user with an active Apple subscription will
see "You already have an active subscription via Apple — manage
it in iOS Settings → Subscriptions" if they navigate to the
web /upgrade page. Same posture in reverse for Stripe-side
subscribers visiting the iOS paywall.

Sandbox testing: any sandbox tester account works. The build
includes a debug log showing the originalTransactionId after
purchase — please share that ID if there's an issue we need
to investigate.

Contact: jim@heelerdigital.com
```

---

## §8 — Sandbox tester account

For TestFlight + local IAP testing. (Not the same as the App Review reviewer account.)

1. App Store Connect → **Users and Access** → **Sandbox** tab → **Testers**.
2. **+ Add Tester**:
   - First/Last name: anything (`Acuity Sandbox`)
   - Email: `acuity.sandbox.iap@<a-domain-you-control>` — must be UNIQUE across all Apple ID accounts (cannot be your real Apple ID). Suggest using a `+` alias on a domain you own (NOT a Gmail `+` alias — Apple rejects those).
   - Password: 12+ chars, mixed.
   - Country/Region: United States.
3. Save. Apple may take a few minutes to provision the account.

**Using the sandbox tester:**
- Sign OUT of the App Store on the device first (Settings → App Store → tap your Apple ID → Sign Out). Real Apple IDs cannot make sandbox purchases.
- Open the Acuity app, navigate to the paywall, attempt purchase.
- iOS prompts for an Apple ID — enter the sandbox tester credentials.
- Purchase happens against StoreKit sandbox (no real charge).
- Subscription auto-renews on a compressed schedule:
  - 1-month sub renews every 5 minutes
  - 6 cycles before sandbox auto-cancels
  - Resets every Apple sandbox-environment refresh
- The sandbox originalTransactionId begins with `2000000` and is distinguishable from production IDs in Vercel logs.

---

## §9 — StoreKit Configuration File (Phase 3 prerequisite — Jim does NOT need to do this in Phase 1)

For local Xcode/Expo testing without going through Apple's sandbox network:

- File → New → File → **StoreKit Configuration File**
- Add product `com.heelerdigital.acuity.pro.monthly` matching the App Store Connect spec
- Edit Scheme → Run → Options → StoreKit Configuration → select the file
- Lets developers test purchase flows offline against a synthesized StoreKit response

This is a Phase 3 (StoreKit client) task. Mentioned here so Jim knows the file will exist + the wiring to invoke it; not actionable until Phase 3.

For Expo specifically, the StoreKit Configuration File lives in the Xcode project that `expo prebuild` generates. Phase 3 will document the integration.

---

## §10 — Locale strategy

**Recommendation: launch with English (US) only.**

Reasoning:
- Existing web copy is English-only. Adding mobile localizations before web localizes is asymmetric.
- Apple shows iOS Settings → Subscriptions strings in the user's device language. With one locale (en-US), users on non-English devices see English. Apple does not reject for this — many indie apps ship en-US only.
- Each locale = duplicate Display Name + Description + Review Notes. Two locales doubles the maintenance + review surface.

If we localize web later (e.g. Spanish), bundle the iOS localization in the same v1.x release.

---

## §11 — Action checklist split: Jim vs. CC

### Jim must do (Apple side — manual):

- [ ] **§1** Confirm SBP eligibility (proceeds < $1M last year; not part of larger entity).
- [ ] **§2** Enroll in Apple Small Business Program → wait 24-48h for activation.
- [ ] **§5** After SBP activation, create Subscription Group "Acuity Pro" + product `com.heelerdigital.acuity.pro.monthly` at $12.99/mo. Verify 15% commission shown before saving.
- [ ] **§6** Take review screenshot (after Phase 3 paywall ships).
- [ ] **§7** Paste IAP product review notes (text in §7 above).
- [ ] **§8** Create sandbox tester account.

### Claude Code can do (codebase side):

- [x] Phase 4 (already shipped this sweep): User schema columns + entitlement-source helpers + tests + backfill SQL doc.
- [ ] Phase 2 (next workstream): receipt-verification endpoint + App Store Server Notifications V2 webhook wiring.
- [ ] Phase 3 (next workstream): StoreKit 2 client + paywall UI on iOS.
- [ ] Phase 5 (next workstream): conflict-policy UI ("you already have an active sub via X").
- [ ] Phase 6 (next workstream): manage-subscription routing (iOS users → Settings → Subscriptions; web users → Stripe portal).

### Both must coordinate:

- [ ] **DO NOT submit v1.1 build for review until SBP shows "Enrolled".** Submitting at 30% rate is hard to undo.
- [ ] **DO NOT enable IAP in production until receipt-verification (Phase 2) is shipping receipts to the right webhook**. Otherwise users pay Apple but `User.subscriptionStatus` doesn't flip — Apple sees the receipt, our DB doesn't.

---

## §12 — Risks + open questions

| # | Risk / question | Mitigation |
|---|-----------------|------------|
| 1 | SBP enrollment delays beyond 48h, blocking submission | Start SBP enrollment NOW (parallel to Phase 2/3 development). The 24-48h is the Apple SLA; in practice almost always <24h on weekdays. |
| 2 | Apple rejects v1.1 build because IAP product is `Missing Metadata` | Phase 6 ensures the screenshot is uploaded BEFORE submission. The IAP product status must be `Ready to Submit` when the build review opens. |
| 3 | A user has an active Apple sub AND somehow also subscribes via Stripe | Phase 5 conflict UI prevents this on the entry points; receipt verification (Phase 2) blocks the rare race-condition double-charge by reading `subscriptionStatus` before allowing the new purchase to flip the state. |
| 4 | Sandbox subscription compression (5-min renewal) skews testing intuition | Documented in §8. Devs need to know 5-min ≠ production behavior. |
| 5 | Apple changes SBP rules mid-year | Apple has not retroactively re-rated. If they change the eligibility ceiling, we re-attest; we don't owe back commission. |
| 6 | A user with an active Apple sub deletes the iOS app | Apple-side sub continues; web-side `subscriptionStatus` stays PRO until receipt expires. Receipt-verification webhook (Phase 2) handles `DID_FAIL_TO_RENEW` notifications. |
| 7 | Family Sharing of Acuity Pro requested by users | Off at launch. Add when v1.2 if user demand. |

---

## §13 — API Keys + Webhook URL (Phase 2)

Phase 2 (`/api/iap/verify-receipt` + `/api/iap/notifications`) is shipped. Before either endpoint can do real work, **Jim must create the App Store Connect API Key + register the webhook URL**. Both are Apple-side actions, both happen AFTER SBP shows Enrolled.

### §13.1 Create the App Store Connect API Key

The key is what our backend uses to authenticate to Apple's `/inApps/v1/transactions/{id}` API. Without it, `/api/iap/verify-receipt` returns 502 `APPLE_AUTH_FAILED` on every call (intentional fail-closed).

1. Sign in to https://appstoreconnect.apple.com → **Users and Access** → **Integrations** tab → **App Store Server API** in the left sidebar (NOT the App Store Connect API tab — that's a different API).
2. Click **+** to generate a new key.
3. Form:
   - **Name:** `Acuity Backend — In-App Purchase` (or any internal name; not user-facing).
   - **Access:** **In-App Purchase** (this scope is required; "Customer Service" alone is insufficient).
4. Click **Generate**. Apple shows the **Key ID** (10-char string) and **Issuer ID** (UUID) on the resulting page. **Copy both**.
5. Click the **Download API Key** button. The `.p8` file is delivered ONCE — Apple does not let you re-download. Save it somewhere durable.
6. The downloaded file will look like:
   ```
   -----BEGIN PRIVATE KEY-----
   MIGT...
   -----END PRIVATE KEY-----
   ```

### §13.2 Env vars to add

Add these three to **both** `apps/web/.env.local` (Jim's local dev) AND Vercel (production + preview):

| Var | Value | Where to find it |
|-----|-------|------------------|
| `APPLE_IAP_KEY_ID` | The 10-char Key ID from §13.1 step 4 | App Store Connect → Users and Access → Integrations → key row |
| `APPLE_IAP_ISSUER_ID` | The UUID from §13.1 step 4 (e.g. `57246542-96fe-1a63-e053-0824d011072a`) | Same page header |
| `APPLE_IAP_PRIVATE_KEY` | Full PEM contents of the `.p8` file (BEGIN/END markers + body) | The downloaded `.p8` |

For Vercel, paste the PEM contents into the value field — Vercel preserves newlines correctly. Do NOT base64-wrap or escape; the `jose` library expects the raw PEM.

### §13.3 Register the webhook URL for App Store Server Notifications V2

Apple POSTs subscription lifecycle events (`DID_RENEW`, `EXPIRED`, `REFUND`, etc.) to a URL we register per-app. The webhook URL is `https://www.getacuity.io/api/iap/notifications`.

1. App Store Connect → **My Apps → Acuity** → **App Information** (left sidebar).
2. Scroll to **App Store Server Notifications**. There are **two URL fields** (production + sandbox).
3. **Production URL:** `https://www.getacuity.io/api/iap/notifications`. **Version:** select `V2`.
4. **Sandbox URL:** same — `https://www.getacuity.io/api/iap/notifications`. The endpoint reads `data.environment` from the inbound payload to distinguish, so we don't need a separate URL.
5. Click **Save** at the top right.

Apple sends a test notification (`TEST` type) immediately after save — that's a good way to verify the env vars + URL are correct. The test notification logs to Vercel as `iap.notifications.log-only` with `reason="unhandled notification type: TEST"` (since TEST isn't in our switch).

### §13.4 Sandbox vs production routing in our code

The endpoints handle both environments transparently:

- `/api/iap/verify-receipt`: when calling Apple's `/inApps/v1/transactions/{id}`, we try **production first**, fall back to **sandbox** on 404. This matches Apple's recommended pattern for apps that don't always know their own environment (TestFlight builds use sandbox; App Store builds use production).
- `/api/iap/notifications`: Apple's notification payload includes `data.environment` ("Sandbox" | "Production"). We persist this verbatim to `User.appleEnvironment` so support tickets can quickly identify TestFlight-side issues.

### §13.5 Pre-launch readiness checklist

Before submitting v1.1 for review:

- [ ] SBP shows "Enrolled" in Agreements, Tax, and Banking.
- [ ] Subscription product `com.heelerdigital.acuity.pro.monthly` shows "Ready to Submit" in App Store Connect.
- [ ] All three env vars configured in Vercel **production** AND **preview** environments.
- [ ] Notification webhook URL registered, Version V2, both prod + sandbox slots filled.
- [ ] Test notification arrived (visible in `IapNotificationLog` table OR Vercel runtime logs as `iap.notifications.log-only` for type=TEST).
- [ ] Sandbox tester account created (§8) and signed into a TestFlight build.
- [ ] Phase 3 mobile StoreKit client ships at the same time as the build that exercises this path. Without Phase 3, the endpoints exist but nothing calls them.

If any item is missing, the v1.1 build will pass App Review but iOS purchases will silently fail (Apple takes payment; our DB doesn't flip; user sees Pro UI gated off). **Don't submit v1.1 to ship IAP without all six checkmarks.**

### §13.6 Two new endpoints (Phase 2 reference)

| Method + Path | Auth | Purpose | Notes |
|---|---|---|---|
| `POST /api/iap/verify-receipt` | NextAuth session OR mobile bearer JWT | Verify a fresh StoreKit purchase, flip User to PRO + apple | Idempotent on re-verify; 409 on cross-source / cross-user conflict |
| `POST /api/iap/notifications` | Apple-signed JWS (no session — Apple calls us) | React to renewal/expiration/refund lifecycle events | Idempotent via `IapNotificationLog.notificationUUID @unique`; status-guarded so Stripe-source rows never mutate |

Both are `runtime: nodejs` (need `node:crypto` for X.509 chain validation).

---

## §14 — Cross-references

- Web pricing source: `apps/web/src/app/upgrade/upgrade-plan-picker.tsx`
- Phase 4 schema: `prisma/schema.prisma` (User.subscriptionSource + appleOriginalTransactionId etc., shipped in this same sweep)
- Phase 4 helpers: `apps/web/src/lib/entitlements.ts` (`isAppleSubscription`, `isStripeSubscription`)
- Apple SBP overview: https://developer.apple.com/app-store/small-business-program/
- App Store Connect IAP guide: https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/
- Existing v1.0 review notes (multiplatform-service framing): `docs/APP_STORE_REVIEW_NOTES.md`
- v1.1 review notes addendum: `docs/v1-1/app-review-notes-v1-1.md` (will need a follow-up addendum once IAP ships, to disclose the dual-source model)
