/**
 * POST /api/admin/music-sample — fires content-factory/music.sample: one
 * ElevenLabs AI track per brand, emailed to Keenan (2026-10-03). The
 * ElevenLabs key is prod-only.
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
  await inngest.send({ name: "content-factory/music.sample", data: {} });
  return NextResponse.json({ ok: true });
}
