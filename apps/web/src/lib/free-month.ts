import { createHmac, timingSafeEqual } from "crypto";

import { NOT_IAP_SOURCE_WHERE } from "@/lib/entitlements";

/**
 * Win-back free month (2026-10-14, per Keenan: "send out a 'free month'
 * email to every single user on our end that's churned. ask them what the
 * app lacked, why they stopped using it, and what prevented it from being
 * their go-to app").
 *
 * Audience: free-plan accounts that already had Pro and lost it, i.e. a
 * paid sub or card trial that ended, or a free trial that ran out. Funnel
 * leavers who never had a trial get the free week instead (lib/free-week.ts).
 *
 * Same mechanics as the free week: the email button opens /free-month, and
 * the month starts only on a form POST (mail scanners can't start it).
 * Claiming sets the cardless TRIAL state with 30 days on the clock, and
 * trial-expiration-cron returns them to FREE afterwards. App Store / Google
 * Play subscribers are excluded (NOT_IAP_SOURCE_WHERE): the store owns their
 * entitlement, so a server-side trial would be overwritten.
 *
 * No schema change: the one-time claim is an OnboardingEvent
 * ("free_month_claimed").
 */

export const FREE_MONTH_DAYS = 30;
export const FREE_MONTH_CLAIMED_EVENT = "free_month_claimed";

const TOKEN_TTL_MS = 45 * 24 * 60 * 60 * 1000;

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const sig = (payload: string) => {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET unset");
  return createHmac("sha256", `free-month:${secret}`).update(payload).digest();
};

/** Signed claim link token: base64url(userId.expiresAtMs).base64url(hmac). */
export function signFreeMonthToken(userId: string): string {
  const payload = b64(`${userId}.${Date.now() + TOKEN_TTL_MS}`);
  return `${payload}.${b64(sig(payload))}`;
}

/** The user id, or null when the token is malformed, forged or expired. */
export function verifyFreeMonthToken(token: string | null | undefined): string | null {
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

export function freeMonthUrl(userId: string, campaign: string): string {
  const origin = process.env.NEXTAUTH_URL ?? "https://goripple.io";
  const t = encodeURIComponent(signFreeMonthToken(userId));
  return `${origin}/free-month?t=${t}&utm_source=email&utm_medium=winback&utm_campaign=${campaign}`;
}

/**
 * Prisma filter for "churned and can still claim": on the free plan, had Pro
 * before (a Stripe sub/card trial, or a trial that expired), not a store
 * subscriber, never claimed the free month.
 */
export const FREE_MONTH_ELIGIBLE_WHERE = {
  subscriptionStatus: "FREE",
  AND: [
    { OR: [{ stripeSubscriptionId: { not: null } }, { subscriptionSource: "stripe" }, { trialExpiredAt: { not: null } }] },
    NOT_IAP_SOURCE_WHERE,
  ],
  onboardingEvents: { none: { event: FREE_MONTH_CLAIMED_EVENT } },
};

export type FreeMonthClaimResult = "claimed" | "already_claimed" | "already_pro" | "not_eligible";

/** Start the month. Idempotent: a second tap reports already_claimed. */
export async function claimFreeMonth(userId: string): Promise<FreeMonthClaimResult> {
  const { prisma } = await import("@/lib/prisma");
  const now = new Date();
  const switched = await prisma.$transaction(async (tx) => {
    const res = await tx.user.updateMany({
      where: { id: userId, ...FREE_MONTH_ELIGIBLE_WHERE },
      data: {
        subscriptionStatus: "TRIAL",
        trialEndsAt: new Date(now.getTime() + FREE_MONTH_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    if (res.count === 1) {
      await tx.onboardingEvent.create({ data: { userId, event: FREE_MONTH_CLAIMED_EVENT } });
    }
    return res.count === 1;
  });
  if (switched) return "claimed";
  const state = await freeMonthState(userId);
  return state === "eligible" ? "not_eligible" : state;
}

/** Where this user stands, without changing anything (for the landing page). */
export async function freeMonthState(userId: string): Promise<FreeMonthClaimResult | "eligible"> {
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: {
      subscriptionStatus: true,
      onboardingEvents: { where: { event: FREE_MONTH_CLAIMED_EVENT }, select: { id: true }, take: 1 },
    },
  });
  if (!user) return "not_eligible";
  if (user.onboardingEvents.length > 0) return "already_claimed";
  if (user.subscriptionStatus === "PRO") return "already_pro";
  const eligible = await prisma.user.count({ where: { id: userId, ...FREE_MONTH_ELIGIBLE_WHERE } });
  return eligible === 1 ? "eligible" : "not_eligible";
}
