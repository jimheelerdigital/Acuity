/**
 * /api/task-groups/[id]
 *
 *   PATCH  — update {name?, icon?, color?, order?} on a group this
 *            user owns. Name updates check for duplicates first.
 *
 *   DELETE — delete a group this user owns. Tasks with this groupId
 *            automatically become ungrouped (Prisma onDelete: SetNull).
 *            Optionally, body: {moveTasksTo: <targetGroupId>} reassigns
 *            the tasks to another of the user's groups before delete.
 *            The user's LAST remaining group cannot be deleted — keeps
 *            the app from entering a state with zero groups, which the
 *            extraction classifier assumes won't happen.
 */
import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceUserRateLimit("userWrite", userId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    icon?: string;
    color?: string;
    order?: number;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");

  const existing = await prisma.taskGroup.findFirst({
    where: { id: params.id, userId },
    select: { id: true, name: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: {
    name?: string;
    icon?: string;
    color?: string;
    order?: number;
  } = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name || name.length > 40) {
      return NextResponse.json(
        { error: "Name must be 1–40 chars." },
        { status: 400 }
      );
    }
    if (name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await prisma.taskGroup.findFirst({
        where: {
          userId,
          name: { equals: name, mode: "insensitive" },
          NOT: { id: params.id },
        },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: "A group with that name already exists." },
          { status: 409 }
        );
      }
    }
    data.name = name;
  }
  if (typeof body.icon === "string" && body.icon.trim()) {
    data.icon = body.icon.trim();
  }
  if (typeof body.color === "string" && body.color.trim()) {
    data.color = body.color.trim();
  }
  if (typeof body.order === "number" && Number.isFinite(body.order)) {
    data.order = Math.max(0, Math.floor(body.order));
  }

  const group = await prisma.taskGroup.update({
    where: { id: params.id },
    data,
    select: {
      id: true,
      name: true,
      icon: true,
      color: true,
      order: true,
      isDefault: true,
      isAIGenerated: true,
    },
  });

  return NextResponse.json({ group });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceUserRateLimit("userWrite", userId);
  if (limited) return limited;

  // Optional reassignment target before delete. Accepts a JSON body
  // with `moveTasksTo` — if omitted, tasks become ungrouped.
  const body = (await req
    .json()
    .catch(() => ({}) as { moveTasksTo?: string })) as {
    moveTasksTo?: string;
  };
  const moveTasksTo =
    typeof body.moveTasksTo === "string" ? body.moveTasksTo : null;

  const { prisma } = await import("@/lib/prisma");

  const existing = await prisma.taskGroup.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Guard against deleting the user's last group.
  const groupCount = await prisma.taskGroup.count({ where: { userId } });
  if (groupCount <= 1) {
    return NextResponse.json(
      { error: "Can't delete your last group." },
      { status: 409 }
    );
  }

  if (moveTasksTo) {
    const target = await prisma.taskGroup.findFirst({
      where: { id: moveTasksTo, userId },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json(
        { error: "Target group not found." },
        { status: 400 }
      );
    }
    // Reassign before delete so the SetNull cascade doesn't touch any
    // of the user's tasks.
    await prisma.task.updateMany({
      where: { userId, groupId: params.id },
      data: { groupId: target.id },
    });
  }

  await prisma.taskGroup.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
