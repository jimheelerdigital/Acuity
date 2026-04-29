import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";
import { getCached, invalidateCachePrefix } from "@/lib/admin-cache";
import { MONTHLY_PRICE_CENTS, SUBSCRIPTION_STATUS } from "@/lib/pricing";

export const dynamic = "force-dynamic";

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
  const start = startStr
    ? new Date(startStr)
    : new Date(end.getTime() - 7 * 86400000);

  // Previous period (same duration, immediately before start)
  const duration = end.getTime() - start.getTime();
  const prevStart = new Date(start.getTime() - duration);
  const prevEnd = new Date(start.getTime() - 1);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

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
        case "overview":
          return getOverview(prisma, start, end, prevStart, prevEnd, monthStart);
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
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  const monthAgo = new Date(today.getTime() - 30 * 86400000);

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
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

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
