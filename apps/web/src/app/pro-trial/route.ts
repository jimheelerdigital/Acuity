/**
 * GET /pro-trial — the "Start my free 7 days" link in lifecycle emails.
 *
 * The 7-day card trial only exists on the funnel paywall
 * (/api/onboarding/create-checkout, trial_period_days: 7). /upgrade charges
 * immediately, so emails promising a free week must land on the paywall.
 *
 *   - signed out  → sign in, then back here
 *   - already Pro / has a Stripe sub → /home (nothing to sell)
 *   - otherwise   → the paywall of the funnel they came through
 *                   (/start-bwk for BWK signups, /start for everyone else)
 *
 * UTM params on the email link are passed through to the paywall URL.
 */
import { getServerSession } from "next-auth";
import { NextResponse, type NextRequest } from "next/server";

import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    const back = `/pro-trial${url.search}`;
    return NextResponse.redirect(
      new URL(`/auth/signin?callbackUrl=${encodeURIComponent(back)}`, url)
    );
  }

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionStatus: true, stripeSubscriptionId: true },
  });
  if (!user || user.subscriptionStatus === "PRO" || user.stripeSubscriptionId) {
    return NextResponse.redirect(new URL("/home", url));
  }

  const lastFunnelEvent = await prisma.onboardingEvent.findFirst({
    where: { userId: session.user.id, flowVersion: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { flowVersion: true },
  });
  const fv = lastFunnelEvent?.flowVersion ?? "";
  // v9 (/start-test) names its paywall step "paywall"; v8 funnels use "savings".
  const [path, paywallStep] = fv.startsWith("v9")
    ? [fv.includes("bwk") ? "/start-test-bwk" : "/start-test", "paywall"]
    : fv.includes("bwk")
      ? ["/start-bwk", "savings"]
      : ["/start", "savings"];

  const dest = new URL(path, url);
  dest.searchParams.set("step", paywallStep);
  for (const [k, v] of url.searchParams) {
    if (k.startsWith("utm_")) dest.searchParams.set(k, v);
  }
  return NextResponse.redirect(dest);
}
