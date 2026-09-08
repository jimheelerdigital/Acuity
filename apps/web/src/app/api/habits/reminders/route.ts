import { NextRequest, NextResponse } from "next/server";

import { MAX_HABIT_REMINDERS } from "@acuity/shared";
import { getAnySessionUserId } from "@/lib/mobile-auth";

/**
 * Habit nudges — UserReminder rows with kind="habit".
 *
 * ── Same table, same scheduler, separate everything else ─────────────
 * Reuses UserReminder (and therefore the on-device scheduler and the boot
 * self-heal) so there is no second cron and no second scheduling path. But
 * habit nudges get:
 *
 *   - their OWN cap (MAX_HABIT_REMINDERS), so adding a habit nudge can
 *     never evict one of the five debrief reminders;
 *   - their OWN copy (see lib/notifications.ts::pickHabitBody), because
 *     "remind me to debrief" wording on a habit nudge is the wrong
 *     notification arriving on the right schedule;
 *   - a habitId, so the nudge can name the thing the user committed to.
 *
 * /api/account/reminders is scoped to kind="debrief" and is untouched by
 * anything here.
 */

export const dynamic = "force-dynamic";

const HABIT_KIND = "habit";
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isFlagOn(): boolean {
  return process.env.ENABLE_HABITS === "1";
}

export async function GET(req: NextRequest) {
  if (!isFlagOn()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const userId = await getAnySessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { prisma } = await import("@/lib/prisma");
  const reminders = await prisma.userReminder.findMany({
    where: { userId, kind: HABIT_KIND },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      time: true,
      daysActive: true,
      enabled: true,
      habitId: true,
    },
  });
  return NextResponse.json({ reminders, cap: MAX_HABIT_REMINDERS });
}

/** Create or replace the nudge for ONE habit. */
export async function PUT(req: NextRequest) {
  if (!isFlagOn()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const userId = await getAnySessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    habitId?: unknown;
    time?: unknown;
    enabled?: unknown;
  } | null;

  const habitId = typeof body?.habitId === "string" ? body.habitId : "";
  if (!habitId) {
    return NextResponse.json({ error: "habitId is required" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");

  // Ownership. Without it a caller could attach a nudge to another user's
  // habit id and learn that it exists.
  const habit = await prisma.habit.findFirst({
    where: { id: habitId, userId },
    select: { id: true, daysActive: true },
  });
  if (!habit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Turning a nudge off deletes the row rather than disabling it: the
  // scheduler already treats enabled=false as no-op, and an accumulating
  // pile of disabled rows would eventually hit the cap invisibly.
  if (body?.enabled === false) {
    await prisma.userReminder.deleteMany({
      where: { userId, kind: HABIT_KIND, habitId },
    });
    return NextResponse.json({ ok: true, enabled: false });
  }

  const time = typeof body?.time === "string" ? body.time.trim() : "";
  if (!TIME_RE.test(time)) {
    return NextResponse.json(
      { error: "time must be HH:MM (24-hour)" },
      { status: 400 }
    );
  }

  const existing = await prisma.userReminder.findFirst({
    where: { userId, kind: HABIT_KIND, habitId },
    select: { id: true },
  });

  if (!existing) {
    const count = await prisma.userReminder.count({
      where: { userId, kind: HABIT_KIND },
    });
    if (count >= MAX_HABIT_REMINDERS) {
      return NextResponse.json(
        {
          error: `You can have up to ${MAX_HABIT_REMINDERS} habit nudges.`,
          code: "TOO_MANY_HABIT_REMINDERS",
        },
        { status: 400 }
      );
    }
    const created = await prisma.userReminder.create({
      data: {
        userId,
        kind: HABIT_KIND,
        habitId,
        time,
        // The nudge follows the habit's own schedule. A nudge on a day the
        // habit isn't expected is a notification about nothing.
        daysActive: habit.daysActive,
        enabled: true,
        sortOrder: count,
      },
      select: { id: true, time: true, daysActive: true, enabled: true, habitId: true },
    });
    return NextResponse.json({ reminder: created }, { status: 201 });
  }

  const updated = await prisma.userReminder.update({
    where: { id: existing.id },
    data: { time, daysActive: habit.daysActive, enabled: true },
    select: { id: true, time: true, daysActive: true, enabled: true, habitId: true },
  });
  return NextResponse.json({ reminder: updated });
}
