import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

const THIRTY_DAYS_AGO = () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

export async function GET() {
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

  const since = THIRTY_DAYS_AGO();

  // Section 1: Signup source breakdown
  const recentUsers = await prisma.user.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id: true,
      signupUtmSource: true,
      signupUtmCampaign: true,
      signupLandingPath: true,
      subscriptionStatus: true,
      firstRecordingAt: true,
    },
  });

  const sourceMap = new Map<
    string,
    { total: number; firstRecording: number; paid: number }
  >();
  for (const u of recentUsers) {
    const source = u.signupUtmSource ?? "(direct)";
    const entry = sourceMap.get(source) ?? {
      total: 0,
      firstRecording: 0,
      paid: 0,
    };
    entry.total++;
    if (u.firstRecordingAt) entry.firstRecording++;
    if (u.subscriptionStatus === "PRO") entry.paid++;
    sourceMap.set(source, entry);
  }

  const signupsBySource = Array.from(sourceMap.entries())
    .map(([source, counts]) => ({
      source,
      ...counts,
      conversionRate:
        counts.total > 0
          ? Math.round((counts.paid / counts.total) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Section 2: Per-campaign CAC
  const campaignMap = new Map<
    string,
    { signups: number; paid: number }
  >();
  for (const u of recentUsers) {
    const campaign = u.signupUtmCampaign;
    if (!campaign) continue;
    const entry = campaignMap.get(campaign) ?? { signups: 0, paid: 0 };
    entry.signups++;
    if (u.subscriptionStatus === "PRO") entry.paid++;
    campaignMap.set(campaign, entry);
  }

  let campaignCAC: Array<{
    campaign: string;
    spendCents: number;
    signups: number;
    paid: number;
    blendedCac: number | null;
    trueCac: number | null;
  }> = [];

  try {
    const metaSpend = await prisma.metaSpend.findMany({
      where: { weekStart: { gte: since } },
      select: { campaign: true, spendCents: true },
    });

    const spendByCampaign = new Map<string, number>();
    for (const row of metaSpend) {
      spendByCampaign.set(
        row.campaign,
        (spendByCampaign.get(row.campaign) ?? 0) + row.spendCents
      );
    }

    const allCampaigns = new Set([
      ...campaignMap.keys(),
      ...spendByCampaign.keys(),
    ]);

    campaignCAC = Array.from(allCampaigns).map((campaign) => {
      const spend = spendByCampaign.get(campaign) ?? 0;
      const data = campaignMap.get(campaign) ?? { signups: 0, paid: 0 };
      return {
        campaign,
        spendCents: spend,
        signups: data.signups,
        paid: data.paid,
        blendedCac:
          data.signups > 0 ? Math.round(spend / data.signups) : null,
        trueCac: data.paid > 0 ? Math.round(spend / data.paid) : null,
      };
    });
  } catch {
    // MetaSpend table may not exist
  }

  // Section 3: Landing page performance
  const landingMap = new Map<
    string,
    { signups: number; firstRecording: number; paid: number }
  >();
  for (const u of recentUsers) {
    const path = u.signupLandingPath;
    if (!path) continue;
    const entry = landingMap.get(path) ?? {
      signups: 0,
      firstRecording: 0,
      paid: 0,
    };
    entry.signups++;
    if (u.firstRecordingAt) entry.firstRecording++;
    if (u.subscriptionStatus === "PRO") entry.paid++;
    landingMap.set(path, entry);
  }

  const landingPages = Array.from(landingMap.entries())
    .map(([path, counts]) => ({
      path,
      ...counts,
      signupToPaidRate:
        counts.signups > 0
          ? Math.round((counts.paid / counts.signups) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => b.signups - a.signups);

  // Section 4: Active experiments
  let experiments: Array<{
    flagKey: string;
    flagName: string;
    variants: string[];
    variantData: Array<{
      variant: string;
      assigned: number;
      converted: number;
      conversionRate: number;
    }>;
  }> = [];

  try {
    const experimentFlags = await prisma.featureFlag.findMany({
      where: {
        enabled: true,
        experimentVariants: { isEmpty: false },
      },
      select: {
        key: true,
        name: true,
        experimentVariants: true,
      },
    });

    for (const flag of experimentFlags) {
      const assignments = await prisma.experimentAssignment.findMany({
        where: { flagKey: flag.key },
        select: { userId: true, variant: true },
      });

      // Get conversion status for assigned users
      const userIds = assignments
        .filter((a) => a.userId)
        .map((a) => a.userId!);

      const paidUsers = userIds.length > 0
        ? new Set(
            (
              await prisma.user.findMany({
                where: {
                  id: { in: userIds },
                  subscriptionStatus: "PRO",
                },
                select: { id: true },
              })
            ).map((u) => u.id)
          )
        : new Set<string>();

      const variantMap = new Map<
        string,
        { assigned: number; converted: number }
      >();
      for (const v of flag.experimentVariants) {
        variantMap.set(v, { assigned: 0, converted: 0 });
      }
      for (const a of assignments) {
        const entry = variantMap.get(a.variant) ?? {
          assigned: 0,
          converted: 0,
        };
        entry.assigned++;
        if (a.userId && paidUsers.has(a.userId)) entry.converted++;
        variantMap.set(a.variant, entry);
      }

      experiments.push({
        flagKey: flag.key,
        flagName: flag.name,
        variants: flag.experimentVariants,
        variantData: Array.from(variantMap.entries()).map(
          ([variant, data]) => ({
            variant,
            assigned: data.assigned,
            converted: data.converted,
            conversionRate:
              data.assigned > 0
                ? Math.round(
                    (data.converted / data.assigned) * 1000
                  ) / 10
                : 0,
          })
        ),
      });
    }
  } catch {
    // ExperimentAssignment table may not exist yet
  }

  // Section 5: Pre-signup funnel (aggregate counts)
  const totalSignups = recentUsers.length;
  const withLandingPath = recentUsers.filter(
    (u) => u.signupLandingPath
  ).length;
  const withUtm = recentUsers.filter((u) => u.signupUtmCampaign).length;

  return NextResponse.json({
    signupsBySource,
    campaignCAC,
    landingPages,
    experiments,
    preSignupFunnel: {
      landingSessions: withLandingPath,
      signupPageViews: withUtm,
      signupCompletions: totalSignups,
    },
  });
}
