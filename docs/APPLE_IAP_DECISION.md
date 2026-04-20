# Apple IAP Strategy — Decision Matrix

**Author:** Claude (Opus 4.7)
**Date:** 2026-04-20
**Decision owner:** Jim
**Blocks:** TestFlight submission. `app.json` + EAS work is queued behind this.

---

## TL;DR

**Three viable paths.** I recommend **Option C: free iOS app that opens web for paid actions**, stepping up to full RevenueCat only after web subscription data shows mobile-captured conversions are a meaningful share of total.

Cost-of-implementation ranking (least → most):

| Option | Build | Ongoing ops | Apple cut |
|---|---|---|---|
| B — Log-in only | ~0.5 day | low | 0 |
| C — Free app + web upgrade link | ~1 day | low | 0 |
| A — RevenueCat + IAP | ~5-7 days | moderate | 15–30% |

Why C beats B: B blocks iOS users from subscribing at all (they'd need to open a desktop browser, log in, and subscribe on web). That's a hostile UX. C keeps the web-subscribe path but makes it one tap from the iOS profile screen — which is already how the current mobile app works (per the 2026-04-18 decision to wire `?src=mobile_profile` into the `/upgrade` button). C is effectively "polish what's already there and make sure it passes review." A is the full native-IAP treatment; it's inevitable eventually, but only after there's evidence the cost is worth it.

---

## 1. Context

- Acuity has a 14-day trial → $12.99/mo or $19/mo (unresolved, per `PROGRESS.md` *Open Decisions*) paywall on web, billed by Stripe.
- Mobile is a companion experience: users sign in on mobile but the same `subscriptionStatus` on their `User` row drives whether they can record.
- Users will land on the iOS app in at least three realistic states:
  1. **Web-subscribed, open iOS app.** Already PRO. Shouldn't be asked to subscribe again.
  2. **Trialing, open iOS app.** Can record fine during trial. Will face the paywall at day 14.
  3. **Post-trial free, open iOS app.** Hit the paywall on mobile. Where do they go?

- App Store Review Guideline 3.1.1 (In-App Purchase) is the constraint: apps that unlock features or content on iOS via subscription *generally* must use Apple's IAP for those subscriptions. Apple takes 15% for the first year per subscriber, 30% thereafter (or 15% flat under Small Business Program — anyone with < $1M/yr in App Store revenue, which we qualify for).
- **3.1.3(a) "Reader Apps" carve-out:** apps whose primary function is reading/consuming content (magazines, newspapers, books, audio, video, access to professional databases, VoIP, cloud storage) CAN direct users to an external subscription flow without using IAP — BUT only if they also don't include any "buy" button or external-purchase language in the iOS app. Reader apps get a sign-in-only UX plus a one-off external-link entitlement request filed with Apple.
- **3.1.3(b) "Multiplatform Services":** if the subscription is sold on web for use across platforms (Acuity fits this — web + iOS), the iOS app can sign in users who subscribed elsewhere without offering IAP, provided the iOS app doesn't push users toward the external purchase. This is what MOST SaaS iOS apps do (Notion, Linear, Slack, 1Password).

Key interpretation for Acuity: we're a SaaS product with a web-sold subscription. 3.1.3(b) applies. We do NOT need to implement IAP as long as the iOS app does not include "buy now" / "subscribe" language or a button that leads to an external purchase. Users can sign in on iOS and use whatever entitlement their account already carries from web.

**However**, Apple's enforcement is inconsistent. They've rejected SaaS apps for showing an "Upgrade" button on the profile screen even when that button just deep-links to the web (which is exactly what our mobile does today). Conservative path: make the iOS app so obviously a sign-in-only surface that there's nothing for a reviewer to object to. Aggressive path: keep the deep-link-to-web upgrade button and hope the reviewer doesn't flag it (they did flag Spotify, Epic, and Basecamp for this in past cycles). Post-2022 the "link to external purchase" rules have loosened — there's now a formal `StoreKit External Purchase Link Entitlement` that apps can apply for — but the approval process is an additional Apple review.

---

## 2. Option A — RevenueCat + Apple IAP (full native subscriptions)

**What it is:** iOS users subscribe via Apple's IAP sheet. RevenueCat is the third-party SaaS that abstracts Apple's StoreKit + Google Play Billing + web subscriptions under one SDK and API. We'd keep the Stripe web checkout and add RevenueCat/StoreKit for iOS, syncing both via server webhooks into a single `subscriptionStatus` on the `User` row.

### Implementation cost

**~5–7 days of Claude Code work**, broken down:

1. **Apple developer account setup** (1 day, partly Jim) — Apple Developer Program enrollment (~$99/yr), App Store Connect app record, signing certs, IAP product configuration (create a `pro_monthly` subscription product, price it in $1 tier — Apple's pricing matrix is fixed at specific tiers), screenshots + metadata, submit for App Privacy review of the IAP product.
2. **RevenueCat account + config** (0.5 day) — sign up, configure the Apple Shared Secret + App Store Connect API key, define the `pro` entitlement, connect the product.
3. **Mobile SDK integration** (1 day) — install `react-native-purchases`, initialize on app start with the user's ID as the RevenueCat `appUserID`, wire the paywall modal to offer the subscription, handle purchase success / cancellation / failure states.
4. **Backend entitlement sync** (1–1.5 days) — RevenueCat sends webhooks on purchase / renewal / cancellation / refund to our server. Need a new `/api/revenuecat/webhook` route, signed event verification, logic to map RevenueCat events → `User.subscriptionStatus` transitions (similar shape to the Stripe webhook we already have). Handle the "user subscribed on web, then opens iOS" case — RevenueCat can unify identities if we use the same `appUserID` across platforms.
5. **Cross-platform identity** (1 day) — need to prevent double-charging: a user who subscribes on web shouldn't be shown the iOS IAP paywall (nor vice versa). RevenueCat's solution is `logIn(userId)` before `getOfferings()`; we check `customerInfo.entitlements.active.pro` before offering purchase. Test matrix: web-subscribed-iOS-app, iOS-subscribed-web-app, both-subscribed-same-user, subscribed-then-canceled-then-resubscribed-different-platform.
6. **Restore purchases flow** (0.5 day) — required by Apple. A "Restore Purchases" button somewhere in the app (typically settings/profile) that calls `Purchases.restorePurchases()`. Required even if users haven't switched devices — Apple reviewers test this.
7. **Refund handling** (0.5 day) — Apple handles refunds itself (user goes to reportaproblem.apple.com). We receive a `REFUND` webhook from RevenueCat and need to downgrade `subscriptionStatus`. Different from Stripe's refund flow where we handle refunds ourselves.

### Ongoing cost

- **Apple's cut:** 15% under Small Business Program (under $1M ARR), 30% once you cross. Stripe's web-sold subs are 2.9% + $0.30 for comparison.
- **RevenueCat:** Free tier is generous — first $10K/mo of tracked revenue is free. Above that, 1% of monthly tracked revenue (separate from Apple's cut). A $10K-MRR business pays RevenueCat $0; $25K-MRR pays ~$150/mo.
- **Maintenance tax:** Apple changes StoreKit APIs every major iOS release; RevenueCat shields most of this, but periodic SDK upgrades still need testing. Apple's IAP sandbox is notoriously flaky — expect to debug "transactions not flowing through" a few times a year.

### UX impact

**Best-in-class mobile UX.** iOS users tap "Upgrade" → Apple's native subscription sheet appears → Face ID confirms → subscription is instant. No redirect to browser, no re-login, no context switch. This is the UX pattern iOS users expect and it converts at 2-3x the rate of web-checkout redirects (industry benchmark from RevenueCat + Appcues data).

### Risk of App Store rejection if we don't implement IAP

**Moderate to high**, depending on how aggressive the iOS app's upgrade-pathing is.

- If the iOS app has a visible "Upgrade" / "Subscribe" / "Go Pro" button that opens an external URL → **likely rejection** under 3.1.1 unless we file for the StoreKit External Purchase Link Entitlement (a separate Apple review process, not guaranteed).
- If the iOS app has no visible upgrade pathing at all (pure log-in → use → paywall-as-silent-wall with a message like "Your subscription has expired, visit getacuity.io to renew") → **low rejection risk** under 3.1.3(b), similar to how Netflix works.

The 2026-04-18 decision to keep a web-upgrade redirect in the mobile profile screen puts us in the "moderate risk" bucket. Survivable if the reviewer is lenient; rejection if they're strict.

### Technical complexity

**Meaningful.** RevenueCat + Apple IAP requires:
- Webhook signature verification on our server (separate from Stripe's).
- A reconciliation job to detect drift between Apple's ground-truth and our `subscriptionStatus` (recommended weekly cron).
- Testing against Apple's sandbox StoreKit environment, which is a separate test Apple ID and a separate subscription tier that Apple-resets every ~7 days.
- Handling `ios_family_sharing` (user A buys, user B in their iCloud family gets access).
- Handling the "user restores purchases after reinstalling the app" flow.

### Summary

Best mobile conversion, highest build cost, adds a second billing system to operate. Right answer **once we have evidence that mobile-captured subscriptions are a meaningful share of total.** Too early today — we have no mobile-attributed conversions to measure against.

---

## 3. Option B — Log-in-only iOS companion (no subscriptions on mobile at all)

**What it is:** iOS app is a read-only / record-only surface. No subscription flow inside the app — no "Upgrade" button, no pricing shown, no external link pushing users to upgrade. Users who hit the paywall on mobile see a message like "Your subscription expired. To continue, visit getacuity.io from a browser." That's it.

### Implementation cost

**~0.5 day of work:** remove the upgrade button from `apps/mobile/app/(tabs)/profile.tsx`. Replace with a read-only "Subscription: Active / Expired" label. On paywall 402 responses from the server (from record / weekly / lifemap / life-audit), show a native Alert that says "Continue at getacuity.io" without offering a "Continue" button that does anything (no `Linking.openURL` call).

### Ongoing cost

**Zero.** No Apple cut, no RevenueCat fees, no mobile-side billing complexity.

### UX impact

**Hostile.** An iOS user whose trial just expired has to:
1. Pick up a different device (or quit the app, open Safari on the same iPhone).
2. Navigate to getacuity.io.
3. Sign in (again).
4. Click Upgrade.
5. Complete Stripe checkout.
6. Come back to the iOS app.
7. Foreground refresh to see the new subscription state.

Conversion rate is essentially whatever we get from the email campaign and the PostHog-tracked upgrade-page-viewed funnel. Most users who get stuck at step 2 or 3 never complete.

### Risk of App Store rejection

**Low** under 3.1.3(b). This is how a lot of enterprise SaaS iOS apps work (Linear, Notion, etc.). Apple's guidance explicitly allows the app to tell the user their subscription can be managed elsewhere, as long as the app doesn't *push* them there via a button or in-app purchase flow.

### Technical complexity

**Near-zero.** Remove code, don't add any.

### Summary

Compliant and cheap to build, but kills mobile conversion. Only defensible if mobile is truly companion-only (users who sign up via web, already have the habit, and only use iOS for the nightly-recording ritual). Early on that's probably fine; once mobile is a real acquisition surface it's a serious problem.

---

## 4. Option C — Free iOS app that opens web for paid actions (the middle path)

**What it is:** iOS app has no in-app purchase surface whatsoever. When a user needs to subscribe — because they hit a 402 or because they tap Upgrade in settings — the app opens Safari (not an in-app browser) to `https://getacuity.io/upgrade?src=mobile_profile`. They complete checkout there. When they return to the iOS app, it foreground-refreshes `subscriptionStatus` and unlocks features.

This is already roughly where the mobile app is per the 2026-04-18 decision ("keep the web redirect for the paywall PR; IAP remains a separate unresolved decision"). Polish it, make it obviously-compliant, and ship.

### Implementation cost

**~1 day total**, broken down:

1. **Audit current profile screen Upgrade button** (0.5 day). The button exists per `apps/mobile/app/(tabs)/profile.tsx:100-112` per `AUDIT.md`. Right now it opens `/upgrade` in the system browser. Need to verify it:
   - Opens Safari (not a WebView / in-app browser — Apple allows Safari because it's an external browser).
   - Doesn't include any "subscribe" / "buy" / "pricing" / "$" text in the button copy. Change button label from "Upgrade" to "Manage on web" or "Account settings" to avoid 3.1.1 scrutiny.
2. **Foreground-refresh hook on app resume** (0.5 day). When the user returns from Safari, the subscription state may have changed. Re-fetch `GET /api/user/me` (create this endpoint if it doesn't exist — simple auth + `select: { subscriptionStatus, trialEndsAt }`). Trigger on `AppState.addEventListener("change", (state) => state === "active" && refreshUser())`. Update local Zustand / context / auth-cache state so the paywall walls drop if the user just subscribed.
3. **Test App Store Connect submission copy** (0.25 day, Jim's workload). When submitting, make sure the App Store description doesn't mention pricing or subscription features — describe Acuity as a journaling tool, not a subscription service. The reviewer sees the description alongside the app.

### Ongoing cost

**Same as Option B — zero.** No Apple cut, no RevenueCat fees.

### UX impact

**Meaningfully better than B, meaningfully worse than A.**

The foreground-refresh pattern is the key piece: the user opens Safari, subscribes in ~15 seconds, switches back to the iOS app with cmd-tab equivalent, and the app already knows they're PRO. The worst part — re-entering subscription state — is reduced from "manually force-quit the app" to "just switch back."

Compare to Option A: about 3x the steps from first tap to unlocked-state. But the native app never asks the user to type anything (they're already authed in Safari via their logged-in session or sign-in cookie), so the actual friction is close.

### Risk of App Store rejection

**Low-to-moderate**, specifically depending on the Upgrade button copy:

- "Upgrade" / "Subscribe" / "Go Pro" → flagged likely.
- "Account" / "Manage on web" / "Your plan" → fine.

Also: do not mention specific prices ($12.99/mo) in the iOS app. That's an explicit 3.1.1 violation. Pricing lives on the web upgrade page only.

### Technical complexity

**Low.** Modify an existing button + add a foreground-refresh hook. Use existing web infrastructure for checkout.

### Summary

**This is the strongest default.** Cheap to build, compliant if done carefully, and preserves a functional (if not native-class) upgrade path for iOS users. Upgrade to Option A when mobile-attributed conversions prove meaningful — which we can measure via PostHog's `subscription_started` event with `source: "mobile_profile"` (already wired in the Stripe webhook per `IMPLEMENTATION_PLAN_PAYWALL.md §8.3`).

---

## 5. Recommendation

**Ship Option C for TestFlight and the initial App Store submission. Revisit Option A once PostHog attribution shows `source: "mobile_profile"` is driving material revenue.**

Concrete criteria for when to upgrade C → A:
- > 15% of `subscription_started` events have `source: "mobile_profile"` over a 30-day window, AND
- Mobile-sourced conversions have at least a 20% drop-off between "upgrade page viewed on mobile via Safari" and "subscription_started" (indicating users are losing conversions in the cross-device hop) — Option A would recover those by collapsing the flow into a native IAP sheet.

Without both criteria, Option A's 5–7 days of build + 15–30% revenue tax doesn't pay back. With both, it does.

### Implementation sequence for C

1. **Before any code:**
   - Jim decides price ($12.99 vs $19 — needs to happen before App Store Connect copy anyway).
   - Enroll in Apple Developer Program if not already ($99/yr).
2. **Claude Code work (estimated 1 day):**
   - Audit the existing upgrade button in `apps/mobile/app/(tabs)/profile.tsx` — change copy to "Account" or "Manage plan", keep the Safari redirect.
   - Build `GET /api/user/me` endpoint returning `{ subscriptionStatus, trialEndsAt }` (auth-gated; this is a thin wrapper).
   - Wire `AppState` foreground listener in `apps/mobile/app/_layout.tsx` or the auth context to re-fetch `/api/user/me` on `active` transitions.
   - Make sure `402` handling on mobile (from the Inngest polling PR) uses "Continue on web" copy rather than "Subscribe now" — verify `apps/mobile/app/(tabs)/index.tsx` 402 branch.
3. **Jim's work (separate):**
   - Fill out App Store Connect metadata. Description should focus on journaling as a practice — "Nightly voice journal. Extracts tasks and insights. Tracks patterns across your life." — **no** pricing, no "subscribe", no "premium." Save the mention of subscription tiers for the web marketing page only.
   - Submit for TestFlight review. If the reviewer flags 3.1.1, respond with "This app relies on a web-based subscription managed outside the App Store. Per guideline 3.1.3(b), users sign in with an existing account and we do not offer in-app purchases." That's the canonical response.

---

## 6. Edge cases to think through regardless of option

1. **Family sharing on iOS.** With Option A, if the subscriber is the iCloud family's "Organizer", their purchased sub can potentially be shared with up to 5 family members. Need to decide whether each family member maps to its own Acuity account or shares one (the latter is almost certainly not what we want — audit and journal content isn't shared family data). RevenueCat handles this via `isFamilyShareSubscription` on the CustomerInfo object; we'd need to decide whether to accept family-shared entitlements or treat them as separate purchases.

2. **Sandbox vs production Apple environments.** With Option A, TestFlight users are using Apple sandbox subscriptions that auto-renew every ~5 minutes in real time. Easy to test, but the webhook flow is distinct from production — sandbox receipts come from a different signing chain and Apple sandbox often delivers webhooks slowly or not at all. Plan for receipt-polling as a fallback to webhook-based sync.

3. **Chargeback / refund timing.** With Option A, Apple controls refunds — a user can refund 90 days out. With Stripe (Options B + C), we control refunds. Different revenue-recognition accounting.

4. **TestFlight reviewers vs App Store reviewers.** Different teams, different standards. TestFlight is looser. If you pass TestFlight with Option C, that doesn't guarantee App Store approval.

5. **App Privacy questionnaire (`app.json` / App Store Connect).** Per `IMPLEMENTATION_PLAN_PAYWALL.md §8.2 / §10.4`, we need to declare PostHog's data collection. With Option A, also declare Apple IAP data collection (handled automatically by Apple's IAP fields in the questionnaire).

---

*Jim to make the call. I recommend C for now, A when mobile attribution data supports it. No code changes in this doc.*
