# Admin Subscription Management — Layer 2 spec

**Date:** 2026-06-30 · **Status:** Plan (no code) · **Owner:** Jimmy
**Goal:** a permanent admin UI capability to cancel + refund a customer's subscription from `/admin`, so we never run the one-shot script (`scripts/cancel-customer-subscription.ts`, Layer 1) again.
**Ships as:** its own PR, after Layer 1.

---

## What it is
A **"Cancel subscription"** action on the user detail drawer in the `/admin` **Users** tab. Same flow as the Layer 1 script — inspect → confirm → refund → cancel → reconcile DB → audit — but triggered from the admin UI, server-side, admin-authenticated, and logged.

## Surfaces & files
- **UI:** `apps/web/src/app/admin/tabs/UsersTab.tsx` — add a **Subscription** block to the user detail drawer:
  - Shows current `subscriptionStatus`, `subscriptionSource`, sub id, period end.
  - **"Cancel subscription"** button — shown only when `subscriptionSource === "stripe"` AND `stripeSubscriptionId` is present. For `apple`/`google_play`, show a disabled note ("Managed by App Store / Play — cancel must happen in the store"). For no sub, hide it.
- **Server route:** `apps/web/src/app/api/admin/users/[id]/cancel-subscription/route.ts`
  - **`GET` (preview)** — read-only: returns the Stripe subscription state + the refundable charges (id, amount, refunded, created) + totals, for the confirmation modal.
  - **`POST` (execute)** — runs refunds + cancel + DB reconcile + audit write. Idempotent (only refunds un-refunded amounts; tolerates an already-canceled sub).
- **Shared logic (DRY):** extract the core flow from the Layer 1 script into `apps/web/src/lib/billing/cancel-and-refund.ts`:
  - `previewCancel(stripe, { customerId, subscriptionId })` → `{ subscription, charges, refundableCents, totalCollectedCents }`
  - `executeCancelAndRefund(stripe, prisma, { userId, customerId, subscriptionId })` → `{ refunds, canceledStatus, dbVia }`
  - **Refactor Layer 1 to import these** so the script and the admin route share one implementation (one place to fix bugs).

## Auth
- Admin-only — reuse the existing `/api/admin/*` guard (`getServerSession` + `isAdmin`, the same one `Users` tab routes use). Resolve the **acting admin's userId** from the session for the audit record. Rate-limit the POST (`enforceUserRateLimit`).

## Stripe key
- In **production** `STRIPE_SECRET_KEY` (Vercel env) is the **live** key, so the route uses the existing `@/lib/stripe`. No special env handling needed (unlike Layer 1, which forces `STRIPE_SECRET_KEY_LIVE` because the local `.env.local` key is test). Locally it operates on test mode — fine for dev.

## Audit — `AdminAuditLog` (already exists)
On every execute, write:
```
AdminAuditLog.create({
  adminUserId,                 // acting admin
  action: "cancel_subscription",
  targetUserId: user.id,
  metadata: {
    subscriptionId, canceledStatus,
    refunds: [{ chargeId, refundId, amountCents }],
    totalRefundedCents, totalCollectedCents, dbVia, // "webhook" | "manual"
  },
})
```

## UX flow
1. Admin opens the user drawer → **Cancel subscription**.
2. Modal opens, fetches **GET** preview → shows: "Refund **$X.XX** across **N** charges. Cancel **sub_…** immediately." with the itemized charge list.
3. **Typed confirmation** (defense-in-depth for a money action) — admin types the customer's email (mirrors the delete-account modal) to enable the confirm button.
4. Confirm → **POST** → spinner → inline **success** (refund ids + new status) or **failure** (error) in the drawer; refresh the user row.

## Edge cases
- Store subs (`apple`/`google_play`): blocked in UI + server (`not_applicable`).
- Already-canceled sub: cancel is a no-op/handled; still refunds outstanding charges.
- DB reconcile: after cancel, the prod `customer.subscription.deleted` webhook usually clears `stripeSubscriptionId` + sets `FREE`; the route waits briefly then **manually clears** if not (same fallback as Layer 1).
- Partial prior refunds: refund only the remaining un-refunded amount per charge.

## Complexity
**M (~1 day):** shared-lib extraction (refactor from Layer 1) + GET/POST route + admin auth + audit write + drawer UI + confirmation modal. No schema change (`AdminAuditLog` exists). Separate PR after Layer 1.

## Open questions
- Typed-email confirmation vs a plain "are you sure" — recommend typed (money + irreversible).
- Should we capture a **cancel reason** here (feeds the self-serve-cancellation retention data)? Cheap to add a free-text field to the modal + audit metadata.
- Surface a read-only **"recent admin subscription actions"** view from `AdminAuditLog` (nice-to-have, later).
