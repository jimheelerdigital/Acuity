/**
 * POST /api/admin/bench/quick-debrief — speed/quality bench for the quick
 * debrief analysis (docs/jimmy-spec-2026-11-05-fast-first-results.md).
 *
 * Runs lib/quick-debrief.ts on one user's most recent debrief transcripts
 * and returns it next to what the full extraction already saved on each
 * entry, plus the full extraction's logged duration. Read-only: nothing is
 * written except ClaudeCallLog rows (purpose "quick_debrief").
 *
 * Body: { email: string, limit?: number (max 30) }.
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { quickDebrief } from "@/lib/quick-debrief";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const CONCURRENCY = 5;

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const bearerOk = !!cronSecret && bearer === `Bearer ${cronSecret}`;
  if (!bearerOk) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }

  const body = (await req.json().catch(() => ({}))) as { email?: string; limit?: number };
  if (!body.email) return NextResponse.json({ error: "email required" }, { status: 400 });
  const limit = Math.min(Math.max(1, body.limit ?? 30), 30);

  const user = await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });

  const entries = await prisma.entry.findMany({
    where: { userId: user.id, transcript: { not: null }, status: { in: ["COMPLETE", "PARTIAL"] } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      createdAt: true,
      transcript: true,
      summary: true,
      themes: true,
      mood: true,
      wins: true,
      blockers: true,
      tasks: { select: { title: true } },
    },
  });

  const logs = await prisma.claudeCallLog.findMany({
    where: {
      userId: user.id,
      purpose: "entry_extraction",
      success: true,
      createdAt: { gte: new Date(Math.min(...entries.map((e) => e.createdAt.getTime()))) },
    },
    select: { createdAt: true, durationMs: true, tokensOut: true },
  });
  // The extraction log is written when the call ends, a few seconds to a few
  // minutes after the entry row; take the first log inside that window.
  const fullFor = (createdAt: Date) =>
    logs
      .filter((l) => l.createdAt >= createdAt && l.createdAt.getTime() - createdAt.getTime() < 10 * 60_000)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null;

  const rows: unknown[] = new Array(entries.length);
  let next = 0;
  async function worker() {
    while (next < entries.length) {
      const i = next++;
      const e = entries[i];
      const transcript = e.transcript ?? "";
      const quick = await quickDebrief(transcript, user!.id);
      const full = fullFor(e.createdAt);
      rows[i] = {
        entryId: e.id,
        createdAt: e.createdAt.toISOString(),
        words: transcript.split(/\s+/).filter(Boolean).length,
        transcript,
        quick: { ...quick.result, ms: quick.ms, tokensOut: quick.tokensOut, ok: !!quick.result },
        full: {
          summary: e.summary,
          themes: e.themes,
          tasks: e.tasks.map((t) => t.title).filter(Boolean),
          mood: e.mood,
          wins: e.wins,
          blockers: e.blockers,
          ms: full?.durationMs ?? null,
          tokensOut: full?.tokensOut ?? null,
        },
      };
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return NextResponse.json({ count: rows.length, rows });
}
