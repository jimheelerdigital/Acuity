import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 60; // cache for 60 seconds

const FOUNDING_MEMBER_CAP = 100;

/**
 * GET /api/founding-members
 * Returns the number of spots left for founding member pricing.
 * Cached server-side for 60 seconds.
 */
export async function GET() {
  const { prisma } = await import("@/lib/prisma");

  const count = await prisma.user.count({
    where: { isFoundingMember: true },
  });

  const spotsLeft = Math.max(0, FOUNDING_MEMBER_CAP - count);

  return NextResponse.json(
    { spotsLeft, total: FOUNDING_MEMBER_CAP, claimed: count },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
      },
    }
  );
}
