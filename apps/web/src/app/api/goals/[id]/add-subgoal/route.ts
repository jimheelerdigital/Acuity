/**
 * POST /api/goals/[id]/add-subgoal
 *
 * Body: { text: string, description?: string, targetDate?: string }
 *
 * Creates a child Goal under [id]. Rejects with 400 if the parent is
 * already at MAX_TREE_DEPTH (= depth would become 5). The new goal is
 * editedByUser=true so the extraction pipeline never overwrites it.
 *
 * Cycle prevention: the self-reference direction (parent → child) can
 * never create a cycle on its own; cycles only appear when reparenting.
 * Depth is checked up-front; nothing else needed here.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { MAX_TREE_DEPTH, computePath } from "@/lib/goals";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  text: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  targetDate: z.string().datetime({ offset: true }).optional(),
  lifeArea: z
    .enum(["CAREER", "HEALTH", "RELATIONSHIPS", "FINANCES", "PERSONAL", "OTHER"])
    .optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { prisma } = await import("@/lib/prisma");

  const parent = await prisma.goal.findFirst({
    where: { id: params.id, userId },
    select: {
      id: true,
      userId: true,
      treePath: true,
      depth: true,
      lifeArea: true,
    },
  });
  if (!parent) {
    return NextResponse.json({ error: "Parent goal not found" }, { status: 404 });
  }

  if (parent.depth + 1 > MAX_TREE_DEPTH) {
    return NextResponse.json(
      {
        error: "MaxDepthExceeded",
        detail: `Parent is already at depth ${parent.depth}; max tree depth is ${MAX_TREE_DEPTH}.`,
      },
      { status: 400 }
    );
  }

  // Create the child first (we need its id for the treePath), then
  // update its path in a follow-up query. Two queries kept outside a
  // transaction because the second only mutates the row we just wrote
  // and a partial failure is recoverable on the next write.
  const created = await prisma.goal.create({
    data: {
      userId,
      title: parsed.data.text,
      description: parsed.data.description ?? null,
      targetDate: parsed.data.targetDate
        ? new Date(parsed.data.targetDate)
        : null,
      lifeArea: parsed.data.lifeArea ?? parent.lifeArea,
      parentGoalId: parent.id,
      editedByUser: true, // user-authored from the first keystroke
    },
  });

  const { treePath, depth } = computePath(created.id, {
    id: parent.id,
    treePath: parent.treePath,
    depth: parent.depth,
  });

  const updated = await prisma.goal.update({
    where: { id: created.id },
    data: { treePath, depth },
  });

  return NextResponse.json({ goal: updated }, { status: 201 });
}
