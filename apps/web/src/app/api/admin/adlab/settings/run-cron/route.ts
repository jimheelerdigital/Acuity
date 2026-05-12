/**
 * POST /api/admin/adlab/settings/run-cron — manually trigger the daily cron
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not set" });
  }

  const baseUrl = process.env.NEXTAUTH_URL || "https://getacuity.io";

  try {
    const res = await fetch(`${baseUrl}/api/admin/adlab/cron`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });

    const data = await res.json();
    return NextResponse.json({ ok: res.ok, status: res.status, data });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Failed to reach cron endpoint",
    });
  }
}
