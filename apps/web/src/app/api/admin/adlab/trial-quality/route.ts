/**
 * GET /api/admin/adlab/trial-quality?since=YYYY-MM-DD
 * Paid trials that record and convert, per lane and per ad (lib/adlab/trial-quality.ts).
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
  const since = new Date(`${req.nextUrl.searchParams.get("since") ?? "2026-09-30"}T00:00:00Z`);
  const { trialQuality } = await import("@/lib/adlab/trial-quality");
  return NextResponse.json({ since: since.toISOString().slice(0, 10), ...(await trialQuality(since)) });
}
