/**
 * GET /api/admin/adlab/performance?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns everything the performance dashboard needs:
 * - Summary cards (all-time + date-range)
 * - Experiment overview table
 * - Daily time-series for charts
 * - Ad-level detail with decisions
 * - AI cost tracking per experiment
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

  const fromDate = new Date(from);
  const toDate = new Date(to);

  // ── 1. All-time metrics ──────────────────────────────────────────────
  const allTimeMetrics = await prisma.adLabDailyMetric.aggregate({
    _sum: { impressions: true, clicks: true, spendCents: true, conversions: true },
  });
  const at = allTimeMetrics._sum;

  // ── 2. Date-range metrics (deep include for ad→creative→angle→experiment chain) ──
  const rangeMetrics = await prisma.adLabDailyMetric.findMany({
    where: { date: { gte: fromDate, lte: toDate } },
    include: {
      ad: {
        include: {
          decisions: { orderBy: { executedAt: "desc" } },
          creative: {
            include: {
              angle: {
                include: {
                  experiment: {
                    select: {
                      id: true,
                      topicBrief: true,
                      status: true,
                      launchedAt: true,
                      concludedAt: true,
                      projectId: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // ── 3. Experiment counts ─────────────────────────────────────────────
  const experimentCounts = await prisma.adLabExperiment.groupBy({
    by: ["status"],
    _count: true,
  });
  const liveExperiments = experimentCounts.find((c) => c.status === "live")?._count ?? 0;
  const concludedExperiments = experimentCounts.find((c) => c.status === "concluded")?._count ?? 0;

  const liveAdsCount = await prisma.adLabAd.count({ where: { status: "live" } });

  // ── 4. Aggregate by ad ───────────────────────────────────────────────
  interface AdAgg {
    adId: string;
    headline: string;
    primaryText: string;
    status: string;
    experimentId: string;
    experimentBrief: string;
    angleHypothesis: string;
    angleSurface: string;
    launchedAt: string | null;
    impressions: number;
    clicks: number;
    spendCents: number;
    conversions: number;
    frequency: number;
    dayCount: number;
    decisions: Array<{
      id: string;
      decisionType: string;
      rationale: string;
      executedAt: string;
      priorBudgetCents: number | null;
      newBudgetCents: number | null;
    }>;
  }

  const adMap = new Map<string, AdAgg>();

  // Daily time series: { date → { experimentId → { spend, conversions } } }
  const dailyMap = new Map<string, Map<string, { spendCents: number; conversions: number }>>();

  // Experiment aggregation
  interface ExpAgg {
    id: string;
    topicBrief: string;
    status: string;
    launchedAt: string | null;
    concludedAt: string | null;
    totalAds: Set<string>;
    spendCents: number;
    conversions: number;
    impressions: number;
    clicks: number;
    // Per-angle CPL for "best angle"
    angleSpend: Map<string, number>;
    angleConversions: Map<string, number>;
    angleHypothesis: Map<string, string>;
  }
  const expMap = new Map<string, ExpAgg>();

  for (const m of rangeMetrics) {
    const ad = m.ad;
    const creative = ad.creative;
    const angle = creative.angle;
    const experiment = angle.experiment;

    // Ad aggregation
    const existing = adMap.get(m.adId);
    if (existing) {
      existing.impressions += m.impressions;
      existing.clicks += m.clicks;
      existing.spendCents += m.spendCents;
      existing.conversions += m.conversions;
      existing.frequency += m.frequency;
      existing.dayCount += 1;
    } else {
      adMap.set(m.adId, {
        adId: m.adId,
        headline: creative.headline,
        primaryText: creative.primaryText,
        status: ad.status,
        experimentId: experiment.id,
        experimentBrief: experiment.topicBrief,
        angleHypothesis: angle.hypothesis,
        angleSurface: angle.valueSurface,
        launchedAt: ad.launchedAt?.toISOString() ?? null,
        impressions: m.impressions,
        clicks: m.clicks,
        spendCents: m.spendCents,
        conversions: m.conversions,
        frequency: m.frequency,
        dayCount: 1,
        decisions: ad.decisions.map((d) => ({
          id: d.id,
          decisionType: d.decisionType,
          rationale: d.rationale,
          executedAt: d.executedAt.toISOString(),
          priorBudgetCents: d.priorBudgetCents,
          newBudgetCents: d.newBudgetCents,
        })),
      });
    }

    // Experiment aggregation
    let exp = expMap.get(experiment.id);
    if (!exp) {
      exp = {
        id: experiment.id,
        topicBrief: experiment.topicBrief,
        status: experiment.status,
        launchedAt: experiment.launchedAt?.toISOString() ?? null,
        concludedAt: experiment.concludedAt?.toISOString() ?? null,
        totalAds: new Set(),
        spendCents: 0,
        conversions: 0,
        impressions: 0,
        clicks: 0,
        angleSpend: new Map(),
        angleConversions: new Map(),
        angleHypothesis: new Map(),
      };
      expMap.set(experiment.id, exp);
    }
    exp.totalAds.add(m.adId);
    exp.spendCents += m.spendCents;
    exp.conversions += m.conversions;
    exp.impressions += m.impressions;
    exp.clicks += m.clicks;
    exp.angleSpend.set(angle.id, (exp.angleSpend.get(angle.id) ?? 0) + m.spendCents);
    exp.angleConversions.set(angle.id, (exp.angleConversions.get(angle.id) ?? 0) + m.conversions);
    exp.angleHypothesis.set(angle.id, angle.hypothesis);

    // Daily time series
    const dateKey = m.date.toISOString().split("T")[0];
    if (!dailyMap.has(dateKey)) dailyMap.set(dateKey, new Map());
    const dayExp = dailyMap.get(dateKey)!;
    const dayData = dayExp.get(experiment.id) ?? { spendCents: 0, conversions: 0 };
    dayData.spendCents += m.spendCents;
    dayData.conversions += m.conversions;
    dayExp.set(experiment.id, dayData);
  }

  // Build ad results
  const ads = Array.from(adMap.values()).map((a) => ({
    adId: a.adId,
    headline: a.headline,
    primaryText: a.primaryText,
    status: a.status,
    experimentId: a.experimentId,
    experimentBrief: a.experimentBrief,
    angleHypothesis: a.angleHypothesis,
    angleSurface: a.angleSurface,
    launchedAt: a.launchedAt,
    impressions: a.impressions,
    clicks: a.clicks,
    ctr: a.impressions > 0 ? +((a.clicks / a.impressions) * 100).toFixed(2) : 0,
    spendCents: a.spendCents,
    conversions: a.conversions,
    cplCents: a.conversions > 0 ? Math.round(a.spendCents / a.conversions) : null,
    cpcCents: a.clicks > 0 ? Math.round(a.spendCents / a.clicks) : null,
    frequency: a.dayCount > 0 ? +(a.frequency / a.dayCount).toFixed(2) : 0,
    decisionsCount: a.decisions.length,
    decisions: a.decisions,
  }));

  // Build experiment results
  const experiments = Array.from(expMap.values()).map((e) => {
    // Find best angle (lowest CPL with at least 1 conversion)
    let bestAngle: string | null = null;
    let bestAngleCpl = Infinity;
    for (const [angleId, conv] of e.angleConversions) {
      if (conv > 0) {
        const cpl = (e.angleSpend.get(angleId) ?? 0) / conv;
        if (cpl < bestAngleCpl) {
          bestAngleCpl = cpl;
          bestAngle = e.angleHypothesis.get(angleId) ?? null;
        }
      }
    }
    return {
      id: e.id,
      topicBrief: e.topicBrief,
      status: e.status,
      launchedAt: e.launchedAt,
      concludedAt: e.concludedAt,
      totalAds: e.totalAds.size,
      spendCents: e.spendCents,
      conversions: e.conversions,
      avgCplCents: e.conversions > 0 ? Math.round(e.spendCents / e.conversions) : null,
      avgCtr: e.impressions > 0 ? +((e.clicks / e.impressions) * 100).toFixed(2) : 0,
      bestAngle,
    };
  });

  // Build daily time series
  const allExpIds = [...new Set(experiments.map((e) => e.id))];
  const dailySeries = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, expData]) => {
      const row: Record<string, unknown> = { date };
      for (const expId of allExpIds) {
        const d = expData.get(expId);
        row[`spend_${expId}`] = d ? d.spendCents / 100 : 0;
        row[`conv_${expId}`] = d ? d.conversions : 0;
        const spend = d?.spendCents ?? 0;
        const conv = d?.conversions ?? 0;
        row[`cpl_${expId}`] = conv > 0 ? +(spend / conv / 100).toFixed(2) : null;
      }
      return row;
    });

  // ── 5. AI Cost tracking ──────────────────────────────────────────────
  // ClaudeCallLog doesn't have a direct FK to experiments, but we can match
  // by purpose field (adlab purposes contain experiment context)
  const claudeCalls = await prisma.claudeCallLog.findMany({
    where: {
      purpose: { startsWith: "adlab" },
    },
    select: {
      purpose: true,
      tokensIn: true,
      tokensOut: true,
      costCents: true,
      createdAt: true,
    },
  });

  // Count image generations per experiment (creatives with imageUrl)
  const imageCreatives = await prisma.adLabCreative.findMany({
    where: { imageUrl: { not: null } },
    select: {
      angle: {
        select: { experimentId: true },
      },
    },
  });

  const aiCostByExp = new Map<string, {
    claudeCalls: number;
    tokensIn: number;
    tokensOut: number;
    costCents: number;
    imageGens: number;
  }>();

  // Group Claude calls — most adlab calls are research/creative/compliance per experiment
  for (const call of claudeCalls) {
    // Try to find experiment ID from purpose pattern
    const key = "adlab_global"; // Falls back to global bucket
    const existing = aiCostByExp.get(key) ?? { claudeCalls: 0, tokensIn: 0, tokensOut: 0, costCents: 0, imageGens: 0 };
    existing.claudeCalls += 1;
    existing.tokensIn += call.tokensIn;
    existing.tokensOut += call.tokensOut;
    existing.costCents += call.costCents;
    aiCostByExp.set(key, existing);
  }

  // Count images per experiment
  for (const ic of imageCreatives) {
    const expId = ic.angle.experimentId;
    const existing = aiCostByExp.get(expId) ?? { claudeCalls: 0, tokensIn: 0, tokensOut: 0, costCents: 0, imageGens: 0 };
    existing.imageGens += 1;
    aiCostByExp.set(expId, existing);
  }

  const aiCosts = Array.from(aiCostByExp.entries()).map(([key, data]) => ({
    experimentId: key,
    claudeCalls: data.claudeCalls,
    tokensIn: data.tokensIn,
    tokensOut: data.tokensOut,
    claudeCostCents: data.costCents,
    imageGens: data.imageGens,
    imageCostCents: Math.round(data.imageGens * 2), // ~$0.02 per gpt-image-2
  }));

  // ── 6. Target CPL from project ───────────────────────────────────────
  const project = await prisma.adLabProject.findFirst({
    select: { targetCplCents: true },
    orderBy: { createdAt: "asc" },
  });

  // ── Summary ──────────────────────────────────────────────────────────
  const rangeSpendCents = ads.reduce((s, a) => s + a.spendCents, 0);
  const rangeConversions = ads.reduce((s, a) => s + a.conversions, 0);
  const rangeImpressions = ads.reduce((s, a) => s + a.impressions, 0);
  const rangeClicks = ads.reduce((s, a) => s + a.clicks, 0);

  return NextResponse.json({
    from,
    to,
    summary: {
      allTime: {
        spendCents: at.spendCents ?? 0,
        conversions: at.conversions ?? 0,
        impressions: at.impressions ?? 0,
        clicks: at.clicks ?? 0,
        avgCplCents: (at.conversions ?? 0) > 0 ? Math.round((at.spendCents ?? 0) / at.conversions!) : null,
        avgCtr: (at.impressions ?? 0) > 0 ? +(((at.clicks ?? 0) / at.impressions!) * 100).toFixed(2) : 0,
      },
      range: {
        spendCents: rangeSpendCents,
        conversions: rangeConversions,
        impressions: rangeImpressions,
        clicks: rangeClicks,
        avgCplCents: rangeConversions > 0 ? Math.round(rangeSpendCents / rangeConversions) : null,
        avgCtr: rangeImpressions > 0 ? +((rangeClicks / rangeImpressions) * 100).toFixed(2) : 0,
      },
      activeExperiments: liveExperiments,
      liveAds: liveAdsCount,
      concludedExperiments,
    },
    experiments,
    dailySeries,
    experimentIds: allExpIds,
    experimentLabels: Object.fromEntries(experiments.map((e) => [e.id, e.topicBrief.slice(0, 30)])),
    targetCplCents: project?.targetCplCents ?? null,
    ads,
    aiCosts,
  });
}
