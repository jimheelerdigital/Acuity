/**
 * POST /api/admin/adlab/run-weekly-batch
 *
 * Fires the adlab/weekly-batch.requested Inngest event, which runs the
 * weekly Reddit→AdLab ad batch immediately (same code path as the Sunday
 * 10:00 UTC cron). Needed because the batch's Claude + image calls require
 * prod-only API keys — local runs 401 (local ANTHROPIC_API_KEY is stale).
 *
 * MONEY SAFETY: the batch never touches Meta — experiments land as
 * awaiting_approval; spend requires the Launch click at /admin/adlab/review.
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
  await inngest.send({ name: "adlab/weekly-batch.requested", data: {} });

  return NextResponse.json({ ok: true });
}
