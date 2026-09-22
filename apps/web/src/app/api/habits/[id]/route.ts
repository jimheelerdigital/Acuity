import { NextRequest, NextResponse } from "next/server";

import { MAX_ACTIVE_HABITS } from "@acuity/shared";
import { getAnySessionUserId } from "@/lib/mobile-auth";

/**
 * Edit / archive a single habit.
 *
 * PATCH  /api/habits/[id]  → rename and/or set active days (pause = []);
 *                            or { archived: false } to restore (unarchive).
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
  description: true,
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
    archived?: unknown;
    description?: unknown;
  } | null;

  // Restore (unarchive): { archived: false }. Handled first because it targets
  // an ARCHIVED habit — the opposite of every other PATCH, which only touches
  // active ones. Only false is meaningful; archiving happens via DELETE.
  if (body?.archived === false) {
    const { prisma } = await import("@/lib/prisma");

    const owned = await prisma.habit.findFirst({
      where: { id, userId, archivedAt: { not: null } },
      select: { id: true, type: true },
    });
    if (!owned) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Restoring counts against the active cap.
    const active = await prisma.habit.count({
      where: { userId, archivedAt: null },
    });
    if (active >= MAX_ACTIVE_HABITS) {
      return NextResponse.json(
        {
          error: `You can track up to ${MAX_ACTIVE_HABITS} habits at once. Remove one before restoring.`,
          code: "TOO_MANY_HABITS",
        },
        { status: 400 }
      );
    }

    // Preserve the one-active-reflection-habit invariant.
    if (owned.type === "reflection") {
      const existing = await prisma.habit.findFirst({
        where: { userId, archivedAt: null, type: "reflection" },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json(
          {
            error: "You already have an active Daily Reflection habit.",
            code: "REFLECTION_EXISTS",
          },
          { status: 400 }
        );
      }
    }

    const habit = await prisma.habit.update({
      where: { id },
      data: { archivedAt: null, updatedAt: new Date() },
      select: HABIT_SELECT,
    });
    return NextResponse.json({ habit });
  }

  const data: { name?: string; daysActive?: number[]; description?: string | null } =
    {};

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

  if (body?.description !== undefined) {
    // Free-text notes. Any string is accepted; empty/blank clears it (null).
    // Capped so it can't bloat the debrief matcher prompt.
    const raw = typeof body.description === "string" ? body.description.trim() : "";
    data.description = raw ? raw.slice(0, 1000) : null;
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

  if (
    data.name === undefined &&
    data.daysActive === undefined &&
    data.description === undefined
  ) {
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
