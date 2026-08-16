# Self-serve cancellation — diagnosis + smallest-fix proposal

**Date:** 2026-06-30 · **Status:** Diagnosis (no code) · **Owner:** Jimmy
**Trigger:** 2 cancel-help emails in 48h — Beth Almeida ("couldn't find it") and Sian Humphrey ("found it, didn't trust it"). Sian's Stripe sub already had `cancel_at_period_end: true` — she *had* canceled but emailed anyway.

> Two distinct failure modes, so two distinct fixes:
> **Beth = discoverability** (can't find the cancel path). **Sian = clarity/confirmation** (canceled, but the app never confirmed it, so she didn't believe it).

---

## 1. Stripe Customer Portal "Cancel subscriptions" toggle — LIKELY ALREADY ON

Can't verify from code (no Stripe MCP; local key is `sk_test`). **But Sian's `cancel_at_period_end: true` is proof the portal's cancel action works** — she used it. So the toggle is almost certainly already enabled, and item 1 is **not** the root cause.

- **Verify anyway (5 min, Jim):** Stripe Dashboard → Settings → Billing → Customer portal → Allowed actions → confirm **"Cancel subscriptions"** is on (and note its mode: "at end of period" vs "immediately" — at-end matches our no-refund-on-self-cancel posture).

## 2. Customer-facing web flow — the real gaps are here

**Path to the portal (discoverability): OK-ish, one buried step.**
- `/account` → **"Manage subscription"** button → `POST /api/stripe/portal` → `billingPortal.sessions.create`. Gated on `hasStripeCustomer`. — `account-client.tsx:925-933`, `api/stripe/portal/route.ts:49-55`.
- The button label is **"Manage subscription," not "Cancel."** Cancel is one more click *inside* Stripe's portal home. That's the buried step for Beth.
- ⚠️ **Portal opens on the portal HOME, not the cancel screen** — `billingPortal.sessions.create` is called with **only `return_url`, no `flow_data`** (`portal/route.ts:50-53`). Stripe supports `flow_data: { type: "subscription_cancel", subscription: <subId> }` to land users *directly* on the cancel-confirmation screen.

**Return + confirmation (clarity): BROKEN — this is Sian's bug.**
- Return URL is `/account?portal=returned` (`portal/route.ts:47`) but **nothing on `/account` reads `?portal=returned`** (grep: zero hits). No toast, no banner, no re-fetch prompt on return.
- **`cancel_at_period_end` is tracked NOWHERE** in the app (grep: only my new Layer 2 files reference it). The `customer.subscription.updated` webhook maps a still-active-but-scheduled-to-cancel sub to plain `PRO` and stores no cancellation flag.
- Net effect: a user who schedules cancellation returns to `/account` and still sees **"Pro — active · Renews [date]"** (`account-client.tsx:629, 884-887`). The word **"Renews"** is actively wrong for them — it directly contradicts what they just did. That is exactly "I didn't trust it."

## 3. Mobile (Apple IAP + Stripe) — works, two rough edges

- **Apple:** "Manage in iOS Settings" row, gated `isPro && isAppleSub`, opens **`https://apps.apple.com/account/subscriptions`** — `profile.tsx:141-142, 260-266`. It's the **https universal link, not the `itms-apps://` scheme.** On iOS the https link *usually* redirects into the App Store app's subscriptions screen, but `itms-apps://apps.apple.com/account/subscriptions` is the guaranteed in-app jump (and we already use `itms-apps://` elsewhere — `UpdatePromptOverlay.tsx:26`). Cheap reliability win.
- **Stripe:** "Manage subscription" row → `openSubscriptionPortal()` → same `POST /api/stripe/portal` (no `flow_data`), gated `isPro && isStripeSub && hasStripeCustomer` — `profile.tsx:131, 269-282`, `lib/subscription.ts:29`.
- ⚠️ **Both rows are gated on `isPro`** — a **TRIAL** user (Beth/Sian's stage) does **not** see a Manage/Cancel row on mobile at all; only "Manage plan on web" may show. Trial users who want out pre-conversion have no mobile cancel affordance.
- Known dead-end (prior audit): the delete-modal "Cancel subscription instead" CTA calls the **Stripe-only** portal (`profile.tsx:438-444`) → Apple/Play users hit a "no subscription" alert.

## 4. Trial-ending email — the cancel-relevant one is Stripe-native

- Checkout sets **`subscription_data.trial_period_days`** and collects a card (`payment_method_types: ["card"]`) — `api/onboarding/create-checkout/route.ts:74-82`. So converting users have a **card on file**, and **Stripe sends its native `trial_will_end` email** (~3 days pre-end). That email's content/links live **only in Stripe Dashboard → Settings → Customer emails** — not in our repo. Stripe's template offers an "update payment method" link; it does **not** offer an arbitrary "Cancel subscription" link.
- Our **own** Resend trial emails (`emails/trial/trial-ending-day13.ts`) DO say *"Cancel anytime from the app"* (`:35`) — but it's **vague and has no link**, and per `email-enabled.ts:42` our `trial_ending` fires for **no-card-on-file** users only — i.e. **not** the converting users who actually get billed. So the people who need the cancel path (card on file) get the Stripe-native email, which has no cancel link.

---

## Smallest fix set — stops the next Beth/Sian email

Ranked by impact-per-effort. Items A+B together kill Sian's failure mode; C kills Beth's.

| # | Fix | Failure mode | Files | Effort |
|---|---|---|---|---|
| **A** | **Track + show cancellation state.** Store `cancel_at_period_end` (+ effective end) from `customer.subscription.updated`; on `/account` show **"Canceled — access until [date]. You won't be charged again."** instead of "Renews [date]." | Sian (clarity) | webhook handler, 1 schema col, `account-client.tsx` status/label | **M (~half day + `prisma db push`)** |
| **B** | **Confirm on return.** Read `?portal=returned` on `/account`, re-fetch status, show a one-line banner reflecting the new state. Pairs with A. | Sian (clarity) | `account-client.tsx` | **S (~1–2h)** |
| **C** | **Deep-link the portal to the cancel screen.** Add `flow_data: { type: "subscription_cancel", subscription: <subId> }` to `billingPortal.sessions.create` (fetch the active sub id first). "Manage subscription" now lands on the cancel-confirm screen. | Beth (discoverability) | `api/stripe/portal/route.ts` | **S (~1–2h)** |
| D | **Email cancel path.** Either (i) verify/adjust the Stripe-native trial-ending email in the Dashboard, or (ii) add a real "Keep or cancel" link (to `/account`) in our own near-end email — and make it fire for card-on-file users too. | Both | Stripe Dashboard and/or `emails/trial/*`, `email-enabled.ts` | S–M |
| E | **Mobile nits:** switch Apple manage URL to `itms-apps://…/account/subscriptions`; consider showing the Manage/Cancel row for TRIAL (not just PRO) Stripe/Apple users. | Both (mobile) | `profile.tsx` | S |

**Recommended order: A → B → C → D → E.** A+B are the highest-leverage because they fix the trust problem that makes users email *even after a successful cancel*; C is a one-line-ish portal change that makes the cancel action one click instead of two-plus.

⚠️ **HIGH RISK touchpoints** (need Jim's go/no-go — live API contracts / mobile-consumed shapes): A touches the Stripe webhook + a schema column + `subscriptionStatus`-adjacent display; E touches a live mobile screen. C/B are web-only and low-risk.

## Cross-references
- Webhook diagnosis (this session): payment-failure → `FREE` without clearing `stripeSubscriptionId`; `charge.refunded` unhandled; PAST_DUE skipped by design.
- Layer 1 script (`scripts/cancel-customer-subscription.ts`, PR #20) + Layer 2 admin UI (PR #21) are the *operator* side; this doc is the *customer* side.
