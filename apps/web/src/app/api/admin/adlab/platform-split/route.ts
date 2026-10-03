/**
 * GET /api/admin/adlab/platform-split?since=YYYY-MM-DD[&until=YYYY-MM-DD]
 *
 * Read-only (2026-10-03, per Keenan: "how much money has been spent on
 * facebook vs instagram?" / "which channel is giving us better acquisition
 * costs?"). Ad-account insights broken down by publisher_platform (facebook,
 * instagram, audience_network, messenger) and campaign: spend, impressions,
 * clicks, and Meta-reported purchases. Purchases before the 2026-10-02 dedupe
 * fix are roughly double-counted, so compare platforms with each other, not
 * with our DB totals.
 *
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

type Row = {
  publisher_platform: string;
  campaign_name?: string;
  spend: string;
  impressions: string;
  clicks: string;
  actions?: { action_type: string; value: string }[];
};

export async function GET(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }
  const since = req.nextUrl.searchParams.get("since") ?? new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const until = req.nextUrl.searchParams.get("until") ?? new Date().toISOString().slice(0, 10);
  const meta = await import("@/lib/adlab/meta");
  const res = await meta.metaGraph(`${meta.adAccountPath()}/insights`, "GET", {
    level: "campaign",
    breakdowns: "publisher_platform",
    fields: "campaign_name,spend,impressions,clicks,actions",
    time_range: JSON.stringify({ since, until }),
    limit: "200",
  });
  const rows = (res.data as Row[]) ?? [];
  const purchases = (r: Row) =>
    Number(r.actions?.find((a) => a.action_type === "offsite_conversion.fb_pixel_purchase")?.value ??
      r.actions?.find((a) => a.action_type === "purchase")?.value ?? 0);
  const total: Record<string, { spend: number; impressions: number; clicks: number; purchases: number }> = {};
  for (const r of rows) {
    const t = (total[r.publisher_platform] ??= { spend: 0, impressions: 0, clicks: 0, purchases: 0 });
    t.spend += Number(r.spend);
    t.impressions += Number(r.impressions);
    t.clicks += Number(r.clicks);
    t.purchases += purchases(r);
  }
  return NextResponse.json({
    since,
    until,
    byPlatform: total,
    byCampaign: rows.map((r) => ({ campaign: r.campaign_name, platform: r.publisher_platform, spend: Number(r.spend), clicks: Number(r.clicks), purchases: purchases(r) })),
  });
}
