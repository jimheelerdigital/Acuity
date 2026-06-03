/**
 * POST /api/user/tour-complete
 *
 * Persists tourCompletedAt on the signed-in User AND awards the
 * `guided_start` achievement if it hasn't been earned yet. Called
 * from the mobile tour orchestrator at both the natural-completion
 * path AND the user-skipped path — we treat both as "done, don't
 * keep nagging." The guided_start UserAchievement row only inserts
 * if the user completed the full tour (last step reached); a
 * mid-tour skip writes tourCompletedAt but does NOT award. We can
 * tell from the client; for now we always award since the client
 * only calls this once and we want the achievement to fire as the
 * positive payoff for finishing.
 *
 * Idempotent: if tourCompletedAt is already set, we don't overwrite
 * (preserves the original completion timestamp). The UserAchievement
 * insert uses skipDuplicates so re-calls don't create duplicate rows.
 *
 * Response shape: { ok: true, awarded: boolean } — awarded=true means
 * this call inserted a fresh UserAchievement row (so the celebration
 * modal will fire on the next /api/achievements/pending poll).
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GUIDED_START_SLUG = "guided_start";

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  // 1) Stamp tourCompletedAt if not already set. updateMany with the
  //    IS NULL re-assert is the idempotent pattern.
  await prisma.user.updateMany({
    where: { id: userId, tourCompletedAt: null },
    data: { tourCompletedAt: new Date() },
  });

  // 2) Award guided_start if not already awarded. Look up the
  //    Achievement row (seeded via Supabase migration) and insert
  //    UserAchievement. skipDuplicates handles the race against
  //    a parallel call.
  const ach = await prisma.achievement.findUnique({
    where: { slug: GUIDED_START_SLUG },
    select: { id: true, points: true, isActive: true },
  });

  let awarded = false;
  if (ach && ach.isActive) {
    const result = await prisma.userAchievement.createMany({
      data: {
        userId,
        achievementId: ach.id,
        pointsAwarded: ach.points,
        shownToUser: false,
      },
      skipDuplicates: true,
    });
    awarded = result.count > 0;
  }

  return NextResponse.json({ ok: true, awarded });
}
