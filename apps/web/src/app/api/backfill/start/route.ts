/**
 * POST /api/backfill/start — kick off the v1.1 slice 5 "Process
 * my history" Inngest flow for the authenticated user.
 *
 * Body (optional): { window: "recent" | "older" }
 *   - "recent" (default): entries newer than 60 days
 *   - "older": entries 60+ days old (the second /account surface)
 *
 * Behavior:
 *   1. Auth + canExtractEntries gate (FREE post-trial returns 402)
 *   2. Counts eligible entries in the requested window
 *   3. If 0 → returns 200 { dispatched: false, recentCount: 0, ... }
 *      so the UI can render "nothing to do" instead of dispatching
 *   4. Sets User.backfillStartedAt = now() (in-flight indicator;
 *      Inngest's per-user concurrency=1 guard does the real
 *      single-flight enforcement)
 *   5. Dispatches `entry/backfill.requested` Inngest event
 *   6. Returns counts so the UI can render confirmation copy
 */

import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { inngest } from "@/inngest/client";
import { backfillWindowCutoff, type BackfillWindow } from "@/lib/backfill-extractions";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { requireEntitlement } from "@/lib/paywall";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gated = await requireEntitlement("canExtractEntries", userId);
  if (!gated.ok) return gated.response;

  // Rate-limit defensively. Even though the Inngest function is
  // per-user concurrency=1 and the WHERE filter dedupes, a malicious
  // client could spam events and exhaust Inngest's free-tier event
  // budget. 10/hr/user is generous but bounded.
  const limited = await enforceUserRateLimit("userWrite", userId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    window?: unknown;
  } | null;
  const window: BackfillWindow =
    body?.window === "older" ? "older" : "recent";

  const { prisma } = await import("@/lib/prisma");

  // Single round-trip: count both windows so the UI can show
  // "we'll process X recent; Y older still available" without a
  // second fetch.
  const cutoffRecent = backfillWindowCutoff("recent");
  const cutoffOlder = backfillWindowCutoff("older");
  const [recentCount, olderCount] = await Promise.all([
    prisma.entry.count({
      where: {
        userId,
        extracted: false,
        rawAnalysis: { equals: Prisma.DbNull },
        status: "COMPLETE",
        transcript: { not: null },
        createdAt: { gt: cutoffRecent.gt! },
      },
    }),
    prisma.entry.count({
      where: {
        userId,
        extracted: false,
        rawAnalysis: { equals: Prisma.DbNull },
        status: "COMPLETE",
        transcript: { not: null },
        createdAt: { lte: cutoffOlder.lte! },
      },
    }),
  ]);

  const targetCount = window === "recent" ? recentCount : olderCount;

  if (targetCount === 0) {
    // Mark dismissed so the banner stops showing — we tried.
    await prisma.user.update({
      where: { id: userId },
      data: {
        backfillPromptDismissedAt: new Date(),
      },
    });
    return NextResponse.json({
      dispatched: false,
      window,
      recentCount,
      olderCount,
    });
  }

  // Mark in-flight + dismiss the banner. Both happen together —
  // a user who tapped "Yes" should never see the prompt again.
  await prisma.user.update({
    where: { id: userId },
    data: {
      backfillStartedAt: new Date(),
      backfillPromptDismissedAt: new Date(),
    },
  });

  await inngest.send({
    name: "entry/backfill.requested",
    data: {
      userId,
      requestedAt: new Date().toISOString(),
      window,
    },
  });

  safeLog.info("backfill.dispatched", {
    userId,
    window,
    recentCount,
    olderCount,
  });

  return NextResponse.json({
    dispatched: true,
    window,
    recentCount,
    olderCount,
  });
}
