/**
 * GET /api/insights/open-loops (2026-10-27)
 *
 * Up to 3 "open loops" for the Insights tab: worries that keep coming up
 * and active goals that have gone quiet. Rules live in lib/open-loops.ts;
 * row loading is shared with the web /insights page
 * (lib/insights-reports-data). Web session or mobile bearer.
 */

import { NextRequest, NextResponse } from "next/server";

import { loadOpenLoops } from "@/lib/insights-reports-data";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { prisma } = await import("@/lib/prisma");
  const loops = await loadOpenLoops(prisma, userId);
  return NextResponse.json(
    { loops },
    { headers: { "Cache-Control": "private, max-age=900" } }
  );
}
