# Stripe Webhook Audit — 2026-05-03

**Scope:** end-to-end audit of the Stripe → User-row sync path.
**Source files:**
- `apps/web/src/app/api/stripe/webhook/route.ts` (the dispatcher)
- `apps/web/src/app/api/stripe/checkout/route.ts` (checkout session creator)
- `apps/web/src/app/api/stripe/portal/route.ts` (billing portal handoff)
- `apps/web/src/lib/entitlements.ts` (downstream consumer of `subscriptionStatus`)
- Schema: `User.stripeCustomerId` / `stripeSubscriptionId` / `stripeCurrentPeriodEnd` / `subscriptionStatus`; `StripeEvent.id` (idempotency tombstone).

**Posture:** diagnostic only — no fixes tonight.

---

## §1 — Event handlers we listen to

| Stripe event                       | Handler line | What it writes to User                                                                                    |
|-----------------------------------|--------------|------------------------------------------------------------------------------------------------------------|
| `checkout.session.completed`      | route.ts:71  | `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus = "PRO"`                                    |
| `invoice.payment_succeeded`       | route.ts:122 | `subscriptionStatus = "PRO"`, `stripeSubscriptionId` (if present), `stripeCurrentPeriodEnd` (if present)    |
| `invoice.payment_failed`          | route.ts:146 | `subscriptionStatus = "PAST_DUE"`; sends payment-failed email                                              |
| `customer.subscription.updated`   | route.ts:177 | `subscriptionStatus` mapped from sub.status; `stripeSubscriptionId`; `stripeCurrentPeriodEnd` (if present)  |
| `customer.subscription.deleted`   | route.ts:215 | `subscriptionStatus = "FREE"`, `stripeSubscriptionId = null`, `stripeCurrentPeriodEnd = null`              |
| (default)                          | route.ts:228 | no-op (acks 200, doesn't touch User)                                                                       |

**Stripe→app status mapping** (in `customer.subscription.updated`):

| Stripe `subscription.status`        | App `subscriptionStatus` |
|-------------------------------------|--------------------------|
| `active`                            | `PRO`                    |
| `trialing`                          | `PRO` (because Acuity uses its own `User.trialEndsAt` clock — Stripe's `trialing` only ever happens if someone manually creates a sub with trial_period_days, which we never do; if it shows up we treat the user as paid) |
| `past_due`                          | `PAST_DUE`               |
| `unpaid`                            | `PAST_DUE`               |
| `canceled`                          | `FREE`                   |
| `incomplete_expired`                | `FREE`                   |
| `incomplete`                        | **unmapped → no-op**     |
| `paused`                            | **unmapped → no-op**     |

**`User.trialEndsAt` is NOT touched by any handler.** This is intentional per `IMPLEMENTATION_PLAN_PAYWALL §1.5` — the trial clock is application-managed (`bootstrapNewUser` sets it on signup) and Stripe is never the source of truth for trial windows.

---

## §2 — Edge case walkthrough

### 2.1 User upgrades on web while trial is active (TRIAL → PRO)

**Flow:**
1. User taps "Upgrade" on `/upgrade` → `POST /api/stripe/checkout` → Stripe Checkout session created with `metadata.userId` set.
2. Stripe redirects user to checkout, they pay, Stripe redirects them back to `/account?upgrade=success`.
3. Stripe fires `checkout.session.completed` webhook (≤ a few seconds later).
4. Handler at route.ts:71 reads `session.metadata.userId`, updates User → `subscriptionStatus = "PRO"`, `stripeCustomerId`, `stripeSubscriptionId` set.
5. PostHog `subscription_started` event fires (best-effort, swallowed on failure at route.ts:107).
6. `recordReferralConversion(userId)` fires (best-effort, swallowed on failure at route.ts:117).

**Observations:**
- ✅ Idempotent: StripeEvent unique-id tombstone (route.ts:55) blocks reprocessing on Stripe retry.
- ✅ Single-source-of-truth on `User.trialEndsAt` is preserved — handler doesn't write it.
- ⚠️ `entitlementsFor` at status="PRO" returns full Pro permissions immediately. The user's pre-paid `trialEndsAt` becomes a vestigial column. That's fine in practice because `entitlementsFor` checks `status === "PRO"` BEFORE checking `trialEndsAt`. Confirmed at `entitlements.ts:109-111`.
- ❓ **Potential race:** the `/account?upgrade=success` redirect can render BEFORE the `checkout.session.completed` webhook arrives. The success page reads User state from the DB; if it's still `subscriptionStatus = "TRIAL"`, the "you're now Pro!" banner won't show. This is a known web-success-redirect race; Stripe's webhook is reliable but not synchronous with the redirect. Mitigation in current code: unknown — would need to grep `/account/page.tsx` for `?upgrade=success` polling logic. **Worth checking — see §4 follow-up #1.**

**Verdict:** clean.

### 2.2 User's payment fails mid-cycle (PRO → PAST_DUE)

**Flow:**
1. Stripe fails to charge the card on the renewal date.
2. `invoice.payment_failed` fires.
3. Handler at route.ts:146 looks up Users by `stripeCustomerId`, downgrades all matching to `PAST_DUE`.
4. Best-effort email via `sendPaymentFailedEmail`.

**Observations:**
- ✅ `entitlementsFor` at `subscriptionStatus = "PAST_DUE"` returns FULL ENTITLEMENT (active-side permissions). The user keeps access during the dunning window. This is the intended behavior per `entitlements.ts:115-118`.
- ✅ When Stripe's retry succeeds, `invoice.payment_succeeded` flips back to PRO.
- ⚠️ **Email-side-effect race:** the email send is inside a try/catch that warns on failure (route.ts:171-173). If Resend is down, the user gets downgraded silently — they only learn from the dashboard banner. Not a correctness issue but worth noting.
- ⚠️ `prisma.user.updateMany({ where: { stripeCustomerId } })` writes to potentially MULTIPLE users sharing the same Stripe customer. **In practice no two users ever share a `stripeCustomerId`** because we always pass `metadata.userId` on checkout creation, which produces a 1:1 mapping. But there's no DB constraint enforcing this — `stripeCustomerId` is `String?` with no `@unique`. **Worth surfacing — see §4 follow-up #2.**

**Verdict:** clean modulo the missing unique constraint.

### 2.3 User cancels (PRO → FREE post-trial)

**Flow:**
1. User opens billing portal (`/api/stripe/portal`) and cancels.
2. Stripe immediately fires `customer.subscription.updated` with `status = "canceled"` (if cancel-at-period-end → status is still `"active"` until period end, then `"canceled"`).
3. Handler at route.ts:177 maps `canceled → FREE`, then writes.
4. OR Stripe fires `customer.subscription.deleted` at end of grace period, hitting route.ts:215.

**Observations:**
- ⚠️ **Both events typically fire on a cancel.** First `customer.subscription.updated` with `cancel_at_period_end=true` (status="active", we re-write PRO — no-op effective). At period end: `customer.subscription.updated` with `status="canceled"` (we write FREE) AND `customer.subscription.deleted` (we write FREE again, also nulls `stripeSubscriptionId` + `stripeCurrentPeriodEnd`). Two writes, both end up at FREE — idempotent so safe, just wasteful.
- ✅ `stripeSubscriptionId` and `stripeCurrentPeriodEnd` are nulled only by `customer.subscription.deleted`, NOT by `customer.subscription.updated`. So between "cancellation effective" and "subscription truly deleted" there's a window where User has `subscriptionStatus = "FREE"` but stale `stripeSubscriptionId` + `stripeCurrentPeriodEnd`. This is a minor data-cleanliness issue — `entitlementsFor` doesn't read those fields, so no UX impact. But the FREE-side UI surfaces using `stripeCurrentPeriodEnd` (e.g. "Your Pro access ends on …") would render incorrectly during this window. Fortunately the FREE locked-state UI doesn't use that field.
- ⚠️ **`User.trialEndsAt` is preserved.** A canceler who originally had a 14-day trial still has `trialEndsAt` set to (signup + 14 days). When `entitlementsFor` runs on a `status = "FREE"` user, it falls through to the `isPostTrialFree: true` branch. Correct outcome. But it does mean: a canceler who's been Pro for 6 months, then cancels, has `trialEndsAt` 6 months in the past. That's fine; UX surfaces don't surface that field.

**Verdict:** clean. Some data-staleness in the cancel window but no behavioral leak.

### 2.4 User resubscribes after cancel (FREE → PRO)

**Flow:**
1. User on FREE post-trial visits `/upgrade`, clicks Subscribe → `POST /api/stripe/checkout` with their existing User row.
2. `checkout.ts:53` reads User → already has `stripeCustomerId` from prior subscription (we never null it on cancel — only `stripeSubscriptionId` is nulled).
3. Stripe Checkout opens with `customer: <existing_id>` instead of `customer_email` — so Stripe attaches the new sub to the SAME Stripe Customer record.
4. New checkout session fires `checkout.session.completed`.
5. Handler updates User → `subscriptionStatus = "PRO"`, new `stripeSubscriptionId`.

**Observations:**
- ✅ `stripeCustomerId` reuse is the right pattern — new subscription against same customer means Stripe's billing history stays unified.
- ⚠️ **No re-extraction backfill is automatically triggered.** A user who cancels, records 30 entries on FREE (themes/tasks/etc all locked), then resubscribes — does NOT automatically get those 30 entries re-extracted. The slice 5 backfill banner appears on `/home` ONLY when `entitlementsFor(user).canExtractEntries === true && !backfillPromptDismissedAt && !backfillStartedAt`. After resubscribe → canExtractEntries flips back to true → banner reappears (assuming user hasn't dismissed it before). If they dismissed it during their prior trial/Pro window, the prompt stays suppressed. Per slice 5 design (sticky dismissal). **Possibly worth re-evaluating — see §4 follow-up #3.**
- ⚠️ **`subscription_started` PostHog event fires again on the NEW checkout.** Same `daysSinceSignup` (calendar days since signup, regardless of subscription history) but `daysIntoTrial` will be a large positive number ("days since trial started" — for a re-subscriber this is likely 30+ days). The analytics surface this currently lumps re-subscribers into "post-trial conversions" which may skew funnel charts. Not a correctness bug.
- ⚠️ **No tracking of "this is a resubscribe."** A `stripeCustomerId !== null && previousSubscriptionStatus === "FREE"` condition would mark the difference. We don't compute that today.

**Verdict:** functional but lossy on analytics. Re-extraction-backfill behavior is intentional per spec but worth a product call.

### 2.5 Refund scenarios

**Flow:**
- User requests refund via portal or directly with us.
- Stripe issues refund → fires `charge.refunded` → **NOT HANDLED** (default case at route.ts:228 → no-op).
- If the refund is for the most recent invoice and Stripe additionally cancels the sub: `customer.subscription.updated` (status=canceled) follows → user → FREE.
- If the refund is invoice-only (sub stays active): no User row change.

**Observations:**
- ⚠️ **`charge.refunded` is unhandled.** Refunding the user does NOT alter their `subscriptionStatus`. If the refund is for the current period and the sub is also canceled by support, the cancellation handler does the right thing. If support refunds without canceling, the user keeps Pro access for the rest of the period — which may or may not be intended.
- ⚠️ **`invoice.refunded` (rarer) is also unhandled.** Same as above.
- ⚠️ **No `customer.subscription.paused`/`customer.subscription.resumed` handling.** Stripe added these events for the "pause subscription" feature. If we ever enable that in Stripe Dashboard → Settings → Billing, paused subs will go to status `paused` which we currently don't map (§1 table). Result: a paused sub gets treated as PRO indefinitely.
- ⚠️ **No `payment_method.attached` / `payment_method.detached` handling.** Stripe surfaces these for PCI logging. We don't need them today; noting for completeness.

**Verdict:** acceptable for v1.0/v1.1 — refunds are rare and manual. Worth a backlog ticket to handle `charge.refunded` if support volume warrants.

---

## §3 — Race conditions, idempotency gaps, unhandled events

### 3.1 Idempotency gaps

| Layer                                  | Idempotent? | Notes                                                                                 |
|----------------------------------------|-------------|---------------------------------------------------------------------------------------|
| StripeEvent.id tombstone (route.ts:55) | YES         | Catches re-deliveries at the dispatcher level. Throws P2002 → 200 ack, no reprocessing |
| `prisma.user.updateMany` writes        | YES         | Repeated writes of the same data are safe                                              |
| `recordReferralConversion`             | YES         | Function-level idempotency via unique constraint on `(referrerId, referredId)`         |
| `subscription_started` PostHog event   | NO          | Re-fires on retry. Not a correctness issue but skews count                              |
| `sendPaymentFailedEmail`               | NO          | Re-sends on Stripe webhook retry. **Real risk** — see §3.4                              |
| `recordReferralConversion` on duplicate event | YES (skipped at tombstone layer)        |                                                                            |

**Issue:** the StripeEvent write happens BEFORE the handler runs (route.ts:55). If the StripeEvent insert succeeds but the handler then throws partway through (e.g. payment-failed email Resend call hangs and Vercel kills the function), the event is marked processed but the User row may not have been updated. Stripe will not retry because we already 200'd (or we'd throw which would 500 → Stripe retries, which would then dedupe at the tombstone). Net: partial-state failure.

The current flow is "tombstone-first." A "tombstone-last" pattern (write StripeEvent only AFTER handler finishes) would lose deduplication safety on re-delivery in flight. The tombstone-first pattern is the right call but the partial-failure window is real.

**Mitigation today:** the handlers are short and Vercel's 60s timeout is plenty. None of the handlers do externally-blocking work that would realistically time out. So in practice we never see partial-state. But it's the kind of thing that would fail in a degraded-database scenario.

### 3.2 Race condition: `/account?upgrade=success` redirect vs webhook arrival

The user lands on `/account?upgrade=success` ~5 seconds after paying. The webhook handler may arrive 1-3 seconds after that. During that window, the user sees the dashboard but their User row still says `subscriptionStatus = "TRIAL"` (or whatever it was). Any "Pro now active!" banner has to either:
- Trust the URL param (`?upgrade=success`) and render unconditionally
- Poll the User row briefly

**Action:** check `apps/web/src/app/account/page.tsx` for how this is handled.

### 3.3 Race condition: simultaneous webhook + portal cancel

Less common but possible: a user cancels via portal while a `payment_failed` retry is happening. Stripe's event ordering can land:
- `invoice.payment_failed` → User → PAST_DUE
- (User cancels in portal in same minute)
- `customer.subscription.updated status=canceled` → User → FREE

End state: FREE. Correct. But a re-fired `payment_failed` (Stripe retry) AFTER the cancel would re-write PAST_DUE. That's wrong — a canceled user shouldn't be PAST_DUE.

**Mitigation today:** none. The handler doesn't check current state before writing. **Real edge case** — see §4 follow-up #4.

### 3.4 Email duplication on payment_failed retry

Stripe retries failed deliveries with exponential backoff. If our endpoint times out (say a Prisma query hangs for 60s), Stripe's retry will hit the SAME event id. Our tombstone catches and 200-acks the duplicate without re-running the handler. ✅

But if our endpoint succeeds but then crashes after the StripeEvent write but before email send, the email never goes. Worst case: silent payment-failed event with no user notification. The dashboard banner still surfaces, so the user isn't blind, but the proactive nudge is lost.

### 3.5 Unhandled events of interest

| Event                                           | Currently | Should we handle it?                                |
|-------------------------------------------------|-----------|------------------------------------------------------|
| `charge.refunded`                                | No-op     | Yes if refund volume rises. Today: manual.            |
| `invoice.refunded`                               | No-op     | Same as above.                                       |
| `customer.subscription.paused`                   | No-op     | Only if we enable subscription pause. Today: not enabled. |
| `customer.subscription.resumed`                  | No-op     | Same.                                                |
| `customer.subscription.trial_will_end`           | No-op     | Maybe — could trigger "trial ending in 3 days" email. Today: app-managed via `trial-email-orchestrator` Inngest. So no.        |
| `payment_method.attached/detached`               | No-op     | Not needed.                                          |
| `customer.deleted`                               | No-op     | Maybe — if Stripe customer is deleted, we should null `stripeCustomerId` on our User row. **Worth handling.** Today not seen. |
| `customer.updated`                               | No-op     | Not needed.                                          |
| `invoice.upcoming`                               | No-op     | Not needed.                                          |
| `invoice.finalized`                              | No-op     | Not needed.                                          |

---

## §4 — Triage / follow-ups

| # | Issue                                                                              | Severity | Category               | Estimate |
|---|-----------------------------------------------------------------------------------|----------|------------------------|----------|
| 1 | `/account?upgrade=success` race vs webhook arrival                                  | low      | Verify UX behavior       | 15 min   |
| 2 | `User.stripeCustomerId` lacks `@unique` — `updateMany` could fan out                | low      | Schema cleanup           | 30 min + db push |
| 3 | Re-subscriber → no automatic re-extraction backfill                                 | spec call | Product decision         | TBD      |
| 4 | Late `invoice.payment_failed` retry overwrites a canceled User → PAST_DUE           | medium   | Bug                      | 30 min — add status guard before write |
| 5 | `charge.refunded` unhandled — silent refund leaves user as PRO                      | low      | Add handler if vol rises | 30 min   |
| 6 | `customer.subscription.paused/resumed` unhandled — fine while feature is off        | low      | Track if we enable it    | n/a      |
| 7 | `customer.deleted` unhandled — orphaned `stripeCustomerId` on our row              | low      | Add null-out handler     | 15 min   |
| 8 | Tombstone-first race — partial-state on mid-handler crash                          | low      | Architectural; accept    | n/a      |
| 9 | `subscription_started` PostHog re-fires on retry — analytics noise                  | trivial  | Backlog                  | 15 min   |

**No findings rise to "fix this session."** §4.4 is the closest thing to a real bug; it's a narrow race that requires both a payment-failed AND a cancel-action in the same minute. Worth fixing but not blocking.

---

## §5 — Recommended backlog entries

Add to `docs/v1-1/backlog.md`:

1. **Stripe webhook: status-guard `payment_failed` handler.** Check `currentStatus !== "FREE"` before downgrading to PAST_DUE. Prevents resurrection of canceled users into the dunning window. (§4.4)

2. **Stripe webhook: handle `charge.refunded`.** When a refund lands and the sub is still active, decide policy: end the period immediately or honor through paid-through-date. Currently no-op. (§4.5)

3. **Stripe webhook: handle `customer.deleted`.** Null out `User.stripeCustomerId` so the next checkout creates a fresh customer. (§4.7)

4. **`User.stripeCustomerId` @unique constraint.** Defensive: add `@unique` so `updateMany` can never accidentally fan out. Requires `prisma db push` from home. (§4.2)

5. **`/account?upgrade=success` polling/refresh.** Verify the UX is correct during the webhook-arrival window; if not, add a 5-second refresh-on-mount or trust the URL param to render the success state. (§4.1)

---

## §6 — One-line summary

The Stripe webhook is well-built. Idempotency works at the StripeEvent tombstone layer. The mapping from Stripe statuses to our 4-value vocab is sane and correct. Real-but-narrow gaps: late-retry `payment_failed` overwriting a canceled user (§4.4 — fix worth doing), `charge.refunded` unhandled (§4.5 — fix when refund volume justifies), `User.stripeCustomerId` not unique (§4.2 — defensive cleanup). No findings warrant a hotfix tonight.

---

## Cross-references

- Webhook dispatcher: `apps/web/src/app/api/stripe/webhook/route.ts`
- Checkout: `apps/web/src/app/api/stripe/checkout/route.ts`
- Portal: `apps/web/src/app/api/stripe/portal/route.ts`
- Status consumer: `apps/web/src/lib/entitlements.ts`
- Trial-clock single-source-of-truth: `IMPLEMENTATION_PLAN_PAYWALL.md §1.5`
- Backfill banner consumer: slice 5 in PROGRESS.md (commit `20cf8e9`)
