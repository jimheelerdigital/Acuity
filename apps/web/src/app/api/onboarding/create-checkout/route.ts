/**
 * POST /api/onboarding/create-checkout
 *
 * Creates a Stripe Checkout Session with trial_period_days for the
 * web-to-app onboarding funnel. Unlike the existing /api/stripe/checkout
 * (which starts paid immediately), this uses Stripe's native trial so
 * the card is collected but not charged until the trial ends.
 *
 * Trial length: TRIAL_DAYS (7) for all users.
 */
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { TRIAL_DAYS } from "@acuity/shared";

import { getAuthOptions } from "@/lib/auth";
import { PRICING } from "@/lib/pricing";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

type Interval = "monthly" | "yearly";

export async function POST(req: NextRequest) {
  // TODO: v1.4 GDPR — If this checkout ever switches from deferred
  // (trial) to immediate charge, add the 14-day withdrawal
  // acknowledgement checkbox per the /upgrade flow (see
  // app/upgrade/upgrade-plan-picker.tsx + the consent gate in
  // /api/stripe/checkout/route.ts).
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let interval: Interval = "monthly";
  try {
    const body = (await req.json()) as { interval?: Interval } | null;
    if (body?.interval === "yearly") interval = "yearly";
  } catch {}

  // Use PRICING config which includes env-var fallbacks for local dev
  const priceId =
    interval === "yearly"
      ? PRICING.annual.stripeId
      : PRICING.monthly.stripeId;

  if (!priceId) {
    console.error("[onboarding/create-checkout] No price ID for interval:", interval);
    return NextResponse.json(
      { error: "Pricing misconfigured" },
      { status: 500 }
    );
  }

  const { prisma } = await import("@/lib/prisma");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true, email: true },
  });

  const trialDays = TRIAL_DAYS;

  try {
    console.log("[onboarding/create-checkout] Creating session:", {
      userId: session.user.id,
      interval,
      priceId,
      trialDays,
      email: user?.email,
      hasCustomerId: !!user?.stripeCustomerId,
    });

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer: user?.stripeCustomerId ?? undefined,
      customer_email: user?.stripeCustomerId ? undefined : (user?.email ?? undefined),
      client_reference_id: session.user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: trialDays,
        metadata: { userId: session.user.id, interval, source: "onboarding_funnel" },
      },
      success_url: `${process.env.NEXTAUTH_URL}/start?step=download&payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/start?step=savings`,
      metadata: { userId: session.user.id, interval, source: "onboarding_funnel" },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err: unknown) {
    const stripeErr = err as { type?: string; code?: string; message?: string; statusCode?: number };
    console.error("[onboarding/create-checkout] Stripe error:", {
      type: stripeErr.type,
      code: stripeErr.code,
      message: stripeErr.message,
      statusCode: stripeErr.statusCode,
      userId: session.user.id,
      interval,
      priceId,
    });
    const message = err instanceof Error ? err.message : "Stripe checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
