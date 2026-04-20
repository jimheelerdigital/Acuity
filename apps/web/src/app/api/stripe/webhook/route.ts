import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

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

      await prisma.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: { subscriptionStatus: "PAST_DUE" },
      });
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
