/**
 * GET  /api/state-of-me       — list the caller's past reports
 * POST /api/state-of-me       — queue a new manual report
 *                               (rate-limited 1/30d)
 */

import { NextRequest, NextResponse } from "next/server";

import { inngest } from "@/inngest/client";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const reports = await prisma.stateOfMeReport.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      periodStart: true,
      periodEnd: true,
      status: true,
      degraded: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ reports });
}

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  // Rate limit — 1 manual generation per 30 days. Auto-cron generated
  // rows count too (a user who got their auto Q1 report shouldn't be
  // able to fire manual Q1 right after).
  const recent = await prisma.stateOfMeReport.findFirst({
    where: {
      userId,
      createdAt: { gte: new Date(Date.now() - THIRTY_DAYS_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    return NextResponse.json(
      {
        error: "RateLimited",
        detail:
          "You can request one State of Me every 30 days. Your last report is below.",
        report: recent,
      },
      { status: 429 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Manual run covers the last 90 days, or signup-to-now if the user
  // is younger. Auto-cron covers aligned quarter boundaries; manual
  // can float.
  const ageMs = Date.now() - user.createdAt.getTime();
  const periodEnd = new Date();
  const periodStart =
    ageMs >= NINETY_DAYS_MS
      ? new Date(Date.now() - NINETY_DAYS_MS)
      : user.createdAt;

  const row = await prisma.stateOfMeReport.create({
    data: {
      userId,
      periodStart,
      periodEnd,
      status: "QUEUED",
      content: {} as unknown as object,
    },
  });

  try {
    await inngest.send({
      name: "state-of-me/generate.requested",
      data: { reportId: row.id, userId },
    });
  } catch (err) {
    console.error("[state-of-me] dispatch failed:", err);
    await prisma.stateOfMeReport.update({
      where: { id: row.id },
      data: { status: "FAILED", errorMessage: "Dispatch failed" },
    });
    return NextResponse.json({ error: "DispatchFailed" }, { status: 500 });
  }

  return NextResponse.json({ report: row }, { status: 202 });
}
