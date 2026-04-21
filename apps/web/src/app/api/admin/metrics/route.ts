import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

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

  try {
    switch (tab) {
      case "overview":
        return NextResponse.json(
          await getOverview(prisma, start, end, prevStart, prevEnd, monthStart)
        );
      case "growth":
        return NextResponse.json(
          await getGrowth(prisma, start, end, prevStart, prevEnd)
        );
      case "engagement":
        return NextResponse.json(
          await getEngagement(prisma, start, end, prevStart, prevEnd)
        );
      case "revenue":
        return NextResponse.json(
          await getRevenue(prisma, start, end, prevStart, prevEnd, monthStart)
        );
      case "funnel":
        return NextResponse.json(await getFunnel(prisma, start, end));
      case "ads":
        return NextResponse.json(
          await getAds(prisma, start, end, prevStart, prevEnd)
        );
      case "ai-costs":
        return NextResponse.json(
          await getAICosts(prisma, start, end, monthStart)
        );
      case "red-flags":
        return NextResponse.json(await getRedFlags(prisma));
      default:
        return NextResponse.json({ error: "Unknown tab" }, { status: 400 });
    }
  } catch (err) {
    console.error("[admin/metrics]", err);
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
        subscriptionStatus: "ACTIVE",
        stripeSubscriptionId: { not: null },
      },
    }),
    // Prev period paying — use snapshot if available, else same count
    prisma.user.count({
      where: {
        subscriptionStatus: "ACTIVE",
        stripeSubscriptionId: { not: null },
      },
    }),
    // Trial-to-paid: users created in range who are now ACTIVE
    prisma.user.count({
      where: {
        createdAt: { gte: start, lte: end },
        subscriptionStatus: "ACTIVE",
      },
    }),
    prisma.user.count({
      where: {
        createdAt: { gte: start, lte: end },
        subscriptionStatus: { in: ["TRIAL", "ACTIVE", "CANCELED", "PAST_DUE"] },
      },
    }),
    prisma.user.count({
      where: {
        createdAt: { gte: prevStart, lte: prevEnd },
        subscriptionStatus: "ACTIVE",
      },
    }),
    prisma.user.count({
      where: {
        createdAt: { gte: prevStart, lte: prevEnd },
        subscriptionStatus: { in: ["TRIAL", "ACTIVE", "CANCELED", "PAST_DUE"] },
      },
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

  return {
    signups,
    prevSignups,
    payingSubs,
    prevPayingSubs,
    conversionRate: Math.round(conversionRate * 10) / 10,
    prevConversionRate: Math.round(prevConversionRate * 10) / 10,
    aiSpendCents,
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
  const [signups, prevSignups, waitlistSignups, signupsOverTime, recentSignups] =
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
    ]);

  // D1 activation: users who have at least one entry within 24h of signup
  const d1Activated = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT u.id)::bigint as count
    FROM "User" u
    INNER JOIN "Entry" e ON e."userId" = u.id
      AND e."createdAt" <= u."createdAt" + interval '24 hours'
    WHERE u."createdAt" >= ${start} AND u."createdAt" <= ${end}
  `.catch(() => [{ count: BigInt(0) }]);

  const d1Rate =
    signups > 0
      ? (Number(d1Activated[0]?.count ?? 0) / signups) * 100
      : 0;

  return {
    signups,
    prevSignups,
    waitlistSignups,
    d1Rate: Math.round(d1Rate * 10) / 10,
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

  return {
    dau: Number(dau[0]?.count ?? 0),
    wau: Number(wau[0]?.count ?? 0),
    mau: Number(mau[0]?.count ?? 0),
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
  _monthStart: Date
) {
  const [payingSubs, trialUsers, pastDueUsers, recentPaying] =
    await Promise.all([
      prisma.user.count({
        where: {
          subscriptionStatus: "ACTIVE",
          stripeSubscriptionId: { not: null },
        },
      }),
      prisma.user.count({
        where: { subscriptionStatus: "TRIAL" },
      }),
      prisma.user.findMany({
        where: { subscriptionStatus: "PAST_DUE" },
        select: {
          email: true,
          stripeCurrentPeriodEnd: true,
          createdAt: true,
        },
        orderBy: { stripeCurrentPeriodEnd: "asc" },
      }),
      prisma.user.findMany({
        where: {
          subscriptionStatus: "ACTIVE",
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
    ]);

  // Simple MRR estimate: $9.99/mo per paying sub (adjust as needed)
  const mrrCents = payingSubs * 999;
  const churnedInPeriod = await prisma.user.count({
    where: {
      subscriptionStatus: "CANCELED",
      updatedAt: { gte: start, lte: end },
    },
  });
  const churnRate =
    payingSubs + churnedInPeriod > 0
      ? (churnedInPeriod / (payingSubs + churnedInPeriod)) * 100
      : 0;

  const trialConverted = await prisma.user.count({
    where: {
      createdAt: { gte: start, lte: end },
      subscriptionStatus: "ACTIVE",
    },
  });
  const trialTotal = await prisma.user.count({
    where: {
      createdAt: { gte: start, lte: end },
    },
  });
  const conversionRate =
    trialTotal > 0 ? (trialConverted / trialTotal) * 100 : 0;

  return {
    mrrCents,
    payingSubs,
    trialUsers,
    churnRate: Math.round(churnRate * 10) / 10,
    conversionRate: Math.round(conversionRate * 10) / 10,
    churnedInPeriod,
    pastDueUsers: pastDueUsers.map((u: { email: string; createdAt: Date; stripeCurrentPeriodEnd: Date | null }) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
      stripeCurrentPeriodEnd: u.stripeCurrentPeriodEnd?.toISOString() ?? null,
    })),
    recentPaying: recentPaying.map((u: { email: string; createdAt: Date; stripeCurrentPeriodEnd: Date | null }) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
      stripeCurrentPeriodEnd: u.stripeCurrentPeriodEnd?.toISOString() ?? null,
    })),
  };
}

async function getFunnel(prisma: P, start: Date, end: Date) {
  const [
    waitlistCount,
    accountsCreated,
    firstRecording,
    activeDay3,
    activeDay7,
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
    // Converted to paid
    prisma.user.count({
      where: {
        createdAt: { gte: start, lte: end },
        subscriptionStatus: "ACTIVE",
      },
    }),
  ]);

  const steps = [
    { label: "Waitlist Signups", count: waitlistCount },
    { label: "Account Created", count: accountsCreated },
    { label: "First Recording", count: Number(firstRecording[0]?.count ?? 0) },
    { label: "Active Day 3", count: Number(activeDay3[0]?.count ?? 0) },
    { label: "Active Day 7", count: Number(activeDay7[0]?.count ?? 0) },
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
