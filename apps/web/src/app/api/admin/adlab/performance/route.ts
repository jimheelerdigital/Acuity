/**
 * GET /api/admin/adlab/performance?from=YYYY-MM-DD&to=YYYY-MM-DD — aggregated ad performance data
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = req.nextUrl.searchParams.get("from") || thirtyDaysAgo.toISOString().split("T")[0];
  const to = req.nextUrl.searchParams.get("to") || now.toISOString().split("T")[0];

  const metrics = await prisma.adLabDailyMetric.findMany({
    where: {
      date: {
        gte: new Date(from),
        lte: new Date(to),
      },
    },
    include: {
      ad: {
        include: {
          creative: {
            include: {
              angle: {
                include: {
                  experiment: {
                    select: { id: true, topicBrief: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Aggregate by ad
  const adMap = new Map<string, {
    adId: string;
    headline: string;
    status: string;
    experimentId: string;
    experimentBrief: string;
    impressions: number;
    clicks: number;
    spendCents: number;
    conversions: number;
    frequency: number;
    dayCount: number;
  }>();

  for (const m of metrics) {
    const key = m.adId;
    const existing = adMap.get(key);
    if (existing) {
      existing.impressions += m.impressions;
      existing.clicks += m.clicks;
      existing.spendCents += m.spendCents;
      existing.conversions += m.conversions;
      existing.frequency += m.frequency;
      existing.dayCount += 1;
    } else {
      adMap.set(key, {
        adId: m.adId,
        headline: m.ad.creative.headline,
        status: m.ad.status,
        experimentId: m.ad.creative.angle.experiment.id,
        experimentBrief: m.ad.creative.angle.experiment.topicBrief,
        impressions: m.impressions,
        clicks: m.clicks,
        spendCents: m.spendCents,
        conversions: m.conversions,
        frequency: m.frequency,
        dayCount: 1,
      });
    }
  }

  const ads = Array.from(adMap.values()).map((a) => ({
    adId: a.adId,
    headline: a.headline,
    status: a.status,
    experimentId: a.experimentId,
    experimentBrief: a.experimentBrief,
    impressions: a.impressions,
    clicks: a.clicks,
    ctr: a.impressions > 0 ? ((a.clicks / a.impressions) * 100) : 0,
    spendCents: a.spendCents,
    conversions: a.conversions,
    cplCents: a.conversions > 0 ? Math.round(a.spendCents / a.conversions) : null,
    cpcCents: a.clicks > 0 ? Math.round(a.spendCents / a.clicks) : null,
    frequency: a.dayCount > 0 ? +(a.frequency / a.dayCount).toFixed(2) : 0,
  }));

  const totalSpendCents = ads.reduce((s, a) => s + a.spendCents, 0);
  const totalConversions = ads.reduce((s, a) => s + a.conversions, 0);
  const totalImpressions = ads.reduce((s, a) => s + a.impressions, 0);
  const totalClicks = ads.reduce((s, a) => s + a.clicks, 0);

  return NextResponse.json({
    from,
    to,
    summary: {
      totalSpendCents,
      totalConversions,
      avgCplCents: totalConversions > 0 ? Math.round(totalSpendCents / totalConversions) : null,
      avgCtr: totalImpressions > 0 ? +((totalClicks / totalImpressions) * 100).toFixed(2) : 0,
      totalImpressions,
      totalClicks,
    },
    ads,
  });
}
