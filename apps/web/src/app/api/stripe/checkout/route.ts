import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

type Interval = "monthly" | "yearly";

function resolvePriceId(interval: Interval): string {
  const priceId =
    interval === "yearly"
      ? process.env.STRIPE_PRICE_YEARLY
      : process.env.STRIPE_PRICE_MONTHLY;
  if (!priceId) {
    throw new Error(
      `Missing Stripe price env var for interval=${interval} — expected STRIPE_PRICE_${interval === "yearly" ? "YEARLY" : "MONTHLY"}`
    );
  }
  return priceId;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Body is optional — legacy callers (no body) get monthly. New callers
  // from /upgrade send { interval: "monthly" | "yearly" }.
  let interval: Interval = "monthly";
  try {
    const body = (await req.json()) as { interval?: Interval } | null;
    if (body?.interval === "yearly") interval = "yearly";
  } catch {
    // no body / not JSON → default monthly
  }

  let priceId: string;
  try {
    priceId = resolvePriceId(interval);
  } catch (err) {
    console.error("[stripe/checkout]", err);
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

  // Trial handled by Acuity's User.trialEndsAt, not Stripe. Subscription
  // starts paid immediately on checkout completion — avoids the
  // 14+7=21-day compound trial the old code created, and keeps the
  // trial clock in one place (IMPLEMENTATION_PLAN_PAYWALL §1.5).
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer: user?.stripeCustomerId ?? undefined,
    customer_email: user?.stripeCustomerId ? undefined : (user?.email ?? undefined),
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${process.env.NEXTAUTH_URL}/home?upgraded=1&plan=${interval}`,
    cancel_url: `${process.env.NEXTAUTH_URL}/upgrade`,
    metadata: { userId: session.user.id, interval },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
