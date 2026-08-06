/**
 * GET /api/admin/entitlement-drift
 *
 * On-demand, READ-ONLY entitlement-drift scan — the same logic the daily
 * `entitlement-drift-monitor` cron runs, exposed for manual invocation so we
 * can confirm ~zero drift against known-good state before trusting the alerts.
 * Writes nothing.
 *
 * Auth: CRON_SECRET bearer token OR admin session (mirrors backfill routes).
 */

import { NextRequest, NextResponse } from "next/server";

import {
  scanEntitlementDrift,
  reconcileEntitlementDrift,
} from "@/lib/entitlement-drift";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const hasCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!hasCronAuth) {
    try {
      const { requireAdmin } = await import("@/lib/admin-guard");
      const guard = await requireAdmin();
      if (!guard.ok) return guard.response;
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // `?mode=reconcile` runs the reconciler in DRY-RUN (writes nothing) and
  // returns what it WOULD correct — the sample used to validate before enabling
  // the nightly apply flag. Default is the plain read-only drift scan.
  if (req.nextUrl.searchParams.get("mode") === "reconcile") {
    const report = await reconcileEntitlementDrift({ apply: false });
    return NextResponse.json({ ok: true, ...report });
  }

  const result = await scanEntitlementDrift();
  return NextResponse.json({ ok: true, ...result });
}
