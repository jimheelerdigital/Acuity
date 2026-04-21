/**
 * GET /api/user/me
 *
 * Thin "refresh my session state" endpoint. Called by both:
 *   - Web components that need to tail-read subscription state
 *     without fetching the whole user row.
 *   - Mobile's foreground-refresh pattern (docs/APPLE_IAP_DECISION.md
 *     §5 implementation step 2) after the user returns from Safari-
 *     based upgrade checkout.
 *
 * Auth accepts EITHER a NextAuth web cookie OR a Bearer JWT in the
 * Authorization header (mobile). See lib/mobile-auth.ts.
 *
 * Returns only the fields the client might legitimately need —
 * nothing sensitive (no Stripe IDs, no push tokens, no isAdmin).
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      timezone: true,
      currentStreak: true,
      longestStreak: true,
      lastStreakMilestone: true,
      notificationTime: true,
      notificationDays: true,
      notificationsEnabled: true,
      onboarding: { select: { completedAt: true, currentStep: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ user: null }, { status: 404 });
  }

  // Flatten the onboarding relation into top-level booleans the
  // mobile AuthGate can read without understanding the nested shape.
  // `onboardingCompleted` is the only flag that drives the redirect;
  // `onboardingStep` helps the client resume where the user left off.
  const { onboarding, ...rest } = user;
  const flat = {
    ...rest,
    onboardingCompleted: Boolean(onboarding?.completedAt),
    onboardingStep: onboarding?.currentStep ?? 1,
  };

  return NextResponse.json(
    { user: flat },
    {
      status: 200,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    }
  );
}
