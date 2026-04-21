/**
 * Referral program helpers. The model + UI surfaces land in W7; this
 * file exists so the Stripe webhook's checkout.session.completed
 * handler can call into a stable entry point today, and the
 * conversion-write logic gets filled in when the schema lands.
 *
 * Reward fulfillment is intentionally NOT implemented — Jim picks the
 * reward type + cadence. The TODO near recordReferralConversion is
 * where it plugs in.
 */

import type { PrismaClient } from "@prisma/client";

/**
 * Generate a human-friendly referral code. 8 chars, uppercase,
 * unambiguous alphabet (no 0/O/I/1). Short enough to say out loud,
 * long enough that collisions are vanishingly rare at beta scale.
 */
export function generateReferralCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/** Maximum rewarded referral conversions per referrer per 365 days.
 *  Over this cap, conversions still record for accounting but don't
 *  earn the +30-day credit. Keeps farming at bay without punishing
 *  the ~1% of superfans who'd hit it legitimately. */
export const REFERRAL_ANNUAL_CAP = 12;

/** Days of reward granted per qualifying conversion (referrer side).
 *  Symmetric with the referred-user bonus in bootstrap-user.ts. */
export const REFERRAL_REWARD_DAYS = 30;

/**
 * Called from the Stripe webhook when a user's trial converts to
 * paid. If they have a referrer, write a ReferralConversion row
 * and (subject to the 12/year cap) grant the referrer a 30-day
 * reward.
 *
 * Reward application — the tricky part since referrers can be in
 * different subscription states:
 *   - TRIAL referrer → extend trialEndsAt by 30 days in-place.
 *   - PAID / PAST_DUE / FREE → accrue the days on a User column
 *     (`referralRewardDays`). A future renewal-time job will apply
 *     the credit; for beta the counter is the source of truth and
 *     gets shown in /account so the user sees the reward stacked up.
 */
export async function recordReferralConversion(userId: string): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referredById: true },
  });
  if (!user?.referredById) return;

  let createdNew = false;
  try {
    await prisma.referralConversion.create({
      data: {
        referrerId: user.referredById,
        referredUserId: userId,
      },
    });
    createdNew = true;
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code !== "P2002") {
      console.error("[referrals] conversion create failed:", err);
    }
    // P2002 means we've already recorded this conversion — don't
    // double-apply the reward on webhook retry.
    return;
  }

  if (!createdNew) return;

  // Cap check: count conversions in the last 365 days, NOT including
  // the row we just inserted (so the cap is "12 rewards per 12 months"
  // rather than "12 conversions total including the one in progress").
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const rewardedThisYear = await prisma.referralConversion.count({
    where: {
      referrerId: user.referredById,
      convertedAt: { gte: yearAgo, lt: new Date() },
      // Excludes the just-created row by time bound (lt:new Date)
    },
  });

  // `rewardedThisYear` includes the row we just inserted in practice
  // (convertedAt defaults to now(), very close to our Date). Treat the
  // cap inclusively.
  if (rewardedThisYear > REFERRAL_ANNUAL_CAP) {
    // Still above cap — don't fulfill reward, but the conversion row
    // lives on for accounting. /account shows "Cap reached".
    return;
  }

  const referrer = await prisma.user.findUnique({
    where: { id: user.referredById },
    select: { subscriptionStatus: true, trialEndsAt: true },
  });
  if (!referrer) return;

  if (referrer.subscriptionStatus === "TRIAL") {
    const base = referrer.trialEndsAt && referrer.trialEndsAt > new Date()
      ? referrer.trialEndsAt
      : new Date();
    await prisma.user.update({
      where: { id: user.referredById },
      data: {
        trialEndsAt: new Date(
          base.getTime() + REFERRAL_REWARD_DAYS * 24 * 60 * 60 * 1000
        ),
      },
    });
  } else {
    // Non-trial referrer — accrue the days. Applied at next
    // subscription renewal (TODO: renewal-hook consumer).
    await prisma.user.update({
      where: { id: user.referredById },
      data: {
        referralRewardDays: { increment: REFERRAL_REWARD_DAYS },
      },
    });
  }
}

/**
 * Resolve a referral code to the referring user's id. Used at signup
 * time when the query string carries ?ref=CODE.
 */
export async function resolveReferrerByCode(
  prisma: PrismaClient,
  code: string
): Promise<string | null> {
  if (!code || code.length < 4 || code.length > 16) return null;
  const upper = code.toUpperCase();
  const user = await prisma.user.findFirst({
    where: { referralCode: upper },
    select: { id: true },
  });
  return user?.id ?? null;
}
