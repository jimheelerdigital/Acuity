/**
 * POST /api/onboarding/create-checkout
 *
 * Creates a Stripe Checkout Session with trial_period_days for the
 * web-to-app onboarding funnel. Unlike the existing /api/stripe/checkout
 * (which starts paid immediately), this uses Stripe's native trial so
 * the card is collected but not charged until the trial ends.
 *
 * Founding members (first 100) get 30-day trial; standard users get 14.
 */
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const FOUNDING_MEMBER_CAP = 100;

type Interval = "monthly" | "yearly";

export async function POST(req: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let interval: Interval = "monthly";
  try {
    const body = (await req.json()) as { interval?: Interval } | null;
    if (body?.interval === "yearly") interval = "yearly";
  } catch {}

  const priceId =
    interval === "yearly"
      ? process.env.STRIPE_PRICE_YEARLY
      : process.env.STRIPE_PRICE_MONTHLY;

  if (!priceId) {
    return NextResponse.json(
      { error: "Pricing misconfigured" },
      { status: 500 }
    );
  }

  const { prisma } = await import("@/lib/prisma");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true, email: true, isFoundingMember: true },
  });

  // Founding members get 30-day trial, standard users get 14
  const trialDays = user?.isFoundingMember ? 30 : 14;

  try {
    console.log("[onboarding/create-checkout] Creating session:", { userId: session.user.id, interval, priceId, trialDays, email: user?.email });

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer: user?.stripeCustomerId ?? undefined,
      customer_email: user?.stripeCustomerId ? undefined : (user?.email ?? undefined),
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: trialDays,
        metadata: { userId: session.user.id, interval, source: "onboarding_funnel" },
      },
      success_url: `${process.env.NEXTAUTH_URL}/start?step=download&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/start?step=paywall`,
      metadata: { userId: session.user.id, interval, source: "onboarding_funnel" },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("[onboarding/create-checkout] Stripe error:", err);
    const message = err instanceof Error ? err.message : "Stripe checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
