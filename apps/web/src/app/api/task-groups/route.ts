/**
 * /api/task-groups
 *
 *   GET  — list the current user's task groups, in `order` ascending.
 *          Seeds the 5 defaults on first call if the user has none.
 *
 *   POST — create a new user-authored group. Body: {name, icon, color}.
 *          Rejects duplicate names (case-insensitive) for this user.
 *
 * Related:
 *   - /api/task-groups/[id]       — PATCH (rename/icon/color/order), DELETE
 *   - /api/task-groups/recategorize — POST (re-run AI classification on
 *                                     ungrouped tasks)
 */
import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { ensureDefaultTaskGroups } from "@/lib/task-groups";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  await ensureDefaultTaskGroups(prisma, userId);

  const groups = await prisma.taskGroup.findMany({
    where: { userId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      icon: true,
      color: true,
      order: true,
      isDefault: true,
      isAIGenerated: true,
      _count: { select: { tasks: true } },
    },
  });

  return NextResponse.json({
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      color: g.color,
      order: g.order,
      isDefault: g.isDefault,
      isAIGenerated: g.isAIGenerated,
      taskCount: g._count.tasks,
    })),
  });
}

export async function POST(req: NextRequest) {
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
  } | null;
  if (!body) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const icon = typeof body.icon === "string" ? body.icon.trim() : "";
  const color = typeof body.color === "string" ? body.color.trim() : "";

  if (!name || name.length > 40) {
    return NextResponse.json(
      { error: "Name required, max 40 chars." },
      { status: 400 }
    );
  }
  if (!icon || !color) {
    return NextResponse.json(
      { error: "Icon and color required." },
      { status: 400 }
    );
  }

  const { prisma } = await import("@/lib/prisma");

  // Duplicate-name guard — case-insensitive so "Work" and "work" can't
  // both exist and confuse the extraction classifier.
  const existing = await prisma.taskGroup.findFirst({
    where: {
      userId,
      name: { equals: name, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A group with that name already exists." },
      { status: 409 }
    );
  }

  // Append new group at the end.
  const maxOrder = await prisma.taskGroup.aggregate({
    where: { userId },
    _max: { order: true },
  });
  const nextOrder = (maxOrder._max.order ?? -1) + 1;

  const group = await prisma.taskGroup.create({
    data: {
      userId,
      name,
      icon,
      color,
      order: nextOrder,
      isDefault: false,
      isAIGenerated: false,
    },
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

  return NextResponse.json({ group }, { status: 201 });
}
