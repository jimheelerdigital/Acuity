import Anthropic from "@anthropic-ai/sdk";
import { NonRetriableError } from "inngest";

import { CLAUDE_MAX_TOKENS, CLAUDE_MODEL } from "@acuity/shared";

import { inngest } from "@/inngest/client";

type GenerateWeeklyReportEventData = {
  reportId: string;
  userId: string;
  weekStart: string; // ISO date
  weekEnd: string; // ISO date
};

type ParsedReport = {
  narrative: string;
  insightBullets: string[];
  moodArc: string;
  topThemes: string[];
};

const WEEKLY_SYSTEM_PROMPT = `You are Acuity's weekly synthesis engine. Analyse the user's brain dump entries from this week and produce a structured weekly report.

Return ONLY valid JSON matching this exact schema — no markdown, no prose:

{
  "narrative": "A 3-5 sentence reflective narrative of the user's week — empathetic, honest, and insightful",
  "insightBullets": ["insight 1", "insight 2", "insight 3"],
  "moodArc": "A one-sentence description of how mood changed across the week (e.g. 'Started rough but ended on a high note')",
  "topThemes": ["theme1", "theme2", "theme3"]
}

Guidelines:
- The narrative should feel like a thoughtful friend reflecting back what they noticed
- Insights should be non-obvious patterns or actionable observations
- moodArc should capture the emotional trajectory, not just an average
- topThemes should be the 3-5 most prominent recurring themes`;

function truncateForUi(message: string, max = 160): string {
  return message.length > max ? message.slice(0, max - 1) + "…" : message;
}

export const generateWeeklyReportFn = inngest.createFunction(
  {
    id: "generate-weekly-report",
    name: "Generate weekly report",
    triggers: [{ event: "weekly-report/generation.requested" }],
    // BACKGROUND (Decisions Made 2026-04-19): 3 retries tolerates longer
    // vendor outages. No user is watching a spinner; the report lands in
    // the dashboard when it's ready.
    retries: 3,
    // One in-flight weekly report per user — prevents double-generation
    // if a user taps "Generate" twice in quick succession.
    concurrency: { key: "event.data.userId", limit: 1 },
    onFailure: async ({ event, error }) => {
      // Triggered after retry exhaustion. Mark the placeholder FAILED so
      // the client polling GET /api/weekly sees the terminal state.
      const originalData = (event.data as { event?: { data?: unknown } })?.event
        ?.data as GenerateWeeklyReportEventData | undefined;
      const reportId = originalData?.reportId;
      if (!reportId) return;

      const { prisma } = await import("@/lib/prisma");
      await prisma.weeklyReport
        .update({
          where: { id: reportId },
          data: {
            status: "FAILED",
            errorMessage: truncateForUi(
              error?.message ?? "Report generation failed"
            ),
          },
        })
        .catch(() => {
          // Report row might not exist anymore — defensive; don't crash
          // the failure handler.
        });
    },
  },
  async ({ event, step, runId }) => {
    const { reportId, userId, weekStart, weekEnd } =
      event.data as GenerateWeeklyReportEventData;
    const { prisma } = await import("@/lib/prisma");

    // Step 0: link the report to this Inngest run + flip to GENERATING.
    await step.run("record-run-id", async () => {
      await prisma.weeklyReport.update({
        where: { id: reportId },
        data: { status: "GENERATING", inngestRunId: runId },
      });
    });

    // Step 1: fetch entries for the week window + verify ownership.
    const entries = await step.run("load-entries-for-week", async () => {
      const report = await prisma.weeklyReport.findUnique({
        where: { id: reportId },
        select: { userId: true, tasksOpened: true, tasksClosed: true },
      });
      if (!report) {
        throw new NonRetriableError(`WeeklyReport ${reportId} not found`);
      }
      if (report.userId !== userId) {
        throw new NonRetriableError(
          `WeeklyReport ${reportId} does not belong to user ${userId}`
        );
      }

      const rows = await prisma.entry.findMany({
        where: {
          userId,
          status: "COMPLETE",
          entryDate: {
            gte: new Date(weekStart),
            lte: new Date(weekEnd),
          },
        },
        orderBy: { entryDate: "asc" },
        select: {
          entryDate: true,
          mood: true,
          moodScore: true,
          energy: true,
          summary: true,
          themes: true,
          wins: true,
          blockers: true,
        },
      });

      if (rows.length < 3) {
        // Edge case: entries got deleted between placeholder creation and
        // this step running. Non-retriable — adding entries doesn't help.
        throw new NonRetriableError(
          `Insufficient entries (${rows.length}) — need at least 3`
        );
      }

      return {
        entries: rows.map((e) => ({
          entryDate: e.entryDate.toISOString(),
          mood: e.mood,
          moodScore: e.moodScore,
          energy: e.energy,
          summary: e.summary,
          themes: e.themes,
          wins: e.wins,
          blockers: e.blockers,
        })),
        tasksOpened: report.tasksOpened,
        tasksClosed: report.tasksClosed,
      };
    });

    // Step 2: call Claude for the narrative synthesis.
    const parsed = await step.run("generate-narrative", async () => {
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const summaryLines = entries.entries
        .map(
          (e, i) =>
            `Entry ${i + 1} (${new Date(e.entryDate).toLocaleDateString()}):\n` +
            `Mood: ${e.mood ?? "—"} (${e.moodScore ?? "?"}/10) | Energy: ${e.energy ?? "?"}/10\n` +
            `Summary: ${e.summary ?? ""}\n` +
            `Themes: ${e.themes.join(", ")}\n` +
            `Wins: ${e.wins.join("; ")}\n` +
            `Blockers: ${e.blockers.join("; ")}`
        )
        .join("\n\n");

      const userContent =
        `Week of ${new Date(weekStart).toLocaleDateString()} — ${new Date(weekEnd).toLocaleDateString()}\n` +
        `${entries.entries.length} entries | ${entries.tasksOpened} tasks opened | ${entries.tasksClosed} tasks closed\n\n` +
        summaryLines;

      const message = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: CLAUDE_MAX_TOKENS,
        system: WEEKLY_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      });

      const rawText =
        message.content[0].type === "text" ? message.content[0].text : "";
      const jsonText = rawText
        .replace(/^```(?:json)?\n?/m, "")
        .replace(/\n?```$/m, "")
        .trim();

      try {
        return JSON.parse(jsonText) as ParsedReport;
      } catch {
        throw new Error(
          `Claude returned non-JSON payload (${rawText.length} chars): ${rawText.slice(0, 120)}`
        );
      }
    });

    // Step 3: persist the parsed report + flip to COMPLETE.
    await step.run("persist-report", async () => {
      await prisma.weeklyReport.update({
        where: { id: reportId },
        data: {
          narrative: parsed.narrative,
          insightBullets: parsed.insightBullets,
          moodArc: parsed.moodArc,
          topThemes: parsed.topThemes,
          status: "COMPLETE",
        },
      });
    });

    return { reportId, status: "COMPLETE" };
  }
);
