/**
 * PATCH /api/goals/[id]/reparent
 *
 * Body: { newParentId: string | null }  (null = make top-level)
 *
 * Moves a goal (and its subtree) under a new parent.
 *
 * Validation:
 *   - newParentId must belong to same user (or be null)
 *   - newParentId must not be the goal itself nor any descendant
 *     (cycle prevention)
 *   - newParent.depth + 1 + subtreeMaxDepth <= MAX_TREE_DEPTH
 *
 * After validation, recompute treePath + depth for the moved subtree.
 * Walks the subtree via the flat goal list (fewer queries than a
 * recursive CTE); updates each goal's path/depth individually inside
 * a transaction.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  MAX_TREE_DEPTH,
  collectDescendantIds,
  computePath,
  subtreeMaxDepth,
} from "@/lib/goals";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  newParentId: z.string().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceUserRateLimit("goalReparent", userId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { newParentId } = parsed.data;

  if (newParentId === params.id) {
    return NextResponse.json(
      { error: "CycleDetected", detail: "Cannot reparent a goal onto itself." },
      { status: 400 }
    );
  }

  const { prisma } = await import("@/lib/prisma");

  // Fetch the whole user-scoped goal set up-front so descendant +
  // depth math runs in memory. A user's tree is tractable; a
  // reparent is rare.
  const allGoals = await prisma.goal.findMany({
    where: { userId },
  });

  const target = allGoals.find((g) => g.id === params.id);
  if (!target) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  let newParentDepth = -1;
  let newParentTreePath: string | null = null;
  if (newParentId !== null) {
    const parent = allGoals.find((g) => g.id === newParentId);
    if (!parent) {
      return NextResponse.json(
        { error: "New parent not found" },
        { status: 404 }
      );
    }
    const descendantIds = collectDescendantIds(target.id, allGoals);
    if (descendantIds.has(newParentId)) {
      return NextResponse.json(
        {
          error: "CycleDetected",
          detail:
            "New parent is a descendant of the target. Reparent would create a cycle.",
        },
        { status: 400 }
      );
    }
    newParentDepth = parent.depth;
    newParentTreePath = parent.treePath;
  }

  const maxSubtree = subtreeMaxDepth(target.id, allGoals);
  const newRootDepth = newParentId === null ? 0 : newParentDepth + 1;
  if (newRootDepth + maxSubtree > MAX_TREE_DEPTH) {
    return NextResponse.json(
      {
        error: "MaxDepthExceeded",
        detail: `Subtree depth ${maxSubtree} + new root depth ${newRootDepth} exceeds max ${MAX_TREE_DEPTH}.`,
      },
      { status: 400 }
    );
  }

  // Compute the path for the target, then every descendant.
  const { treePath: targetPath, depth: targetDepth } = computePath(
    target.id,
    newParentId === null
      ? null
      : {
          id: newParentId,
          treePath: newParentTreePath,
          depth: newParentDepth,
        }
  );

  // Build a childrenByParent map from the current flat list so we can
  // walk the subtree and compute new paths for every descendant.
  const byParent = new Map<string, typeof allGoals>();
  for (const g of allGoals) {
    if (!g.parentGoalId) continue;
    const bucket = byParent.get(g.parentGoalId);
    if (bucket) bucket.push(g);
    else byParent.set(g.parentGoalId, [g]);
  }

  type Update = { id: string; treePath: string; depth: number };
  const updates: Update[] = [
    { id: target.id, treePath: targetPath, depth: targetDepth },
  ];

  const walk = (parentId: string, parentPath: string, parentDepth: number) => {
    const children = byParent.get(parentId) ?? [];
    for (const c of children) {
      const path = `${parentPath}${c.id}/`;
      const depth = parentDepth + 1;
      updates.push({ id: c.id, treePath: path, depth });
      walk(c.id, path, depth);
    }
  };
  walk(target.id, targetPath, targetDepth);

  await prisma.$transaction(async (tx) => {
    // Update the target's parentGoalId separately from path/depth so
    // Prisma's generated query makes the parent-link change explicit.
    await tx.goal.update({
      where: { id: target.id },
      data: {
        parentGoalId: newParentId,
        treePath: targetPath,
        depth: targetDepth,
      },
    });
    for (const u of updates) {
      if (u.id === target.id) continue; // already applied above
      await tx.goal.update({
        where: { id: u.id },
        data: { treePath: u.treePath, depth: u.depth },
      });
    }
  });

  return NextResponse.json({ ok: true, updated: updates.length });
}
