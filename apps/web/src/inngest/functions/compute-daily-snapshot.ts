import { inngest } from "@/inngest/client";

export const computeDailySnapshotFn = inngest.createFunction(
  {
    id: "compute-daily-snapshot",
    name: "Admin — Daily Dashboard Snapshot",
    triggers: [{ cron: "0 2 * * *" }],
    retries: 2,
  },
  async ({ logger }) => {
    const { prisma } = await import("@/lib/prisma");

    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);

    const dayEnd = new Date(yesterday);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const weekAgo = new Date(yesterday.getTime() - 7 * 86400000);
    const monthAgo = new Date(yesterday.getTime() - 30 * 86400000);

    const [
      payingSubs,
      dau,
      wau,
      mau,
      signupsThisDay,
      aiSpend,
    ] = await Promise.all([
      prisma.user.count({
        where: {
          subscriptionStatus: "ACTIVE",
          stripeSubscriptionId: { not: null },
        },
      }),
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT "userId")::bigint as count
        FROM "Entry"
        WHERE "createdAt" >= ${yesterday} AND "createdAt" <= ${dayEnd}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT "userId")::bigint as count
        FROM "Entry"
        WHERE "createdAt" >= ${weekAgo} AND "createdAt" <= ${dayEnd}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT "userId")::bigint as count
        FROM "Entry"
        WHERE "createdAt" >= ${monthAgo} AND "createdAt" <= ${dayEnd}
      `,
      prisma.user.count({
        where: { createdAt: { gte: yesterday, lte: dayEnd } },
      }),
      prisma.$queryRaw<{ total: bigint | null }[]>`
        SELECT COALESCE(SUM("costCents"), 0)::bigint as total
        FROM "ClaudeCallLog"
        WHERE "createdAt" >= ${yesterday} AND "createdAt" <= ${dayEnd}
      `.catch(() => [{ total: BigInt(0) }]),
    ]);

    const mrrCents = payingSubs * 999;

    await prisma.dashboardSnapshot.upsert({
      where: { date: yesterday },
      update: {
        mrr: mrrCents,
        totalSubs: payingSubs,
        dau: Number(dau[0]?.count ?? 0),
        wau: Number(wau[0]?.count ?? 0),
        mau: Number(mau[0]?.count ?? 0),
        signupsThisDay,
        aiCostCents: Number(aiSpend[0]?.total ?? 0),
        metadata: {},
      },
      create: {
        date: yesterday,
        mrr: mrrCents,
        totalSubs: payingSubs,
        dau: Number(dau[0]?.count ?? 0),
        wau: Number(wau[0]?.count ?? 0),
        mau: Number(mau[0]?.count ?? 0),
        signupsThisDay,
        aiCostCents: Number(aiSpend[0]?.total ?? 0),
        metadata: {},
      },
    });

    logger.info("[snapshot] Daily snapshot computed", {
      date: yesterday.toISOString(),
      mrr: mrrCents,
      subs: payingSubs,
    });

    return { date: yesterday.toISOString(), mrr: mrrCents };
  }
);
