/**
 * POST /api/admin/voiced/run-script
 *
 * Fires content-factory/voiced.script now (same path as the 12:00 UTC
 * cron): writes the day's voiced scripts and emails them to Keenan. The
 * script writer needs prod-only keys (local ANTHROPIC_API_KEY is stale).
 * Body (optional): { date?: "YYYY-MM-DD", brand?: "ripple" | "bwk", force?: boolean }.
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

  const body = (await req.json().catch(() => ({}))) as { date?: string; brand?: string; force?: boolean };
  const data: { date?: string; brand?: "ripple" | "bwk"; force?: boolean } = {};
  if (body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) data.date = body.date;
  if (body.brand === "ripple" || body.brand === "bwk") data.brand = body.brand;
  if (body.force) data.force = true;

  const { inngest } = await import("@/inngest/client");
  await inngest.send({ name: "content-factory/voiced.script", data });
  return NextResponse.json({ ok: true, data });
}
