/**
 * GET /api/admin/price-test?since=YYYY-MM-DD&until=YYYY-MM-DD
 * Web price test results per arm (lib/price-test-results.ts). Read-only.
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
  const sp = req.nextUrl.searchParams;
  const since = new Date(`${sp.get("since") ?? "2026-11-02"}T05:00:00Z`);
  const until = sp.get("until") ? new Date(`${sp.get("until")}T05:00:00Z`) : new Date();
  const { priceTestResults } = await import("@/lib/price-test-results");
  return NextResponse.json(await priceTestResults(since, until));
}
