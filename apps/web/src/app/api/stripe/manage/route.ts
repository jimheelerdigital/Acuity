/**
 * GET /api/stripe/manage
 *
 * Email-safe, one-click redirect straight into Stripe. Payment emails
 * (payment-failed and any future billing email) point their CTA here so
 * the user lands directly on Stripe's hosted billing portal — no
 * intermediate "sign in, then hit Manage subscription" hop.
 *
 * A Stripe portal/checkout URL can't be baked into an email (the session
 * token is short-lived and per-user), so we mint it on click instead:
 *   - not signed in        → bounce through /auth/signin and come back here
 *   - live RevenueCat Web Billing subscription (2026-10-14)
 *                           → RevenueCat's customer portal
 *   - has a Stripe customer → Billing Portal session (update card / pay)
 *   - no Stripe customer    → /upgrade to start a subscription
 */

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";
import { mayHaveRcWebBilling } from "@/lib/billing/web-manage";
import { fetchRcBillingManagementUrl } from "@/lib/revenuecat/client";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "https://goripple.io"
  );
}

export async function GET(_req: NextRequest) {
  const base = appUrl();

  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    // Top-level navigation from an email — bounce through sign-in and
    // return here so we can mint the Stripe session once authenticated.
    const callback = encodeURIComponent("/api/stripe/manage");
    return NextResponse.redirect(`${base}/auth/signin?callbackUrl=${callback}`);
  }

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true, subscriptionSource: true, subscriptionStatus: true },
  });

  // RevenueCat Web Billing subscriber → RC's customer portal. Only answers
  // for a live RC_BILLING subscription; everyone else falls through to the
  // unchanged Stripe / upgrade handling below.
  if (user && mayHaveRcWebBilling(user)) {
    const rcUrl = await fetchRcBillingManagementUrl(session.user.id);
    if (rcUrl) return NextResponse.redirect(rcUrl);
  }

  // No Stripe customer yet → they've never subscribed; send them to the
  // upgrade flow rather than an empty portal.
  if (!user?.stripeCustomerId) {
    return NextResponse.redirect(`${base}/upgrade`);
  }

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${base}/account?portal=returned`,
    });
    return NextResponse.redirect(portal.url);
  } catch (err) {
    console.error("[stripe/manage] portal session create failed:", err);
    // Fall back to the in-app account page so the user is never dead-ended.
    return NextResponse.redirect(`${base}/account`);
  }
}
