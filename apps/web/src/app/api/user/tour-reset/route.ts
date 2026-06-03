/**
 * POST /api/user/tour-reset
 *
 * Clears the signed-in user's tourCompletedAt so the first-login
 * product tour fires again on the next home mount. Called from the
 * "Replay product tour" row in Profile → Preferences.
 *
 * Does NOT remove the `guided_start` UserAchievement — once the
 * badge is earned, it stays. Replaying the tour is a UX choice, not
 * an unlocking-the-achievement-again moment.
 *
 * Idempotent: replay-replay just keeps tourCompletedAt at null.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  await prisma.user.update({
    where: { id: userId },
    data: { tourCompletedAt: null },
  });

  return NextResponse.json({ ok: true });
}
