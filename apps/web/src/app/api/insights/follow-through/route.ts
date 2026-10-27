/**
 * GET /api/insights/follow-through (2026-10-27)
 *
 * Weekly follow-through for the Insights tab: tasks captured vs completed
 * (this week vs last), typical days to finish by group, and what's still
 * open. Logic and thresholds live in lib/follow-through.ts; the row
 * loading is shared with the web /insights page (lib/insights-reports-data).
 * Returns { report: null } when there isn't enough data; the card then
 * renders nothing.
 */
import { NextRequest, NextResponse } from "next/server";

import { loadFollowThrough } from "@/lib/insights-reports-data";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { prisma } = await import("@/lib/prisma");
  const report = await loadFollowThrough(prisma, userId);
  return NextResponse.json(
    { report },
    { headers: { "Cache-Control": "private, max-age=300" } }
  );
}
