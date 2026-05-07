/**
 * GET /api/admin/adlab/dashboard — dashboard stats for this month.
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [metrics, liveExperiments, liveAds, recentDecisions] = await Promise.all([
    prisma.adLabDailyMetric.aggregate({
      where: { date: { gte: monthStart } },
      _sum: { spendCents: true, conversions: true },
    }),
    prisma.adLabExperiment.count({ where: { status: "live" } }),
    prisma.adLabAd.count({ where: { status: { in: ["live", "scaled"] } } }),
    prisma.adLabDecision.findMany({
      orderBy: { executedAt: "desc" },
      take: 10,
      select: {
        id: true,
        decisionType: true,
        rationale: true,
        executedAt: true,
      },
    }),
  ]);

  const totalSpend = metrics._sum.spendCents || 0;
  const totalConversions = metrics._sum.conversions || 0;

  return NextResponse.json({
    totalSpendCents: totalSpend,
    totalConversions,
    blendedCplCents: totalConversions > 0 ? Math.round(totalSpend / totalConversions) : null,
    liveExperiments,
    liveAds,
    recentDecisions,
  });
}
