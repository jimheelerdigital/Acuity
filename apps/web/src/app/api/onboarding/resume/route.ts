/**
 * GET /api/onboarding/resume
 *
 * Returns the furthest funnel step a SIGNED-IN user has reached, so the web
 * funnel can resume them there instead of dumping them back at the entry
 * screen. This fixes the return-path bug (2026-07-10): a user who created an
 * account and selected a plan, then came back ~2h later, was shown the entry
 * diagnostic again because funnel progress lived only in sessionStorage, which
 * had since been cleared.
 *
 * Server truth wins: the resume step is derived from the DB (subscription
 * status + appFirstOpenedAt) and the user's OnboardingEvent history — not from
 * client storage. Being authenticated at all means the account already exists,
 * so a signed-in user is NEVER resumed to a pre-account step.
 *
 * Returns { step, subscriptionStatus }. `step` is one of the funnel Step ids;
 * the client validates it against its own STEP_ORDER before applying.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Any of these funnel events proves the user reached the download screen (the
// furthest funnel stage), whether they got there by paying or by taking the
// free trial. If present, resume at "download".
const DOWNLOAD_STAGE_EVENTS = [
  "funnel_savings_locked_in",
  "funnel_download_screen_viewed",
  "funnel_download_viewed",
  "funnel_app_store_clicked",
  "funnel_inapp_browser_detected",
  "funnel_continue_web_app_clicked",
];

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req).catch(() => null);
  if (!userId) {
    return NextResponse.json({ step: null }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionStatus: true, appFirstOpenedAt: true },
  });
  if (!user) {
    return NextResponse.json({ step: null }, { status: 404 });
  }

  // PRO (paid/trialing) or has already opened the app → nothing left in the
  // funnel but the download screen.
  if (user.subscriptionStatus === "PRO" || user.appFirstOpenedAt) {
    return NextResponse.json({
      step: "download",
      subscriptionStatus: user.subscriptionStatus,
    });
  }

  // Otherwise consult the user's own funnel history for the furthest stage.
  const downloadStage = await prisma.onboardingEvent.findFirst({
    where: { userId, event: { in: DOWNLOAD_STAGE_EVENTS } },
    select: { id: true },
  });

  // Signed-in ⇒ account exists ⇒ the minimum resume point is the paywall
  // ("savings"), never the entry diagnostic. Bump to "download" if they've
  // already been there.
  return NextResponse.json({
    step: downloadStage ? "download" : "savings",
    subscriptionStatus: user.subscriptionStatus,
  });
}
