/**
 * GET /api/insights/follow-through (2026-10-27)
 *
 * Weekly follow-through for the Insights tab: tasks captured vs completed
 * (this week vs last), typical days to finish by group, and what's still
 * open. Logic and thresholds live in lib/follow-through.ts. Returns
 * { report: null } when there isn't enough data; the card then renders
 * nothing.
 */
import { NextRequest, NextResponse } from "next/server";

import { computeFollowThrough, DAY_MS } from "@/lib/follow-through";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { prisma } = await import("@/lib/prisma");
  const since = new Date(Date.now() - 60 * DAY_MS);

  const [tasks, groups] = await Promise.all([
    prisma.task.findMany({
      where: {
        userId,
        OR: [{ createdAt: { gte: since } }, { completedAt: { gte: since } }],
      },
      select: {
        id: true,
        title: true,
        text: true,
        status: true,
        entryId: true,
        groupId: true,
        createdAt: true,
        completedAt: true,
      },
    }),
    prisma.taskGroup.findMany({
      where: { userId },
      select: { id: true, name: true },
    }),
  ]);

  const report = computeFollowThrough(tasks, groups);
  return NextResponse.json(
    { report },
    { headers: { "Cache-Control": "private, max-age=300" } }
  );
}
