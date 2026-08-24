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
   `apps/web/src/inngest/functions/stripe-webhook-health.ts`, with the
   judgement in `apps/web/src/lib/stripe-webhook-health.ts`. It alerts the
   cofounders (Slack + email) only when **Stripe itself confirms a failure**.
   See the follow-up below — the original 24h-quiet rule was replaced on
   2026-08-24 after it proved to be a pure false-alarm generator.
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

---

## Follow-up: the monitor was crying wolf (2026-08-24)

**The prevention added on 2026-06-12 was itself a bug.** It alerted whenever
no `StripeEvent` had been processed in 24h, treating silence as evidence of a
broken pipe. That inference only holds for an app with daily subscription
activity. Ripple has ~15 Stripe subscribers, so multi-day silence is the
normal, healthy state.

### Evidence (live account `acct_1TPqQjD9XJakJqj5`, 90 days to 2026-08-24)

| Measure | Value |
|---|---|
| `StripeEvent` quiet gaps > 24h | **13** |
| Quiet gaps > 48h | 2 |
| Quiet gaps > 72h | **0** |
| Longest quiet gap | **53.5h** (2026-08-13 04:56 → 2026-08-15 10:23) |
| Approx. alert emails the 24h rule would have sent | **~28** (×2 recipients) |

At the moment of the fix the ledger's last event was 2026-08-23 01:00Z —
**35.8h earlier** — so the cron was mid-false-alarm while the pipe was
demonstrably up: endpoint `we_1TPqdBD9XJakJqj5dgHvjrbX` `enabled` at
`https://goripple.io/api/stripe/webhook`, recent invoices carrying
`webhooks_delivered_at`, and the latest renewal PAID.

An alert that is wrong 28 times out of 28 gets filtered, and then the next
real outage is as invisible as the 2026-04-24 one was. This was a live
regression in our ability to detect the very incident above.

### What the check does now

Quiet is no longer evidence of anything. Every alert requires Stripe-side
confirmation:

1. **Endpoint config** — `webhookEndpoints.list()`: missing, not `enabled`,
   or pointing anywhere other than the apex URL. This is the exact
   2026-06-12 failure and it is directly observable.
2. **Delivery failure** — `events.list({ delivery_success: false })`: events
   Stripe has failed to deliver or is still retrying past a 60-minute grace
   window. `delivery_success` is account-wide, so an event already in our
   ledger is excluded — that failure belongs to another destination.
3. **Ingestion gap** — events Stripe recorded that never reached
   `StripeEvent`. Catches what a delivery-side check cannot: signature
   mismatch, a handler that 200s after crashing, a failed ledger write.
4. **Quiet + confirmed activity** (retained time-based fallback) — nothing
   ingested in **>72h** AND Stripe reports events in that window. 72h sits
   above the 53.5h observed maximum; over the same 90-day sample it would
   have fired **zero** times.

**Quiet with Stripe also reporting nothing is a HEALTHY result.**

A Stripe *read* failure (revoked key, API outage) is logged via `safeLog` →
Sentry and does **not** email. Inferring an outage from an unreadable Stripe
is the same mistake in a new costume; an unreadable Stripe is an ops problem,
not a billing incident.

### Gotchas worth keeping

- The subscribed event types are read from the live endpoint's
  `enabled_events`, not a hard-coded list, so adding a type in the dashboard
  cannot leave the gap check blind to it. The constant is a fallback only.
- `events.list` retains 30 days; the check only looks back 72h, well inside.
- `delivery_success` is absent from the newest API versions but is supported
  by the pinned `apiVersion: "2024-06-20"` in `lib/stripe.ts`. If that pin is
  ever bumped, re-verify this parameter first.
