/**
 * POST /api/achievements/[id]/seen
 *
 * Marks a UserAchievement as shown to the user. The [id] path param
 * is the UserAchievement.id (NOT the Achievement.id) so we can scope
 * by ownership without a separate lookup.
 *
 * Idempotent — repeated POSTs for the same id are no-ops after the
 * first. Returns 404 if the row doesn't exist or belongs to a
 * different user (we don't leak existence).
 *
 * Auth: same cookie/bearer pattern as /api/achievements.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");

  const row = await prisma.userAchievement.findFirst({
    where: { id, userId },
    select: { id: true, shownToUser: true },
  });
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!row.shownToUser) {
    await prisma.userAchievement.update({
      where: { id },
      data: { shownToUser: true, shownAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
