/**
 * GET /api/insights/how-you-talk (2026-10-27)
 *
 * Shifts in the user's feeling words: last 30 days vs the 30 before.
 * Logic, lexicon and thresholds live in lib/how-you-talk.ts; row loading
 * is shared with the web /insights page (lib/insights-reports-data).
 * Returns { enoughData: false, shifts: [] } when either period is too thin.
 * Cached privately for an hour, like the comparisons card.
 */
import { NextRequest, NextResponse } from "next/server";

import { loadHowYouTalk } from "@/lib/insights-reports-data";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { prisma } = await import("@/lib/prisma");
  const result = await loadHowYouTalk(prisma, userId);
  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, max-age=3600" },
  });
}
