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
  // Optional { groups: ["women"] } to remake just one group.
  const body = (await req.json().catch(() => ({}))) as { groups?: string[] };
  const groups = (body.groups ?? []).filter((g) => g === "women" || g === "men");
  await inngest.send({ name: "adlab/weekly-batch.requested", data: groups.length ? { groups } : {} });

  return NextResponse.json({ ok: true });
}
