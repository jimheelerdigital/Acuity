/**
 * GET /api/insights/wrapped?period=YYYY-MM | YYYY
 *
 * Ripple Wrapped: a monthly or year-end recap (2026-10-27). Row loading
 * (with the user's local dates) is shared with the web /insights/wrapped
 * page (lib/insights-reports-data); the recap itself is lib/wrapped.ts
 * (pure, deterministic, no AI). Works with the web session and the mobile
 * bearer token.
 *
 * `eligible: false` means too few entries for a recap; the app hides the
 * card. Periods that haven't started yet return 400.
 */
import { NextRequest, NextResponse } from "next/server";

import { parseWrappedPeriod } from "@acuity/shared";

import { loadWrapped } from "@/lib/insights-reports-data";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const period = parseWrappedPeriod(req.nextUrl.searchParams.get("period"));
  if (!period) {
    return NextResponse.json({ error: "period must be YYYY-MM or YYYY" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");
  const result = await loadWrapped(prisma, userId, period);
  if (!result.ok) {
    return NextResponse.json({ error: "That period hasn't started yet" }, { status: 400 });
  }
  return NextResponse.json(result.wrapped, {
    headers: { "Cache-Control": "private, max-age=1800" },
  });
}
