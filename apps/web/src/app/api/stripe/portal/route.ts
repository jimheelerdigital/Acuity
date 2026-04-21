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
    select: { stripeCustomerId: true },
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
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });
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
