/**
 * GET /api/goals/tree
 *
 * Returns the user's entire goal forest with children recursively
 * populated + tasks attached at leaves + calculated rollup progress.
 *
 * Query:
 *   includeArchived — '1' to include ON_HOLD/COMPLETE status in output.
 *                     Default excludes ON_HOLD (archived bucket).
 *                     COMPLETE goals always render so the user sees
 *                     their wins.
 *
 * Response shape:
 *   {
 *     roots: GoalNode[],
 *     pendingSuggestionsCount: number  // drives the suggestions banner
 *   }
 */

import { NextRequest, NextResponse } from "next/server";

import { buildGoalForest } from "@/lib/goals";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "1";

  const { prisma } = await import("@/lib/prisma");

  const statusFilter = includeArchived
    ? undefined
    : { not: "ON_HOLD" as const };

  const [goals, tasks, pendingCount] = await Promise.all([
    prisma.goal.findMany({
      where: {
        userId,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
    }),
    prisma.task.findMany({
      where: { userId, goalId: { not: null } },
    }),
    prisma.goalSuggestion.count({
      where: { userId, status: "PENDING" },
    }),
  ]);

  const tasksByGoal = new Map<string, typeof tasks>();
  for (const t of tasks) {
    if (!t.goalId) continue;
    const bucket = tasksByGoal.get(t.goalId);
    if (bucket) bucket.push(t);
    else tasksByGoal.set(t.goalId, [t]);
  }

  const roots = buildGoalForest(goals, tasksByGoal);

  return NextResponse.json({
    roots,
    pendingSuggestionsCount: pendingCount,
  });
}
