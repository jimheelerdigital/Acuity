/**
 * POST /api/admin/adlab/run-competitor-research
 *
 * Fires adlab/competitor-research.requested — the weekly Meta Ad Library
 * scrape + Claude brief, on demand (same path as the Saturday cron). Needed
 * because APIFY_TOKEN and ANTHROPIC_API_KEY are prod-only.
 *
 * Costs Apify pay-per-result (~$0.006/ad, ~320 ads/run ≈ $2). Never
 * touches Meta ads.
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

  const { inngest } = await import("@/inngest/client");
  await inngest.send({ name: "adlab/competitor-research.requested", data: {} });

  return NextResponse.json({ ok: true });
}
