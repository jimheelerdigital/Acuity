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
  "funnel-analytics": 2 * 60_000,
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
  const extraParams = req.nextUrl.searchParams.get("showBots") === "true" ? ":bots" : "";
  const cacheKey = `tab:${tab}:${startStr}:${endStr}${extraParams}`;
  const t0 = Date.now();

  try {
    const computeFn = async () => {
      switch (tab) {
        case "overview": {
          // Merged tab: Overview + Revenue + Funnel + Red Flags + Onboarding/Try funnels
          const [overview, revenue, funnel, redFlags, onboardingFunnel, webFunnel] = await Promise.all([
            getOverview(prisma, start, end, prevStart, prevEnd, monthStart),
            getRevenue(prisma, start, end, prevStart, prevEnd, monthStart),
            getFunnel(prisma, start, end),
            getRedFlags(prisma),
            getOnboardingFunnel(prisma, start, end),
            getWebOnboardingFunnel(prisma, start, end),
          ]);
          return { ...overview, revenue, funnel, redFlags, onboardingFunnel, webFunnel };
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
        case "funnel-analytics": {
          const showBots = req.nextUrl.searchParams.get("showBots") === "true";
          return getFunnelAnalytics(prisma, start, end, showBots);
        }
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
        isBot: false,
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
            isBot: false,
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

// ── Web Onboarding Funnel (/start) ──────────────────────────────────────────

const WEB_FUNNEL_STEPS = [
  { event: "funnel_pain_hook_viewed", label: "Pain hook viewed" },
  { event: "_diagnostics_all", label: "Diagnostics completed" }, // special: requires all 5
  { event: "funnel_mirror_viewed", label: "Mirror viewed" },
  { event: "funnel_commitment_completed", label: "Commitment completed" },
  { event: "funnel_mock_extraction_viewed", label: "Extraction viewed" },
  { event: "funnel_signup_completed", label: "Signup completed" },
  { event: "funnel_paywall_viewed", label: "Paywall viewed" },
  { event: "funnel_payment_completed", label: "Payment completed" },
  { event: "funnel_app_store_clicked", label: "App download clicked" },
];

const DIAGNOSTIC_EVENTS = [
  "funnel_diagnostic_loop",
  "funnel_diagnostic_duration",
  "funnel_diagnostic_attempts",
  "funnel_diagnostic_cost",
  "funnel_diagnostic_desire",
];

const DROP_OFF_FIXES: Record<string, string> = {
  "Pain hook viewed": "Hook didn\u2019t land. A/B test alternative hooks.",
  "Diagnostics completed": "Diagnostic fatigue. Consider reducing questions.",
  "Mirror viewed": "Mirror didn\u2019t resonate. Review copy quality.",
  "Commitment completed": "Won\u2019t commit. Make commitment optional or reduce hold time.",
  "Extraction viewed": "Won\u2019t create account. Simplify to Google/Apple one-tap only.",
  "Signup completed": "Post-signup friction. Check redirect timing.",
  "Paywall viewed": "Won\u2019t pay. Test lower price or extended trial.",
  "Payment completed": "Paid but didn\u2019t download. Improve download screen urgency.",
};

async function countDistinctSessions(prisma: P, event: string, start: Date, end: Date) {
  const bySession = await prisma.onboardingEvent.groupBy({
    by: ["sessionToken"],
    where: { event, createdAt: { gte: start, lte: end }, sessionToken: { not: null }, isBot: false },
  });
  const byUser = await prisma.onboardingEvent.groupBy({
    by: ["userId"],
    where: { event, createdAt: { gte: start, lte: end }, userId: { not: null }, sessionToken: null, isBot: false },
  });
  return bySession.length + byUser.length;
}

async function getWebOnboardingFunnel(prisma: P, start: Date, end: Date) {
  try {
    // ── Funnel steps ────────────────────────────────────
    const steps = await Promise.all(
      WEB_FUNNEL_STEPS.map(async (s) => {
        if (s.event === "_diagnostics_all") {
          // Count sessions that completed ALL 5 diagnostic events
          const sessionSets = await Promise.all(
            DIAGNOSTIC_EVENTS.map(async (de) => {
              const rows = await prisma.onboardingEvent.findMany({
                where: { event: de, createdAt: { gte: start, lte: end }, sessionToken: { not: null }, isBot: false },
                select: { sessionToken: true },
              });
              return new Set(rows.map((r) => r.sessionToken));
            })
          );
          // Intersect all sets
          let intersection = sessionSets[0] ?? new Set();
          for (let i = 1; i < sessionSets.length; i++) {
            intersection = new Set([...intersection].filter((t) => sessionSets[i].has(t)));
          }
          return { label: s.label, count: intersection.size };
        }
        return { label: s.label, count: await countDistinctSessions(prisma, s.event, start, end) };
      })
    );

    // ── Drop-off alerts ─────────────────────────────────
    const alerts: { step: string; dropPct: number; severity: "red" | "yellow"; fix: string }[] = [];
    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1].count;
      const curr = steps[i].count;
      if (prev > 0) {
        const dropPct = Math.round(((prev - curr) / prev) * 100);
        if (dropPct > 50) alerts.push({ step: steps[i].label, dropPct, severity: "red", fix: DROP_OFF_FIXES[steps[i].label] ?? "" });
        else if (dropPct > 30) alerts.push({ step: steps[i].label, dropPct, severity: "yellow", fix: DROP_OFF_FIXES[steps[i].label] ?? "" });
      }
    }

    // ── Diagnostic breakdowns ───────────────────────────
    const diagnosticBreakdowns: Record<string, { value: string; count: number }[]> = {};
    for (const de of DIAGNOSTIC_EVENTS) {
      const rows = await prisma.onboardingEvent.groupBy({
        by: ["value"],
        where: { event: de, createdAt: { gte: start, lte: end }, value: { not: null }, isBot: false },
        _count: true,
      });
      const label = de.replace("funnel_diagnostic_", "");
      diagnosticBreakdowns[label] = rows
        .map((r) => ({ value: r.value ?? "", count: r._count }))
        .sort((a, b) => b.count - a.count);
    }

    // ── Commitment stats ────────────────────────────────
    const commitCompleted = await countDistinctSessions(prisma, "funnel_commitment_completed", start, end);
    const commitAbandoned = await countDistinctSessions(prisma, "funnel_commitment_abandoned", start, end);
    const commitmentStats = {
      completed: commitCompleted,
      abandoned: commitAbandoned,
      successRate: commitCompleted + commitAbandoned > 0
        ? Math.round((commitCompleted / (commitCompleted + commitAbandoned)) * 100)
        : 0,
    };

    // ── Live sessions (last 50) ─────────────────────────
    const recentEvents = await prisma.onboardingEvent.findMany({
      where: {
        event: { startsWith: "funnel_" },
        createdAt: { gte: start, lte: end },
        sessionToken: { not: null },
        isBot: false,
      },
      orderBy: { createdAt: "desc" },
      take: 5000, // cap for aggregation
      select: { sessionToken: true, userId: true, event: true, value: true, createdAt: true, utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true },
    });

    // Group by session
    const sessionMap = new Map<string, typeof recentEvents>();
    for (const e of recentEvents) {
      const key = e.sessionToken!;
      if (!sessionMap.has(key)) sessionMap.set(key, []);
      sessionMap.get(key)!.push(e);
    }

    // Build session rows
    // Step progress — "viewed" events track screen reach, action events track engagement.
    // Use the higher of viewed vs action for each step so we never undercount progress.
    const STEP_PROGRESS: Record<string, number> = {
      funnel_pain_hook_viewed: 1,
      // Diagnostic viewed events (screen reached)
      funnel_diagnostic_loop_viewed: 2,
      funnel_diagnostic_duration_viewed: 3,
      funnel_diagnostic_attempts_viewed: 4,
      funnel_diagnostic_cost_viewed: 5,
      funnel_diagnostic_desire_viewed: 6,
      // Diagnostic answer events (also count as reaching that step)
      funnel_diagnostic_loop: 2, funnel_diagnostic_duration: 3,
      funnel_diagnostic_attempts: 4, funnel_diagnostic_cost: 5, funnel_diagnostic_desire: 6,
      funnel_mirror_viewed: 7,
      funnel_bridge_viewed: 8, funnel_failed_solution_viewed: 8,
      funnel_promise_viewed: 9,
      funnel_commitment_viewed: 10, funnel_commitment_completed: 10,
      funnel_extraction_viewed: 11, funnel_mock_extraction_viewed: 11,
      funnel_timeline_viewed: 12, funnel_journey_viewed: 12,
      funnel_signup_viewed: 13, funnel_signup_started: 13, funnel_signup_completed: 13,
      funnel_paywall_viewed: 14,
      funnel_payment_completed: 15,
      funnel_download_viewed: 16, funnel_download_screen_viewed: 16, funnel_app_store_clicked: 16,
    };
    const STEP_LABELS: Record<number, string> = {
      1: "Pain Hook", 2: "Diagnostic 1", 3: "Diagnostic 2", 4: "Diagnostic 3",
      5: "Diagnostic 4", 6: "Diagnostic 5", 7: "Mirror", 8: "Bridge",
      9: "Promise", 10: "Commitment", 11: "Extraction", 12: "Timeline",
      13: "Signup", 14: "Paywall", 15: "Paid", 16: "Download",
    };

    const sessions = [...sessionMap.entries()]
      .map(([token, events]) => {
        const sorted = events.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const maxStep = Math.max(...events.map((e) => STEP_PROGRESS[e.event] ?? 0));
        const minutesSinceLast = (Date.now() - new Date(last.createdAt).getTime()) / 60000;
        const completed = events.some((e) => e.event === "funnel_app_store_clicked");
        const paid = events.some((e) => e.event === "funnel_payment_completed");

        let status: "completed" | "paid" | "active" | "stalled" | "dropped";
        if (completed) status = "completed";
        else if (paid) status = "paid";
        else if (minutesSinceLast < 10) status = "active";
        else if (minutesSinceLast < 60) status = "stalled";
        else status = "dropped";

        const diagnosticAnswers: Record<string, string> = {};
        for (const e of events) {
          if (e.event.startsWith("funnel_diagnostic_") && e.value) {
            diagnosticAnswers[e.event.replace("funnel_diagnostic_", "")] = e.value;
          }
        }

        // UTM attribution — take from the first event that has it
        const utmEvent = events.find((e) => e.utmSource);
        const source = utmEvent?.utmSource ?? null;
        const medium = utmEvent?.utmMedium ?? null;
        const campaign = utmEvent?.utmCampaign ?? null;
        const creative = utmEvent?.utmContent ?? null;

        return {
          sessionId: token.slice(0, 8),
          userId: events.find((e) => e.userId)?.userId ?? null,
          started: first.createdAt,
          lastEvent: last.createdAt,
          currentStep: STEP_LABELS[maxStep] ?? "Unknown",
          stepNumber: maxStep,
          totalSteps: 16,
          status,
          timeInFunnelSec: Math.round((new Date(last.createdAt).getTime() - new Date(first.createdAt).getTime()) / 1000),
          timeInFunnel: Math.round((new Date(last.createdAt).getTime() - new Date(first.createdAt).getTime()) / 60000),
          events: sorted.map((e) => ({ event: e.event, value: e.value, createdAt: e.createdAt })),
          diagnosticAnswers,
          source: source && medium ? `${source} / ${medium}` : source ?? "direct",
          campaign: campaign ?? null,
          creative: creative ?? null,
        };
      })
      .sort((a, b) => new Date(b.started).getTime() - new Date(a.started).getTime())
      .slice(0, 50);

    // Summary stats
    const activeSessions = sessions.filter((s) => s.status === "active").length;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const completedToday = sessions.filter((s) => s.status === "completed" && new Date(s.started) >= todayStart).length;
    const completedSessions = sessions.filter((s) => s.status === "completed" && s.timeInFunnel > 0);
    const avgCompletionTime = completedSessions.length > 0
      ? Math.round(completedSessions.reduce((sum, s) => sum + s.timeInFunnel, 0) / completedSessions.length)
      : 0;
    const droppedSessions = sessions.filter((s) => s.status === "dropped");
    const dropStepCounts: Record<string, number> = {};
    for (const s of droppedSessions) { dropStepCounts[s.currentStep] = (dropStepCounts[s.currentStep] ?? 0) + 1; }
    const mostCommonDrop = Object.entries(dropStepCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "N/A";

    // ── Ad attribution summary (grouped by creative) ──
    const creativeMap = new Map<string, { started: number; mirror: number; commitment: number; signup: number; paid: number; totalTime: number; paidCount: number }>();
    for (const s of sessions) {
      const cid = s.creative ?? "organic";
      if (!creativeMap.has(cid)) creativeMap.set(cid, { started: 0, mirror: 0, commitment: 0, signup: 0, paid: 0, totalTime: 0, paidCount: 0 });
      const c = creativeMap.get(cid)!;
      c.started++;
      if (s.stepNumber >= 7) c.mirror++;
      if (s.stepNumber >= 10) c.commitment++;
      if (s.stepNumber >= 13) c.signup++;
      if (s.status === "paid" || s.status === "completed") { c.paid++; c.totalTime += s.timeInFunnel; c.paidCount++; }
    }
    const adAttribution = [...creativeMap.entries()].map(([id, c]) => ({
      creativeId: id,
      sessionsStarted: c.started,
      reachedMirror: c.mirror,
      reachedCommitment: c.commitment,
      signedUp: c.signup,
      paid: c.paid,
      completionRate: c.started > 0 ? Math.round((c.paid / c.started) * 100) : 0,
      avgTimeToPay: c.paidCount > 0 ? Math.round(c.totalTime / c.paidCount) : 0,
    })).sort((a, b) => b.sessionsStarted - a.sessionsStarted);

    return {
      steps,
      alerts,
      diagnosticBreakdowns,
      commitmentStats,
      sessions,
      sessionsSummary: { activeSessions, completedToday, avgCompletionTime, mostCommonDrop },
      adAttribution,
    };
  } catch (err) {
    console.error("[metrics] webFunnel error:", err);
    return { steps: [], alerts: [], diagnosticBreakdowns: {}, commitmentStats: { completed: 0, abandoned: 0, successRate: 0 }, sessions: [], sessionsSummary: { activeSessions: 0, completedToday: 0, avgCompletionTime: 0, mostCommonDrop: "N/A" } };
  }
}

// ════════════════════════════════════════════════════════════════════════
// Funnel Analytics — dedicated tab with conversion funnel, campaign
// funnels, key metrics, and per-session data with CSV export support
// ════════════════════════════════════════════════════════════════════════

// v2 funnel deployed — only count events after this date to avoid old
// Pain Hook / diagnostic events polluting the new branching quiz metrics.
const FUNNEL_V2_EPOCH = new Date("2026-05-27T15:00:00Z");

async function getFunnelAnalytics(prisma: PrismaClient, start: Date, end: Date, showBots = false) {
 try {
  // Clamp start to v2 epoch so old v1 events don't pollute metrics
  const effectiveStart = start > FUNNEL_V2_EPOCH ? start : FUNNEL_V2_EPOCH;

  // v2 funnel steps — branching quiz flow
  const FUNNEL_STEPS = [
    { key: "entry", event: "funnel_entry_viewed", label: "Entry", fallback: "funnel_pain_hook_viewed" },
    { key: "branch_q2", event: "funnel_branch_q2_viewed", label: "Branch Q2", fallback: "funnel_diagnostic_loop_viewed" },
    { key: "branch_q3", event: "funnel_branch_q3_viewed", label: "Q3" },
    { key: "branch_q4", event: "funnel_branch_q4_viewed", label: "Q4" },
    { key: "shared_q5", event: "funnel_shared_q5_viewed", label: "Q5" },
    { key: "shared_q6", event: "funnel_shared_q6_viewed", label: "Q6 (Cost)" },
    { key: "shared_q7", event: "funnel_shared_q7_viewed", label: "Q7" },
    { key: "shared_q8", event: "funnel_shared_q8_viewed", label: "Q8" },
    { key: "shared_q9", event: "funnel_shared_q9_viewed", label: "Q9" },
    { key: "mirror", event: "funnel_mirror_viewed", label: "Mirror" },
    { key: "commit", event: "funnel_commit_viewed", label: "Commit", fallback: "funnel_commitment_viewed" },
    { key: "processing", event: "funnel_processing_viewed", label: "Processing" },
    { key: "snapshot", event: "funnel_snapshot_viewed", label: "Snapshot", fallback: "funnel_extraction_viewed" },
    { key: "timeline", event: "funnel_timeline_viewed", label: "Timeline", fallback: "funnel_journey_viewed" },
    { key: "paywall", event: "funnel_paywall_viewed", label: "Paywall" },
    { key: "signup", event: "funnel_signup_completed", label: "Signup" },
    { key: "paid", event: "funnel_payment_completed", label: "Paid", fallback: "funnel_checkout_started" },
    { key: "download", event: "funnel_download_viewed", label: "Download", fallback: "funnel_app_store_clicked" },
  ];

  // Fetch all funnel events in range (exclude bots unless showBots is true)
  const events = await prisma.onboardingEvent.findMany({
    where: {
      event: { startsWith: "funnel_" },
      createdAt: { gte: effectiveStart, lte: end },
      sessionToken: { not: null },
      ...(showBots ? {} : { isBot: false }),
    },
    orderBy: { createdAt: "asc" },
    take: 50000,
    select: {
      sessionToken: true, userId: true, event: true, value: true,
      createdAt: true, utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true, browser: true,
    },
  });

  // Group by session
  const sessionMap = new Map<string, typeof events>();
  for (const e of events) {
    const key = e.sessionToken!;
    if (!sessionMap.has(key)) sessionMap.set(key, []);
    sessionMap.get(key)!.push(e);
  }

  // Step reach counts (how many sessions reached each step)
  const stepReach: Record<string, Set<string>> = {};
  for (const s of FUNNEL_STEPS) {
    stepReach[s.key] = new Set();
  }

  // Build session rows
  const sessions: {
    sessionId: string; started: string; lastEvent: string; status: string;
    currentStep: string; stepNumber: number; timeInFunnelSec: number;
    source: string; campaign: string | null; creative: string | null;
    diagnosticAnswers: Record<string, string>;
    events: { event: string; value: string | null; createdAt: Date }[];
    browser: string | null;
  }[] = [];

  for (const [token, evts] of sessionMap) {
    const sorted = evts.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const eventNames = new Set(evts.map((e) => e.event));

    // Determine max step reached
    let maxStep = 0;
    let maxStepLabel = "Unknown";
    for (let i = 0; i < FUNNEL_STEPS.length; i++) {
      const s = FUNNEL_STEPS[i];
      if (eventNames.has(s.event) || (s.fallback && eventNames.has(s.fallback))) {
        maxStep = i + 1;
        maxStepLabel = s.label;
        stepReach[s.key].add(token);
      }
    }
    // Also count earlier steps (if you reached Mirror, you reached Pain Hook)
    for (let i = 0; i < maxStep; i++) {
      stepReach[FUNNEL_STEPS[i].key].add(token);
    }

    const minutesSinceLast = (Date.now() - new Date(last.createdAt).getTime()) / 60000;
    const completed = eventNames.has("funnel_app_store_clicked") || eventNames.has("funnel_download_viewed");
    const paid = eventNames.has("funnel_payment_completed");

    let status: string;
    if (completed) status = "completed";
    else if (paid) status = "paid";
    else if (minutesSinceLast < 10) status = "active";
    else if (minutesSinceLast < 60) status = "stalled";
    else status = "dropped";

    const diagnosticAnswers: Record<string, string> = {};
    for (const e of evts) {
      // v2 events: funnel_entry_selected, funnel_branch_q*_selected, funnel_shared_q*_selected
      if (e.value) {
        if (e.event === "funnel_entry_selected") diagnosticAnswers["entry"] = e.value;
        else if (e.event.match(/^funnel_(branch|shared)_q\d+_selected$/)) {
          diagnosticAnswers[e.event.replace("funnel_", "").replace("_selected", "")] = e.value;
        }
        // v1 compat
        else if (e.event.startsWith("funnel_diagnostic_") && !e.event.endsWith("_viewed")) {
          diagnosticAnswers[e.event.replace("funnel_diagnostic_", "")] = e.value;
        }
      }
    }

    const utmEvent = evts.find((e) => e.utmSource);
    const source = utmEvent?.utmSource ?? null;
    const medium = utmEvent?.utmMedium ?? null;
    const campaign = utmEvent?.utmCampaign ?? null;
    const creative = utmEvent?.utmContent ?? null;

    sessions.push({
      sessionId: token.slice(0, 8),
      started: first.createdAt.toISOString(),
      lastEvent: last.createdAt.toISOString(),
      status,
      currentStep: maxStepLabel,
      stepNumber: maxStep,
      timeInFunnelSec: Math.round((new Date(last.createdAt).getTime() - new Date(first.createdAt).getTime()) / 1000),
      source: source && medium ? `${source} / ${medium}` : source ?? "direct",
      campaign,
      creative,
      diagnosticAnswers,
      events: sorted.map((e) => ({ event: e.event, value: e.value, createdAt: e.createdAt })),
      browser: evts.find((e) => e.browser)?.browser ?? null,
    });
  }

  sessions.sort((a, b) => new Date(b.started).getTime() - new Date(a.started).getTime());

  // ── Conversion funnel bars ──
  const funnelSteps = FUNNEL_STEPS.map((s, i) => {
    const count = stepReach[s.key].size;
    const prevCount = i > 0 ? stepReach[FUNNEL_STEPS[i - 1].key].size : count;
    const entryCount = stepReach["entry"].size;
    const stepConversion = prevCount > 0 ? Math.round((count / prevCount) * 100) : 0;
    const overallConversion = entryCount > 0 ? Math.round((count / entryCount) * 100) : 0;
    return {
      key: s.key,
      label: s.label,
      count,
      stepConversion,
      overallConversion,
      color: stepConversion >= 70 ? "green" : stepConversion >= 50 ? "yellow" : "red",
    };
  });

  // ── Drop-off alerts ──
  const SUGGESTED_FIXES: Record<string, string> = {
    branch_q2: "Entry question isn\u2019t resonating. Test different options.",
    branch_q3: "Branch questions too many. Consider reducing.",
    branch_q4: "Fatigue at Q4. Shorten or rephrase.",
    shared_q5: "Drop after branch. Shared questions feel generic.",
    shared_q6: "Multi-select friction. Simplify cost question.",
    shared_q7: "Skepticism question causing drop. Review placement.",
    shared_q8: "Too many questions before mirror. Test skipping.",
    shared_q9: "Last question before mirror. Low intent users leave.",
    mirror: "Mirror didn\u2019t resonate. Review emotional copy.",
    commit: "Hold-to-commit friction. Check mobile touch handling.",
    processing: "Processing theater drop. Users leaving during wait.",
    snapshot: "Snapshot not compelling. Personalize more.",
    timeline: "Timeline not motivating. Review copy per branch.",
    paywall: "Paywall drop. Test pricing or copy.",
    signup: "Won\u2019t create account. Simplify auth options.",
    paid: "Won\u2019t pay. Test pricing or extend trial.",
    download: "Paid but didn\u2019t download. Improve download urgency.",
  };

  const alerts = funnelSteps
    .filter((s, i) => i > 0 && s.stepConversion < 50)
    .map((s) => ({
      step: s.label,
      conversion: s.stepConversion,
      suggestion: SUGGESTED_FIXES[s.key] ?? "Review this step.",
    }));

  // ── Key metrics ──
  const totalSessions = sessions.length;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todaySessions = sessions.filter((s) => new Date(s.started) >= todayStart).length;
  const entryCountTotal = stepReach["entry"].size;
  const paidCount = stepReach["paid"].size;
  const completionRate = entryCountTotal > 0 ? Math.round((paidCount / entryCountTotal) * 100) : 0;

  // Biggest drop-off
  let biggestDrop = { step: "N/A", dropPct: 0 };
  for (let i = 1; i < funnelSteps.length; i++) {
    const prev = funnelSteps[i - 1].count;
    const curr = funnelSteps[i].count;
    const drop = prev > 0 ? Math.round(((prev - curr) / prev) * 100) : 0;
    if (drop > biggestDrop.dropPct) {
      biggestDrop = { step: funnelSteps[i].label, dropPct: drop };
    }
  }

  // Avg funnel time (completed sessions)
  const completedSessions = sessions.filter((s) => s.status === "completed" || s.status === "paid");
  const avgFunnelTimeSec = completedSessions.length > 0
    ? Math.round(completedSessions.reduce((sum, s) => sum + s.timeInFunnelSec, 0) / completedSessions.length)
    : 0;

  // ── Campaign funnels ──
  const campaignMap = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const key = s.campaign || "direct / organic";
    if (!campaignMap.has(key)) campaignMap.set(key, []);
    campaignMap.get(key)!.push(s);
  }

  const campaignFunnels = [...campaignMap.entries()].map(([campaign, csessions]) => {
    const cStepReach: Record<string, number> = {};
    for (const s of FUNNEL_STEPS) cStepReach[s.key] = 0;

    for (const sess of csessions) {
      const eventNames = new Set(sess.events.map((e) => e.event));
      let maxIdx = -1;
      for (let i = 0; i < FUNNEL_STEPS.length; i++) {
        const fs = FUNNEL_STEPS[i];
        if (eventNames.has(fs.event) || (fs.fallback && eventNames.has(fs.fallback))) {
          maxIdx = i;
        }
      }
      for (let i = 0; i <= maxIdx; i++) {
        cStepReach[FUNNEL_STEPS[i].key]++;
      }
    }

    const total = csessions.length;
    const paidC = cStepReach["paid"];
    const convRate = total > 0 ? Math.round((paidC / total) * 100) : 0;
    const completedC = csessions.filter((s) => s.status === "completed" || s.status === "paid");
    const avgTime = completedC.length > 0
      ? Math.round(completedC.reduce((sum, s) => sum + s.timeInFunnelSec, 0) / completedC.length)
      : 0;

    // Diagnostic answer distribution for this campaign
    const diagDist: Record<string, Record<string, number>> = {};
    for (const sess of csessions) {
      for (const [k, v] of Object.entries(sess.diagnosticAnswers)) {
        if (!diagDist[k]) diagDist[k] = {};
        diagDist[k][v] = (diagDist[k][v] ?? 0) + 1;
      }
    }

    // Per-creative breakdown within campaign
    const creativeMap = new Map<string, { sessions: number; maxStep: number; paid: number }>();
    for (const sess of csessions) {
      const cid = sess.creative ?? "unknown";
      if (!creativeMap.has(cid)) creativeMap.set(cid, { sessions: 0, maxStep: 0, paid: 0 });
      const c = creativeMap.get(cid)!;
      c.sessions++;
      c.maxStep = Math.max(c.maxStep, sess.stepNumber);
      if (sess.status === "paid" || sess.status === "completed") c.paid++;
    }

    return {
      campaign,
      sessions: total,
      steps: {
        diagnostic: cStepReach["diagnostic"],
        mirror: cStepReach["mirror"],
        commitment: cStepReach["commitment"],
        signup: cStepReach["signup"],
        paid: paidC,
      },
      conversionRate: convRate,
      avgTimeSec: avgTime,
      diagnosticDistribution: diagDist,
      creatives: [...creativeMap.entries()].map(([id, c]) => ({
        creativeId: id,
        sessions: c.sessions,
        maxStep: c.maxStep,
        paid: c.paid,
        convRate: c.sessions > 0 ? Math.round((c.paid / c.sessions) * 100) : 0,
      })).sort((a, b) => b.sessions - a.sessions),
    };
  }).sort((a, b) => b.sessions - a.sessions);

  // ── Branch breakdown — which pain path converts best ──
  const BRANCH_KEYS = ["blur", "patterns", "rumination", "graveyard", "mask", "drift"];
  const branchMap = new Map<string, typeof sessions>();
  for (const s of sessions) {
    // Find the funnel_entry_selected event to determine branch
    const entryEvent = s.events.find((e) => e.event === "funnel_entry_selected");
    const b = entryEvent?.value ?? "unknown";
    if (!branchMap.has(b)) branchMap.set(b, []);
    branchMap.get(b)!.push(s);
  }

  const branchBreakdown = [...branchMap.entries()]
    .filter(([key]) => BRANCH_KEYS.includes(key))
    .map(([branchKey, bSessions]) => {
      const total = bSessions.length;
      const reachedMirror = bSessions.filter((s) => s.stepNumber >= 10).length;
      const reachedCommit = bSessions.filter((s) => s.stepNumber >= 11).length;
      const reachedPaywall = bSessions.filter((s) => s.stepNumber >= 15).length;
      const paidCount = bSessions.filter((s) => s.status === "paid" || s.status === "completed").length;
      return {
        branch: branchKey,
        sessions: total,
        mirror: reachedMirror,
        commit: reachedCommit,
        paywall: reachedPaywall,
        paid: paidCount,
        convRate: total > 0 ? Math.round((paidCount / total) * 100) : 0,
      };
    })
    .sort((a, b) => b.sessions - a.sessions);

  return {
    keyMetrics: {
      totalSessions,
      todaySessions,
      completionRate,
      biggestDrop,
      avgFunnelTimeSec,
    },
    funnelSteps,
    alerts,
    campaignFunnels,
    branchBreakdown,
    sessions: sessions.slice(0, 100),
    totalSessionCount: sessions.length,
  };
 } catch (err) {
    console.error("[getFunnelAnalytics] Query failed:", err);
    return {
      keyMetrics: { totalSessions: 0, todaySessions: 0, completionRate: 0, biggestDrop: { step: "N/A", dropPct: 0 }, avgFunnelTimeSec: 0 },
      funnelSteps: [],
      alerts: [],
      campaignFunnels: [],
      branchBreakdown: [],
      sessions: [],
      totalSessionCount: 0,
    };
  }
}
