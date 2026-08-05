# Fix B — Apple/Google IAP linkage hardening (spec, not yet implemented)

**Status:** proposed — needs the next mobile build. Do NOT implement without a build cycle.
**Author:** Claude Code (2026-08-05), from the emily101infante incident investigation.
**Related shipped fix:** Fix A (`fix(billing): stop Stripe events clobbering IAP-source PRO`) — server-only, already live. Fix B is independent and additive.

## Problem

Promotion of an Apple/Google IAP purchase to `subscriptionStatus = PRO` depends **entirely** on the mobile client successfully calling `POST /api/iap/verify-receipt`. There is **no server-authoritative fallback**. If that call fails — network drop, the July `getacuity.io → 301 → 405` host outage, a transient Apple 502, app killed before the call — the user is stranded FREE **even though Apple keeps sending SUBSCRIBED + DID_RENEW notifications**.

The App Store Server Notifications (ASSN) webhook cannot rescue these users today because:

1. **`SUBSCRIBED` is `log-only`** in `decideNotificationAction` — the initial purchase notification never promotes.
2. **The webhook matches users only by `appleOriginalTransactionId`**, and that column is written **only** by `verify-receipt`. So a purchase that never linked can never be matched by any later notification (DID_RENEW etc.) → `targetUser = null` → `ignore`.
3. **Purchases carry no `appAccountToken`** (verified null on all production notifications), so Apple's payloads contain **no identifier for our user** — the webhook has nothing to link on.

Net: a chicken-and-egg — the notification that could link the user is ignored because the user isn't linked yet.

## Fix (three parts)

### 1. Mobile: attach `appAccountToken` on every StoreKit purchase
- StoreKit 2: `Product.purchase(options: [.appAccountToken(uuid)])`. `appAccountToken` **must be a UUID**; our `userId` is a cuid, so:
  - Add `User.iapAccountToken String? @unique` (a v4 UUID), generated lazily server-side and returned to the app (e.g. on `/api/user/me` or a dedicated `/api/iap/account-token`).
  - The app passes that UUID as `appAccountToken` at purchase time.
- Apple then echoes it in `signedTransactionInfo.appAccountToken` on SUBSCRIBED / DID_RENEW / etc.
- **Cannot be back-filled** for existing transactions (emily's, etc.) — appAccountToken is set at purchase. Existing stranded users still need `verify-receipt` or a manual fix; this prevents *future* strandings.

### 2. Server: make the ASSN webhook a real promotion fallback
In `apps/web/src/app/api/iap/notifications/route.ts` + `decideNotificationAction`:
- Treat **`SUBSCRIBED` and `DID_RENEW` as promotion events** (→ set PRO), not log-only for SUBSCRIBED.
- When lookup by `appleOriginalTransactionId` returns no user, **fall back to `appAccountToken`**: decode `signedTransactionInfo.appAccountToken`, look up `User.iapAccountToken`.
- On a promotion where the row wasn't previously linked, **write the linkage** (`appleOriginalTransactionId`, `appleProductId`, `appleEnvironment`, `appleLatestReceiptInfo`, `subscriptionSource = "apple"`, `subscriptionStatus = "PRO"`, `trialEndsAt = null`) — same shape as `verify-receipt`'s write branch, so subsequent notifications match by `appleOriginalTransactionId` too.
- Keep the existing idempotency tombstone (`IapNotificationLog`) and the `skip-stripe-source` guard.

### 3. Client: harden `verify-receipt` so the primary path rarely fails
- Retry with backoff on network / 502 (`APPLE_AUTH_FAILED`, `APPLE_HTTP_ERROR`).
- Persist the pending transaction locally and re-attempt on next app launch until Apple's `Transaction.updates` / `currentEntitlements` confirms it's been acknowledged server-side.
- Surface a non-blocking "restoring your subscription…" state instead of a hard paywall error.

## Test coverage to add
- ASSN `SUBSCRIBED` with a matching `iapAccountToken` and **no** prior `appleOriginalTransactionId` → user promoted to PRO + linkage written.
- ASSN `DID_RENEW` for an unlinked user resolvable only by `appAccountToken` → promoted.
- Idempotency: replaying the same notification does not double-write.
- `skip-stripe-source` still holds (an Apple notification must not touch a Stripe-source row).

## Notes / decisions
- **Google Play parity:** the RTDN webhook (`/api/iap/google/webhook`) has the same single-path dependency on `verify-receipt`; apply the equivalent `obfuscatedExternalAccountId` (Play's analogue of `appAccountToken`) linkage.
- Fix A already stops the *reverse* clobber (Stripe demoting IAP PRO); Fix B stops the *initial-link* failure. They are complementary and both needed for reliable IAP entitlement.
