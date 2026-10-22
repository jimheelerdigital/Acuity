/**
 * POST /api/task-groups/recategorize
 *
 * Runs Claude over this user's currently-ungrouped tasks (Task.groupId
 * IS NULL and status != DONE) and assigns each one to the best-match
 * TaskGroup. Returns a count. Used by the "Re-run AI categorization"
 * button on the task-groups settings page.
 *
 * Rate-limited by the `expensiveAi` bucket (10/hour).
 */
import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { classifyTasks } from "@/lib/task-group-classify";
import { ensureDefaultTaskGroups, resolveGroupName } from "@/lib/task-groups";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Cap how many tasks we send to Claude per call — each task is small
// but we don't want to spend the whole token budget on a mass re-run.
const MAX_TASKS_PER_CALL = 40;

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceUserRateLimit("expensiveAi", userId);
  if (limited) return limited;

  const { prisma } = await import("@/lib/prisma");
  await ensureDefaultTaskGroups(prisma, userId);

  const groups = await prisma.taskGroup.findMany({
    where: { userId },
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  });
  if (groups.length === 0) {
    return NextResponse.json({ updated: 0 });
  }
  const groupNames = groups.map((g) => g.name);

  const ungrouped = await prisma.task.findMany({
    where: { userId, groupId: null, status: { not: "DONE" } },
    orderBy: { createdAt: "desc" },
    take: MAX_TASKS_PER_CALL,
    select: { id: true, title: true, text: true, description: true },
  });

  if (ungrouped.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const classifications = await classifyTasks(ungrouped, groupNames);

  let updated = 0;
  for (const task of ungrouped) {
    const chosen = classifications[task.id];
    const groupId = await resolveGroupName(prisma, userId, chosen);
    if (!groupId) continue;
    await prisma.task.update({
      where: { id: task.id },
      data: { groupId },
      // Explicit select — production DB doesn't yet have C3
      // calendar columns. Without this, the post-update RETURNING
      // projection triggers P2022.
      select: { id: true },
    });
    updated += 1;
  }

  return NextResponse.json({ updated });
}
