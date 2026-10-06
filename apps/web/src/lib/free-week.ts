import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

import { NOT_IAP_SOURCE_WHERE } from "@/lib/entitlements";

/**
 * No-card free week (2026-10-06, per Keenan: "go use us for a week for free
 * with no card"). Offered by email to web-funnel signups who left the funnel
 * without paying (recovery orchestrator: free_week_offer ~20 min after
 * signup, free_week_followup 2 days later if unclaimed).
 *
 * The paywall stays card-only. On 2026-09-24 the automatic no-card week was
 * removed because it made the card ask pointless (305 no-card trials → 1
 * payer, 36 card trials → 11). This week only goes to people who already
 * declined the card, and only when they tap the email button.
 *
 * Claiming sets the user back to the cardless TRIAL state with 7 days on the
 * clock. Everything after that is the existing trial lifecycle: trial_ending
 * / never_recorded_3day / never_recorded_lastday before the end, and
 * trial-expiration-cron flips them to FREE (stamping trialExpiredAt) after.
 *
 * No schema change: the one-time claim is an OnboardingEvent
 * ("free_week_claimed"), and an expired free week leaves trialExpiredAt set,
 * which also fails the eligibility check below.
 */

export const FREE_WEEK_DAYS = 7;
export const FREE_WEEK_CLAIMED_EVENT = "free_week_claimed";
/** Funnel signups before the card-only paywall (09-24) already had a no-card week. */
export const FREE_WEEK_SIGNUPS_FROM = new Date("2026-09-24T00:00:00Z");

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const sig = (payload: string) => {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET unset");
  return createHmac("sha256", `free-week:${secret}`).update(payload).digest();
};

/** Signed claim link token: base64url(userId.expiresAtMs).base64url(hmac). */
export function signFreeWeekToken(userId: string): string {
  const payload = b64(`${userId}.${Date.now() + TOKEN_TTL_MS}`);
  return `${payload}.${b64(sig(payload))}`;
}

/** The user id, or null when the token is malformed, forged or expired. */
export function verifyFreeWeekToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = sig(payload);
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [userId, exp] = Buffer.from(payload, "base64url").toString().split(".");
  if (!userId || !exp || Date.now() > Number(exp)) return null;
  return userId;
}

export function freeWeekUrl(userId: string, campaign: string): string {
  const origin = process.env.NEXTAUTH_URL ?? "https://goripple.io";
  const t = encodeURIComponent(signFreeWeekToken(userId));
  return `${origin}/free-week?t=${t}&utm_source=email&utm_medium=recovery&utm_campaign=${campaign}`;
}

/**
 * Prisma filter for "can still claim": a web-funnel free-plan account that
 * never had a trial or a paid sub. The claimed-event check is separate
 * (relation filter on onboardingEvents).
 */
export const FREE_WEEK_ELIGIBLE_WHERE = {
  subscriptionStatus: "FREE",
  stripeSubscriptionId: null,
  trialExpiredAt: null,
  createdAt: { gte: FREE_WEEK_SIGNUPS_FROM },
  onboardingEvents: { none: { event: FREE_WEEK_CLAIMED_EVENT } },
  ...NOT_IAP_SOURCE_WHERE,
};

export type ClaimResult = "claimed" | "already_claimed" | "already_pro" | "not_eligible";

/** Start the free week. Safe to call twice: the second call is a no-op. */
export async function claimFreeWeek(userId: string): Promise<ClaimResult> {
  const { prisma } = await import("@/lib/prisma");
  const now = new Date();

  const switched = await prisma.$transaction(async (tx) => {
    const res = await tx.user.updateMany({
      where: { id: userId, ...FREE_WEEK_ELIGIBLE_WHERE },
      data: {
        subscriptionStatus: "TRIAL",
        trialEndsAt: new Date(now.getTime() + FREE_WEEK_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    if (res.count === 1) {
      await tx.onboardingEvent.create({ data: { userId, event: FREE_WEEK_CLAIMED_EVENT } });
    }
    return res.count === 1;
  });
  if (switched) return "claimed";
  const state = await freeWeekState(userId);
  return state === "eligible" ? "not_eligible" : state;
}

/** Where this user stands, without changing anything (for the landing page). */
export async function freeWeekState(userId: string): Promise<ClaimResult | "eligible"> {
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: {
      subscriptionStatus: true,
      stripeSubscriptionId: true,
      onboardingEvents: { where: { event: FREE_WEEK_CLAIMED_EVENT }, select: { id: true }, take: 1 },
    },
  });
  if (!user) return "not_eligible";
  if (user.onboardingEvents.length > 0) return "already_claimed";
  if (user.subscriptionStatus === "PRO" || user.stripeSubscriptionId) return "already_pro";
  const eligible = await prisma.user.count({ where: { id: userId, ...FREE_WEEK_ELIGIBLE_WHERE } });
  return eligible === 1 ? "eligible" : "not_eligible";
}
