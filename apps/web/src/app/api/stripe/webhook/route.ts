import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook dispatcher.
 *
 * Verifies signature, short-circuits on seen event ids (StripeEvent
 * model — Stripe retries at-least-once), and routes to per-event
 * handlers. Each handler is idempotent on its own so a surprise
 * re-delivery after the StripeEvent write succeeded is still safe.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = headers().get("stripe-signature");

  if (!sig) {
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
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe-webhook] signature verification failed:", message);
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 }
    );
  }

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
    // Any other error — log but don't retry the whole event.
    const code = (err as { code?: string } | null)?.code;
    if (code === "P2002") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[stripe-webhook] StripeEvent write failed:", err);
    // Fall through to handling anyway — idempotency guard failure
    // shouldn't drop the event payload.
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      if (!userId) break;

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: session.subscription as string,
          subscriptionStatus: "PRO",
        },
        select: { createdAt: true, trialEndsAt: true, email: true },
      });

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
        console.warn("[stripe-webhook] subscription_started track failed:", err);
      }

      // Fire referral conversion if this user was referred. Stub
      // reward-fulfillment logic — Jim decides the actual reward.
      try {
        const { recordReferralConversion } = await import("@/lib/referrals");
        await recordReferralConversion(userId);
      } catch (err) {
        console.warn("[stripe-webhook] referral conversion failed:", err);
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      if (!customerId) break;

      const sub = invoice.subscription as string | null;

      // Status guard (W-A audit, 2026-05-03): never resurrect a
      // canceled user (subscriptionStatus="FREE") back to PRO. A
      // late or out-of-order Stripe event for a sub the user has
      // already canceled would otherwise un-cancel them silently.
      // The WHERE filter makes the no-op atomic — no read/write race.
      // PAST_DUE → PRO is the intended dunning recovery path, so
      // it's allowed (FREE is the only excluded state).
      await prisma.user.updateMany({
        where: {
          stripeCustomerId: customerId,
          subscriptionStatus: { not: "FREE" },
        },
        data: {
          subscriptionStatus: "PRO",
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
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      if (!customerId) break;

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
        data: { subscriptionStatus: "PAST_DUE" },
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
        console.warn("[stripe-webhook] payment-failed email failed:", err);
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
      if (!customerId) break;

      const status = sub.status;
      // Map Stripe's granular statuses onto our 4-value vocab.
      // active/trialing → PRO. past_due/unpaid → PAST_DUE.
      // canceled/incomplete_expired → FREE.
      let nextStatus: string | null = null;
      if (status === "active" || status === "trialing") nextStatus = "PRO";
      else if (status === "past_due" || status === "unpaid") nextStatus = "PAST_DUE";
      else if (status === "canceled" || status === "incomplete_expired")
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
        await prisma.user.updateMany({
          where,
          data: {
            subscriptionStatus: nextStatus,
            stripeSubscriptionId: sub.id,
            ...(sub.current_period_end
              ? {
                  stripeCurrentPeriodEnd: new Date(
                    sub.current_period_end * 1000
                  ),
                }
              : {}),
          },
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await prisma.user.updateMany({
        where: { stripeCustomerId: sub.customer as string },
        data: {
          subscriptionStatus: "FREE",
          stripeSubscriptionId: null,
          stripeCurrentPeriodEnd: null,
        },
      });
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
