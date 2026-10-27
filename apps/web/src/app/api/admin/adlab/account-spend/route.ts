/**
 * GET /api/admin/adlab/account-spend?days=7  (or ?since=YYYY-MM-DD&until=YYYY-MM-DD)
 * Every Meta campaign's real spend, priced by paid trial and charged payer
 * (lib/adlab/account-spend.ts). Read-only.
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

export async function GET(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }
  const sp = req.nextUrl.searchParams;
  const days = Math.min(Math.max(Number(sp.get("days") ?? 7) || 7, 1), 90);
  const until = sp.get("until") ?? ymd(new Date());
  const since = sp.get("since") ?? ymd(new Date(Date.now() - (days - 1) * 24 * 3600_000));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    return NextResponse.json({ error: "since/until must be YYYY-MM-DD" }, { status: 400 });
  }
  try {
    const { accountSpend } = await import("@/lib/adlab/account-spend");
    return NextResponse.json(await accountSpend(since, until));
  } catch (err) {
    const { redactAccessToken } = await import("@/lib/adlab/meta");
    return NextResponse.json({ error: redactAccessToken(String(err)).slice(0, 400) }, { status: 500 });
  }
}
