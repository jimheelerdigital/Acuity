import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

/**
 * Edit / archive a single habit.
 *
 * PATCH  /api/habits/[id]  → rename and/or set active days (pause = []).
 * DELETE /api/habits/[id]  → archive (soft delete). The check history is
 *                            kept so streak/insight data survives; an
 *                            archived habit simply stops appearing and
 *                            stops nudging.
 *
 * Ownership is always verified against the session user — the id alone
 * says nothing about who owns the habit.
 */

export const dynamic = "force-dynamic";

function isFlagOn(): boolean {
  return process.env.ENABLE_HABITS === "1";
}

/** Same select shape the list route returns, so clients can reconcile. */
const HABIT_SELECT = {
  id: true,
  name: true,
  type: true,
  daysActive: true,
  archivedAt: true,
  sortOrder: true,
  createdAt: true,
} as const;

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isFlagOn()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    daysActive?: unknown;
  } | null;

  const data: { name?: string; daysActive?: number[] } = {};

  if (body?.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (name.length > 80) {
      return NextResponse.json({ error: "Name is too long" }, { status: 400 });
    }
    data.name = name;
  }

  if (body?.daysActive !== undefined) {
    // Days are validated, not trusted: an out-of-range value would make the
    // habit silently never appear. An empty array is allowed — that is the
    // "paused" state. Same rules as the create route.
    if (!Array.isArray(body.daysActive)) {
      return NextResponse.json(
        { error: "daysActive must be an array" },
        { status: 400 }
      );
    }
    const parsed = body.daysActive
      .map((d) => (typeof d === "number" ? d : Number.NaN))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    data.daysActive = Array.from(new Set(parsed)).sort();
  }

  if (data.name === undefined && data.daysActive === undefined) {
    return NextResponse.json(
      { error: "Nothing to update" },
      { status: 400 }
    );
  }

  const { prisma } = await import("@/lib/prisma");

  const owned = await prisma.habit.findFirst({
    where: { id, userId, archivedAt: null },
    select: { id: true },
  });
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const habit = await prisma.habit.update({
    where: { id },
    data: { ...data, updatedAt: new Date() },
    select: HABIT_SELECT,
  });

  return NextResponse.json({ habit });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isFlagOn()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const { prisma } = await import("@/lib/prisma");

  const owned = await prisma.habit.findFirst({
    where: { id, userId, archivedAt: null },
    select: { id: true },
  });
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Archive rather than hard-delete: the check history stays intact (so the
  // data is recoverable and insights aren't destroyed), the habit just
  // stops appearing. Also drop any habit nudge so an archived habit can't
  // keep notifying.
  await prisma.$transaction([
    prisma.habit.update({
      where: { id },
      data: { archivedAt: new Date(), updatedAt: new Date() },
    }),
    prisma.userReminder.deleteMany({
      where: { userId, kind: "habit", habitId: id },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
