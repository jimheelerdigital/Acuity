/**
 * POST /api/admin/adlab/ads/promote — move proven ads into their lane's MAIN
 * (production) ad set. Accepts { adIds: string[] } (AdLabAd ids).
 *
 * 2026-10-05, per Keenan: two ad sets per lane (production + testing); the
 * planner variation ads move from their own ad sets into production. Each
 * ad is re-created in MAIN on the same Meta creative (createInMain), and
 * only once that succeeds is the old ad paused, so a failed move never
 * leaves the ad off.
 *
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import * as meta from "@/lib/adlab/meta";
import { createInMain, weeklyBatchGroup } from "@/lib/adlab/evergreen";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }
  const body = (await req.json().catch(() => ({}))) as { adIds?: string[] };
  const adIds = (body.adIds ?? []).filter((x) => typeof x === "string").slice(0, 10);
  if (!adIds.length) return NextResponse.json({ error: "adIds required" }, { status: 400 });

  const ads = await prisma.adLabAd.findMany({
    where: { id: { in: adIds } },
    select: {
      id: true,
      metaAdId: true,
      creativeId: true,
      creative: { select: { headline: true, angle: { select: { experiment: { select: { campaignTags: true } } } } } },
    },
  });
  const results: Record<string, unknown>[] = [];
  for (const ad of ads) {
    const group = weeklyBatchGroup(ad.creative.angle.experiment.campaignTags);
    if (!group || !ad.metaAdId) {
      results.push({ id: ad.id, error: !group ? "not a weekly-batch lane ad" : "no metaAdId" });
      continue;
    }
    try {
      const newMetaAdId = await createInMain(group, { metaAdId: ad.metaAdId, creativeId: ad.creativeId, headline: ad.creative.headline });
      await meta.setStatus(ad.metaAdId, "ad", "PAUSED");
      await prisma.adLabAd.update({
        where: { id: ad.id },
        data: { status: "paused", decisionReason: "PROMOTED to the main (production) ad set (Keenan, 2026-10-05)." },
      });
      await prisma.adLabDecision.create({ data: { adId: ad.id, decisionType: "manual", rationale: "PROMOTE (manual): moved to main ad set." } });
      results.push({ id: ad.id, headline: ad.creative.headline, promoted: true, newMetaAdId });
    } catch (err) {
      results.push({ id: ad.id, headline: ad.creative.headline, error: meta.redactAccessToken(String(err)).slice(0, 400) });
    }
  }
  return NextResponse.json({ results });
}
