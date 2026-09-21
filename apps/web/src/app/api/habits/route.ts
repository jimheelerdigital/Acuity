import { NextRequest, NextResponse } from "next/server";

import { MAX_ACTIVE_HABITS } from "@acuity/shared";
import { getAnySessionUserId } from "@/lib/mobile-auth";

/**
 * Habits v1 — manual only.
 *
 * GET  /api/habits  → active habits + this user's checks in a recent window
 * POST /api/habits  → create
 *
 * ── Why checks come back with the list ───────────────────────────────
 * The client computes streaks (shared logic in @acuity/shared/habits) so
 * web and mobile cannot disagree. Doing it server-side instead would mean
 * the server needs the user's LOCAL date, which it does not reliably know —
 * and a streak computed against the wrong calendar day is exactly the bug
 * users spot and we cannot reproduce.
 */

export const dynamic = "force-dynamic";

/** Enough history for a long streak without shipping a user's whole life. */
const CHECK_WINDOW_DAYS = 400;

function isFlagOn(): boolean {
  return process.env.ENABLE_HABITS === "1";
}

export async function GET(req: NextRequest) {
  if (!isFlagOn()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  const cutoff = new Date(Date.now() - CHECK_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [habits, checks] = await Promise.all([
    prisma.habit.findMany({
      where: { userId, archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        daysActive: true,
        archivedAt: true,
        sortOrder: true,
        createdAt: true,
      },
    }),
    prisma.habitCheck.findMany({
      where: { userId, createdAt: { gte: cutoff } },
      select: { habitId: true, localDate: true },
    }),
  ]);

  return NextResponse.json({ habits, checks });
}

export async function POST(req: NextRequest) {
  if (!isFlagOn()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    daysActive?: unknown;
  } | null;

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json({ error: "Name is too long" }, { status: 400 });
  }

  // Days are validated rather than trusted: an out-of-range value would
  // make the habit silently never appear, which reads as a broken feature
  // rather than bad input.
  let daysActive = [0, 1, 2, 3, 4, 5, 6];
  if (Array.isArray(body?.daysActive)) {
    const parsed = body.daysActive
      .map((d) => (typeof d === "number" ? d : Number.NaN))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    daysActive = Array.from(new Set(parsed)).sort();
  }

  const { prisma } = await import("@/lib/prisma");

  const active = await prisma.habit.count({ where: { userId, archivedAt: null } });
  if (active >= MAX_ACTIVE_HABITS) {
    return NextResponse.json(
      {
        error: `You can track up to ${MAX_ACTIVE_HABITS} habits at once.`,
        code: "TOO_MANY_HABITS",
      },
      { status: 400 }
    );
  }

  const habit = await prisma.habit.create({
    data: { userId, name, daysActive, sortOrder: active },
    select: {
      id: true,
      name: true,
      daysActive: true,
      archivedAt: true,
      sortOrder: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ habit }, { status: 201 });
}
