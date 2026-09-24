/**
 * POST /api/admin/content-factory/metrics-refresh
 *
 * Fires content-factory/metrics.refresh — the nightly IG/FB/TikTok
 * engagement refresh — on demand. Needed because the IG/Meta/Apify tokens
 * are Vercel-sensitive (prod-only). TikTok step costs ~$0.12 in Apify.
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
  // ?full=1 → scrape every TikTok video, not just the latest 40
  const full = req.nextUrl.searchParams.get("full") === "1";
  await inngest.send({ name: "content-factory/metrics.refresh", data: { full } });

  return NextResponse.json({ ok: true });
}
