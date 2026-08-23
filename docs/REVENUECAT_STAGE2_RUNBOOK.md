# RevenueCat Stage 2 — cutover runbook

Stage 1 is **done and merged dark**: the RC code is on `main`, every flag is
off, and `activeSourceName()` returns `"db"`. Nothing in this document has
happened yet.

Everything here is a **dashboard or environment action**. None of it can be
done from the repo — it needs Apple, Google, Stripe, RevenueCat and Vercel
credentials that deliberately do not live in code.

> **The one rule that matters:** the RC cutover and the price rise are two
> separate events. Flipping them together means a billing incident has two
> candidate causes and no clean rollback. Do not compress the order at the
> end of this document, however safe it looks on the day.

---

## 0. Preconditions

- [ ] Stage 1 merged to `main` (schema reconciliation + RC dark)
- [ ] `npm run db:push` run **from main** — the guard should say
      *"Schema and database agree"*. If it proposes anything, stop.
- [ ] Confirm current subscriber count so grandfathering can be verified
      afterwards (was 17 at the time of writing)

---

## 1. Create products — $9.99 / $89.99

The tier is already defined in `packages/shared/src/pricing-plans.ts` as
`V2_TIER`. Product **ids** there are placeholders until these exist.

### Apple — App Store Connect
Create **new** auto-renewable subscriptions in the existing group. Do **not**
edit the price of the current products.

| Product ID | Price | Duration |
|---|---|---|
| `com.heelerdigital.acuity.pro.monthly.v2` | $9.99 | 1 month |
| `com.heelerdigital.acuity.pro.annual.v2` | $89.99 | 1 year |

> **Why new products rather than a price edit:** Apple product IDs are
> immutable, and editing an existing product's price prompts every current
> subscriber to consent — declining cancels them. New products are what makes
> grandfathering automatic on iOS: existing subscribers stay on the product
> they bought.

Set the annual product's **free trial introductory offer to 7 days**. Trials
are annual-only (spec §4 Screen 6).

### Google — Play Console
| Product ID | Base plan | Price |
|---|---|---|
| `acuity_pro_monthly_v2` | monthly autorenewing | $9.99 |
| `acuity_pro_annual_v2` | annual autorenewing | $89.99 |

### Stripe
Create two **Prices** on the existing Product (do not create a new Product,
or reporting splits):

| Price | Interval |
|---|---|
| $9.99 | month |
| $89.99 | year |

Record both `price_...` ids — they become `STRIPE_PRICE_MONTHLY_V2` /
`STRIPE_PRICE_YEARLY_V2`, and fill the `stripe: null` TODOs in
`pricing-plans.ts`.

> Existing subscriptions reference their own Price object and are never
> re-read from config, so pointing new checkouts at a new Price cannot touch
> them. That is already the architecture — nothing needs building for it.

### RevenueCat — products, entitlement, offerings
1. Import all four store products (Apple ×2, Google ×2) plus the two Stripe
   prices.
2. Entitlement **`pro`** (`RC_ENTITLEMENT_PRO`) — attach **all** products,
   legacy and v2. One entitlement, many products: that is what lets a
   grandfathered subscriber and a new subscriber both resolve as entitled.
3. Offerings (`RC_OFFERINGS`):
   - **`default`** → the v2 products, packages `$rc_monthly` / `$rc_annual`
   - **`grandfathered`** → the legacy $4.99 / $39.99 products

---

## 2. Environment variables — Vercel

Set in **Production**, then redeploy (env changes do not take effect until
one).

| Variable | Value | Notes |
|---|---|---|
| `RC_PUBLIC_KEY_STRIPE` | RC **public** app key (Stripe app) | see warning |
| `RC_PUBLIC_KEY_IOS` | RC **public** app key (iOS app) | fallback for reads |
| `RC_SECRET_KEY` | `sk_...` | server-only endpoints |
| `RC_WEBHOOK_AUTH` | shared secret | must match the RC dashboard webhook header |
| `RC_PROJECT_ID` | RC project id | some v2 endpoints |

> ⚠️ **`GET /v1/subscribers` needs the PUBLIC key, not `sk_`.**
> RC classes it as client-facing alongside `POST /receipts`, `/attributes`,
> `/attribution` and `GET /offerings`. Sending the secret key returns HTTP
> 400 / code **7243** ("Secret API keys should not be used in your app").
> This was discovered when a receipt import hit 7243 on all 12 rows, and the
> same mistake was latent in the read path — it would have surfaced only at
> cutover, on live traffic. The code already uses `publicReadKey`; these two
> variables are what make that work.

Also set, when the Stripe prices exist:
`STRIPE_PRICE_MONTHLY_V2`, `STRIPE_PRICE_YEARLY_V2`.

Point the RC dashboard webhook at `POST /api/revenuecat/webhook` with the
`RC_WEBHOOK_AUTH` header. Delivery is deduped on the `RevenueCatEvent` table
(now on main), so redeliveries are safe.

---

## 3. Flag order — four separate events

Each step is its own deploy and its own soak. **Never combine two.**

### 3.1 `RC_OBSERVER=1`
SDK configures in observer mode. RC watches purchases; **the app still reads
the DB**. Purchases continue to flow through the existing StoreKit/Stripe
paths.

*Watch:* transactions appearing in the RC dashboard. **Soak: a few days**,
long enough to see real purchases and at least one renewal.

*Rollback:* unset. Nothing depended on it.

### 3.2 `RC_SOURCE_OF_TRUTH=1` ← the real cutover
`activeSourceName()` starts returning `"revenuecat"`. Entitlement reads come
from RC, with a DB fallback on any failure.

*Watch:* the **`fellBack`** field on every resolution, logged as
`entitlements.rc-source-fellback`. **A rising fallback rate is the rollback
signal** — it means RC reads are failing and every user is being served by
the safety net.

Also watch `entitlements.app-trial-overlay`. Ripple's trial takes no payment
method, so RC has no record of a trialing user; the resolver unions RC's paid
state with the app's trial clock. Without that overlay this flag would revoke
access from everyone mid-trial. Seeing the overlay fire is **correct**.

*Verify before soaking:* one grandfathered subscriber still resolves PRO, one
trialing user still has access, one free user still does not.

*Rollback:* unset the flag. Instant, and the DB was never stale.

### 3.3 `newPricingEnabled` — the pricing event, deliberately separate
New checkouts resolve V2 ($9.99 / $89.99). Existing subscribers resolve
`LEGACY_TIER` via `pricingTierFor()` and keep their current Price object.

> **Blocking prerequisite:** the displayed price on web is a hardcoded
> constant — `MONTHLY_PRICE_CENTS` / `ANNUAL_PRICE_CENTS` in
> `apps/web/src/lib/pricing.ts` — and the app never reads Stripe's live
> price. There are ~35 hardcoded price occurrences across web and mobile,
> including the terms page and two iOS fallback strings
> (`MONTHLY_FALLBACK_PRICE` / `ANNUAL_FALLBACK_PRICE` in `subscribe.tsx`).
>
> **Those must be made tier-derived BEFORE this flag flips**, or the paywall
> shows $4.99 while Stripe charges $9.99. That is the single worst failure
> available in this whole sequence.

### ⚠️ Flip day — set BOTH web variables, then redeploy

`NEW_PRICING_ENABLED` **and** `NEXT_PUBLIC_NEW_PRICING_ENABLED` must both be
set in Vercel Production.

`components/landing.tsx` is a **client** component. Client bundles cannot
read a non-public env var — Next inlines only `NEXT_PUBLIC_*`, at build
time. Set just the server variable and the landing page keeps advertising
the old price while every server-rendered page shows the new one. That is
precisely the "page quotes a different number than the card is charged"
failure this whole prerequisite exists to prevent, except self-inflicted on
flip day.

Inlining happens at **build**, so setting the variables is not enough on its
own — **redeploy**. Mobile is the same shape: `EXPO_PUBLIC_NEW_PRICING` is
baked in by Metro, so mobile needs a NEW BUILD and cannot be flipped OTA.
Plan for web and mobile to change price at different times, and prefer web
first — an app quoting a stale price in the store is harder to fix quickly.

**Pre-flip display work is DONE** (PRs #41 and the pre-flip cleanup). Every
user-facing price, the annual savings badge, and the Meta Pixel
`value`/`predicted_ltv` all resolve from the active tier. The therapy
testimonial's price clause is removed, and terms carries "Existing
subscribers keep their current rate." Nothing on that list remains.

**`cutoverAt` needs a real value.** `pricingTierFor()` grandfathers on
`paidSince < cutoverAt`. It is currently `null`, which grandfathers every
prior payer — safe, but someone subscribing *during* the flip has no
deterministic tier. Pick the timestamp before flipping.

*Rollback:* unset. New checkouts revert to legacy prices; anyone who bought
at v2 keeps what they bought.

### 3.4 `RC_SDK_PURCHASES=1` — last
Purchases route through RC's SDK instead of direct StoreKit.

> `configureRevenueCat()` logs a loud warning if this is on while
> `RC_SOURCE_OF_TRUTH` is off — that combination takes a purchase RC owns
> while the app still reads the DB, so the user pays and stays locked out.
> The order above avoids it; the warning is the backstop.

---

## 4. Post-cutover verification

- [ ] A grandfathered subscriber still resolves PRO and is still billed the
      legacy amount in Stripe
- [ ] A new checkout charges $9.99 / $89.99 and the paywall *displays* that
- [ ] A trialing user retains access (the overlay is doing its job)
- [ ] `fellBack` rate is at or near zero
- [ ] Webhook events are landing and deduping in `RevenueCatEvent`
- [ ] Restore Purchases works on a reinstall

## 5. If something goes wrong

Unset the **most recent** flag first and redeploy. Every step is independently
reversible **in the order given** — which is the entire reason for not
combining them. The DB remains authoritative and current throughout, so
falling back to it is never a data-loss event.
