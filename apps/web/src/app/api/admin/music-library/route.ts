/**
 * POST /api/admin/music-library — fires content-factory/music.library: builds the
 * AI music library per brand (2026-10-03). Body: { perBrand?: number }. The
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
  const body = (await req.json().catch(() => ({}))) as { perBrand?: number; brands?: string[]; prefix?: string };
  await inngest.send({
    name: "content-factory/music.library",
    data: { perBrand: body.perBrand, brands: body.brands, prefix: body.prefix },
  });
  return NextResponse.json({ ok: true });
}
