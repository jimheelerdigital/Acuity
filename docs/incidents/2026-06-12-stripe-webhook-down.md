# Incident: Stripe webhook silently down ~7 weeks (subscription state stale)

- **Severity:** P0 (revenue/billing integrity)
- **Detected:** 2026-06-12, while investigating 2 users reported as PRO in our
  DB despite failed Stripe payments.
- **Duration:** ~2026-04-24 → 2026-06-12 (~49 days).
- **Status:** Resolved (endpoint repointed + re-enabled, affected rows
  reconciled, monitoring added).
- **Customer comms:** None sent (see Impact — 2 real customers, ~1 day of
  unpaid Pro access each; healing on its own via Stripe Smart Retries).

## Summary

The Stripe webhook endpoint (`/api/stripe/webhook`) was **disabled by Stripe**
after its configured URL began returning redirects. For ~7 weeks, **no Stripe
subscription lifecycle events were processed** — payment failures,
cancellations, renewals, and dunning never reached our DB. New signups still
got PRO (granted on the checkout-success path, independent of the webhook), so
the gap was invisible until a failed-payment user surfaced still marked PRO.

## Timeline

- **2026-04-24** — Last Stripe event recorded in `StripeEvent`
  (16 rows total, all this day). Webhook deliveries stop after this.
  Around this time the `www → apex` canonical redirect was enforced
  site-wide; the Stripe endpoint URL was `https://www.getacuity.io/...`.
- **2026-04-24 → 06-12** — Stripe attempts deliveries to the `www` URL, gets
  308 redirects (Stripe does not follow redirects on webhook delivery),
  records repeated failures, and **auto-disables the endpoint**. All
  `invoice.payment_failed` / `customer.subscription.updated` /
  `customer.subscription.deleted` events go unprocessed.
- **2026-06-12** — Two UK users (trial→paid conversions) reported as PRO in
  DB despite failed charges. Investigation found: Stripe says `past_due`, DB
  says `PRO`; `StripeEvent` empty since 04-24; endpoint `status: disabled`,
  URL `www.getacuity.io`. Root cause confirmed (POST to `www` URL → HTTP 308).
- **2026-06-12** — Endpoint repointed to apex + re-enabled; 13 stripe subs
  reconciled; monitoring cron added.

## Root cause

1. The Stripe webhook endpoint was configured with the **`www`** host:
   `https://www.getacuity.io/api/stripe/webhook`.
2. The site enforces a **`www → apex` 308 redirect** (canonical domain).
3. **Stripe does not follow redirects** for webhook delivery — a 308 counts as
   a failed delivery.
4. After sustained delivery failures, **Stripe auto-disabled the endpoint**.
   A disabled endpoint receives nothing, so the gap persisted silently.

Contributing factor: nothing alerted on the absence of events — a webhook
going quiet for 7 weeks produced no signal.

## Customer impact

Reconciled all 13 `subscriptionSource = 'stripe'` subs (DB vs live Stripe).
**10 were correct; 3 were stale:**

| User | DB (stale) | Stripe (truth) | Corrected to |
|---|---|---|---|
| l.connolly1988@gmail.com | PRO | past_due (insufficient funds) | PAST_DUE |
| kayleighxaviagray@gmail.com | PRO | past_due (insufficient funds) | PAST_DUE |
| jwcunningham525@gmail.com | PRO | canceled | FREE (internal/test account) |

Net real-customer impact: **2 customers** had Pro access for ~1 day without a
successful charge (both genuine insufficient-funds declines, not an app bug).
No customer was incorrectly *downgraded*. No mass mischarge. Both will resolve
via Stripe Smart Retries — to FREE if retries fail, back to PRO if they update
their card. **Decision: no outreach** (impact smaller than the noise of
surfacing it).

## Remediation (done)

1. **Repointed + re-enabled the endpoint** (`we_1TPqdBD9XJakJqj5dgHvjrbX`):
   URL `www.getacuity.io` → **`https://getacuity.io/api/stripe/webhook`**
   (apex, no redirect); `disabled` → `enabled`. Events now flow.
2. **Reconciled** the 3 stale rows to match Stripe (2 → PAST_DUE, 1 → FREE),
   with `updatedAt` stamped.

## Prevention

1. **Monitoring cron** (`stripe-webhook-health-check`, every 6h):
   `apps/web/src/inngest/functions/stripe-webhook-health.ts` alerts the
   cofounders (Slack + email) if no `StripeEvent` has been processed in >24h.
   A quiet webhook now surfaces within hours, not weeks.
2. **URL hygiene:** all third-party webhook/callback URLs must use the **apex**
   (`getacuity.io`), never `www` — the `www → apex` redirect breaks any
   integration that doesn't follow redirects (Stripe, Google Pub/Sub, etc.).
3. **Follow-up considerations:** add the same quiet-detection pattern for other
   critical webhooks (e.g., the new Google Play RTDN endpoint); consider a
   periodic Stripe-vs-DB reconciliation cron as defense-in-depth.

## Diagnostics reference (how it was confirmed)

- `StripeEvent`: 16 rows, newest `2026-04-24` (no events since).
- Stripe API: endpoint `status: disabled`, url `www…`; subs `past_due`;
  PaymentIntents `decline_code: insufficient_funds`, `next_action: null`
  (genuine NSF, **not** an SCA/3DS failure); cards GB, charged USD.
- `curl -X POST https://www.getacuity.io/api/stripe/webhook` → HTTP 308;
  apex → HTTP 400 (route healthy, rejecting unsigned test).
