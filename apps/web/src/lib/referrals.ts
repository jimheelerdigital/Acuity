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

/**
 * Called from the Stripe webhook when a user's trial converts to
 * paid. If they have a referrer, write a ReferralConversion row.
 * Reward fulfillment is a TODO — see spec W7.
 */
export async function recordReferralConversion(userId: string): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referredById: true },
  });
  if (!user?.referredById) return;

  // Dedupe — a user's trial only converts once in practice (they'd
  // have to cancel + re-start to hit this path a second time), but
  // the unique key on (referrerId, referredUserId) enforces it in
  // storage. Catch the P2002 if it fires.
  try {
    await prisma.referralConversion.create({
      data: {
        referrerId: user.referredById,
        referredUserId: userId,
      },
    });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code !== "P2002") {
      console.error("[referrals] conversion create failed:", err);
    }
  }

  // TODO (Jim): reward fulfillment. Current stub does nothing beyond
  // recording the conversion. Decide: Stripe credit? Extra trial
  // days? In-app "pro gift" flag? Wire it here.
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
