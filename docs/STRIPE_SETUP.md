# Stripe Setup — Acuity

**Status:** Runbook for one-time Stripe configuration. Reference when setting up a new Stripe environment (initial production launch, new sandbox, recovery from a dashboard misconfig).

**Last verified:** 2026-04-24

**Companion docs:**
- `docs/APP_STORE_METADATA.md` §5 — why we don't use Apple IAP (Multiplatform Services guideline)
- `docs/APPLE_IAP_DECISION.md` — full cost analysis, monthly vs yearly pricing, Option C rationale
- `PROGRESS.md` commit `9c55993` — pricing lock at $12.99/mo + $99/yr + env var rename from `STRIPE_PRO_PRICE_ID` to `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY`

---

## 1. Public details — what users see on the Checkout page

**Stripe Dashboard → Settings → Public details**

| Field | Value | Why |
|---|---|---|
| Public business name | **Acuity** | What the user sees as the merchant name at the top of the Checkout page AND in Stripe-sent emails (receipts, payment failures, etc.). Without this override, Stripe shows the legal entity name (e.g. `HEELER DIGITAL LLC JAMES CUNNINGHAM MBR`) — accurate but terrible for trust on a wellness-adjacent purchase. |
| Statement descriptor | **`ACUITY`** | What shows on the customer's credit-card statement. Max 22 characters, alphanumeric + spaces only. Must be recognizable enough that a user doesn't dispute the charge as unknown. |
| Shortened descriptor | **`Acuity`** | Prefix for dynamic descriptors (e.g. `Acuity Pro Monthly`). Keep it under 10 chars. |
| Support email | **`support@getacuity.io`** | Stripe puts this in receipt emails + shows it on failed-payment UI. Must be monitored — Stripe's own compliance team will test it. |
| Support phone | *(blank or a real number)* | Optional; if provided, Stripe shows it to buyers. Leave blank unless there's a staffed line. |
| Support URL | **`https://www.getacuity.io/support`** | Linked from receipt emails. The `/support` route is public and reachable. Don't point this at `/account` — unauthenticated users won't be able to load it. |
| Website | **`https://www.getacuity.io`** | Stripe displays this on Checkout. Required for some account verification steps. |

**Banned values** (previously observed on the account, must not return):
- `HEELER DIGITAL LLC JAMES CUNNINGHAM MBR % JAMES CUNNINGHAM MBR` — this is the raw IRS / Delaware registered agent string. Never visible to users.
- Any variant with "LLC" in the Public business name — users see the consumer brand, not the holding entity.

**Regression guard:** `/api/stripe/checkout` doesn't send a `payment_intent_data.description` or a custom Checkout branding object — Stripe falls back to the account-level settings. So every knob above has to be configured in the dashboard; no code can override.

---

## 2. Branding — logo + colors

**Stripe Dashboard → Settings → Branding**

| Field | Value |
|---|---|
| Logo | Upload `apps/web/public/AcuityLogo.png` (40×40 or larger square PNG — Stripe auto-resizes). |
| Icon | Same file. Stripe uses this as a favicon on the Checkout page. |
| Brand color | `#7C3AED` (matches the product's primary purple). Hex, no leading #. |
| Accent color | `#1E1B4B` (deep indigo — matches sentiment-neutral gradient in Theme Map). Optional. |

---

## 3. Products + prices

**Stripe Dashboard → Products**

One product, two prices. Match the env vars exactly.

| Product name | `Acuity Pro` |
|---|---|
| Product description | `Acuity Pro — weekly reports, Life Audit, Theme Map, State of Me.` |
| Statement descriptor override | *(blank — inherits from account-level)* |
| Tax behavior | `inclusive` if prices quoted tax-inclusive; `exclusive` if Stripe Tax should add VAT/GST on top. Default: `exclusive`. |

Create two Prices on that product:

| Price | Amount | Interval | Currency | Env var to paste the resulting `price_xxx` into |
|---|---|---|---|---|
| Monthly | **$12.99** | `monthly` | USD | `STRIPE_PRICE_MONTHLY` |
| Yearly | **$99** | `yearly` | USD | `STRIPE_PRICE_YEARLY` |

**Do not create prices in test mode and copy IDs to production env vars.** The mode of the price ID has to match the mode of `STRIPE_SECRET_KEY` — test-mode price IDs fail against live-mode secret keys with `StripeInvalidRequestError: No such price`.

When you archive an old price (e.g. rotating from a retired $9.99 → new $12.99), **archive, don't delete**. Archived prices stay referenceable for existing subscriptions and historical invoices; deleted prices break those. Any old price ID currently referenced by the removed `STRIPE_PRO_PRICE_ID` env var should be archived, not left active — an orphaned active price is confusing to read in the dashboard.

---

## 4. Webhooks

**Stripe Dashboard → Developers → Webhooks → Add endpoint**

| Field | Value |
|---|---|
| Endpoint URL | **`https://www.getacuity.io/api/stripe/webhook`** |
| Description | `Production — subscription lifecycle + payment status` |
| API version | Match `apiVersion` in `apps/web/src/lib/stripe.ts` (currently `2024-06-20`). |
| Events to send | See list below. |

**Do NOT use `/api/webhooks/stripe` (plural webhooks, stripe-last order).** The route handler is at `apps/web/src/app/api/stripe/webhook/route.ts`, which Next.js exposes at `/api/stripe/webhook` (singular). The plural-order variant returns 404 and silently drops every webhook.

### Events to subscribe to

```
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_succeeded
invoice.payment_failed
```

The first five are load-bearing for `User.subscriptionStatus` transitions. `invoice.payment_failed` triggers the PAST_DUE → recovery email flow.

### Webhook signing secret

After creating the endpoint, Stripe shows a `whsec_xxx` signing secret. Copy it into Vercel env as `STRIPE_WEBHOOK_SECRET` (Production scope at minimum). If preview deploys also need to receive webhooks (unusual; usually preview uses test-mode keys with a separate webhook), add it to Preview scope with the test-mode endpoint's secret.

### Verifying the webhook is connected

After save, Stripe lets you send a test webhook from the endpoint detail page.
```
Stripe Dashboard → Webhooks → [your endpoint] → Send test webhook →
choose `customer.subscription.updated` → Send test webhook
```
Expected: HTTP 200. Anything else (400, 404, 500) means one of:
- **404** — URL is wrong (most likely: `/api/webhooks/stripe` instead of `/api/stripe/webhook`)
- **400 `Missing signature`** — Stripe is POSTing without signing; this shouldn't happen for a real event, but it's what a plain curl POST returns
- **400 `Webhook verification failed`** — `STRIPE_WEBHOOK_SECRET` env var is wrong or missing
- **500** — something else is throwing; check Vercel function logs

---

## 5. Environment variables — Vercel Production

All Stripe env vars required for production checkout + webhook processing:

| Env var | Source | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys → Secret key (live mode) | Starts with `sk_live_` in production; `sk_test_` in staging/preview. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Same page → Publishable key | Starts with `pk_live_` / `pk_test_`. Used client-side for Stripe.js if we ever embed a payment form directly (not used today — Checkout is server-redirect). |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → [your endpoint] → Signing secret | Starts with `whsec_`. One per endpoint — do not share between test + live webhooks. |
| `STRIPE_PRICE_MONTHLY` | Price ID from §3 above (monthly) | `price_xxx`. |
| `STRIPE_PRICE_YEARLY` | Price ID from §3 above (yearly) | `price_xxx`. |
| `NEXTAUTH_URL` | `https://www.getacuity.io` | Used by the checkout route to construct `success_url` and `cancel_url`. Do NOT trail with a slash — concatenation is `${NEXTAUTH_URL}/account?...`. |

**Env var naming history:** The old single-interval name `STRIPE_PRO_PRICE_ID` was retired in commit `9c55993` (2026-04-22). If Vercel production still has that name configured, `/api/stripe/checkout` will throw `StripeInvalidRequestError: No such price` — because the route reads `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY` and the old name is ignored. Remove `STRIPE_PRO_PRICE_ID`; add the two new names.

---

## 6. Account activation (live payments)

**Stripe Dashboard → Settings → Business settings → Activate account**

Before switching `STRIPE_SECRET_KEY` from `sk_test_` to `sk_live_`, the Stripe account must be fully activated. Stripe requires:

- Business name + legal entity type
- EIN / Tax ID
- Business address
- Owner / representative personal info (SSN last-4 or full SSN for KYC)
- Bank account (ACH routing + account number) for payouts
- Website URL (must be live + match Public details URL above)

Activation typically takes **2–10 business days** for manual review; sometimes instant if the risk profile is low. Until activated, `sk_live_` keys exist but Checkout Session creation returns `StripeAccountError: Your Stripe account is not yet active for live payments.`

**Do not switch production to live keys until activation completes.** The test-mode fallback works indefinitely for QA; flipping too early breaks every real user's checkout.

---

## 7. Tax (optional, recommended for US + EU)

**Stripe Dashboard → Products → Tax**

Stripe Tax auto-calculates VAT / GST / US state sales tax at Checkout. Requires:
- Your business's tax registrations entered in the dashboard (e.g. California CDTFA seller permit if you have economic nexus there)
- Either setting Price objects as `tax_behavior: exclusive` (tax added on top) or `inclusive` (tax rolled in)
- A small per-transaction fee (0.5% on automated, free for US-only manual)

**For v1 launch we are NOT enabling Stripe Tax.** Rationale: Acuity is a digital service, the initial launch is US + EN-speaking markets (see `docs/APP_STORE_PRICING.md` §5), and under most thresholds we're not obligated to collect sales tax yet. Revisit when MRR passes the economic nexus threshold in any state (~$100k/yr typically) OR when we launch in an EU country (immediate VAT obligation).

---

## 8. Pre-launch checklist

Before flipping the account from test to live:

- [ ] Public details (§1) — all six fields set as specified
- [ ] Branding (§2) — logo uploaded, brand color set
- [ ] Products + prices (§3) — `Acuity Pro` with Monthly $12.99 + Yearly $99 prices created IN LIVE MODE
- [ ] Webhook (§4) — endpoint created at `/api/stripe/webhook` (singular), 6 events subscribed, signing secret copied
- [ ] Vercel env vars (§5) — all six set in Production scope, `STRIPE_PRO_PRICE_ID` removed
- [ ] Account activation (§6) — status shows "Active for live payments" on Stripe Dashboard → Home
- [ ] Test transaction — run one live Checkout with a real card ($0.50 test product, refund after), confirm:
  - Merchant name on Checkout reads "Acuity"
  - Receipt email from Stripe has "Acuity" in the subject + support email matches
  - Webhook fires + `User.subscriptionStatus` transitions to `PRO` in Supabase within ~30s
  - Post-checkout redirect lands on `/account?upgrade=success&session_id=...` with the subscription card highlighted

---

## 9. Troubleshooting

### Checkout returns 500 with body `{ "error": "Pricing misconfigured" }`

The route caught `resolvePriceId()` throwing — `STRIPE_PRICE_MONTHLY` or `STRIPE_PRICE_YEARLY` env var is undefined in Vercel. Fix: add the missing var.

### Checkout returns 500 with no body (generic Next.js 500)

`stripe.checkout.sessions.create()` threw and wasn't caught. Most common causes:
- Price ID in env var points at an archived or test-mode price (while secret key is live)
- `NEXTAUTH_URL` missing → `success_url` = `undefined/account?...` which Stripe rejects
- Account not activated for live payments

Check Vercel function logs OR Sentry for the Stripe error message. From 2026-04-24 onward the route captures these explicitly with Sentry tags `stage: stripe.checkout.create` — search there first.

### Merchant name on Checkout still shows the LLC name after updating Public details

Stripe caches the merchant display for a few minutes. Clear the Stripe session in your browser (incognito works) OR wait 5 min and retry. If still wrong after 10 min, check that the "Public business name" field saved (some browsers silently fail the form if third-party cookies are blocked).

### Webhook returns 404 in Stripe Dashboard's delivery log

URL mismatch. The route lives at `/api/stripe/webhook` (singular webhook, stripe-first). Stripe may have been configured at `/api/webhooks/stripe` (plural webhooks, stripe-last) — fix the endpoint URL in the dashboard.

### Webhook returns 400 `Webhook verification failed`

`STRIPE_WEBHOOK_SECRET` in Vercel doesn't match the signing secret from the Stripe endpoint's dashboard page. Rotate: copy the `whsec_...` value from Stripe → paste into Vercel env → redeploy (env changes don't hot-reload).

### User completes Checkout but `User.subscriptionStatus` stays `TRIAL`

Webhook didn't fire OR fired but dispatcher didn't handle the event type. Check `StripeEvent` table for a row matching the `evt_xxx` id from the Stripe webhook delivery log. Missing row = webhook didn't land (see above). Row present but status didn't update = dispatcher bug or the event type isn't in our handler set.

### User completes Checkout and subscription activates correctly, but lands on `/home` not `/account`

The `success_url` in `apps/web/src/app/api/stripe/checkout/route.ts` is wrong. Should be `${NEXTAUTH_URL}/account?upgrade=success&session_id={CHECKOUT_SESSION_ID}`. If `/home` is what you see, someone reverted the URL — blame git, fix the route.

---

*Update this doc when Stripe config changes. Each knob in Stripe Dashboard that this project depends on must be documented here — silent UI changes in Stripe Dashboard that aren't in code aren't discoverable any other way.*
