/**
 * User data export.
 *
 *   GET  /api/user/export — returns the caller's most recent
 *                           DataExport row (for /account UI state).
 *   POST /api/user/export — kicks off an async export job via Inngest.
 *                           Rate-limited 1/7d per user (server-side
 *                           check against DataExport rows; also
 *                           covered by the shared dataExport limiter).
 *
 * The actual zip build + upload + email happens in the Inngest function
 * inngest/functions/generate-data-export.ts. This route just creates
 * the PENDING row + dispatches the event.
 */

import { NextRequest, NextResponse } from "next/server";

import { inngest } from "@/inngest/client";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const latest = await prisma.dataExport.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ export: latest });
}

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Short-window rate limit (server-side check against recent rows).
  // The Upstash limiter is a defense-in-depth layer; the DB check is
  // the authoritative "you already requested an export this week".
  const { prisma } = await import("@/lib/prisma");
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
  const recent = await prisma.dataExport.findFirst({
    where: {
      userId,
      createdAt: { gte: cutoff },
      status: { in: ["PENDING", "PROCESSING", "READY"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    return NextResponse.json(
      {
        error: "RateLimited",
        detail:
          "You can request one export every 7 days. Check your email or /account for the last link.",
        export: recent,
      },
      { status: 429 }
    );
  }

  const limited = await enforceUserRateLimit("dataExport", userId);
  if (limited) return limited;

  const row = await prisma.dataExport.create({
    data: { userId, status: "PENDING" },
  });

  // Inngest event — generates in the background; user polls GET.
  try {
    await inngest.send({
      name: "data-export/generate.requested",
      data: { exportId: row.id, userId },
    });
  } catch (err) {
    console.error("[data-export] inngest dispatch failed:", err);
    await prisma.dataExport.update({
      where: { id: row.id },
      data: { status: "FAILED", errorMessage: "Dispatch failed" },
    });
    return NextResponse.json({ error: "DispatchFailed" }, { status: 500 });
  }

  return NextResponse.json({ export: row }, { status: 202 });
}
