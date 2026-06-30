import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";
import { safeLog } from "@/lib/safe-log";
import {
  sendConversionEvent,
  generateEventId,
} from "@/lib/meta-capi";

export const dynamic = "force-dynamic";
// Explicit Node.js runtime. Stripe signature verification requires the
// raw request body (Buffer / bytes-faithful string). The Edge runtime
// can mangle that via its body-parsing layer; pinning Node here means
// a future Next.js / Vercel default flip can't silently break us.
// 2026-06-01: webhook silent-fail diagnosis hardening.
export const runtime = "nodejs";

/**
 * Stripe webhook dispatcher.
 *
 * Verifies signature, short-circuits on seen event ids (StripeEvent
 * model — Stripe retries at-least-once), and routes to per-event
 * handlers. Each handler is idempotent on its own so a surprise
 * re-delivery after the StripeEvent write succeeded is still safe.
 *
 * 2026-06-01 hardening (38-day silence diagnosis):
 *   - Top-of-handler log fires BEFORE signature verification so
 *     Vercel logs prove Stripe is even reaching this code path.
 *   - safeLog (Sentry-routing) replaces silent `break`s on
 *     unhandled-event / missing-metadata paths so a future
 *     misconfiguration surfaces in observability instead of
 *     vanishing into a 200 OK.
 *   - The User update inside each handler is wrapped in try/catch
 *     with safeLog.error so a Prisma failure surfaces explicitly
 *     instead of bubbling to Next.js's 500 + Stripe's retry +
 *     eventual give-up.
 */
export async function POST(req: NextRequest) {
  // First line: prove the function is invoked. Independent of body,
  // signature, env. If Vercel logs don't show this for an event
  // Stripe Dashboard says was delivered, the route isn't reachable
  // (deployment / function-not-found / middleware redirect).
  safeLog.info("stripe-webhook.received", {
    ts: new Date().toISOString(),
  });

  const body = await req.text();
  const sig = headers().get("stripe-signature");

  if (!sig) {
    safeLog.warn("stripe-webhook.missing-signature-header", {
      bodyLength: body.length,
    });
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    // Log the SDK's diagnostic message server-side, but return an opaque
    // error to the caller. Surfacing the SDK message lets an attacker
    // tune signature-forgery attempts (e.g. "no signatures found
    // matching the expected signature for payload" vs "timestamp
    // outside the tolerance zone" tells them which guard to bypass
    // next).
    safeLog.error("stripe-webhook.signature-verification-failed", err, {
      hasSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      secretLength: process.env.STRIPE_WEBHOOK_SECRET?.length ?? 0,
      bodyLength: body.length,
      sigPrefix: sig.slice(0, 16),
    });
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 }
    );
  }

  safeLog.info("stripe-webhook.event", {
    id: event.id,
    type: event.type,
    livemode: event.livemode,
  });

  const { prisma } = await import("@/lib/prisma");

  // Idempotency guard — Stripe retries deliveries. If we've processed
  // this event.id before, ack with 200 and skip. The create happens at
  // the START (not end) of processing so a webhook that lands twice
  // in flight won't double-write; the second invocation throws on the
  // unique id, we catch and return 200.
  try {
    await prisma.stripeEvent.create({
      data: { id: event.id, type: event.type },
    });
  } catch (err) {
    // Unique violation (P2002) on StripeEvent.id means we've seen this.
    // Any other error — log + fall through (a StripeEvent write failure
    // shouldn't drop the actual payload handling).
    const code = (err as { code?: string } | null)?.code;
    if (code === "P2002") {
      safeLog.info("stripe-webhook.duplicate", { id: event.id });
      return NextResponse.json({ received: true, duplicate: true });
    }
    safeLog.error("stripe-webhook.stripe-event-write-failed", err, {
      id: event.id,
      type: event.type,
    });
    // Fall through to handling anyway.
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      if (!userId) {
        // Was a silent `break` before 2026-06-01. Now surfaces so a
        // future checkout-creation path that forgets metadata.userId
        // is visible in Sentry the first time it hits production.
        safeLog.warn("stripe-webhook.checkout-session-missing-user-id", {
          sessionId: session.id,
          customerEmail: session.customer_email ?? null,
          customerId:
            typeof session.customer === "string" ? session.customer : null,
          hasMetadata: Boolean(session.metadata),
        });
        break;
      }

      let user: {
        createdAt: Date;
        trialEndsAt: Date | null;
        email: string | null;
      } | null = null;
      try {
        user = await prisma.user.update({
          where: { id: userId },
          data: {
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            subscriptionStatus: "PRO",
            subscriptionSource: "stripe",
          },
          select: { createdAt: true, trialEndsAt: true, email: true },
        });
      } catch (err) {
        // Was an uncaught throw before 2026-06-01 — propagated to a
        // 500 response, Stripe retried, eventually gave up. Now
        // logged explicitly so the failure mode is visible. Stripe
        // still 2xx-acks so retries stop (the eventual give-up is
        // worse than a logged failure — it abandons the event).
        safeLog.error("stripe-webhook.checkout-session-user-update-failed", err, {
          sessionId: session.id,
          userId,
          customerId:
            typeof session.customer === "string" ? session.customer : null,
        });
        break;
      }

      // Analytics event (IMPLEMENTATION_PLAN_PAYWALL §8.3). Days-since-
      // signup + days-into-trial are the retention signals we need to
      // tell good-trial-convert from bad-trial-convert later.
      try {
        const { track } = await import("@/lib/posthog");
        const now = Date.now();
        const daysSinceSignup = Math.floor(
          (now - user.createdAt.getTime()) / (24 * 60 * 60 * 1000)
        );
        const daysIntoTrial = user.trialEndsAt
          ? Math.floor(
              (now - (user.trialEndsAt.getTime() - 14 * 24 * 60 * 60 * 1000)) /
                (24 * 60 * 60 * 1000)
            )
          : null;
        await track(userId, "subscription_started", {
          daysSinceSignup,
          daysIntoTrial,
          email: user.email,
          source: session.metadata?.src ?? "direct",
        });
      } catch (err) {
        safeLog.warn("stripe-webhook.subscription-started-track-failed", {
          err: err instanceof Error ? err.message : String(err),
        });
      }

      // Fire Meta CAPI Purchase event (best-effort, non-blocking)
      try {
        const interval = session.metadata?.interval ?? "monthly";
        const purchaseValue = interval === "yearly" ? 39.99 : 4.99;
        const capiEventId = generateEventId("Purchase");
        sendConversionEvent({
          eventName: "Purchase",
          eventId: capiEventId,
          eventSourceUrl: "https://getacuity.io/start",
          userData: {
            email: user.email ?? undefined,
          },
          customData: {
            currency: "USD",
            value: purchaseValue,
            content_name: `Acuity Pro ${interval}`,
            content_type: "product",
            content_ids: [session.subscription as string],
          },
        }).catch(() => {});
      } catch (err) {
        safeLog.warn("stripe-webhook.meta-capi-purchase-failed", {
          err: err instanceof Error ? err.message : String(err),
        });
      }

      // Founder notification. checkout.session.completed fires for BOTH the
      // trial funnel (no money now — converts in ~7 days) and the immediate-
      // charge /upgrade path. Only send the "new trial signup" notice when
      // nothing was charged at checkout (amount_total 0/null). The immediate-
      // charge case is covered by the "Payment received" notice on
      // invoice.payment_succeeded, so we don't double-notify here.
      if ((session.amount_total ?? 0) === 0) {
        try {
          const { notifyFoundersOfTrialSignup } = await import("@/lib/founder-notifications");
          await notifyFoundersOfTrialSignup({
            email: user.email ?? "unknown",
            plan: session.metadata?.interval ?? "monthly",
            source: session.metadata?.source ?? "direct",
            timestamp: new Date(),
            convertsOn: user.trialEndsAt,
          });
        } catch (err) {
          safeLog.warn("stripe-webhook.trial-signup-notification-failed", {
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Fire referral conversion if this user was referred. Stub
      // reward-fulfillment logic — Jim decides the actual reward.
      try {
        const { recordReferralConversion } = await import("@/lib/referrals");
        await recordReferralConversion(userId);
      } catch (err) {
        safeLog.warn("stripe-webhook.referral-conversion-failed", {
          err: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      if (!customerId) {
        safeLog.warn("stripe-webhook.invoice-missing-customer", {
          invoiceId: invoice.id,
        });
        break;
      }

      const sub = invoice.subscription as string | null;

      // Status guard (W-A audit, 2026-05-03): never resurrect a
      // canceled user (subscriptionStatus="FREE") back to PRO. A
      // late or out-of-order Stripe event for a sub the user has
      // already canceled would otherwise un-cancel them silently.
      // The WHERE filter makes the no-op atomic — no read/write race.
      // PAST_DUE → PRO is the intended dunning recovery path, so
      // it's allowed (FREE is the only excluded state).
      try {
        const result = await prisma.user.updateMany({
          where: {
            stripeCustomerId: customerId,
            subscriptionStatus: { not: "FREE" },
          },
          data: {
            subscriptionStatus: "PRO",
            subscriptionSource: "stripe",
            // Recovery — clear the dunning anchor so a future failure starts
            // a fresh grace window.
            stripeFirstFailureAt: null,
            ...(sub ? { stripeSubscriptionId: sub } : {}),
            ...(invoice.lines.data[0]?.period?.end
              ? {
                  stripeCurrentPeriodEnd: new Date(
                    invoice.lines.data[0].period.end * 1000
                  ),
                }
              : {}),
          },
        });
        if (result.count === 0) {
          safeLog.warn("stripe-webhook.invoice-success-no-user-found", {
            customerId,
            invoiceId: invoice.id,
          });
        }
      } catch (err) {
        safeLog.error("stripe-webhook.invoice-success-update-failed", err, {
          customerId,
          invoiceId: invoice.id,
        });
      }

      // Founder "money received" notification — the REAL payment signal
      // (trial conversion or renewal). Skip the $0 trial-start invoice so we
      // don't send a misleading "$0.00 received". Fail-soft + non-blocking.
      if ((invoice.amount_paid ?? 0) > 0) {
        try {
          const payer = await prisma.user.findFirst({
            where: { stripeCustomerId: customerId },
            select: { email: true },
          });
          const interval = invoice.lines.data[0]?.price?.recurring?.interval;
          const plan =
            interval === "year"
              ? "yearly"
              : interval === "month"
                ? "monthly"
                : "subscription";
          const { notifyFoundersOfPayment } = await import("@/lib/founder-notifications");
          await notifyFoundersOfPayment({
            email: payer?.email ?? invoice.customer_email ?? "unknown",
            plan,
            amountCents: invoice.amount_paid,
            currency: invoice.currency ?? "usd",
            timestamp: new Date(),
          });
        } catch (err) {
          safeLog.warn("stripe-webhook.payment-received-notification-failed", {
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      if (!customerId) {
        safeLog.warn("stripe-webhook.invoice-failed-missing-customer", {
          invoiceId: invoice.id,
        });
        break;
      }

      // Downgrade to PAST_DUE. The UI surfaces a soft banner on the
      // dashboard keyed on this status. Stripe's own retry schedule
      // will fire invoice.payment_succeeded when the card is fixed;
      // that handler flips us back to PRO.
      //
      // Status guard (W-A audit §4.4 fix, 2026-05-03): the audit at
      // docs/v1-1/stripe-webhook-audit.md §4.4 flagged a real race —
      // a late Stripe retry for an old failed invoice could resurrect
      // a user who has since canceled (FREE) back into PAST_DUE. The
      // user would see Pro access and a "your payment failed" banner
      // for a sub that no longer exists. WHERE filter blocks FREE →
      // PAST_DUE so the update is a no-op for canceled users; we
      // still 200-ack the webhook so Stripe stops retrying.
      // The findMany also adds the same guard so we don't email a
      // canceled user about a card that's no longer on file.
      try {
        const users = await prisma.user.findMany({
          where: {
            stripeCustomerId: customerId,
            subscriptionStatus: { not: "FREE" },
          },
          select: { id: true, email: true, name: true },
        });
        await prisma.user.updateMany({
          where: {
            stripeCustomerId: customerId,
            subscriptionStatus: { not: "FREE" },
          },
          data: { subscriptionStatus: "FREE" },
        });

        // Anchor the grace window at the FIRST failure only — set
        // stripeFirstFailureAt where it's still null so Stripe's subsequent
        // retry failures don't keep pushing the window out. Cleared on
        // recovery (payment_succeeded) or cancel.
        await prisma.user.updateMany({
          where: {
            stripeCustomerId: customerId,
            subscriptionStatus: { not: "FREE" },
            stripeFirstFailureAt: null,
          },
          data: { stripeFirstFailureAt: new Date() },
        });

        // Best-effort email nudge so the user knows to update their
        // payment method before Stripe's dunning period ends. Only
        // sent to users we actually downgraded — canceled users
        // were filtered out by the findMany above.
        try {
          const { sendPaymentFailedEmail } = await import("@/emails/payment-failed");
          for (const u of users) {
            if (u.email) await sendPaymentFailedEmail({ to: u.email, name: u.name });
          }
        } catch (err) {
          safeLog.warn("stripe-webhook.payment-failed-email-failed", {
            err: err instanceof Error ? err.message : String(err),
          });
        }
      } catch (err) {
        safeLog.error("stripe-webhook.invoice-failed-update-failed", err, {
          customerId,
          invoiceId: invoice.id,
        });
      }
      break;
    }

    case "customer.subscription.updated": {
      // Fires on plan change, cancel-at-period-end flags, trial
      // conversions, etc. We reflect status transitions but don't
      // over-infer — Stripe is the source of truth, so we mirror
      // what it tells us.
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;
      if (!customerId) {
        safeLog.warn("stripe-webhook.sub-updated-missing-customer", {
          subscriptionId: sub.id,
        });
        break;
      }

      const status = sub.status;
      // Map Stripe's granular statuses onto our vocab. NO grace (2026-06-12
      // spec): active/trialing → PRO; any non-active state (past_due, unpaid,
      // canceled, incomplete_expired) → FREE immediately. The recovery banner
      // is driven by stripeFirstFailureAt (set by invoice.payment_failed), not
      // by a PAST_DUE status.
      let nextStatus: string | null = null;
      if (status === "active" || status === "trialing") nextStatus = "PRO";
      else if (
        status === "past_due" ||
        status === "unpaid" ||
        status === "canceled" ||
        status === "incomplete_expired"
      )
        nextStatus = "FREE";

      if (nextStatus) {
        // Status guard (W-A audit, 2026-05-03): same race shape as
        // invoice.payment_failed/succeeded — a late subscription.updated
        // with status="active" or "past_due" arriving after a user
        // has been canceled (FREE) would resurrect them. WHERE
        // filter blocks the upgrade direction; FREE → FREE (the
        // canceled→canceled no-op) is also fine; FREE writes are
        // unrestricted because they're terminal-direction (cancel).
        const where =
          nextStatus === "FREE"
            ? { stripeCustomerId: customerId }
            : { stripeCustomerId: customerId, subscriptionStatus: { not: "FREE" } };
        try {
          const result = await prisma.user.updateMany({
            where,
            data: {
              subscriptionStatus: nextStatus,
              subscriptionSource: "stripe",
              stripeSubscriptionId: sub.id,
              // Clear the failure anchor on recovery (PRO). On FREE, leave it
              // — invoice.payment_failed sets it on a failed renewal and it
              // drives the recovery banner's 30-day window. (A clean cancel
              // never set it → no banner.)
              ...(nextStatus === "PRO"
                ? { stripeFirstFailureAt: null }
                : {}),
              ...(sub.current_period_end
                ? {
                    stripeCurrentPeriodEnd: new Date(
                      sub.current_period_end * 1000
                    ),
                  }
                : {}),
            },
          });
          if (result.count === 0) {
            safeLog.warn("stripe-webhook.sub-updated-no-user-found", {
              customerId,
              subscriptionId: sub.id,
              stripeStatus: status,
              mappedStatus: nextStatus,
            });
          }
        } catch (err) {
          safeLog.error("stripe-webhook.sub-updated-update-failed", err, {
            customerId,
            subscriptionId: sub.id,
          });
        }
      } else {
        safeLog.info("stripe-webhook.sub-updated-unmapped-status", {
          customerId,
          subscriptionId: sub.id,
          stripeStatus: status,
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      try {
        await prisma.user.updateMany({
          where: { stripeCustomerId: sub.customer as string },
          data: {
            subscriptionStatus: "FREE",
            stripeSubscriptionId: null,
            stripeCurrentPeriodEnd: null,
            stripeFirstFailureAt: null,
          },
        });
      } catch (err) {
        safeLog.error("stripe-webhook.sub-deleted-update-failed", err, {
          customerId: sub.customer,
          subscriptionId: sub.id,
        });
      }
      break;
    }

    case "charge.refunded": {
      // Real money OUT — surface it to founders. amount_refunded is the
      // cumulative refunded total on the charge. Notification-only; the DB
      // cancel/cleanup is handled by the cancel script / admin action.
      // Requires charge.refunded to be enabled on the Stripe webhook
      // endpoint (Dashboard → Webhooks).
      const charge = event.data.object as Stripe.Charge;
      const customerId =
        typeof charge.customer === "string" ? charge.customer : null;
      try {
        let email: string | null =
          charge.billing_details?.email ?? charge.receipt_email ?? null;
        if (!email && customerId) {
          const u = await prisma.user.findFirst({
            where: { stripeCustomerId: customerId },
            select: { email: true },
          });
          email = u?.email ?? null;
        }
        const { notifyFoundersOfRefund } = await import("@/lib/founder-notifications");
        await notifyFoundersOfRefund({
          email: email ?? "unknown",
          amountCents: charge.amount_refunded,
          currency: charge.currency ?? "usd",
          timestamp: new Date(),
        });
      } catch (err) {
        safeLog.warn("stripe-webhook.refund-notification-failed", {
          err: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    default:
      safeLog.info("stripe-webhook.unhandled-event-type", { type: event.type });
      break;
  }

  return NextResponse.json({ received: true });
}
