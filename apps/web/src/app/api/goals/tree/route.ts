/**
 * GET /api/goals/tree
 *
 * Returns the user's entire goal forest with children recursively
 * populated + tasks attached at leaves + calculated rollup progress.
 *
 * Query:
 *   includeArchived — '1' to include ARCHIVED goals. Default excludes
 *                     them — they're the "hide from me" bucket.
 *                     ON_HOLD goals still render in the default view
 *                     because "paused for now" is not the same as
 *                     "hide this". COMPLETE always renders so the
 *                     user sees their wins.
 *
 * Response shape:
 *   {
 *     roots: GoalNode[],
 *     pendingSuggestionsCount: number  // drives the suggestions banner
 *   }
 */

import { NextRequest, NextResponse } from "next/server";

import { buildGoalForest } from "@/lib/goals";
import { gateFeatureFlag } from "@/lib/feature-flags";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const gated = await gateFeatureFlag(userId, "goal_progression_tree");
  if (gated) return gated;

  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "1";

  const { prisma } = await import("@/lib/prisma");

  const statusFilter = includeArchived
    ? undefined
    : { not: "ARCHIVED" as const };

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
