import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";
import { getCached, invalidateCachePrefix } from "@/lib/admin-cache";
import { MONTHLY_PRICE_CENTS, SUBSCRIPTION_STATUS } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// ─── Dashboard Epoch ───────────────────────────────────────────────
// All historical data before this date is polluted from testing, the
// CompleteRegistration bug, and billing freezes. Time-series queries
// and signup/entry counts clamp their windows to start no earlier than
// this date so the dashboard charts start clean. Current-state metrics
// (e.g. "active paying subs right now") are NOT clamped — they always
// reflect the real DB state.
//
// Set to null to disable the epoch and show all historical data.
const DASHBOARD_EPOCH: Date | null = new Date("2026-05-20T00:00:00Z");

// TTLs per tab (in milliseconds)
const TAB_TTLS: Record<string, number> = {
  overview: 5 * 60_000,
  growth: 5 * 60_000,
  engagement: 5 * 60_000,
  revenue: 10 * 60_000,
  funnel: 15 * 60_000,
  ads: 15 * 60_000,
  "ai-costs": 2 * 60_000,
  "content-factory": 0, // no cache — needs to be live
  "red-flags": 5 * 60_000,
  users: 2 * 60_000,
  "feature-flags": 1 * 60_000,
  "growth-metrics": 15 * 60_000,
  "business-metrics": 10 * 60_000,
  guide: Infinity, // static content
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tab = req.nextUrl.searchParams.get("tab") ?? "overview";
  const startStr = req.nextUrl.searchParams.get("start");
  const endStr = req.nextUrl.searchParams.get("end");
  const refresh = req.nextUrl.searchParams.get("refresh") === "true";

  const end = endStr ? new Date(endStr) : new Date();
  let start = startStr
    ? new Date(startStr)
    : new Date(end.getTime() - 7 * 86400000);

  // Clamp start to the dashboard epoch so charts don't show polluted
  // pre-epoch data. The epoch is set to the date the dashboard was
  // reset and all test data wiped.
  if (DASHBOARD_EPOCH && start < DASHBOARD_EPOCH) {
    start = DASHBOARD_EPOCH;
  }

  // Previous period (same duration, immediately before start).
  // Also clamped — if prev period falls entirely before the epoch,
  // prevStart === prevEnd and all prev-period metrics will be 0.
  const duration = end.getTime() - start.getTime();
  let prevStart = new Date(start.getTime() - duration);
  const prevEnd = new Date(start.getTime() - 1);
  if (DASHBOARD_EPOCH && prevStart < DASHBOARD_EPOCH) {
    prevStart = DASHBOARD_EPOCH;
  }

  let monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  if (DASHBOARD_EPOCH && monthStart < DASHBOARD_EPOCH) {
    monthStart = DASHBOARD_EPOCH;
  }

  // Invalidate cache if refresh requested
  if (refresh) {
    invalidateCachePrefix(`tab:${tab}`);
  }

  const ttl = TAB_TTLS[tab] ?? 5 * 60_000;
  const cacheKey = `tab:${tab}:${startStr}:${endStr}`;
  const t0 = Date.now();

  try {
    const computeFn = async () => {
      switch (tab) {
        case "overview": {
          // Merged tab: Overview + Revenue + Funnel + Red Flags + Onboarding/Try funnels
          const [overview, revenue, funnel, redFlags, onboardingFunnel, tryFunnel] = await Promise.all([
            getOverview(prisma, start, end, prevStart, prevEnd, monthStart),
            getRevenue(prisma, start, end, prevStart, prevEnd, monthStart),
            getFunnel(prisma, start, end),
            getRedFlags(prisma),
            getOnboardingFunnel(prisma, start, end),
            getTryFunnel(prisma, start, end),
          ]);
          return { ...overview, revenue, funnel, redFlags, onboardingFunnel, tryFunnel };
        }
        // Legacy tab keys still served for backwards compat
        case "growth":
          return getGrowth(prisma, start, end, prevStart, prevEnd);
        case "engagement":
          return getEngagement(prisma, start, end, prevStart, prevEnd);
        case "revenue":
          return getRevenue(prisma, start, end, prevStart, prevEnd, monthStart);
        case "funnel":
          return getFunnel(prisma, start, end);
        case "ads":
          return getAds(prisma, start, end, prevStart, prevEnd);
        case "ai-costs":
          return getAICosts(prisma, start, end, monthStart);
        case "red-flags":
          return getRedFlags(prisma);
        case "growth-metrics":
          return getGrowthMetrics(prisma, start, end);
        case "business-metrics":
          return getBusinessMetrics(prisma, monthStart);
        case "guide":
          return getGuide();
        default:
          throw new Error("Unknown tab");
      }
    };

    const { data, cached, computedAt } = await getCached(cacheKey, ttl, computeFn);
    const durationMs = Date.now() - t0;

    console.log(
      `[metrics] tab=${tab} range=${startStr}..${endStr} cached=${cached} duration=${durationMs}ms`
    );

    return NextResponse.json({
      ...data,
      _meta: { cached, computedAt, durationMs },
    });
  } catch (err) {
    console.error("[admin/metrics]", err);
    if (err instanceof Error && err.message === "Unknown tab") {
      return NextResponse.json({ error: "Unknown tab" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P = any; // Prisma client type shorthand

async function getOverview(
  prisma: P,
  start: Date,
  end: Date,
  prevStart: Date,
  prevEnd: Date,
  monthStart: Date
) {
  const [
    signups,
    prevSignups,
    payingSubs,
    prevPayingSubs,
    trialConverted,
    trialTotal,
    prevTrialConverted,
    prevTrialTotal,
    aiSpend,
    signupsOverTime,
    aiByPurpose,
    recentRedFlags,
  ] = await Promise.all([
    // Signups this period
    prisma.user.count({
      where: { createdAt: { gte: start, lte: end } },
    }),
    prisma.user.count({
      where: { createdAt: { gte: prevStart, lte: prevEnd } },
    }),
    // Active paying subs
    prisma.user.count({
      where: {
        subscriptionStatus: SUBSCRIPTION_STATUS.PRO,
        stripeSubscriptionId: { not: null },
      },
    }),
    // Prev-period paying-sub count: no point-in-time history exists yet
    // (MetricSnapshot lands in Slice 2). Returning the same count here
    // means the period delta renders as "no change" — accurate-ish until
    // the snapshot table backfills a real prior value.
    prisma.user.count({
      where: {
        subscriptionStatus: SUBSCRIPTION_STATUS.PRO,
        stripeSubscriptionId: { not: null },
      },
    }),
    // Trial-to-paid: users created in range who are now PRO
    prisma.user.count({
      where: {
        createdAt: { gte: start, lte: end },
        subscriptionStatus: SUBSCRIPTION_STATUS.PRO,
      },
    }),
    // Denominator: every signup in range, regardless of current status.
    prisma.user.count({
      where: { createdAt: { gte: start, lte: end } },
    }),
    prisma.user.count({
      where: {
        createdAt: { gte: prevStart, lte: prevEnd },
        subscriptionStatus: SUBSCRIPTION_STATUS.PRO,
      },
    }),
    prisma.user.count({
      where: { createdAt: { gte: prevStart, lte: prevEnd } },
    }),
    // AI spend MTD
    prisma.$queryRaw<{ total: bigint | null }[]>`
      SELECT COALESCE(SUM("costCents"), 0)::bigint as total
      FROM "ClaudeCallLog"
      WHERE "createdAt" >= ${monthStart}
    `.catch(() => [{ total: BigInt(0) }]),
    // Signups over time for sparklines / bar chart
    prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT DATE("createdAt")::text as date, COUNT(*)::bigint as count
      FROM "User"
      WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,
    // AI cost by purpose
    prisma.$queryRaw<{ purpose: string; total: bigint }[]>`
      SELECT purpose, COALESCE(SUM("costCents"), 0)::bigint as total
      FROM "ClaudeCallLog"
      WHERE "createdAt" >= ${monthStart}
      GROUP BY purpose
      ORDER BY total DESC
    `.catch(() => []),
    // Red flags
    prisma.redFlag.findMany({
      where: { resolved: false },
      orderBy: { createdAt: "desc" },
      take: 10,
    }).catch(() => []),
  ]);

  const conversionRate =
    trialTotal > 0 ? (trialConverted / trialTotal) * 100 : 0;
  const prevConversionRate =
    prevTrialTotal > 0 ? (prevTrialConverted / prevTrialTotal) * 100 : 0;
  const aiSpendCents = Number(aiSpend[0]?.total ?? 0);

  // ── Try Session Metrics ──────────────────────────────────────────────
  let tryMetrics = { today: 0, thisWeek: 0, allTime: 0, conversions: 0, conversionRate: 0, dailyCapUsed: 0, dailyCap: 100 };
  try {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [today, thisWeek, allTime, conversions] = await Promise.all([
      prisma.trySession.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.trySession.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.trySession.count(),
      prisma.trySession.count({ where: { claimed: true } }),
    ]);
    const allTimeTries = allTime || 1; // avoid division by zero
    tryMetrics = {
      today,
      thisWeek,
      allTime,
      conversions,
      conversionRate: Math.round((conversions / allTimeTries) * 1000) / 10,
      dailyCapUsed: today,
      dailyCap: 100,
    };
  } catch {
    // TrySession table may not exist yet (pre-migration)
  }

  // Blended CAC: total ad spend / total signups in period
  let blendedCac: number | null = null;
  try {
    const adSpendRows = await prisma.metaSpend.findMany({
      where: { weekStart: { gte: start, lte: end } },
      select: { spendCents: true },
    });
    const totalAdSpend = adSpendRows.reduce(
      (acc: number, r: { spendCents: number }) => acc + r.spendCents,
      0
    );
    if (totalAdSpend > 0 && signups > 0) {
      blendedCac = Math.round(totalAdSpend / signups);
    }
  } catch {
    // MetaSpend table may not exist yet
  }

  return {
    signups,
    prevSignups,
    payingSubs,
    prevPayingSubs,
    conversionRate: Math.round(conversionRate * 10) / 10,
    prevConversionRate: Math.round(prevConversionRate * 10) / 10,
    aiSpendCents,
    blendedCac,
    signupsOverTime: signupsOverTime.map((r: { date: string; count: bigint }) => ({
      date: r.date,
      count: Number(r.count),
    })),
    aiByPurpose: aiByPurpose.map((r: { purpose: string; total: bigint }) => ({
      purpose: r.purpose,
      total: Number(r.total),
    })),
    redFlags: recentRedFlags,
    tryMetrics,
  };
}

async function getGrowth(
  prisma: P,
  start: Date,
  end: Date,
  prevStart: Date,
  prevEnd: Date
) {
  const [signups, prevSignups, waitlistSignups, signupsOverTime, recentSignups, d1Activated] =
    await Promise.all([
      prisma.user.count({
        where: { createdAt: { gte: start, lte: end } },
      }),
      prisma.user.count({
        where: { createdAt: { gte: prevStart, lte: prevEnd } },
      }),
      prisma.waitlist.count({
        where: { createdAt: { gte: start, lte: end } },
      }),
      prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT DATE("createdAt")::text as date, COUNT(*)::bigint as count
        FROM "User"
        WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
      `,
      prisma.user.findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: { email: true, createdAt: true, subscriptionStatus: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      // D0 activation: users who have at least one entry within 24h of signup
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT u.id)::bigint as count
        FROM "User" u
        INNER JOIN "Entry" e ON e."userId" = u.id
          AND e."createdAt" <= u."createdAt" + interval '24 hours'
        WHERE u."createdAt" >= ${start} AND u."createdAt" <= ${end}
      `.catch(() => [{ count: BigInt(0) }]),
    ]);

  const d0Rate =
    signups > 0
      ? (Number(d1Activated[0]?.count ?? 0) / signups) * 100
      : 0;

  return {
    signups,
    prevSignups,
    waitlistSignups,
    d0Rate: Math.round(d0Rate * 10) / 10,
    signupsOverTime: signupsOverTime.map((r: { date: string; count: bigint }) => ({
      date: r.date,
      count: Number(r.count),
    })),
    recentSignups: recentSignups.map((u: { email: string; createdAt: Date; subscriptionStatus: string }) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
    })),
  };
}

async function getEngagement(
  prisma: P,
  start: Date,
  end: Date,
  _prevStart: Date,
  _prevEnd: Date
) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let weekAgo = new Date(today.getTime() - 7 * 86400000);
  let monthAgo = new Date(today.getTime() - 30 * 86400000);
  if (DASHBOARD_EPOCH) {
    if (weekAgo < DASHBOARD_EPOCH) weekAgo = DASHBOARD_EPOCH;
    if (monthAgo < DASHBOARD_EPOCH) monthAgo = DASHBOARD_EPOCH;
  }

  const [dau, wau, mau, totalEntries, avgDuration, silentTrialUsers] =
    await Promise.all([
      // DAU
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT "userId")::bigint as count
        FROM "Entry"
        WHERE "createdAt" >= ${today}
      `,
      // WAU
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT "userId")::bigint as count
        FROM "Entry"
        WHERE "createdAt" >= ${weekAgo}
      `,
      // MAU
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT "userId")::bigint as count
        FROM "Entry"
        WHERE "createdAt" >= ${monthAgo}
      `,
      // Total entries in period
      prisma.entry.count({
        where: { createdAt: { gte: start, lte: end } },
      }),
      // Avg duration
      prisma.$queryRaw<{ avg: number | null }[]>`
        SELECT AVG(duration)::float as avg
        FROM "Entry"
        WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
        AND duration IS NOT NULL AND duration > 0
      `.catch(() => [{ avg: null }]),
      // Silent trial users (0 recordings in last 3 days)
      prisma.$queryRaw<{ id: string; email: string; lastSeenAt: string | null }[]>`
        SELECT u.id, u.email, u."lastSeenAt"::text
        FROM "User" u
        WHERE u."subscriptionStatus" = 'TRIAL'
        AND u."createdAt" < ${new Date(today.getTime() - 3 * 86400000)}
        AND NOT EXISTS (
          SELECT 1 FROM "Entry" e
          WHERE e."userId" = u.id
          AND e."createdAt" >= ${new Date(today.getTime() - 3 * 86400000)}
        )
        LIMIT 20
      `.catch(() => []),
    ]);

  // Entries per user per week
  const userCount = await prisma.user.count({
    where: { createdAt: { lte: end } },
  });
  const daysInRange = Math.max(
    1,
    (end.getTime() - start.getTime()) / 86400000
  );
  const weeksInRange = daysInRange / 7;
  const avgPerUserPerWeek =
    userCount > 0 && weeksInRange > 0
      ? totalEntries / userCount / weeksInRange
      : 0;

  const dauVal = Number(dau[0]?.count ?? 0);
  const mauVal = Number(mau[0]?.count ?? 0);
  const dauMauRatio = mauVal > 0 ? (dauVal / mauVal) * 100 : 0;

  return {
    dau: dauVal,
    wau: Number(wau[0]?.count ?? 0),
    mau: mauVal,
    dauMauRatio: Math.round(dauMauRatio * 10) / 10,
    totalEntries,
    avgDuration: Math.round(avgDuration[0]?.avg ?? 0),
    avgPerUserPerWeek: Math.round(avgPerUserPerWeek * 10) / 10,
    silentTrialUsers,
  };
}

async function getRevenue(
  prisma: P,
  start: Date,
  end: Date,
  _prevStart: Date,
  _prevEnd: Date,
  monthStart: Date
) {
  // ── 30-day window for cost calculations ───────────────────────────
  let thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  if (DASHBOARD_EPOCH && thirtyDaysAgo < DASHBOARD_EPOCH) {
    thirtyDaysAgo = DASHBOARD_EPOCH;
  }

  const [
    payingSubs,
    trialUsers,
    pastDueUsers,
    recentPaying,
    churnedInPeriod,
    trialConverted,
    trialTotal,
    claudeSpend30d,
    claudeSpendMtd,
    entriesThisMonth,
    signupsThisMonth,
    stripeCustomerCount,
    adSpendRows,
  ] = await Promise.all([
    prisma.user.count({
      where: {
        subscriptionStatus: SUBSCRIPTION_STATUS.PRO,
        stripeSubscriptionId: { not: null },
      },
    }),
    prisma.user.count({
      where: { subscriptionStatus: SUBSCRIPTION_STATUS.TRIAL },
    }),
    prisma.user.findMany({
      where: { subscriptionStatus: SUBSCRIPTION_STATUS.PAST_DUE },
      select: {
        id: true,
        email: true,
        stripeCurrentPeriodEnd: true,
        createdAt: true,
      },
      orderBy: { stripeCurrentPeriodEnd: "asc" },
      take: 200,
    }),
    prisma.user.findMany({
      where: {
        subscriptionStatus: SUBSCRIPTION_STATUS.PRO,
        stripeSubscriptionId: { not: null },
      },
      select: {
        email: true,
        createdAt: true,
        stripeCurrentPeriodEnd: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    // Churn = users who were paying customers (have a Stripe customer)
    // and are now FREE. Uses updatedAt (added 2026-04-28) — falls back
    // to 0 if column doesn't exist yet (pre-schema-push).
    prisma.user.count({
      where: {
        subscriptionStatus: SUBSCRIPTION_STATUS.FREE,
        stripeCustomerId: { not: null },
        updatedAt: { gte: start, lte: end },
      },
    }).catch(() => 0),
    prisma.user.count({
      where: {
        createdAt: { gte: start, lte: end },
        subscriptionStatus: SUBSCRIPTION_STATUS.PRO,
      },
    }),
    prisma.user.count({
      where: {
        createdAt: { gte: start, lte: end },
      },
    }),
    // Claude spend last 30 days
    prisma.$queryRaw<{ total: bigint | null }[]>`
      SELECT COALESCE(SUM("costCents"), 0)::bigint as total
      FROM "ClaudeCallLog"
      WHERE "createdAt" >= ${thirtyDaysAgo}
    `.catch(() => [{ total: BigInt(0) }]),
    // Claude spend MTD
    prisma.$queryRaw<{ total: bigint | null }[]>`
      SELECT COALESCE(SUM("costCents"), 0)::bigint as total
      FROM "ClaudeCallLog"
      WHERE "createdAt" >= ${monthStart}
    `.catch(() => [{ total: BigInt(0) }]),
    // Entry count this month (for cost-per-recording)
    prisma.entry.count({
      where: { createdAt: { gte: monthStart } },
    }).catch(() => 0),
    // Signups this month (for cost-per-signup)
    prisma.user.count({
      where: { createdAt: { gte: monthStart } },
    }),
    // Stripe customer count (for fee estimation)
    prisma.user.count({
      where: { stripeCustomerId: { not: null } },
    }),
    // Ad spend for CAC calculation
    prisma.metaSpend.findMany({
      where: { weekStart: { gte: start, lte: end } },
      select: { spendCents: true },
    }).catch(() => [] as { spendCents: number }[]),
  ]);

  // ── Core revenue metrics ──────────────────────────────────────────
  const mrrCents = payingSubs * MONTHLY_PRICE_CENTS;
  const churnRate =
    payingSubs + churnedInPeriod > 0
      ? (churnedInPeriod / (payingSubs + churnedInPeriod)) * 100
      : 0;
  const conversionRate =
    trialTotal > 0 ? (trialConverted / trialTotal) * 100 : 0;

  // ── True Cost of Revenue (last 30 days) ───────────────────────────
  const claudeSpend30dCents = Number(claudeSpend30d[0]?.total ?? 0);
  // Stripe fees: 2.9% + 30¢ per transaction. Estimate one transaction
  // per paying sub per month (monthly billing).
  const stripeFeeCents = Math.round(payingSubs * (MONTHLY_PRICE_CENTS * 0.029 + 30));
  // Fixed costs prorated to 30 days (hardcoded — flag for Jimmy to
  // update with real billing data when convenient)
  const resendCostCents = 2000; // $20/mo flat
  const vercelCostCents = 2000; // $20/mo Pro plan
  const supabaseCostCents = 2500; // $25/mo
  const totalCostCents =
    claudeSpend30dCents + stripeFeeCents + resendCostCents + vercelCostCents + supabaseCostCents;

  // ── Margin ────────────────────────────────────────────────────────
  const grossMarginCents = mrrCents - totalCostCents;
  const grossMarginPct = mrrCents > 0
    ? Math.round((grossMarginCents / mrrCents) * 1000) / 10
    : 0;

  // ── Per-customer unit economics ───────────────────────────────────
  const arpuCents = payingSubs > 0
    ? Math.round(mrrCents / payingSubs)
    : 0;
  const avgCostPerCustomerCents = payingSubs > 0
    ? Math.round(totalCostCents / payingSubs)
    : 0;
  const contributionMarginCents = arpuCents - avgCostPerCustomerCents;
  // LTV = ARPU / monthly churn rate, capped at 36 months
  const monthlyChurnRate = churnRate / 100;
  const ltvCents = monthlyChurnRate > 0
    ? Math.round(Math.min(arpuCents / monthlyChurnRate, arpuCents * 36))
    : arpuCents * 36; // no churn = cap at 36 months

  // CAC from ad spend
  const totalAdSpendCents = adSpendRows.reduce(
    (acc: number, r: { spendCents: number }) => acc + r.spendCents,
    0
  );
  const signupsInPeriod = trialTotal > 0 ? trialTotal : 1;
  const cacCents = totalAdSpendCents > 0
    ? Math.round(totalAdSpendCents / signupsInPeriod)
    : null;
  const ltvCacRatio = cacCents && cacCents > 0
    ? Math.round((ltvCents / cacCents) * 10) / 10
    : null;

  // ── AI Cost Breakdown (executive summary) ─────────────────────────
  const claudeSpendMtdCents = Number(claudeSpendMtd[0]?.total ?? 0);
  const budgetCents = 10000; // $100 budget
  const costPerRecordingCents = entriesThisMonth > 0
    ? Math.round((claudeSpendMtdCents / entriesThisMonth) * 10) / 10
    : 0;
  const costPerSignupCents = signupsThisMonth > 0
    ? Math.round((claudeSpendMtdCents / signupsThisMonth) * 10) / 10
    : 0;

  return {
    // Existing fields
    mrrCents,
    payingSubs,
    trialUsers,
    churnRate: Math.round(churnRate * 10) / 10,
    conversionRate: Math.round(conversionRate * 10) / 10,
    churnedInPeriod,
    pastDueUsers: pastDueUsers.map((u: { id: string; email: string; createdAt: Date; stripeCurrentPeriodEnd: Date | null }) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
      stripeCurrentPeriodEnd: u.stripeCurrentPeriodEnd?.toISOString() ?? null,
    })),
    recentPaying: recentPaying.map((u: { email: string; createdAt: Date; stripeCurrentPeriodEnd: Date | null }) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
      stripeCurrentPeriodEnd: u.stripeCurrentPeriodEnd?.toISOString() ?? null,
    })),
    // New: True Cost of Revenue
    costs: {
      claudeApiCents: claudeSpend30dCents,
      whisperCents: null as number | null, // Not tracked yet
      stripeFeeCents,
      resendCents: resendCostCents,
      vercelCents: vercelCostCents,
      supabaseCents: supabaseCostCents,
      totalCents: totalCostCents,
    },
    // New: Margin
    margin: {
      grossMarginCents,
      grossMarginPct,
    },
    // New: Per-customer unit economics
    unitEconomics: {
      arpuCents,
      avgCostPerCustomerCents,
      contributionMarginCents,
      ltvCents,
      cacCents,
      ltvCacRatio,
    },
    // New: AI cost breakdown (executive summary)
    aiSummary: {
      claudeSpendMtdCents,
      budgetCents,
      budgetRemainingCents: budgetCents - claudeSpendMtdCents,
      costPerRecordingCents,
      costPerSignupCents,
      entriesThisMonth,
      signupsThisMonth,
    },
  };
}

async function getFunnel(prisma: P, start: Date, end: Date) {
  const [
    waitlistCount,
    accountsCreated,
    firstRecording,
    activeDay1,
    activeDay3,
    activeDay7,
    activeDay30,
    converted,
  ] = await Promise.all([
    prisma.waitlist.count({
      where: { createdAt: { gte: start, lte: end } },
    }),
    prisma.user.count({
      where: { createdAt: { gte: start, lte: end } },
    }),
    // First recording within period
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT u.id)::bigint as count
      FROM "User" u
      INNER JOIN "Entry" e ON e."userId" = u.id
      WHERE u."createdAt" >= ${start} AND u."createdAt" <= ${end}
    `.catch(() => [{ count: BigInt(0) }]),
    // Active Day 1 (first 0-2 days)
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT u.id)::bigint as count
      FROM "User" u
      INNER JOIN "Entry" e ON e."userId" = u.id
        AND e."createdAt" >= u."createdAt"
        AND e."createdAt" <= u."createdAt" + interval '2 days'
      WHERE u."createdAt" >= ${start} AND u."createdAt" <= ${end}
    `.catch(() => [{ count: BigInt(0) }]),
    // Active Day 3
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT u.id)::bigint as count
      FROM "User" u
      INNER JOIN "Entry" e ON e."userId" = u.id
        AND e."createdAt" >= u."createdAt" + interval '2 days'
        AND e."createdAt" <= u."createdAt" + interval '4 days'
      WHERE u."createdAt" >= ${start} AND u."createdAt" <= ${end}
    `.catch(() => [{ count: BigInt(0) }]),
    // Active Day 7
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT u.id)::bigint as count
      FROM "User" u
      INNER JOIN "Entry" e ON e."userId" = u.id
        AND e."createdAt" >= u."createdAt" + interval '6 days'
        AND e."createdAt" <= u."createdAt" + interval '8 days'
      WHERE u."createdAt" >= ${start} AND u."createdAt" <= ${end}
    `.catch(() => [{ count: BigInt(0) }]),
    // Active Day 30 (days 28-32)
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT u.id)::bigint as count
      FROM "User" u
      INNER JOIN "Entry" e ON e."userId" = u.id
        AND e."createdAt" >= u."createdAt" + interval '28 days'
        AND e."createdAt" <= u."createdAt" + interval '32 days'
      WHERE u."createdAt" >= ${start} AND u."createdAt" <= ${end}
    `.catch(() => [{ count: BigInt(0) }]),
    // Converted to paid
    prisma.user.count({
      where: {
        createdAt: { gte: start, lte: end },
        subscriptionStatus: SUBSCRIPTION_STATUS.PRO,
      },
    }),
  ]);

  const steps = [
    { label: "Waitlist Signups", count: waitlistCount },
    { label: "Account Created", count: accountsCreated },
    { label: "First Recording", count: Number(firstRecording[0]?.count ?? 0) },
    { label: "Active Day 1", count: Number(activeDay1[0]?.count ?? 0) },
    { label: "Active Day 3", count: Number(activeDay3[0]?.count ?? 0) },
    { label: "Active Day 7", count: Number(activeDay7[0]?.count ?? 0) },
    { label: "Active Day 30", count: Number(activeDay30[0]?.count ?? 0) },
    { label: "Converted to Paid", count: converted },
  ];

  return { steps };
}

async function getAds(
  prisma: P,
  start: Date,
  end: Date,
  _prevStart: Date,
  _prevEnd: Date
) {
  const [spendRows, totalSignups] = await Promise.all([
    prisma.metaSpend.findMany({
      where: { weekStart: { gte: start, lte: end } },
      orderBy: { weekStart: "asc" },
    }).catch(() => []),
    prisma.user.count({
      where: { createdAt: { gte: start, lte: end } },
    }),
  ]);

  const totalSpendCents = spendRows.reduce(
    (acc: number, r: { spendCents: number }) => acc + r.spendCents,
    0
  );
  const blendedCac =
    totalSignups > 0 ? Math.round(totalSpendCents / totalSignups) : 0;

  // Group spend by campaign
  const byCampaign: Record<string, number> = {};
  for (const row of spendRows) {
    byCampaign[row.campaign] =
      (byCampaign[row.campaign] ?? 0) + row.spendCents;
  }

  return {
    totalSpendCents,
    blendedCac,
    totalSignups,
    byCampaign: Object.entries(byCampaign).map(([campaign, cents]) => ({
      campaign,
      cents,
    })),
    spendRows: spendRows.map((r: { weekStart: Date; campaign: string; spendCents: number }) => ({
      weekStart: r.weekStart.toISOString(),
      campaign: r.campaign,
      spendCents: r.spendCents,
    })),
  };
}

async function getAICosts(
  prisma: P,
  start: Date,
  end: Date,
  monthStart: Date
) {
  const [mtdSpend, byPurpose, byDay, recentCalls] = await Promise.all([
    prisma.$queryRaw<{ total: bigint | null }[]>`
      SELECT COALESCE(SUM("costCents"), 0)::bigint as total
      FROM "ClaudeCallLog"
      WHERE "createdAt" >= ${monthStart}
    `.catch(() => [{ total: BigInt(0) }]),
    prisma.$queryRaw<{ purpose: string; total: bigint; calls: bigint }[]>`
      SELECT purpose,
             COALESCE(SUM("costCents"), 0)::bigint as total,
             COUNT(*)::bigint as calls
      FROM "ClaudeCallLog"
      WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
      GROUP BY purpose
      ORDER BY total DESC
    `.catch(() => []),
    prisma.$queryRaw<{ date: string; total: bigint; calls: bigint }[]>`
      SELECT DATE("createdAt")::text as date,
             COALESCE(SUM("costCents"), 0)::bigint as total,
             COUNT(*)::bigint as calls
      FROM "ClaudeCallLog"
      WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `.catch(() => []),
    prisma.claudeCallLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return {
    mtdSpendCents: Number(mtdSpend[0]?.total ?? 0),
    budgetCents: 10000,
    byPurpose: byPurpose.map((r: { purpose: string; total: bigint; calls: bigint }) => ({
      purpose: r.purpose,
      totalCents: Number(r.total),
      calls: Number(r.calls),
    })),
    byDay: byDay.map((r: { date: string; total: bigint; calls: bigint }) => ({
      date: r.date,
      totalCents: Number(r.total),
      calls: Number(r.calls),
    })),
    recentCalls: recentCalls.map((c: { createdAt: Date; [key: string]: unknown }) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

async function getRedFlags(prisma: P) {
  const flags = await prisma.redFlag
    .findMany({
      where: { resolved: false },
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
    })
    .catch(() => []);

  return {
    flags: flags.map((f: { createdAt: Date; resolvedAt: Date | null; [key: string]: unknown }) => ({
      ...f,
      createdAt: f.createdAt.toISOString(),
      resolvedAt: f.resolvedAt?.toISOString() ?? null,
    })),
  };
}

function getGuide() {
  // Static content — cached with infinite TTL
  return { guide: true };
}

// ─── Growth Metrics (new tab) ──────────────────────────────────────

async function getGrowthMetrics(prisma: P, start: Date, end: Date) {
  const epochFilter = DASHBOARD_EPOCH ? `AND u."createdAt" >= '${DASHBOARD_EPOCH.toISOString()}'` : "";
  const epochFilterEntry = DASHBOARD_EPOCH ? `AND e."createdAt" >= '${DASHBOARD_EPOCH.toISOString()}'` : "";

  const [
    weeklySignups,
    cumulativeUsers,
    signupsBySource,
    weeklyRecordings,
    avgRecordingsPerUser,
    avgDuration,
    trialToPaidRate,
    mrrOverTime,
    payingUsersOverTime,
    cohorts,
  ] = await Promise.all([
    // Weekly signups
    prisma.$queryRaw<{ week: string; count: bigint }[]>`
      SELECT DATE_TRUNC('week', "createdAt")::date::text as week, COUNT(*)::bigint as count
      FROM "User"
      WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
      ${DASHBOARD_EPOCH ? prisma.$queryRawUnsafe(`AND "createdAt" >= '${DASHBOARD_EPOCH.toISOString()}'`) : prisma.$queryRawUnsafe("")}
      GROUP BY DATE_TRUNC('week', "createdAt")
      ORDER BY week ASC
    `.catch(() => []),

    // Cumulative users over time
    prisma.$queryRaw<{ week: string; total: bigint }[]>`
      SELECT w.week::text, COUNT(u.id)::bigint as total
      FROM generate_series(
        DATE_TRUNC('week', ${start}::timestamp),
        ${end}::timestamp,
        '1 week'::interval
      ) as w(week)
      LEFT JOIN "User" u ON u."createdAt" <= w.week + interval '6 days'
      ${DASHBOARD_EPOCH ? prisma.$queryRawUnsafe(`AND u."createdAt" >= '${DASHBOARD_EPOCH.toISOString()}'`) : prisma.$queryRawUnsafe("")}
      GROUP BY w.week ORDER BY w.week ASC
    `.catch(() => []),

    // Signups by source (UTM-based)
    prisma.$queryRaw<{ week: string; direct: bigint; meta: bigint; organic: bigint; referral: bigint }[]>`
      SELECT DATE_TRUNC('week', "createdAt")::date::text as week,
        COUNT(*) FILTER (WHERE "signupUtmSource" IS NULL AND "referredById" IS NULL)::bigint as direct,
        COUNT(*) FILTER (WHERE "signupUtmSource" ILIKE '%meta%' OR "signupUtmSource" ILIKE '%facebook%')::bigint as meta,
        COUNT(*) FILTER (WHERE "signupUtmSource" IS NOT NULL AND "signupUtmSource" NOT ILIKE '%meta%' AND "signupUtmSource" NOT ILIKE '%facebook%' AND "referredById" IS NULL)::bigint as organic,
        COUNT(*) FILTER (WHERE "referredById" IS NOT NULL)::bigint as referral
      FROM "User"
      WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
      GROUP BY DATE_TRUNC('week', "createdAt")
      ORDER BY week ASC
    `.catch(() => []),

    // Weekly recordings
    prisma.$queryRaw<{ week: string; count: bigint }[]>`
      SELECT DATE_TRUNC('week', "createdAt")::date::text as week, COUNT(*)::bigint as count
      FROM "Entry"
      WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
      GROUP BY DATE_TRUNC('week', "createdAt")
      ORDER BY week ASC
    `.catch(() => []),

    // Avg recordings per active user per week
    prisma.$queryRaw<{ week: string; avg: number }[]>`
      SELECT week, CASE WHEN users > 0 THEN ROUND(entries::numeric / users, 1) ELSE 0 END as avg
      FROM (
        SELECT DATE_TRUNC('week', "createdAt")::date::text as week,
               COUNT(*)::int as entries,
               COUNT(DISTINCT "userId")::int as users
        FROM "Entry"
        WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
        GROUP BY DATE_TRUNC('week', "createdAt")
      ) sub
      ORDER BY week ASC
    `.catch(() => []),

    // Avg duration per week
    prisma.$queryRaw<{ week: string; seconds: number }[]>`
      SELECT DATE_TRUNC('week', "createdAt")::date::text as week,
             COALESCE(AVG(duration), 0)::int as seconds
      FROM "Entry"
      WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
        AND duration IS NOT NULL AND duration > 0
      GROUP BY DATE_TRUNC('week', "createdAt")
      ORDER BY week ASC
    `.catch(() => []),

    // Trial-to-paid rate by signup week
    prisma.$queryRaw<{ week: string; rate: number }[]>`
      SELECT week,
        CASE WHEN total > 0 THEN ROUND(paid::numeric / total * 100, 1) ELSE 0 END as rate
      FROM (
        SELECT DATE_TRUNC('week', "createdAt")::date::text as week,
               COUNT(*)::int as total,
               COUNT(*) FILTER (WHERE "subscriptionStatus" = 'PRO')::int as paid
        FROM "User"
        WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
        GROUP BY DATE_TRUNC('week', "createdAt")
      ) sub
      ORDER BY week ASC
    `.catch(() => []),

    // MRR over time (monthly paying user count × price)
    prisma.$queryRaw<{ month: string; mrr: bigint }[]>`
      SELECT DATE_TRUNC('month', "createdAt")::date::text as month,
             (COUNT(*) FILTER (WHERE "subscriptionStatus" = 'PRO' AND "stripeSubscriptionId" IS NOT NULL) * ${MONTHLY_PRICE_CENTS})::bigint as mrr
      FROM "User"
      WHERE "createdAt" <= ${end}
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY month ASC
    `.catch(() => []),

    // Paying users over time
    prisma.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT DATE_TRUNC('month', "createdAt")::date::text as month,
             COUNT(*) FILTER (WHERE "subscriptionStatus" = 'PRO')::bigint as count
      FROM "User"
      WHERE "createdAt" <= ${end}
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY month ASC
    `.catch(() => []),

    // Retention cohorts (last 12 weeks)
    prisma.$queryRaw<{
      cohort_week: string;
      signups: bigint;
      week1: number; week2: number; week3: number; week4: number;
      week8: number; week12: number;
    }[]>`
      WITH cohort AS (
        SELECT id, DATE_TRUNC('week', "createdAt")::date as cohort_week
        FROM "User"
        WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
      ),
      activity AS (
        SELECT DISTINCT "userId", DATE_TRUNC('week', "createdAt")::date as activity_week
        FROM "Entry"
        WHERE "createdAt" >= ${start}
      )
      SELECT
        c.cohort_week::text,
        COUNT(DISTINCT c.id)::bigint as signups,
        ROUND(COUNT(DISTINCT a1.id)::numeric / NULLIF(COUNT(DISTINCT c.id), 0) * 100, 1) as week1,
        ROUND(COUNT(DISTINCT a2.id)::numeric / NULLIF(COUNT(DISTINCT c.id), 0) * 100, 1) as week2,
        ROUND(COUNT(DISTINCT a3.id)::numeric / NULLIF(COUNT(DISTINCT c.id), 0) * 100, 1) as week3,
        ROUND(COUNT(DISTINCT a4.id)::numeric / NULLIF(COUNT(DISTINCT c.id), 0) * 100, 1) as week4,
        ROUND(COUNT(DISTINCT a8.id)::numeric / NULLIF(COUNT(DISTINCT c.id), 0) * 100, 1) as week8,
        ROUND(COUNT(DISTINCT a12.id)::numeric / NULLIF(COUNT(DISTINCT c.id), 0) * 100, 1) as week12
      FROM cohort c
      LEFT JOIN (SELECT DISTINCT a."userId" as id, c2.cohort_week FROM activity a JOIN cohort c2 ON a."userId" = c2.id WHERE a.activity_week = c2.cohort_week + 7) a1 ON a1.id = c.id AND a1.cohort_week = c.cohort_week
      LEFT JOIN (SELECT DISTINCT a."userId" as id, c2.cohort_week FROM activity a JOIN cohort c2 ON a."userId" = c2.id WHERE a.activity_week = c2.cohort_week + 14) a2 ON a2.id = c.id AND a2.cohort_week = c.cohort_week
      LEFT JOIN (SELECT DISTINCT a."userId" as id, c2.cohort_week FROM activity a JOIN cohort c2 ON a."userId" = c2.id WHERE a.activity_week = c2.cohort_week + 21) a3 ON a3.id = c.id AND a3.cohort_week = c.cohort_week
      LEFT JOIN (SELECT DISTINCT a."userId" as id, c2.cohort_week FROM activity a JOIN cohort c2 ON a."userId" = c2.id WHERE a.activity_week = c2.cohort_week + 28) a4 ON a4.id = c.id AND a4.cohort_week = c.cohort_week
      LEFT JOIN (SELECT DISTINCT a."userId" as id, c2.cohort_week FROM activity a JOIN cohort c2 ON a."userId" = c2.id WHERE a.activity_week = c2.cohort_week + 56) a8 ON a8.id = c.id AND a8.cohort_week = c.cohort_week
      LEFT JOIN (SELECT DISTINCT a."userId" as id, c2.cohort_week FROM activity a JOIN cohort c2 ON a."userId" = c2.id WHERE a.activity_week = c2.cohort_week + 84) a12 ON a12.id = c.id AND a12.cohort_week = c.cohort_week
      GROUP BY c.cohort_week
      ORDER BY c.cohort_week ASC
    `.catch(() => []),
  ]);

  // Projections based on recent growth rate
  let projections = null;
  const totalUsers = await prisma.user.count().catch(() => 0);
  if (weeklySignups.length >= 2) {
    const recentWeeks = weeklySignups.slice(-4);
    const avgPerWeek = recentWeeks.reduce((s, w) => s + Number(w.count), 0) / recentWeeks.length;
    if (avgPerWeek > 0) {
      const weeksTo = (target: number) => Math.ceil(Math.max(0, target - totalUsers) / avgPerWeek);
      const addWeeks = (n: number) => {
        const d = new Date(); d.setDate(d.getDate() + n * 7); return d.toISOString().slice(0, 10);
      };
      projections = {
        current: totalUsers,
        growth100: totalUsers >= 100 ? "reached" : addWeeks(weeksTo(100)),
        growth500: totalUsers >= 500 ? "reached" : addWeeks(weeksTo(500)),
        growth1000: totalUsers >= 1000 ? "reached" : addWeeks(weeksTo(1000)),
      };
    }
  }

  return {
    weeklySignups: weeklySignups.map((r) => ({ week: r.week, count: Number(r.count) })),
    cumulativeUsers: cumulativeUsers.map((r) => ({ week: r.week, total: Number(r.total) })),
    signupsBySource: signupsBySource.map((r) => ({
      week: r.week, direct: Number(r.direct), meta: Number(r.meta),
      organic: Number(r.organic), referral: Number(r.referral),
    })),
    weeklyRecordings: weeklyRecordings.map((r) => ({ week: r.week, count: Number(r.count) })),
    avgRecordingsPerUser: avgRecordingsPerUser.map((r) => ({ week: r.week, avg: Number(r.avg) })),
    avgDuration: avgDuration.map((r) => ({ week: r.week, seconds: Number(r.seconds) })),
    trialToPaidRate: trialToPaidRate.map((r) => ({ week: r.week, rate: Number(r.rate) })),
    mrrOverTime: mrrOverTime.map((r) => ({ month: r.month, mrr: Number(r.mrr) })),
    payingUsersOverTime: payingUsersOverTime.map((r) => ({ month: r.month, count: Number(r.count) })),
    cohorts: cohorts.map((r) => ({
      cohortWeek: r.cohort_week,
      signups: Number(r.signups),
      retention: {
        week1: Number(r.week1) || 0, week2: Number(r.week2) || 0,
        week3: Number(r.week3) || 0, week4: Number(r.week4) || 0,
        week8: Number(r.week8) || 0, week12: Number(r.week12) || 0,
      },
    })),
    projections,
  };
}

// ─── Business Metrics (new tab) ────────────────────────────────────

async function getBusinessMetrics(prisma: P, monthStart: Date) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const [
    payingUsers,
    totalUsers,
    aiCostsMtd,
    adSpendMtd,
    infraCosts,
    mrrTrend,
    churnedThisMonth,
  ] = await Promise.all([
    prisma.user.count({
      where: { subscriptionStatus: SUBSCRIPTION_STATUS.PRO, stripeSubscriptionId: { not: null } },
    }),
    prisma.user.count(),
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM("costCents"), 0)::bigint as total
      FROM "ClaudeCallLog" WHERE "createdAt" >= ${monthStart}
    `.catch(() => [{ total: BigInt(0) }]),
    prisma.metaSpend.aggregate({
      _sum: { spendCents: true },
      where: { weekStart: { gte: monthStart } },
    }).catch(() => ({ _sum: { spendCents: null } })),
    prisma.infrastructureCost.findMany({
      where: {
        effectiveAt: { lte: new Date() },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { category: "asc" },
    }).catch(() => []),
    // MRR trend (last 6 months, snapshot current paying users per month)
    prisma.$queryRaw<{ month: string; subs: bigint }[]>`
      SELECT DATE_TRUNC('month', NOW() - (n || ' months')::interval)::date::text as month,
             0::bigint as subs
      FROM generate_series(0, 5) as n
      ORDER BY month ASC
    `.catch(() => []),
    prisma.user.count({
      where: {
        subscriptionStatus: SUBSCRIPTION_STATUS.FREE,
        stripeCustomerId: { not: null },
        updatedAt: { gte: monthStart },
      },
    }).catch(() => 0),
  ]);

  const mrrCents = payingUsers * MONTHLY_PRICE_CENTS;
  const aiCostsCents = Number(aiCostsMtd[0]?.total ?? 0);
  const adSpendCents = adSpendMtd._sum?.spendCents ?? 0;
  const infraTotalCents = infraCosts.reduce((s: number, c: { amountCents: number }) => s + c.amountCents, 0);

  // Stripe fees estimate
  const stripeFeeCents = Math.round(payingUsers * (MONTHLY_PRICE_CENTS * 0.029 + 30));
  const totalCostsCents = aiCostsCents + adSpendCents + infraTotalCents + stripeFeeCents;

  // Unit economics
  const arpuCents = payingUsers > 0 ? Math.round(mrrCents / payingUsers) : 0;
  const costPerUserCents = payingUsers > 0 ? Math.round(totalCostsCents / payingUsers) : 0;
  const grossMarginPerUserCents = arpuCents - costPerUserCents;
  const grossMarginPct = mrrCents > 0 ? Math.round((mrrCents - totalCostsCents) / mrrCents * 1000) / 10 : 0;

  const monthlyChurnRate = (payingUsers + churnedThisMonth) > 0
    ? churnedThisMonth / (payingUsers + churnedThisMonth)
    : 0;
  const ltvCents = monthlyChurnRate > 0
    ? Math.round(Math.min(arpuCents / monthlyChurnRate, arpuCents * 36))
    : arpuCents * 36;

  // New paying customers this month for CAC
  const newPaidThisMonth = await prisma.user.count({
    where: {
      subscriptionStatus: SUBSCRIPTION_STATUS.PRO,
      createdAt: { gte: monthStart },
    },
  }).catch(() => 0);
  const cacCents = adSpendCents > 0 && newPaidThisMonth > 0
    ? Math.round(adSpendCents / newPaidThisMonth)
    : null;
  const ltvCacRatio = cacCents && cacCents > 0 ? Math.round(ltvCents / cacCents * 10) / 10 : null;
  const paybackMonths = cacCents && grossMarginPerUserCents > 0
    ? Math.round(cacCents / grossMarginPerUserCents * 10) / 10
    : null;

  // P&L
  const netProfitCents = mrrCents - totalCostsCents;
  const breakEvenUsers = totalCostsCents > 0
    ? Math.ceil(totalCostsCents / MONTHLY_PRICE_CENTS)
    : 0;
  const runwayMonths = netProfitCents < 0 ? null : null; // No cash tracking yet

  return {
    mrrCents,
    totalRevenueCents: mrrCents, // placeholder — will be more accurate with Stripe data
    revenueThisMonthCents: mrrCents,
    arpuCents,
    payingUsers,
    mrrTrend: [{ month: new Date().toISOString().slice(0, 7), mrr: mrrCents }],
    aiCostsThisMonthCents: aiCostsCents,
    adSpendThisMonthCents: adSpendCents,
    infraCosts: infraCosts.map((c: { category: string; label: string; amountCents: number }) => ({
      category: c.category, label: c.label, amountCents: c.amountCents,
    })),
    totalCostsThisMonthCents: totalCostsCents,
    costPerUserCents,
    cacCents,
    grossMarginPerUserCents,
    grossMarginPct,
    ltvCents,
    ltvCacRatio,
    paybackMonths,
    netProfitCents,
    profitTrend: [{ month: new Date().toISOString().slice(0, 7), revenue: mrrCents, costs: totalCostsCents, net: netProfitCents }],
    breakEvenUsers,
    runwayMonths,
  };
}

// ── Onboarding Funnel (event-based) ─────────────────────────────────────────

const ONBOARDING_FUNNEL_STEPS = [
  { event: "onboarding_recording_screen_viewed", label: "Recording screen" },
  { event: "onboarding_recording_started", label: "Started recording" },
  { event: "onboarding_recording_completed", label: "Completed recording" },
  { event: "onboarding_extraction_viewed", label: "Saw extraction" },
  { event: "onboarding_download_screen_viewed", label: "Download screen" },
  { event: "onboarding_app_store_clicked", label: "Downloaded app" },
];

async function getOnboardingFunnel(prisma: P, start: Date, end: Date) {
  try {
    // Count "Signups" as distinct users who have ANY onboarding event in
    // the date range. This captures users who signed up just before
    // tracking deployed but completed onboarding after — they'd be missed
    // by a pure user.createdAt filter.
    const signupUsers = await prisma.onboardingEvent.groupBy({
      by: ["userId"],
      where: {
        event: { startsWith: "onboarding_" },
        createdAt: { gte: start, lte: end },
        userId: { not: null },
      },
    });
    const signups = signupUsers.length;

    const counts = await Promise.all(
      ONBOARDING_FUNNEL_STEPS.map(async (s) => {
        const distinctUsers = await prisma.onboardingEvent.groupBy({
          by: ["userId"],
          where: {
            event: s.event,
            createdAt: { gte: start, lte: end },
            userId: { not: null },
          },
        });
        return { label: s.label, count: distinctUsers.length };
      })
    );

    return {
      steps: [{ label: "Signups", count: signups }, ...counts],
    };
  } catch {
    return { steps: [] };
  }
}

// ── Try Flow Funnel ─────────────────────────────────────────────────────────

const TRY_FUNNEL_STEPS = [
  { event: "try_recording_screen_viewed", label: "Try started" },
  { event: "try_recording_started", label: "Recording started" },
  { event: "try_recording_completed", label: "Recording completed" },
  { event: "try_extraction_viewed", label: "Extraction viewed" },
  { event: "try_signup_started", label: "Signup started" },
  { event: "try_signup_completed", label: "Signup completed" },
];

async function getTryFunnel(prisma: P, start: Date, end: Date) {
  try {
    const counts = await Promise.all(
      TRY_FUNNEL_STEPS.map(async (s) => {
        // Try events may have sessionToken or userId — count distinct sessions
        const bySession = await prisma.onboardingEvent.groupBy({
          by: ["sessionToken"],
          where: {
            event: s.event,
            createdAt: { gte: start, lte: end },
            sessionToken: { not: null },
          },
        });
        const byUser = await prisma.onboardingEvent.groupBy({
          by: ["userId"],
          where: {
            event: s.event,
            createdAt: { gte: start, lte: end },
            userId: { not: null },
            sessionToken: null,
          },
        });
        return { label: s.label, count: bySession.length + byUser.length };
      })
    );

    return { steps: counts };
  } catch {
    return { steps: [] };
  }
}
