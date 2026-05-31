/**
 * GET /api/achievements/pending
 *
 * Returns UserAchievement rows where shownToUser=false, joined to the
 * Achievement metadata so the client can render the celebration modal
 * without a second fetch. Ordered by earnedAt ascending — the oldest
 * un-shown badge comes first so the queue plays in earn order.
 *
 * The client (mobile + web) polls this on:
 *   - app foreground / page mount
 *   - immediately after a successful entry processing completes
 * and displays them sequentially via the CelebrationModal queue.
 *
 * Auth: same cookie/bearer pattern as /api/achievements.
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

  const rows = await prisma.userAchievement.findMany({
    where: { userId, shownToUser: false },
    orderBy: { earnedAt: "asc" },
    include: {
      achievement: {
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          category: true,
          tier: true,
          emblem: true,
          points: true,
          iconKey: true,
        },
      },
    },
  });

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      achievementId: r.achievementId,
      earnedAt: r.earnedAt.toISOString(),
      pointsAwarded: r.pointsAwarded,
      achievement: r.achievement,
    })),
  });
}
