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
  // since/until: full ISO timestamps, or YYYY-MM-DD (Central midnight).
  const parse = (v: string | null, fallback: Date) => (!v ? fallback : /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T05:00:00Z`) : new Date(v));
  const since = parse(sp.get("since"), new Date("2026-10-28T00:20:00Z"));
  const until = parse(sp.get("until"), new Date());
  const { priceTestResults } = await import("@/lib/price-test-results");
  return NextResponse.json(await priceTestResults(since, until));
}
