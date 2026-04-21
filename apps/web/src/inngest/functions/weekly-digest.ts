/**
 * Weekly digest dispatcher. Fires hourly on Sundays UTC; filters
 * per-user by local timezone so each user gets their send at ~9am
 * local on Sunday. Deduped via User.lastWeeklyDigestAt — sending
 * window is 6 days so a late-running cron still respects the weekly
 * cadence without double-posting.
 *
 * Content assembly reads:
 *   - last 7 days of entries (mood + theme counts)
 *   - latest WeeklyReport for CTA deep-link
 *   - active UserInsight rows for observations
 *   - top 3 goals with recent lastMentionedAt for goal updates
 *
 * Skips users with <3 entries in the window per spec. Also skips
 * FREE users who are post-trial — they shouldn't get a weekly
 * reminder pitching content they can't generate.
 */

import { inngest } from "@/inngest/client";

const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_ENTRIES_FOR_DIGEST = 3;
const SEND_HOUR_LOCAL = 9;

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

function userLocalDayOfWeek(tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
    });
    const day = fmt.format(new Date());
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return map[day] ?? -1;
  } catch {
    return -1;
  }
}

export const weeklyDigestFn = inngest.createFunction(
  {
    id: "weekly-digest",
    name: "Weekly digest dispatcher (hourly scan)",
    triggers: [{ cron: "0 * * * *" }],
    retries: 2,
  },
  async ({ logger }) => {
    const { prisma } = await import("@/lib/prisma");
    const { sendWeeklyDigest } = await import("@/emails/weekly-digest");

    const candidates = await prisma.user.findMany({
      where: {
        weeklyEmailEnabled: true,
        subscriptionStatus: { in: ["TRIAL", "PRO"] },
      },
      select: {
        id: true,
        email: true,
        name: true,
        timezone: true,
        currentStreak: true,
        lastWeeklyDigestAt: true,
      },
    });

    let sent = 0;
    for (const user of candidates) {
      if (!user.email) continue;
      // Local time gate: Sunday 9am ± 1 hour tolerance.
      if (userLocalDayOfWeek(user.timezone) !== 0) continue;
      if (userLocalHour(user.timezone) !== SEND_HOUR_LOCAL) continue;
      // Dedup: skip if we sent within the last 6 days.
      if (
        user.lastWeeklyDigestAt &&
        Date.now() - user.lastWeeklyDigestAt.getTime() < SIX_DAYS_MS
      ) {
        continue;
      }

      const weekEnd = new Date();
      const weekStart = new Date(weekEnd.getTime() - WEEK_MS);

      const [entries, latestReport, observations, goalUpdates] =
        await Promise.all([
          prisma.entry.findMany({
            where: {
              userId: user.id,
              status: "COMPLETE",
              createdAt: { gte: weekStart },
            },
            select: {
              mood: true,
              themes: true,
              createdAt: true,
            },
          }),
          prisma.weeklyReport.findFirst({
            where: {
              userId: user.id,
              status: "COMPLETE",
              createdAt: { gte: weekStart },
            },
            orderBy: { createdAt: "desc" },
            select: { id: true },
          }),
          prisma.userInsight.findMany({
            where: {
              userId: user.id,
              dismissedAt: null,
              createdAt: { gte: weekStart },
            },
            orderBy: { createdAt: "desc" },
            take: 2,
          }),
          prisma.goal.findMany({
            where: {
              userId: user.id,
              status: { in: ["IN_PROGRESS", "NOT_STARTED"] },
            },
            orderBy: { lastMentionedAt: "desc" },
            select: { title: true, progress: true },
            take: 3,
          }),
        ]);

      if (entries.length < MIN_ENTRIES_FOR_DIGEST) {
        logger.debug(
          `[weekly-digest] skip ${user.id}: only ${entries.length} entries`
        );
        continue;
      }

      // Build summary bits.
      const moodCounts: Record<string, number> = {};
      for (const e of entries) {
        if (!e.mood) continue;
        moodCounts[e.mood] = (moodCounts[e.mood] ?? 0) + 1;
      }
      const moodSummary = Object.entries(moodCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([k, v]) => `${v} ${k.toLowerCase()}`)
        .join(" · ") || "a quieter week";

      const themeCounts: Record<string, number> = {};
      for (const e of entries) {
        for (const t of e.themes ?? []) {
          const key = t.toLowerCase();
          themeCounts[key] = (themeCounts[key] ?? 0) + 1;
        }
      }
      const topThemes = Object.entries(themeCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([name, mentions]) => ({ name, mentions }));

      try {
        await sendWeeklyDigest({
          to: user.email,
          name: user.name,
          userId: user.id,
          weekStartISO: weekStart.toISOString(),
          weekEndISO: weekEnd.toISOString(),
          entryCount: entries.length,
          streak: user.currentStreak ?? 0,
          moodSummary,
          topThemes,
          observations: observations.map((o) => o.observationText),
          goalUpdates: goalUpdates.map((g) => ({
            title: g.title,
            progress: g.progress,
          })),
          reportUrl: latestReport
            ? `${appUrl()}/insights`
            : undefined,
        });

        await prisma.user.update({
          where: { id: user.id },
          data: { lastWeeklyDigestAt: new Date() },
        });
        sent += 1;
      } catch (err) {
        logger.error(`[weekly-digest] send failed ${user.id}: ${String(err)}`);
      }
    }

    return { scanned: candidates.length, sent };
  }
);

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "https://www.getacuity.io"
  );
}
