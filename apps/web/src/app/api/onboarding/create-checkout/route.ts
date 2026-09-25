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

// Funnel paths Stripe may send the buyer back to. Allowlisted so the request
// body can't point success_url anywhere else. /start-bwk buyers used to land
// on /start (women's copy, wrong cohort tag) after paying.
const FUNNEL_PATHS = new Set(["/start", "/start-bwk", "/start-test", "/start-test-bwk"]);

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
  let funnelPath = "/start";
  // embedded (2026-09-24, /start-test): Stripe's Embedded Checkout mounts
  // on our own paywall, with Apple Pay / Google Pay at the top and the card
  // form below. Returns a client secret instead of a redirect URL.
  let embedded = false;
  try {
    const body = (await req.json()) as { interval?: Interval; funnel?: string; embedded?: boolean } | null;
    if (body?.interval === "yearly") interval = "yearly";
    if (body?.funnel && FUNNEL_PATHS.has(body.funnel)) funnelPath = body.funnel;
    embedded = body?.embedded === true;
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

    const returnUrl = `${process.env.NEXTAUTH_URL}${funnelPath}?step=download&payment=success&session_id={CHECKOUT_SESSION_ID}`;
    const checkoutSession = await stripe.checkout.sessions.create({
      ...(embedded
        ? { ui_mode: "embedded" as const, return_url: returnUrl }
        : {
            success_url: returnUrl,
            // Back from Checkout = back to the paywall, where they can switch
            // plan or take the no-card path. (Was step=download, which
            // dropped them past the choice with no way back.)
            // /start-test and /start-test-bwk (v9) call their paywall step "paywall".
            cancel_url: `${process.env.NEXTAUTH_URL}${funnelPath}?step=${funnelPath.startsWith("/start-test") ? "paywall" : "savings"}`,
          }),
      mode: "subscription",
      // Card + Link only (2026-09-25, Keenan). Apple Pay and Google Pay are
      // wallets on the "card" type, so they still show when enabled in the
      // dashboard. This keeps out bank debits (they "succeed" then bounce
      // days later on insufficient funds), Cash App Pay, Klarna and Amazon
      // Pay, none of which suit a $0-today trial. Was: no list, which showed
      // every dashboard method. Funnel checkout only; /upgrade is separate.
      payment_method_types: ["card", "link"],
      customer: user?.stripeCustomerId ?? undefined,
      customer_email: user?.stripeCustomerId ? undefined : (user?.email ?? undefined),
      client_reference_id: session.user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: trialDays,
        metadata: { userId: session.user.id, interval, source: "onboarding_funnel" },
      },
      metadata: { userId: session.user.id, interval, source: "onboarding_funnel" },
    });

    if (embedded) {
      return NextResponse.json({ clientSecret: checkoutSession.client_secret });
    }
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
