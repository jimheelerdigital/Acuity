/**
 * GET /api/achievements
 *
 * Full catalog of active achievements joined with the requesting
 * user's UserAchievement rows. Returns earned status + earnedAt +
 * pointsAwarded for each. Sorted by category then sortOrder so the
 * client can render the three-section grid (Consistency, Reflection,
 * Moment) without further client-side sorting.
 *
 * Auth: cookie session on web, Bearer JWT on mobile via
 * getAnySessionUserId. Same auth shape as the rest of /api.
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

  const [catalog, earned] = await Promise.all([
    prisma.achievement.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.userAchievement.findMany({
      where: { userId },
      select: {
        achievementId: true,
        earnedAt: true,
        pointsAwarded: true,
        shownToUser: true,
        shownAt: true,
      },
    }),
  ]);

  const earnedById = new Map(earned.map((e) => [e.achievementId, e]));

  const items = catalog.map((a) => {
    const e = earnedById.get(a.id);
    return {
      id: a.id,
      slug: a.slug,
      title: a.title,
      description: a.description,
      category: a.category,
      tier: a.tier,
      emblem: a.emblem,
      points: a.points,
      iconKey: a.iconKey,
      earned: Boolean(e),
      earnedAt: e ? e.earnedAt.toISOString() : null,
      pointsAwarded: e ? e.pointsAwarded : null,
    };
  });

  const totalPoints = earned.reduce((sum, e) => sum + e.pointsAwarded, 0);

  return NextResponse.json({
    items,
    totals: {
      earned: earned.length,
      total: catalog.length,
      points: totalPoints,
    },
  });
}
