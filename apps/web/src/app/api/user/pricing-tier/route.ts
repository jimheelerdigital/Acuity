/**
 * GET /api/user/pricing-tier → { tier: "legacy" | "v2" }
 *
 * Tells the paywall which offering to show this customer (see
 * lib/pricing-tier.ts for the rule). Called only when the paywall opens,
 * not on every app load, because it may do one Stripe lookup.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { customerPricingTier } from "@/lib/pricing-tier";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { appleProductId: true, googleProductId: true, stripeSubscriptionId: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let stripePriceId: string | null = null;
  if (user.stripeSubscriptionId) {
    try {
      const { stripe } = await import("@/lib/stripe");
      const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      stripePriceId = sub.items.data[0]?.price?.id ?? null;
    } catch (err) {
      // Unknown price → offer current pricing. Wrongly offering legacy would
      // discount a whole subscription lifetime; wrongly offering v2 is fixed
      // on the next paywall open once Stripe answers.
      safeLog.warn("pricing-tier.stripe-lookup-failed", {
        userId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const tier = customerPricingTier({
    appleProductId: user.appleProductId,
    googleProductId: user.googleProductId,
    stripePriceId,
  });

  return NextResponse.json(
    { tier },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}
