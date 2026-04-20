/**
 * GET  /api/weekly — return the last 10 reports for the signed-in user.
 * POST /api/weekly — generate a new report for the last 7 days.
 *
 * Dual-path behavior (INNGEST_MIGRATION_PLAN.md §5 + §11 step 3):
 *   - ENABLE_INNGEST_PIPELINE !== "1" (default): legacy sync path. Runs
 *     the Claude synthesis inline and returns 201 with the completed
 *     report. Subject to Vercel's function timeout.
 *   - ENABLE_INNGEST_PIPELINE === "1": async path. Creates a
 *     WeeklyReport in QUEUED status, dispatches an
 *     `weekly-report/generation.requested` Inngest event, and returns
 *     202 immediately. Client polls GET /api/weekly for status
 *     transitions (QUEUED → GENERATING → COMPLETE / FAILED).
 */

import Anthropic from "@anthropic-ai/sdk";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { CLAUDE_MAX_TOKENS, CLAUDE_MODEL } from "@acuity/shared";

import { getAuthOptions } from "@/lib/auth";
import { inngest } from "@/inngest/client";
import {
  checkRateLimit,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  const reports = await prisma.weeklyReport.findMany({
    where: { userId: session.user.id },
    orderBy: { weekStart: "desc" },
    take: 10,
  });

  return NextResponse.json({ reports });
}

export async function POST() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = await checkRateLimit(limiters.expensiveAi, `user:${userId}`);
  if (!rl.success) return rateLimitedResponse(rl);

  const { prisma } = await import("@/lib/prisma");

  // Shared setup — both paths need the same week window, entry/task/goal
  // counts, and the minimum-entries gate.
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const entries = await prisma.entry.findMany({
    where: {
      userId,
      status: "COMPLETE",
      entryDate: { gte: weekAgo },
    },
    orderBy: { entryDate: "asc" },
  });

  if (entries.length < 3) {
    return NextResponse.json(
      { error: "Need at least 3 completed entries to generate a weekly report" },
      { status: 400 }
    );
  }

  const tasks = await prisma.task.findMany({
    where: { userId, createdAt: { gte: weekAgo } },
  });
  const tasksOpened = tasks.length;
  const tasksClosed = tasks.filter((t) => t.status === "DONE").length;

  const goals = await prisma.goal.findMany({
    where: { userId, status: "ACTIVE" },
  });

  const now = new Date();
  const weekStart = new Date(weekAgo);
  const weekEnd = new Date(now);
  const weekNumber = getWeekNumber(now);

  const useInngest = process.env.ENABLE_INNGEST_PIPELINE === "1";

  // ── Async path: create placeholder, dispatch event, return 202 ──────────
  if (useInngest) {
    const report = await prisma.weeklyReport.create({
      data: {
        userId,
        weekStart,
        weekEnd,
        weekNumber,
        year: now.getFullYear(),
        entryCount: entries.length,
        tasksOpened,
        tasksClosed,
        goalsProgressed: goals
          .filter((g) => g.progress > 0)
          .map((g) => g.title),
        status: "QUEUED",
      },
    });

    await inngest.send({
      name: "weekly-report/generation.requested",
      data: {
        reportId: report.id,
        userId,
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
      },
    });

    return NextResponse.json(
      { reportId: report.id, status: "QUEUED" },
      { status: 202 }
    );
  }

  // ── Sync path (legacy): inline Claude call, return 201 on completion ────
  const report = await prisma.weeklyReport.create({
    data: {
      userId,
      weekStart,
      weekEnd,
      weekNumber,
      year: now.getFullYear(),
      entryCount: entries.length,
      tasksOpened,
      tasksClosed,
      goalsProgressed: goals.filter((g) => g.progress > 0).map((g) => g.title),
      status: "GENERATING",
    },
  });

  const entrySummaries = entries
    .map(
      (e, i) =>
        `Entry ${i + 1} (${new Date(e.entryDate).toLocaleDateString()}):\n` +
        `Mood: ${e.mood} (${e.moodScore}/10) | Energy: ${e.energy}/10\n` +
        `Summary: ${e.summary}\n` +
        `Themes: ${e.themes.join(", ")}\n` +
        `Wins: ${e.wins.join("; ")}\n` +
        `Blockers: ${e.blockers.join("; ")}`
    )
    .join("\n\n");

  const systemPrompt = `You are Acuity's weekly synthesis engine. Analyse the user's brain dump entries from this week and produce a structured weekly report.

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

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: CLAUDE_MAX_TOKENS,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content:
            `Week of ${weekStart.toLocaleDateString()} — ${weekEnd.toLocaleDateString()}\n` +
            `${entries.length} entries | ${tasksOpened} tasks opened | ${tasksClosed} tasks closed\n\n` +
            entrySummaries,
        },
      ],
    });

    const rawText =
      message.content[0].type === "text" ? message.content[0].text : "";
    const jsonText = rawText
      .replace(/^```(?:json)?\n?/m, "")
      .replace(/\n?```$/m, "")
      .trim();

    const parsed = JSON.parse(jsonText) as {
      narrative: string;
      insightBullets: string[];
      moodArc: string;
      topThemes: string[];
    };

    const updated = await prisma.weeklyReport.update({
      where: { id: report.id },
      data: {
        narrative: parsed.narrative,
        insightBullets: parsed.insightBullets,
        moodArc: parsed.moodArc,
        topThemes: parsed.topThemes,
        status: "COMPLETE",
      },
    });

    return NextResponse.json({ report: updated }, { status: 201 });
  } catch (err) {
    console.error("[weekly] Report generation failed:", err);
    await prisma.weeklyReport.update({
      where: { id: report.id },
      data: { status: "FAILED" },
    });
    return NextResponse.json(
      { error: "Report generation failed" },
      { status: 500 }
    );
  }
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
