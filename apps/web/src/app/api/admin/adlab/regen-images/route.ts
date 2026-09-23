/**
 * POST /api/admin/adlab/regen-images
 *
 * Fires the adlab/regen-images.requested Inngest event, which rebuilds the
 * image generationPrompts for the given weekly-batch experiments using the
 * direct-response AD_FORMATS rotation, force-regenerates every image, and
 * re-runs compliance. Copy/angles/experiments are untouched; nothing
 * touches Meta.
 *
 * Body: { "experimentIds": ["...", "..."] }
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

  const body = await req.json().catch(() => ({}));
  const experimentIds: unknown = body?.experimentIds;
  if (!Array.isArray(experimentIds) || !experimentIds.every((id) => typeof id === "string") || !experimentIds.length) {
    return NextResponse.json({ ok: false, error: "experimentIds: string[] required" }, { status: 400 });
  }

  const { inngest } = await import("@/inngest/client");
  await inngest.send({ name: "adlab/regen-images.requested", data: { experimentIds } });

  return NextResponse.json({ ok: true, experimentIds });
}
