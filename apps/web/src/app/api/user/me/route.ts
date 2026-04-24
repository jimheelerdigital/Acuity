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
      // stripeCurrentPeriodEnd is the renewal date once
      // subscriptionStatus flips to PRO. Exposed so the account-page
      // polling can render "Renews [date]" without a second fetch.
      stripeCurrentPeriodEnd: true,
      // Raw customer ID is NOT sent — flattened to a boolean below.
      // Callers use this to decide whether to show "Manage subscription"
      // vs "Upgrade" without needing the underlying id.
      stripeCustomerId: true,
      timezone: true,
      currentStreak: true,
      longestStreak: true,
      lastStreakMilestone: true,
      notificationTime: true,
      notificationDays: true,
      notificationsEnabled: true,
      weeklyEmailEnabled: true,
      monthlyEmailEnabled: true,
      referralCode: true,
      createdAt: true,
      onboarding: { select: { completedAt: true, currentStep: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ user: null }, { status: 404 });
  }

  // Opportunistic lastSeenAt bump. Used by the onboarding smart-skip
  // (W6) to decide if a user has genuinely abandoned. Fire-and-forget;
  // a failed write shouldn't block the response.
  void prisma.user
    .update({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => {});

  // Smart-skip: a user who signed up 30+ days ago and STILL hasn't
  // finished onboarding is effectively a returning user. Don't force
  // them through 10 steps on return. Silently mark onboarding complete;
  // demographics + reminders remain editable from /account.
  const ABANDON_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;
  const ageMs = Date.now() - user.createdAt.getTime();
  let effectiveCompletedAt = user.onboarding?.completedAt ?? null;
  if (!effectiveCompletedAt && ageMs > ABANDON_THRESHOLD_MS) {
    try {
      await prisma.userOnboarding.upsert({
        where: { userId },
        create: {
          userId,
          completedAt: new Date(),
          currentStep: user.onboarding?.currentStep ?? 1,
        },
        update: { completedAt: new Date() },
      });
      effectiveCompletedAt = new Date();
    } catch (err) {
      console.warn("[user/me] smart-skip finalize failed:", err);
    }
  }

  // Flatten the onboarding relation into top-level booleans the
  // mobile AuthGate can read without understanding the nested shape.
  // `onboardingCompleted` is the only flag that drives the redirect;
  // `onboardingStep` helps the client resume where the user left off.
  //
  // `stripeCustomerId` is NEVER returned as a raw string — downstream
  // callers only need to know whether the user has a Stripe customer
  // row (to decide "Upgrade" vs "Manage subscription" UI). Replaced
  // with a boolean `hasStripeCustomer` before send.
  const {
    onboarding,
    createdAt: _created,
    stripeCustomerId,
    ...rest
  } = user;
  void _created; // only used for smart-skip math above
  void onboarding;
  const flat = {
    ...rest,
    onboardingCompleted: Boolean(effectiveCompletedAt),
    onboardingStep: user.onboarding?.currentStep ?? 1,
    hasStripeCustomer: Boolean(stripeCustomerId),
  };

  return NextResponse.json(
    { user: flat },
    {
      status: 200,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    }
  );
}
