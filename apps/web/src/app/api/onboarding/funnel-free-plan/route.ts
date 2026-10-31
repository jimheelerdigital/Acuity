/**
 * POST /api/onboarding/funnel-free-plan
 *
 * Web funnel accounts (/start, /start-bwk) start on the FREE plan. The 7-day
 * Pro trial there requires a card (Stripe Checkout, trial_period_days: 7).
 *
 * Why (2026-09-24): every signup used to get a cardless 7-day TRIAL from
 * bootstrapNewUser. Over 150 days, 305 cardless trials produced 1 paying user.
 * 36 card trials produced 11. With a free Pro week on offer, the paywall's
 * card ask bought the user nothing, so almost nobody took it.
 *
 * Called by the funnel right after account creation (email or OAuth return),
 * before the paywall. Deliberately narrow so it can never touch an existing
 * user who signs in through the funnel:
 *   - account created within the last 60 minutes
 *   - still TRIAL, no Stripe subscription, not an Apple/Google IAP row
 *
 * trialExpiredAt stays null on purpose. It triggers the "your trial ended"
 * email + push cohorts, and these users never had a trial. A later Stripe
 * card trial flips them to PRO via the webhook (trialing → PRO).
 *
 * Mobile signups are unaffected: they don't go through this route.
 *
 * 2026-10-31: the signup route now does this server-side for funnel signups
 * (lib/funnel-free-plan.ts); this browser call is the backstop.
 */
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";
import { moveNewFunnelAccountToFree } from "@/lib/funnel-free-plan";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const switched = await moveNewFunnelAccountToFree(session.user.id);
  return NextResponse.json({ ok: true, switched });
}
