/**
 * GET /api/user/referrals
 *
 * Returns the signed-in user's referral code + simple stats. Stats
 * are derived from the User.referrals relation (signups who listed
 * the caller as their referrer) and ReferralConversion (trial→paid
 * among those signups).
 *
 * Cookie OR Bearer auth. Stats only — no per-user names or emails of
 * referrals are exposed, to avoid leaking who joined via whose link
 * in a way that the referrer might not expect.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  const [user, signupCount, conversionCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    }),
    prisma.user.count({ where: { referredById: userId } }),
    prisma.referralConversion.count({ where: { referrerId: userId } }),
  ]);

  // Lazy-issue a code for users that predate the referral system
  // (pre-2026-04-21 signups). bootstrap-user issues on new signups.
  let code = user?.referralCode ?? null;
  if (!code) {
    const { generateReferralCode } = await import("@/lib/referrals");
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateReferralCode();
      const existing = await prisma.user.findFirst({
        where: { referralCode: candidate },
        select: { id: true },
      });
      if (!existing) {
        await prisma.user.update({
          where: { id: userId },
          data: { referralCode: candidate },
        });
        code = candidate;
        break;
      }
    }
  }

  return NextResponse.json(
    {
      referralCode: code,
      signups: signupCount,
      conversions: conversionCount,
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}
