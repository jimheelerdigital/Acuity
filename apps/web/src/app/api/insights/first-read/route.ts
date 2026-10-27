/**
 * GET /api/insights/first-read (2026-10-27)
 *
 * "Your first read": the small report for people with 3+ completed
 * entries who haven't unlocked Pattern Insights yet. Rules are in
 * lib/first-read.ts; row loading is shared with the web /insights page
 * (lib/insights-reports-data).
 *
 * The Pattern Insights gate is applied by the CALLER from its own
 * progression (the app's Insights tab already holds it). Like
 * /api/insights/emerging-patterns, this deliberately avoids
 * getUserProgression, whose snapshot write would swallow
 * `recentlyUnlocked` before /api/user/progression could show it.
 *
 * Response: { firstRead: FirstRead | null }. null means render nothing.
 * Auth: cookie session or mobile bearer (getAnySessionUserId).
 */
import { NextRequest, NextResponse } from "next/server";

import { loadFirstRead } from "@/lib/insights-reports-data";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { prisma } = await import("@/lib/prisma");
  const firstRead = await loadFirstRead(prisma, userId);
  return NextResponse.json(
    { firstRead },
    { headers: { "Cache-Control": "private, max-age=300" } }
  );
}
