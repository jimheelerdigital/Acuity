/**
 * Data loaders for the Insights v2 reports (2026-10-27).
 *
 * One loader per report, shared by the mobile API routes
 * (app/api/insights/<report>/route.ts) and the web /insights page (a
 * server component that calls these directly with the session user).
 * The rules and thresholds stay in each report's pure lib; these only
 * gather rows and hand them over, so the app and the website can never
 * disagree about what a user sees.
 *
 * Gating (progression / entitlement) is the CALLER's job, exactly as it
 * was in the routes: lifts-drains needs `canExtractEntries`, first-read is
 * only shown before Pattern Insights unlocks. None of these touch
 * getUserProgression (its snapshot write would swallow unlock
 * celebrations).
 */
import "server-only";

import type { PrismaClient } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";

import {
  wrappedPeriodRange,
  wrappedPeriodStarted,
  type WrappedPeriod,
} from "@acuity/shared";

import { selectEmergingThemes } from "@/lib/emerging-patterns";
import { loadEmergingThemeCandidates } from "@/lib/emerging-patterns-data";
import {
  FIRST_READ_MIN_ENTRIES,
  MAX_TASK_TITLES,
  buildFirstRead,
  type FirstRead,
} from "@/lib/first-read";
import {
  computeFollowThrough,
  type FollowThroughReport,
} from "@/lib/follow-through";
import { localDateForTimezone } from "@/lib/habits-autocheck";
import {
  MAX_CHARS_PER_TRANSCRIPT,
  PERIOD_DAYS,
  compareTalk,
  countPeriod,
  type HowYouTalk,
} from "@/lib/how-you-talk";
import {
  WINDOW_DAYS,
  computeLiftsDrains,
  type HabitInput,
  type LiftsDrainsResult,
  type MoodDay,
} from "@/lib/lifts-drains";
import {
  WORRY_LOOKBACK_DAYS,
  computeOpenLoops,
  type OpenLoop,
} from "@/lib/open-loops";
import { computeWrapped, type Wrapped } from "@/lib/wrapped";

const DAY_MS = 24 * 60 * 60 * 1000;
/** how-you-talk: cap rows read (two months of very frequent recording). */
const MAX_TALK_ENTRIES = 240;
/** Wrapped falls back to this zone, like the rest of the app. */
const DEFAULT_TZ = "America/Chicago";

type Db = PrismaClient;

// ── Follow-through ────────────────────────────────────────────────────

export async function loadFollowThrough(
  prisma: Db,
  userId: string
): Promise<FollowThroughReport | null> {
  const since = new Date(Date.now() - 60 * DAY_MS);
  const [tasks, groups] = await Promise.all([
    prisma.task.findMany({
      where: {
        userId,
        OR: [{ createdAt: { gte: since } }, { completedAt: { gte: since } }],
      },
      select: {
        id: true,
        title: true,
        text: true,
        status: true,
        entryId: true,
        groupId: true,
        createdAt: true,
        completedAt: true,
      },
    }),
    prisma.taskGroup.findMany({
      where: { userId },
      select: { id: true, name: true },
    }),
  ]);
  return computeFollowThrough(tasks, groups);
}

// ── Open loops ────────────────────────────────────────────────────────

export async function loadOpenLoops(
  prisma: Db,
  userId: string,
  now: Date = new Date()
): Promise<OpenLoop[]> {
  const since = new Date(now.getTime() - WORRY_LOOKBACK_DAYS * DAY_MS);
  const [mentions, goals] = await Promise.all([
    prisma.themeMention.findMany({
      where: {
        theme: { userId },
        createdAt: { gte: since },
        entry: { status: "COMPLETE" },
      },
      select: {
        themeId: true,
        entryId: true,
        createdAt: true,
        sentiment: true,
        theme: { select: { name: true } },
      },
    }),
    prisma.goal.findMany({
      where: {
        userId,
        status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        lastMentionedAt: { not: null },
      },
      select: {
        id: true,
        title: true,
        status: true,
        lastMentionedAt: true,
        entryRefs: true,
      },
    }),
  ]);

  return computeOpenLoops(
    mentions.map((m) => ({
      themeId: m.themeId,
      themeName: m.theme.name,
      entryId: m.entryId,
      createdAt: m.createdAt,
      sentiment: m.sentiment,
    })),
    goals.map((g) => ({
      id: g.id,
      title: g.title,
      status: g.status,
      lastMentionedAt: g.lastMentionedAt,
      entryRefsCount: g.entryRefs.length,
    })),
    now
  );
}

// ── What lifts you, what drains you ───────────────────────────────────

/** Caller must check `requireEntitlement("canExtractEntries", userId)`. */
export async function loadLiftsDrains(
  prisma: Db,
  userId: string
): Promise<LiftsDrainsResult> {
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
        energy: true,
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
  const byDay = new Map<
    string,
    { moods: number[]; energies: number[]; themes: string[]; people: string[] }
  >();
  for (const e of entries) {
    const key = local(e.createdAt);
    const b = byDay.get(key) ?? { moods: [], energies: [], themes: [], people: [] };
    b.moods.push(e.moodScore as number);
    if (typeof e.energy === "number") b.energies.push(e.energy);
    b.themes.push(...(e.themes ?? []));
    for (const m of e.entityMentions) b.people.push(m.person.displayName);
    byDay.set(key, b);
  }
  const days: MoodDay[] = [...byDay.entries()].map(([date, b]) => ({
    date,
    mood: b.moods.reduce((a, x) => a + x, 0) / b.moods.length,
    energy: b.energies.length
      ? b.energies.reduce((a, x) => a + x, 0) / b.energies.length
      : null,
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

  return computeLiftsDrains({ days, habits: habitInputs, eventsByDay });
}

// ── How you talk ──────────────────────────────────────────────────────

export async function loadHowYouTalk(
  prisma: Db,
  userId: string
): Promise<HowYouTalk> {
  const now = Date.now();
  const splitAt = new Date(now - PERIOD_DAYS * DAY_MS);
  const since = new Date(now - 2 * PERIOD_DAYS * DAY_MS);

  const rows = await prisma.entry.findMany({
    where: {
      userId,
      status: "COMPLETE",
      createdAt: { gte: since },
      transcript: { not: null },
    },
    select: { createdAt: true, transcript: true },
    orderBy: { createdAt: "desc" },
    take: MAX_TALK_ENTRIES,
  });

  const current: string[] = [];
  const previous: string[] = [];
  for (const r of rows) {
    const t = (r.transcript ?? "").slice(0, MAX_CHARS_PER_TRANSCRIPT);
    (r.createdAt >= splitAt ? current : previous).push(t);
  }
  return compareTalk(countPeriod(current), countPeriod(previous));
}

// ── Your first read ───────────────────────────────────────────────────

/** Caller shows it only while Pattern Insights is still locked. */
export async function loadFirstRead(
  prisma: Db,
  userId: string
): Promise<FirstRead | null> {
  const completedEntries = await prisma.entry.findMany({
    where: { userId, status: "COMPLETE" },
    select: { moodScore: true, energy: true },
  });
  if (completedEntries.length < FIRST_READ_MIN_ENTRIES) return null;

  const [capturedTaskCount, recentTasks, candidates, entriesCount] =
    await Promise.all([
      prisma.task.count({ where: { userId, entryId: { not: null } } }),
      prisma.task.findMany({
        where: { userId, entryId: { not: null } },
        orderBy: { createdAt: "desc" },
        take: MAX_TASK_TITLES,
        select: { title: true, text: true },
      }),
      loadEmergingThemeCandidates(prisma, userId),
      prisma.entry.count({ where: { userId } }),
    ]);

  const emerging = selectEmergingThemes({
    entriesCount,
    themeMapUnlocked: false,
    themes: candidates,
  });

  return buildFirstRead({
    completedEntries,
    capturedTaskCount,
    recentTaskTitles: recentTasks.map((t) => t.title ?? t.text ?? ""),
    emergingThemeLabels: emerging.map((t) => t.label),
  });
}

// ── Ripple Wrapped ────────────────────────────────────────────────────

/** The user's zone and a local-date formatter for it. */
export async function loadUserLocalDate(
  prisma: Db,
  userId: string
): Promise<{ tz: string; localDate: (d: Date) => string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const tz = user?.timezone || DEFAULT_TZ;
  return { tz, localDate: (d: Date) => formatInTimeZone(d, tz, "yyyy-MM-dd") };
}

export type WrappedLoad =
  | { ok: true; wrapped: Wrapped }
  | { ok: false; reason: "not_started" };

export async function loadWrapped(
  prisma: Db,
  userId: string,
  period: WrappedPeriod
): Promise<WrappedLoad> {
  const { localDate } = await loadUserLocalDate(prisma, userId);

  if (!wrappedPeriodStarted(period, localDate(new Date()))) {
    return { ok: false, reason: "not_started" };
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

  return { ok: true, wrapped };
}
