/**
 * Monthly digest dispatcher. Same hourly-scan pattern as weekly but
 * fires on the 1st of the month (local) at 9am local. Dedup via
 * User.lastMonthlyDigestAt — 25-day window so a late cron still
 * honors monthly cadence.
 *
 * Content assembly diffs last month vs the month before for Life
 * Matrix deltas + theme counts + mood distribution.
 */

import { inngest } from "@/inngest/client";
import { isEnabledForAnon } from "@/lib/feature-flags";

const TWENTY_FIVE_DAYS_MS = 25 * 24 * 60 * 60 * 1000;
const SEND_HOUR_LOCAL = 9;
const MIN_ENTRIES_FOR_DIGEST = 5;

const AREA_LABELS: Record<string, string> = {
  CAREER: "Career",
  HEALTH: "Health",
  RELATIONSHIPS: "Relationships",
  FINANCES: "Finances",
  PERSONAL: "Personal Growth",
  OTHER: "Other",
};

function userLocalHour(tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    });
    return Number(fmt.format(new Date()));
  } catch {
    return -1;
  }
}

function userLocalDayOfMonth(tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      day: "numeric",
    });
    return Number(fmt.format(new Date()));
  } catch {
    return -1;
  }
}

function userLocalMonthLabel(tz: string, offsetMonths: number = -1): string {
  try {
    const now = new Date();
    // offsetMonths=-1 → last month in user's local calendar.
    const nowLocalString = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
    }).format(now);
    const [m, y] = nowLocalString.split("/").map(Number);
    const target = new Date(Date.UTC(y, m - 1 + offsetMonths, 15));
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(target);
  } catch {
    return "Last month";
  }
}

export const monthlyDigestFn = inngest.createFunction(
  {
    id: "monthly-digest",
    name: "Monthly digest dispatcher (hourly scan)",
    triggers: [{ cron: "0 * * * *" }],
    retries: 2,
  },
  async ({ logger }) => {
    if (!(await isEnabledForAnon("monthly_email_digest"))) {
      logger.info("monthly-digest.disabled_by_flag");
      return { skipped: "feature-flag-disabled" };
    }

    const { prisma } = await import("@/lib/prisma");
    const { sendMonthlyDigest } = await import("@/emails/monthly-digest");

    const candidates = await prisma.user.findMany({
      where: {
        monthlyEmailEnabled: true,
        subscriptionStatus: { in: ["TRIAL", "PRO"] },
      },
      select: {
        id: true,
        email: true,
        name: true,
        timezone: true,
        longestStreak: true,
        lastMonthlyDigestAt: true,
      },
    });

    const now = new Date();
    let sent = 0;

    for (const user of candidates) {
      if (!user.email) continue;
      if (userLocalDayOfMonth(user.timezone) !== 1) continue;
      if (userLocalHour(user.timezone) !== SEND_HOUR_LOCAL) continue;
      if (
        user.lastMonthlyDigestAt &&
        now.getTime() - user.lastMonthlyDigestAt.getTime() <
          TWENTY_FIVE_DAYS_MS
      ) {
        continue;
      }

      // Rough last-month bounds in UTC — good enough for volume
      // aggregation; timezone edge cases wash out in a month of data.
      const lastMonthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
      );
      const lastMonthEnd = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
      );
      const prevMonthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)
      );

      const [entriesLastMonth, areasNow, areasLastMonth, goals] =
        await Promise.all([
          prisma.entry.findMany({
            where: {
              userId: user.id,
              status: "COMPLETE",
              createdAt: { gte: lastMonthStart, lt: lastMonthEnd },
            },
            select: { mood: true, themes: true },
          }),
          prisma.lifeMapArea.findMany({
            where: { userId: user.id },
            select: { area: true, score: true },
          }),
          prisma.lifeMapAreaHistory.findMany({
            where: {
              userId: user.id,
              weekStart: { gte: prevMonthStart, lt: lastMonthStart },
            },
            select: { area: true, score: true, weekStart: true },
          }),
          prisma.goal.groupBy({
            by: ["status"],
            where: { userId: user.id },
            _count: { _all: true },
          }),
        ]);

      if (entriesLastMonth.length < MIN_ENTRIES_FOR_DIGEST) continue;

      // Mood distribution line.
      const moodCounts: Record<string, number> = {};
      for (const e of entriesLastMonth) {
        if (!e.mood) continue;
        moodCounts[e.mood] = (moodCounts[e.mood] ?? 0) + 1;
      }
      const moodDistribution = Object.entries(moodCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([k, v]) => `${v} ${k.toLowerCase()}`)
        .join(" · ") || "a quieter month";

      // Theme frequencies.
      const themeCounts: Record<string, number> = {};
      for (const e of entriesLastMonth) {
        for (const t of e.themes ?? []) {
          const k = t.toLowerCase();
          themeCounts[k] = (themeCounts[k] ?? 0) + 1;
        }
      }
      const topThemes = Object.entries(themeCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, mentions]) => ({ name, mentions }));

      // Area deltas — average prev-month snapshots per area vs current.
      const prevByArea: Record<string, number[]> = {};
      for (const s of areasLastMonth) {
        (prevByArea[s.area] ??= []).push(s.score);
      }
      const deltas = areasNow
        .map((a) => {
          const prev = prevByArea[a.area];
          if (!prev || prev.length === 0) return null;
          const prevAvg = prev.reduce((x, y) => x + y, 0) / prev.length;
          const delta = Math.round(a.score - prevAvg);
          return {
            area: AREA_LABELS[a.area] ?? a.area,
            delta,
          };
        })
        .filter((x): x is { area: string; delta: number } => x !== null);

      const goalsCompleted =
        goals.find((g) => g.status === "COMPLETE")?._count._all ?? 0;
      const goalsActive =
        goals
          .filter((g) => g.status === "IN_PROGRESS" || g.status === "NOT_STARTED")
          .reduce((a, b) => a + b._count._all, 0) ?? 0;

      try {
        await sendMonthlyDigest({
          to: user.email,
          name: user.name,
          userId: user.id,
          monthLabel: userLocalMonthLabel(user.timezone, -1),
          entryCount: entriesLastMonth.length,
          longestStreak: user.longestStreak ?? 0,
          moodDistribution,
          lifeMatrixDeltas: deltas,
          topThemes,
          goalsCompleted,
          goalsActive,
        });

        await prisma.user.update({
          where: { id: user.id },
          data: { lastMonthlyDigestAt: new Date() },
        });
        sent += 1;
      } catch (err) {
        logger.error(
          `[monthly-digest] send failed ${user.id}: ${String(err)}`
        );
      }
    }

    return { scanned: candidates.length, sent };
  }
);
