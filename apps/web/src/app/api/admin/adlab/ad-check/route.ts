/**
 * GET /api/admin/adlab/ad-check?ids=<metaAdId>,<metaAdId>
 *
 * Read-only diagnostics for specific Meta ads (2026-10-01): delivery status
 * and any issues, whether the creative carries an Instagram identity, and
 * spend/impressions split by platform (Facebook vs Instagram) over the last
 * 3 days. Used to check ads launched before the Instagram-identity fix.
 *
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter((s) => /^\d{6,25}$/.test(s)).slice(0, 20);
  const meta = await import("@/lib/adlab/meta");
  const out: Record<string, unknown> = {};
  for (const id of ids) {
    try {
      const ad = await meta.metaGraph(id, "GET", {
        fields: "name,effective_status,configured_status,issues_info,adset{name},creative{id,instagram_user_id,object_story_spec}",
      });
      const creative = ad.creative as { object_story_spec?: Record<string, unknown>; instagram_user_id?: string } | undefined;
      const ins = await meta.metaGraph(`${id}/insights`, "GET", {
        fields: "spend,impressions,clicks",
        breakdowns: "publisher_platform",
        date_preset: "last_3d",
      });
      out[id] = {
        name: ad.name,
        adset: (ad.adset as { name?: string } | undefined)?.name,
        status: ad.effective_status,
        configured: ad.configured_status,
        issues: ad.issues_info ?? null,
        instagramIdentity: creative?.instagram_user_id ?? (creative?.object_story_spec?.instagram_user_id as string | undefined) ?? null,
        byPlatform: ((ins.data as { publisher_platform: string; spend: string; impressions: string; clicks: string }[]) ?? []).map((r) => ({
          platform: r.publisher_platform,
          spend: r.spend,
          impressions: r.impressions,
          clicks: r.clicks,
        })),
      };
    } catch (err) {
      out[id] = { error: String(err).slice(0, 300) };
    }
  }
  return NextResponse.json(out);
}
