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
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Webhook verification failed: ${message}` },
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

      await prisma.user.updateMany({
        where: { stripeCustomerId: customerId },
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
      const users = await prisma.user.findMany({
        where: { stripeCustomerId: customerId },
        select: { id: true, email: true, name: true },
      });
      await prisma.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: { subscriptionStatus: "PAST_DUE" },
      });

      // Best-effort email nudge so the user knows to update their
      // payment method before Stripe's dunning period ends.
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
        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
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
