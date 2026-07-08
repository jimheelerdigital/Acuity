/**
 * POST /api/stripe/portal
 *
 * Creates a Stripe Customer Portal session and returns its URL. The
 * /account UI redirects there on "Manage subscription" — users can
 * update payment method, cancel, switch plans, download invoices,
 * all inside Stripe's hosted portal. No subscription-management UI
 * we have to build ourselves.
 *
 * Only users with an existing stripeCustomerId can access this. Users
 * who never subscribed hit /upgrade instead.
 */

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true, stripeSubscriptionId: true },
  });
  if (!user?.stripeCustomerId) {
    // User has no Stripe customer yet — route them to the upgrade
    // flow instead of dead-ending with a blank portal.
    return NextResponse.json(
      {
        error: "NoSubscription",
        redirect: "/upgrade",
        detail: "Start a subscription first.",
      },
      { status: 400 }
    );
  }

  const returnUrl = `${appUrl()}/account?portal=returned`;

  try {
    const params: Stripe.BillingPortal.SessionCreateParams = {
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    };
    // Deep-link straight to the cancel-confirmation screen when there's an
    // active subscription, so canceling is one click instead of buried in
    // the portal home (Beth's "couldn't find it"). When the user finishes
    // OR backs out, Stripe returns them to /account?portal=returned, where
    // the page refetches state + shows the cancellation confirmation
    // (the cancel-state trust fix). The dedicated payment-update path lives
    // on /api/stripe/manage, so card updates are unaffected. Falls back to
    // the portal home when there's no subscription id to cancel.
    if (user.stripeSubscriptionId) {
      params.flow_data = {
        type: "subscription_cancel",
        subscription_cancel: { subscription: user.stripeSubscriptionId },
        after_completion: {
          type: "redirect",
          redirect: { return_url: returnUrl },
        },
      };
    }
    const session = await stripe.billingPortal.sessions.create(params);
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/portal] session create failed:", err);
    return NextResponse.json(
      { error: "PortalError", detail: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "https://www.getacuity.io"
  );
}
