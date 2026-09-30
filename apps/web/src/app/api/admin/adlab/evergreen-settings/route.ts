/**
 * POST /api/admin/adlab/evergreen-settings
 *
 * Pushes the code's per-group daily budget and optimization event
 * (lib/adlab/evergreen.ts) onto the live evergreen ad sets, and returns what
 * Meta now reports for each. Added 2026-09-30 to switch both ad sets to
 * Purchase optimization and move $20/day from women to men.
 *
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }
  const { applyEvergreenSettings } = await import("@/lib/adlab/evergreen");
  return NextResponse.json(await applyEvergreenSettings());
}
