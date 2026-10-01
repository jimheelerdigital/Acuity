/**
 * POST /api/admin/content-factory/performance-report
 *
 * Fires the performance loop now (same code paths as the crons):
 *   body {} or { action: "report" } → refresh scoreboards + email Keenan
 *   body { action: "refresh" }      → refresh scoreboards only
 * Needed because scoring reads prod storage/DB with prod keys.
 *
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const bearerOk = !!cronSecret && bearer === `Bearer ${cronSecret}`;
  if (!bearerOk) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const name = body.action === "refresh" ? "content-factory/scoreboard.refresh" : "content-factory/performance.report";
  const { inngest } = await import("@/inngest/client");
  await inngest.send({ name, data: {} });
  return NextResponse.json({ ok: true, event: name });
}
