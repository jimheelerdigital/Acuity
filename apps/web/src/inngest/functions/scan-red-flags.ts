import { inngest } from "@/inngest/client";

export const scanRedFlagsFn = inngest.createFunction(
  {
    id: "scan-red-flags",
    name: "Admin — Red Flag Scanner",
    triggers: [{ cron: "0 */6 * * *" }],
    retries: 1,
  },
  async ({ logger }) => {
    const { prisma } = await import("@/lib/prisma");
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Clean up old silent trial flags — these are no longer generated
    await prisma.redFlag.updateMany({
      where: { category: "trial", resolved: false },
      data: { resolved: true, resolvedAt: now },
    });

    const flags: {
      severity: "CRITICAL" | "WARNING" | "INFO";
      category: string;
      title: string;
      description: string;
      affectedUserIds: string[];
    }[] = [];

    // CRITICAL: Failed Inngest jobs in last 24h
    const failedJobs = await prisma.generationJob
      .count({
        where: { status: "FAILED", completedAt: { gte: oneDayAgo } },
      })
      .catch(() => 0);
    if (failedJobs > 0) {
      flags.push({
        severity: "CRITICAL",
        category: "inngest",
        title: `${failedJobs} Inngest job(s) failed in last 24h`,
        description: "Check Inngest dashboard for details.",
        affectedUserIds: [],
      });
    }

    // CRITICAL: PAST_DUE users > 3 days
    const pastDueUsers = await prisma.user
      .findMany({
        where: {
          subscriptionStatus: "PAST_DUE",
          stripeCurrentPeriodEnd: { lt: threeDaysAgo },
        },
        select: { id: true },
      })
      .catch(() => []);
    if (pastDueUsers.length > 0) {
      flags.push({
        severity: "CRITICAL",
        category: "payment",
        title: `${pastDueUsers.length} user(s) past due > 3 days`,
        description:
          "These users have failed payments and may churn without intervention.",
        affectedUserIds: pastDueUsers.map((u: { id: string }) => u.id),
      });
    }

    // INFO: AI budget > 75%
    const aiSpend = await prisma
      .$queryRaw<{ total: bigint | null }[]>`
      SELECT COALESCE(SUM("costCents"), 0)::bigint as total
      FROM "ClaudeCallLog"
      WHERE "createdAt" >= ${monthStart}
    `
      .catch(() => [{ total: BigInt(0) }]);
    const spendCents = Number(aiSpend[0]?.total ?? 0);
    if (spendCents > 7500) {
      flags.push({
        severity: spendCents > 10000 ? "CRITICAL" : "INFO",
        category: "ai_budget",
        title: `AI budget ${spendCents > 10000 ? "exceeded" : ">75%"}: $${(spendCents / 100).toFixed(2)} / $100`,
        description: "Monthly Claude API spend is high.",
        affectedUserIds: [],
      });
    }

    // Write new flags (avoid duplicates by checking title+category in last 6h)
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    let created = 0;
    for (const flag of flags) {
      const existing = await prisma.redFlag.findFirst({
        where: {
          title: flag.title,
          category: flag.category,
          resolved: false,
          createdAt: { gte: sixHoursAgo },
        },
      });
      if (!existing) {
        await prisma.redFlag.create({ data: flag });
        created++;
      }
    }

    logger.info("[red-flags] Scan complete", {
      scanned: flags.length,
      created,
    });

    return { scanned: flags.length, created };
  }
);
