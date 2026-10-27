/**
 * GET /api/insights/wrapped?period=YYYY-MM | YYYY
 *
 * Ripple Wrapped: a monthly or year-end recap (2026-10-27). Loads the
 * period's rows, converts timestamps to the user's local dates and hands
 * them to lib/wrapped.ts (pure, deterministic, no AI). Works with the web
 * session and the mobile bearer token.
 *
 * `eligible: false` means too few entries for a recap; the app hides the
 * card. Periods that haven't started yet return 400.
 */
import { formatInTimeZone } from "date-fns-tz";
import { NextRequest, NextResponse } from "next/server";

import { parseWrappedPeriod, wrappedPeriodRange, wrappedPeriodStarted } from "@acuity/shared";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { computeWrapped } from "@/lib/wrapped";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const period = parseWrappedPeriod(req.nextUrl.searchParams.get("period"));
  if (!period) {
    return NextResponse.json({ error: "period must be YYYY-MM or YYYY" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const tz = user?.timezone || "America/Chicago";
  const localDate = (d: Date) => formatInTimeZone(d, tz, "yyyy-MM-dd");

  if (!wrappedPeriodStarted(period, localDate(new Date()))) {
    return NextResponse.json({ error: "That period hasn't started yet" }, { status: 400 });
  }

  // Fetch a day wider than the period on both sides (UTC), then filter on
  // the user's local date so entries near midnight land in the right month.
  const range = wrappedPeriodRange(period);
  const from = new Date(new Date(`${range.start}T00:00:00Z`).getTime() - DAY_MS);
  const to = new Date(new Date(`${range.end}T00:00:00Z`).getTime() + DAY_MS);

  const [entries, tasks, habits, mentions] = await Promise.all([
    prisma.entry.findMany({
      where: { userId, status: "COMPLETE", createdAt: { gte: from, lt: to } },
      select: {
        createdAt: true,
        audioDuration: true,
        duration: true,
        themes: true,
        wins: true,
        moodScore: true,
      },
    }),
    prisma.task.findMany({
      where: { userId, createdAt: { gte: from, lt: to } },
      select: { entryId: true, createdAt: true, completedAt: true },
    }),
    prisma.habit.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        daysActive: true,
        archivedAt: true,
        checks: {
          where: { localDate: { gte: range.start, lt: range.end } },
          select: { localDate: true },
        },
      },
    }),
    prisma.entityMention.findMany({
      where: {
        createdAt: { gte: from, lt: to },
        entry: { userId },
        person: { userId, archived: false },
      },
      select: { createdAt: true, personId: true, person: { select: { displayName: true } } },
    }),
  ]);

  const byPerson = new Map<string, { displayName: string; mentionDates: string[] }>();
  for (const m of mentions) {
    const cur = byPerson.get(m.personId) ?? { displayName: m.person.displayName, mentionDates: [] };
    cur.mentionDates.push(localDate(m.createdAt));
    byPerson.set(m.personId, cur);
  }

  const wrapped = computeWrapped({
    period,
    entries: entries.map((e) => ({
      localDate: localDate(e.createdAt),
      audioDuration: e.audioDuration ?? e.duration ?? null,
      themes: e.themes ?? [],
      wins: e.wins ?? [],
      moodScore: e.moodScore ?? null,
    })),
    tasks: tasks.map((t) => ({
      fromRecording: t.entryId !== null,
      createdLocalDate: localDate(t.createdAt),
      completedLocalDate: t.completedAt ? localDate(t.completedAt) : null,
    })),
    habits: habits.map((h) => ({
      id: h.id,
      name: h.name,
      daysActive: h.daysActive,
      archivedAt: null, // a habit archived later still counts for its past run
      checkedDates: h.checks.map((c) => c.localDate),
    })),
    people: [...byPerson.values()],
  });

  return NextResponse.json(wrapped, {
    headers: { "Cache-Control": "private, max-age=1800" },
  });
}
