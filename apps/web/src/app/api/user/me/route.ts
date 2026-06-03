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
      // Phase 4 dual-source: surfaced so mobile can route
      // "Manage subscription" to the right place (Stripe Customer
      // Portal vs iOS Settings → Subscriptions). Null on FREE +
      // never-subscribed users.
      subscriptionSource: true,
      trialEndsAt: true,
      // Stamped by the trial-expiration cron when TRIAL → FREE.
      // Drives the post-expiry "Your insights are paused" state on
      // the TrialStatusCard (web + mobile) for ~14 days after expiry.
      trialExpiredAt: true,
      // stripeCurrentPeriodEnd is the renewal date once
      // subscriptionStatus flips to PRO. Exposed so the account-page
      // polling can render "Renews [date]" without a second fetch.
      stripeCurrentPeriodEnd: true,
      // Raw customer ID is NOT sent — flattened to a boolean below.
      // Callers use this to decide whether to show "Manage subscription"
      // vs "Upgrade" without needing the underlying id.
      stripeCustomerId: true,
      timezone: true,
      // v1.3.x biometric auto-lock threshold (encoding in
      // apps/mobile/lib/app-lock.ts). Surfaced here for cross-device
      // sync — mobile reads this on cold launch and hydrates the
      // local AsyncStorage value when stored locally diverges.
      autoLockMinutes: true,
      currentStreak: true,
      longestStreak: true,
      // Surfaced for mobile slice 9b — push-token registration triggers
      // exactly when the user hits totalRecordings === 2 (first felt-
      // value moment). Cheap to expose; the column already populates
      // on every entry write.
      totalRecordings: true,
      lastStreakMilestone: true,
      notificationTime: true,
      notificationDays: true,
      notificationsEnabled: true,
      // Multi-reminder list (Slice C, 2026-05-09). Mobile reads this
      // to render the Reminders settings screen with N reminders.
      // Empty array on accounts that haven't opted into reminders;
      // legacy single-time fields above kept in sync via dual-write
      // for not-yet-updated clients.
      reminders: {
        select: {
          id: true,
          time: true,
          daysActive: true,
          enabled: true,
          sortOrder: true,
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
      weeklyEmailEnabled: true,
      monthlyEmailEnabled: true,
      referralCode: true,
      createdAt: true,
      appFirstOpenedAt: true,
      onboarding: { select: { completedAt: true, currentStep: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ user: null }, { status: 404 });
  }

  // Opportunistic lastSeenAt bump + mobile device tracking. Fire-and-
  // forget; a failed write shouldn't block the response. X-Platform /
  // X-App-Version are sent by the mobile client (apps/mobile/lib/api.ts).
  const xPlatform = req.headers.get("x-platform"); // "ios" | "android"
  const xAppVersion = req.headers.get("x-app-version");
  const isMobile = xPlatform === "ios" || xPlatform === "android";

  const updateData: Record<string, unknown> = { lastSeenAt: new Date() };
  if (isMobile) {
    updateData.devicePlatform = xPlatform;
    updateData.appVersion = xAppVersion ?? undefined;
    // Write-once: only set appFirstOpenedAt if it's currently null.
    if (!user.appFirstOpenedAt) {
      updateData.appFirstOpenedAt = new Date();
    }
  }

  void prisma.user
    .update({
      where: { id: userId },
      data: updateData,
    })
    .catch(() => {});

  // Smart-skip: a user who signed up 30+ days ago and never started
  // onboarding (no UserOnboarding row at all) is effectively a
  // returning user. Don't force them through 10 steps on return;
  // silently mark onboarding complete. Demographics + reminders
  // remain editable from /account.
  //
  // CRITICAL: only apply when the row DOESN'T EXIST (`user.onboarding`
  // is null). A row with `completedAt = null` is a *deliberate* reset
  // (admin / QA / Jim resetting in Supabase to re-trigger onboarding),
  // not an abandoned-signup signal. Treating the two cases identically
  // silently reverses the reset on the next /api/user/me hit and
  // routes the user to /(tabs) instead of /onboarding — bug surfaced
  // 2026-05-29 when Jim's TestFlight reset wouldn't take.
  const ABANDON_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;
  const ageMs = Date.now() - user.createdAt.getTime();
  let effectiveCompletedAt = user.onboarding?.completedAt ?? null;
  if (!user.onboarding && ageMs > ABANDON_THRESHOLD_MS) {
    try {
      // Row doesn't exist (guarded above) so a plain create is
      // sufficient. The upsert was carried over from when this branch
      // also handled the row-exists-with-null case, which is now
      // intentionally excluded (respect explicit resets).
      await prisma.userOnboarding.create({
        data: {
          userId,
          completedAt: new Date(),
          currentStep: 1,
        },
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
    createdAt,
    stripeCustomerId,
    appFirstOpenedAt: _appFirst,
    ...rest
  } = user;
  void onboarding;
  void _appFirst; // only used for write-once check above
  const flat = {
    ...rest,
    createdAt: createdAt.toISOString(),
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
