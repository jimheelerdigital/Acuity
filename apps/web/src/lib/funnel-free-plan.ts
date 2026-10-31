/**
 * Web funnel accounts start on the FREE plan; their 7-day Pro trial needs a
 * card (Stripe Checkout, trial_period_days: 7). See
 * api/onboarding/funnel-free-plan/route.ts for the 2026-09-24 reasoning.
 *
 * 2026-10-31 (per Keenan): the funnel used to do this only with a browser
 * fetch after sign-in, which silently failed for 3 of ~160 recent signups.
 * Those kept the automatic no-card TRIAL, so closing checkout still unlocked
 * the app for a week (Laura, 10-30). The signup route now calls this
 * server-side for funnel signups; the browser call stays as a backstop.
 * Accounts that already slipped through keep their trial (Keenan).
 */
import { NOT_IAP_SOURCE_WHERE } from "@/lib/entitlements";

const NEW_ACCOUNT_WINDOW_MS = 60 * 60 * 1000;

/** /start, /start-bwk, /start-test, /start-test-bwk and any later /start-* funnel. */
export function isWebFunnelPath(path: string | null | undefined): boolean {
  return typeof path === "string" && /^\/start(-[a-z0-9-]+)?\/?(\?.*)?$/i.test(path);
}

/**
 * Move a just-created account from the automatic no-card TRIAL to FREE.
 * Deliberately narrow: created within 60 minutes, still TRIAL, no Stripe
 * subscription, not an Apple/Google IAP row. trialExpiredAt stays null so
 * the "your trial ended" emails and pushes never fire. Returns true when
 * the account was switched.
 */
export async function moveNewFunnelAccountToFree(userId: string): Promise<boolean> {
  const { prisma } = await import("@/lib/prisma");
  const now = new Date();
  const result = await prisma.user.updateMany({
    where: {
      id: userId,
      createdAt: { gte: new Date(now.getTime() - NEW_ACCOUNT_WINDOW_MS) },
      subscriptionStatus: "TRIAL",
      stripeSubscriptionId: null,
      ...NOT_IAP_SOURCE_WHERE,
    },
    data: { subscriptionStatus: "FREE", trialEndsAt: now },
  });
  return result.count === 1;
}
