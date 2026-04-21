/**
 * Quarterly State-of-Me generator.
 *
 * Dispatched two ways:
 *   1. Cron `state-of-me/auto.tick` scans all users once a day at
 *      08:00 UTC and fires the generate event for anyone whose
 *      signup anniversary-quarter lands today.
 *   2. User taps "Generate State of Me" on /insights — the route
 *      sends `state-of-me/generate.requested` directly.
 *
 * Cadence logic (v1, intentionally simple): every 90 days from
 * User.createdAt. No timezone rollover, no mid-quarter signup
 * adjustments. Good enough for beta; revisit if users complain.
 *
 * Content: Claude Opus 4.7 synthesizes major themes + emotional arc +
 * life-matrix movement + goals progress + key relationships + patterns
 * + closing reflection. Fallback path fires when the user has
 * insufficient entries (<10) — we build a simpler template-filled
 * report so the user isn't left with a "nothing to show" page.
 *
 * Concurrency: 1 per user. Retries: 2. Failure flips the row to
 * FAILED with errorMessage set; user sees an inline error on the
 * detail page and can re-request after the standard 30-day cooldown.
 */

import Anthropic from "@anthropic-ai/sdk";

import {
  CLAUDE_FLAGSHIP_MAX_TOKENS,
  CLAUDE_FLAGSHIP_MODEL,
  type StateOfMeContent,
} from "@acuity/shared";

import { inngest } from "@/inngest/client";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const MIN_ENTRIES_FOR_FLAGSHIP = 10;

const SYSTEM_PROMPT = `You are Acuity's quarterly introspection writer. You have 90 days of a user's voice-journal entries + their life-matrix deltas + their goal status + their relationships (from extractions). Your job is to produce a State-of-Me report as JSON.

Return ONLY valid JSON matching this schema:
{
  "headline": "5-8 word title of this quarter",
  "majorThemes": [
    { "theme": "short phrase", "mentions": N, "excerpt": "200-char representative quote", "entryId": null, "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE" }
  ],
  "emotionalArc": { "narrative": "1-2 sentence trajectory" },
  "lifeMatrixMovement": [ { "area": "Career", "scoreStart": N, "scoreEnd": N, "delta": N } ],
  "goalsProgress": [ { "title": "goal", "status": "IN_PROGRESS" | etc, "progress": N, "verdict": "shipped" | "stalled" | "steady" | "abandoned" } ],
  "keyRelationships": [ { "name": "person", "mentionCount": N, "evolution": "1-sentence" } ],
  "patternsNoticed": [ { "observation": "..." } ],
  "closingReflection": "250-350 word second-person reflection"
}

Tone:
- Second person. Warm. Non-judgmental. No diagnostic language.
- Specific to this user. Never generic. Reference their actual words.
- The closing reflection is the flagship piece — 250-350 words of warm synthesis. No prescriptions. No "you should". End on a grounded observation, not an injunction.

Guardrails:
- NEVER speculate beyond the entries.
- If mood data is sparse, the emotionalArc narrative can say that plainly.
- Max 5 majorThemes, 3 keyRelationships, 3 patternsNoticed, 6 goalsProgress.`;

export const generateStateOfMeFn = inngest.createFunction(
  {
    id: "generate-state-of-me",
    name: "Generate State of Me report",
    triggers: [{ event: "state-of-me/generate.requested" }],
    concurrency: { key: "event.data.userId", limit: 1 },
    retries: 2,
  },
  async ({ event, logger }) => {
    const { reportId, userId } = (event as unknown as {
      data: { reportId: string; userId: string };
    }).data;
    const { prisma } = await import("@/lib/prisma");

    await prisma.stateOfMeReport.update({
      where: { id: reportId },
      data: { status: "GENERATING", inngestRunId: event.id },
    });

    try {
      const row = await prisma.stateOfMeReport.findUnique({
        where: { id: reportId },
      });
      if (!row) throw new Error("StateOfMe row vanished mid-run");

      const { periodStart, periodEnd } = row;

      // Pull the primary sources in parallel.
      const [entries, lifeAreas, snapshots, goals] = await Promise.all([
        prisma.entry.findMany({
          where: {
            userId,
            status: "COMPLETE",
            createdAt: { gte: periodStart, lte: periodEnd },
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            createdAt: true,
            summary: true,
            mood: true,
            moodScore: true,
            themes: true,
            rawAnalysis: true,
          },
        }),
        prisma.lifeMapArea.findMany({
          where: { userId },
          select: { area: true, score: true },
        }),
        prisma.lifeMapAreaHistory.findMany({
          where: {
            userId,
            weekStart: { gte: periodStart, lte: periodEnd },
          },
          select: { area: true, score: true, weekStart: true },
        }),
        prisma.goal.findMany({
          where: { userId, createdAt: { lte: periodEnd } },
          select: {
            title: true,
            status: true,
            progress: true,
            createdAt: true,
            lastMentionedAt: true,
          },
          take: 20,
        }),
      ]);

      // Degraded path — not enough signal for Claude to riff on.
      if (entries.length < MIN_ENTRIES_FOR_FLAGSHIP) {
        const fallback = buildFallback({
          entries,
          lifeAreas,
          goals,
          periodStart,
          periodEnd,
        });
        await prisma.stateOfMeReport.update({
          where: { id: reportId },
          data: { status: "COMPLETE", degraded: true, content: fallback as unknown as object },
        });
        logger.info(
          `[state-of-me] ${reportId} fallback (entries=${entries.length})`
        );
        return { ok: true, mode: "fallback", entries: entries.length };
      }

      // Build context block for Claude — compact per-entry digest so
      // the prompt stays under budget. Transcripts omitted (token +
      // privacy cost without obvious accuracy upside at quarterly
      // scale).
      const entryLines = entries
        .slice(0, 60)
        .map((e) => {
          const date = e.createdAt.toISOString().slice(0, 10);
          const themes = (e.themes ?? []).slice(0, 4).join(", ");
          const mood = e.mood ?? "?";
          const summary = (e.summary ?? "").slice(0, 220);
          return `[${date}] mood=${mood} themes=${themes} | ${summary}`;
        })
        .join("\n");

      const areaLines = lifeAreas
        .map((a) => {
          const snapshot = snapshots
            .filter((s) => s.area === a.area)
            .sort(
              (x, y) => x.weekStart.getTime() - y.weekStart.getTime()
            )[0];
          const start = snapshot?.score ?? a.score;
          return `${a.area}: start=${start} current=${a.score} delta=${a.score - start}`;
        })
        .join("\n");

      const goalLines = goals
        .slice(0, 10)
        .map(
          (g) =>
            `- "${g.title}" status=${g.status} progress=${g.progress}`
        )
        .join("\n");

      const userMessage = [
        `Period: ${periodStart.toISOString().slice(0, 10)} → ${periodEnd.toISOString().slice(0, 10)}`,
        `Entries: ${entries.length}`,
        ``,
        `Entry digest:`,
        entryLines,
        ``,
        `Life Matrix:`,
        areaLines,
        ``,
        `Goals:`,
        goalLines,
      ].join("\n");

      const res = await anthropic.messages.create({
        model: CLAUDE_FLAGSHIP_MODEL,
        max_tokens: CLAUDE_FLAGSHIP_MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      const rawText =
        res.content[0]?.type === "text" ? res.content[0].text : "";
      const jsonText = rawText
        .replace(/^```(?:json)?\n?/m, "")
        .replace(/\n?```$/m, "")
        .trim();

      const parsed = JSON.parse(jsonText) as Partial<StateOfMeContent>;
      const content: StateOfMeContent = {
        headline: String(parsed.headline ?? "Your quarter").slice(0, 120),
        majorThemes: (parsed.majorThemes ?? [])
          .slice(0, 5)
          .map((t) => ({
            theme: String(t.theme ?? ""),
            mentions: Number(t.mentions ?? 0),
            excerpt: String(t.excerpt ?? "").slice(0, 280),
            entryId: null,
            sentiment:
              t.sentiment === "POSITIVE" || t.sentiment === "NEGATIVE"
                ? t.sentiment
                : "NEUTRAL",
          })),
        emotionalArc: {
          narrative: String(parsed.emotionalArc?.narrative ?? ""),
          weeklyMood: buildWeeklyMood(entries, periodStart, periodEnd),
        },
        lifeMatrixMovement: (parsed.lifeMatrixMovement ?? []).slice(0, 6),
        goalsProgress: (parsed.goalsProgress ?? []).slice(0, 6),
        keyRelationships: (parsed.keyRelationships ?? []).slice(0, 3),
        patternsNoticed: (parsed.patternsNoticed ?? []).slice(0, 3),
        closingReflection: String(parsed.closingReflection ?? ""),
        mode: "flagship",
      };

      await prisma.stateOfMeReport.update({
        where: { id: reportId },
        data: {
          status: "COMPLETE",
          degraded: false,
          content: content as unknown as object,
        },
      });

      // Send the beautiful email.
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, name: true },
        });
        if (user?.email) {
          const { sendStateOfMeReadyEmail } = await import(
            "@/emails/state-of-me-ready"
          );
          await sendStateOfMeReadyEmail({
            to: user.email,
            name: user.name,
            reportId,
            headline: content.headline,
            closingReflection: content.closingReflection,
          });
        }
      } catch (err) {
        logger.warn(`[state-of-me] email failed: ${String(err)}`);
      }

      return { ok: true, mode: "flagship", entries: entries.length };
    } catch (err) {
      logger.error(`[state-of-me] failed ${reportId}: ${String(err)}`);
      await prisma.stateOfMeReport.update({
        where: { id: reportId },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "unknown",
        },
      });
      throw err;
    }
  }
);

/**
 * Daily scan — identifies users whose signup anniversary-quarter
 * boundary lands today and fires a generate event for each. Idempotent
 * via a dedup check against the most recent StateOfMeReport row.
 */
export const stateOfMeAutoTickFn = inngest.createFunction(
  {
    id: "state-of-me-auto-tick",
    name: "State of Me — auto-dispatch (daily scan)",
    triggers: [{ cron: "0 8 * * *" }],
    retries: 1,
  },
  async ({ logger }) => {
    const { prisma } = await import("@/lib/prisma");

    const users = await prisma.user.findMany({
      where: { subscriptionStatus: { in: ["TRIAL", "PRO"] } },
      select: {
        id: true,
        createdAt: true,
        stateOfMeReports: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true, periodEnd: true, status: true },
        },
      },
    });

    const now = Date.now();
    let dispatched = 0;

    for (const u of users) {
      const ageMs = now - u.createdAt.getTime();
      // User must be at least 90 days old (first report fires on
      // their first 90-day anniversary).
      if (ageMs < NINETY_DAYS_MS) continue;
      const quartersElapsed = Math.floor(ageMs / NINETY_DAYS_MS);

      const latest = u.stateOfMeReports[0];
      if (latest) {
        // If the last report covers the current quarter already, skip.
        const latestAgeMs = now - latest.createdAt.getTime();
        if (latestAgeMs < NINETY_DAYS_MS) continue;
      }

      const periodEnd = new Date(u.createdAt.getTime() + quartersElapsed * NINETY_DAYS_MS);
      const periodStart = new Date(periodEnd.getTime() - NINETY_DAYS_MS);

      const row = await prisma.stateOfMeReport.create({
        data: {
          userId: u.id,
          periodStart,
          periodEnd,
          status: "QUEUED",
          content: {} as unknown as object,
        },
      });

      await inngest.send({
        name: "state-of-me/generate.requested",
        data: { reportId: row.id, userId: u.id },
      });
      dispatched += 1;
    }

    logger.info(`[state-of-me-auto-tick] dispatched ${dispatched}`);
    return { dispatched };
  }
);

// ── Helpers ─────────────────────────────────────────────────────────

function buildWeeklyMood(
  entries: Array<{ createdAt: Date; moodScore: number | null }>,
  periodStart: Date,
  periodEnd: Date
): Array<{ weekStart: string; avg: number | null }> {
  const weeks: Array<{ weekStart: string; avg: number | null }> = [];
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  for (let t = periodStart.getTime(); t < periodEnd.getTime(); t += WEEK_MS) {
    const wStart = new Date(t);
    const wEnd = new Date(t + WEEK_MS);
    const inWeek = entries.filter(
      (e) => e.createdAt >= wStart && e.createdAt < wEnd && e.moodScore != null
    );
    const avg =
      inWeek.length === 0
        ? null
        : Math.round(
            (inWeek.reduce((s, e) => s + (e.moodScore ?? 0), 0) / inWeek.length) *
              10
          ) / 10;
    weeks.push({ weekStart: wStart.toISOString().slice(0, 10), avg });
  }
  return weeks;
}

function buildFallback(params: {
  entries: Array<{ createdAt: Date; moodScore: number | null; themes: string[] }>;
  lifeAreas: Array<{ area: string; score: number }>;
  goals: Array<{ title: string; status: string; progress: number }>;
  periodStart: Date;
  periodEnd: Date;
}): StateOfMeContent {
  const { entries, lifeAreas, goals, periodStart, periodEnd } = params;
  const themeFreq: Record<string, number> = {};
  for (const e of entries) {
    for (const t of e.themes ?? []) {
      const k = t.toLowerCase();
      themeFreq[k] = (themeFreq[k] ?? 0) + 1;
    }
  }
  const topThemes = Object.entries(themeFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([theme, mentions]) => ({
      theme,
      mentions,
      excerpt: "",
      entryId: null,
      sentiment: "NEUTRAL" as const,
    }));

  return {
    headline: "Your quarter so far",
    majorThemes: topThemes,
    emotionalArc: {
      narrative:
        entries.length === 0
          ? "No entries logged this quarter — a State of Me gets richer the more you record."
          : "Keep recording — patterns will emerge across the next few weeks.",
      weeklyMood: buildWeeklyMood(entries, periodStart, periodEnd),
    },
    lifeMatrixMovement: lifeAreas.map((a) => ({
      area: a.area,
      scoreStart: a.score,
      scoreEnd: a.score,
      delta: 0,
    })),
    goalsProgress: goals.slice(0, 6).map((g) => ({
      title: g.title,
      status: g.status,
      progress: g.progress,
      verdict: g.progress >= 100 ? "shipped" : g.progress > 0 ? "steady" : "stalled",
    })),
    keyRelationships: [],
    patternsNoticed: [],
    closingReflection:
      "This is a lightweight report because there aren't enough entries yet to synthesize a full picture. Keep going — a richer read is waiting on the other side of a few more days.",
    mode: "fallback",
  };
}
