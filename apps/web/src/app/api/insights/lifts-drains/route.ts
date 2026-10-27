/**
 * GET /api/insights/lifts-drains (2026-10-27)
 *
 * "What lifts you, what drains you": day-level mood compared across
 * themes, people, habits and (when connected) calendar load. All the
 * logic and the minimum-data rules live in lib/lifts-drains.ts; this
 * route only gathers the last WINDOW_DAYS of rows.
 *
 * Pro (PRO + active trial), same entitlement as the other personal
 * analysis surfaces. Returns { lifts: [], drains: [] } when there isn't
 * enough data, and the card renders nothing.
 */
import { NextRequest, NextResponse } from "next/server";

import { localDateForTimezone } from "@/lib/habits-autocheck";
import {
  WINDOW_DAYS,
  computeLiftsDrains,
  type HabitInput,
  type MoodDay,
} from "@/lib/lifts-drains";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { requireEntitlement } from "@/lib/paywall";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const proGate = await requireEntitlement("canExtractEntries", userId);
  if (!proGate.ok) return proGate.response;

  const { prisma } = await import("@/lib/prisma");
  const since = new Date(Date.now() - WINDOW_DAYS * DAY_MS);

  const [user, entries, habits, checks] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, calendarConnectedProvider: true },
    }),
    prisma.entry.findMany({
      where: {
        userId,
        status: "COMPLETE",
        createdAt: { gte: since },
        moodScore: { not: null },
      },
      select: {
        createdAt: true,
        moodScore: true,
        themes: true,
        entityMentions: {
          where: { person: { archived: false } },
          select: { person: { select: { displayName: true } } },
        },
      },
    }),
    prisma.habit.findMany({
      where: { userId },
      select: { id: true, name: true, daysActive: true, createdAt: true, archivedAt: true },
    }),
    prisma.habitCheck.findMany({
      where: { userId, createdAt: { gte: new Date(since.getTime() - DAY_MS) } },
      select: { habitId: true, localDate: true },
    }),
  ]);

  const tz = user?.timezone;
  const local = (d: Date) => localDateForTimezone(tz, d);

  // Entries → one MoodDay per local day.
  const byDay = new Map<string, { moods: number[]; themes: string[]; people: string[] }>();
  for (const e of entries) {
    const key = local(e.createdAt);
    const b = byDay.get(key) ?? { moods: [], themes: [], people: [] };
    b.moods.push(e.moodScore as number);
    b.themes.push(...(e.themes ?? []));
    for (const m of e.entityMentions) b.people.push(m.person.displayName);
    byDay.set(key, b);
  }
  const days: MoodDay[] = [...byDay.entries()].map(([date, b]) => ({
    date,
    mood: b.moods.reduce((a, x) => a + x, 0) / b.moods.length,
    themes: b.themes,
    people: b.people,
  }));

  const checked = new Map<string, Set<string>>();
  for (const c of checks) {
    const set = checked.get(c.habitId) ?? new Set<string>();
    set.add(c.localDate);
    checked.set(c.habitId, set);
  }
  const habitInputs: HabitInput[] = habits.map((h) => ({
    name: h.name,
    daysActive: h.daysActive,
    createdDate: local(h.createdAt),
    archivedDate: h.archivedAt ? local(h.archivedAt) : null,
    checkedDates: checked.get(h.id) ?? new Set(),
  }));

  // Calendar load: only for users who've connected a calendar. Timed
  // events only (all-day items like birthdays aren't meetings).
  let eventsByDay: Map<string, number> | null = null;
  if (user?.calendarConnectedProvider) {
    const events = await prisma.calendarEvent.findMany({
      where: { userId, allDay: false, startTime: { gte: since } },
      select: { startTime: true },
    });
    if (events.length > 0) {
      eventsByDay = new Map();
      for (const ev of events) {
        const key = local(ev.startTime);
        eventsByDay.set(key, (eventsByDay.get(key) ?? 0) + 1);
      }
    }
  }

  const result = computeLiftsDrains({ days, habits: habitInputs, eventsByDay });
  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, max-age=1800" },
  });
}
