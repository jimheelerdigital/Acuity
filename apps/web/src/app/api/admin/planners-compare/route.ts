/**
 * GET /api/admin/planners-compare[?since=ISO] — Planners funnel new vs old,
 * split visitors only (lib/planners-compare.ts).
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }
  const { plannersCompare, PLANNERS_SPLIT_FROM } = await import("@/lib/planners-compare");
  const sinceParam = req.nextUrl.searchParams.get("since");
  const since = sinceParam && !Number.isNaN(Date.parse(sinceParam)) ? new Date(sinceParam) : PLANNERS_SPLIT_FROM;
  return NextResponse.json(await plannersCompare(since));
}
