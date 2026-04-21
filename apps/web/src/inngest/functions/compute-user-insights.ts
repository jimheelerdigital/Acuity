/**
 * Weekly cron: compute user-level observations for the Insights page.
 *
 * Four signal types (one per helper below):
 *   1. Life Matrix area deltas > 2 points week-over-week.
 *   2. Theme frequency changes > 2x week-over-week.
 *   3. Streak milestones (7 / 30 / 100-day thresholds).
 *   4. Mood drift (≥1 band up or down week-over-week on the 5-band scale).
 *
 * Writes up to 6 new UserInsight rows per user per week (deduped
 * against the last 7 days of the same observationText to avoid
 * duplicates when the cron retries). Users see the top 1-3 on
 * /insights, sorted by severity weight (CONCERNING > POSITIVE > NEUTRAL)
 * then recency.
 *
 * Schedule: Sundays at 01:00 UTC — runs after the 00:05 Life Matrix
 * snapshot so week-over-week math has fresh history. Idempotent: if
 * the text dupes a recent row, we skip.
 */

import { inngest } from "@/inngest/client";

const MOOD_ORDER: Record<string, number> = {
  ROUGH: 1,
  LOW: 2,
  NEUTRAL: 3,
  GOOD: 4,
  GREAT: 5,
};

const AREA_LABELS: Record<string, string> = {
  CAREER: "Career",
  HEALTH: "Health",
  RELATIONSHIPS: "Relationships",
  FINANCES: "Finances",
  PERSONAL: "Personal Growth",
  OTHER: "Other",
};

function weekStartOf(d: Date): Date {
  const base = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  base.setUTCDate(base.getUTCDate() - base.getUTCDay());
  return base;
}

export const computeUserInsightsFn = inngest.createFunction(
  {
    id: "compute-user-insights",
    name: "Compute user insights (weekly)",
    triggers: [{ cron: "0 1 * * 0" }],
    retries: 2,
  },
  async ({ step, logger }) => {
    const { prisma } = await import("@/lib/prisma");

    const users = await step.run("fetch-users", async () =>
      prisma.user.findMany({
        where: { subscriptionStatus: { in: ["TRIAL", "ACTIVE"] } },
        select: { id: true },
      })
    );

    logger.info(`computing insights for ${users.length} users`);

    const now = new Date();
    const thisWeekStart = weekStartOf(now);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
    const twoWeeksAgo = new Date(lastWeekStart);
    twoWeeksAgo.setUTCDate(twoWeeksAgo.getUTCDate() - 7);
    const recencyCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let totalWritten = 0;

    for (const { id: userId } of users) {
      const observations: Array<{
        observationText: string;
        severity: "POSITIVE" | "NEUTRAL" | "CONCERNING";
        linkedAreaId?: string | null;
      }> = [];

      // ── 1. Area deltas (> 2 points) ─────────────────────────────────
      const currentAreas = await prisma.lifeMapArea.findMany({
        where: { userId },
        select: { area: true, score: true },
      });
      const lastWeekSnapshots = await prisma.lifeMapAreaHistory.findMany({
        where: {
          userId,
          weekStart: { gte: lastWeekStart, lt: thisWeekStart },
        },
        select: { area: true, score: true },
      });
      const byAreaLast: Record<string, number> = {};
      for (const s of lastWeekSnapshots) byAreaLast[s.area] = s.score;

      for (const c of currentAreas) {
        const prev = byAreaLast[c.area];
        if (prev === undefined) continue;
        const delta = c.score - prev;
        const label = AREA_LABELS[c.area] ?? c.area;
        // Score is 0..100; "2 points" in the spec reads as 2 on the
        // 0..10 reduced scale used in the UI. Compare deltas in the
        // 0..100 space by * 10.
        if (delta <= -20) {
          observations.push({
            observationText: `Your ${label} score dropped ${Math.round(-delta / 10)} points this week`,
            severity: "CONCERNING",
            linkedAreaId: c.area,
          });
        } else if (delta >= 20) {
          observations.push({
            observationText: `Your ${label} score climbed ${Math.round(delta / 10)} points this week`,
            severity: "POSITIVE",
            linkedAreaId: c.area,
          });
        }
      }

      // ── 2. Theme frequency > 2x week-over-week ──────────────────────
      const lastWeekEntries = await prisma.entry.findMany({
        where: {
          userId,
          entryDate: { gte: lastWeekStart, lt: thisWeekStart },
          status: "COMPLETE",
        },
        select: { themes: true },
      });
      const twoWeeksAgoEntries = await prisma.entry.findMany({
        where: {
          userId,
          entryDate: { gte: twoWeeksAgo, lt: lastWeekStart },
          status: "COMPLETE",
        },
        select: { themes: true },
      });

      const freq = (entries: { themes: string[] }[]): Record<string, number> => {
        const m: Record<string, number> = {};
        for (const e of entries) {
          for (const t of e.themes ?? []) {
            const key = t.toLowerCase();
            m[key] = (m[key] ?? 0) + 1;
          }
        }
        return m;
      };
      const thisFreq = freq(lastWeekEntries);
      const prevFreq = freq(twoWeeksAgoEntries);

      for (const [theme, thisCount] of Object.entries(thisFreq)) {
        if (thisCount < 2) continue; // noise filter
        const prevCount = prevFreq[theme] ?? 0;
        if (prevCount === 0) continue; // new theme doesn't trigger a "2x" change
        if (thisCount >= prevCount * 2) {
          observations.push({
            observationText: `You mentioned "${theme}" ${thisCount === prevCount * 2 ? "twice as often" : `${Math.round(thisCount / prevCount)}x more`} than last week`,
            severity: "NEUTRAL",
          });
        }
      }

      // ── 3. Streak milestones (7 / 30 / 100) ─────────────────────────
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { currentStreak: true, lastStreakMilestone: true },
      });
      if (user?.currentStreak) {
        for (const milestone of [7, 30, 100]) {
          if (
            user.currentStreak >= milestone &&
            (user.lastStreakMilestone ?? 0) < milestone
          ) {
            observations.push({
              observationText: `${milestone}-day streak — consistency is compounding`,
              severity: "POSITIVE",
            });
          }
        }
      }

      // ── 4. Mood drift (≥1 band) ────────────────────────────────────
      const moodBandAvg = (entries: Array<{ mood: string | null }>): number | null => {
        const ranks = entries
          .map((e) => (e.mood ? MOOD_ORDER[e.mood] : null))
          .filter((r): r is number => r !== null);
        if (ranks.length === 0) return null;
        return ranks.reduce((a, b) => a + b, 0) / ranks.length;
      };
      const [thisMoodEntries, prevMoodEntries] = await Promise.all([
        prisma.entry.findMany({
          where: {
            userId,
            entryDate: { gte: lastWeekStart, lt: thisWeekStart },
            status: "COMPLETE",
          },
          select: { mood: true },
        }),
        prisma.entry.findMany({
          where: {
            userId,
            entryDate: { gte: twoWeeksAgo, lt: lastWeekStart },
            status: "COMPLETE",
          },
          select: { mood: true },
        }),
      ]);
      const thisMood = moodBandAvg(thisMoodEntries);
      const prevMood = moodBandAvg(prevMoodEntries);
      if (thisMood !== null && prevMood !== null) {
        const drift = thisMood - prevMood;
        if (drift <= -1) {
          observations.push({
            observationText: "Your mood has dipped noticeably this week",
            severity: "CONCERNING",
          });
        } else if (drift >= 1) {
          observations.push({
            observationText: "Your mood has lifted compared to last week",
            severity: "POSITIVE",
          });
        }
      }

      // ── Write out — dedupe against recent rows ─────────────────────
      if (observations.length === 0) continue;

      const recent = await prisma.userInsight.findMany({
        where: {
          userId,
          createdAt: { gte: recencyCutoff },
        },
        select: { observationText: true },
      });
      const recentTexts = new Set(recent.map((r) => r.observationText));

      const fresh = observations.filter(
        (o) => !recentTexts.has(o.observationText)
      );
      if (fresh.length === 0) continue;

      await prisma.userInsight.createMany({
        data: fresh.map((o) => ({
          userId,
          observationText: o.observationText,
          severity: o.severity,
          linkedAreaId: o.linkedAreaId ?? null,
        })),
      });
      totalWritten += fresh.length;
    }

    return { usersProcessed: users.length, insightsWritten: totalWritten };
  }
);
