import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Trends summary for the admin Command Center (2026-09-17).
 * One call returns the three research/performance feeds the home
 * screen surfaces: latest Reddit audience-pulse digest per brand,
 * top-performing posted content by views, and the competitor
 * outlier feed with mimic briefs. Every section is soft — an empty
 * table just yields an empty array, never an error.
 */
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

  const [digests, topContent, outliers, accounts] = await Promise.all([
    // Latest audience-pulse digest per brand (2 rows max).
    Promise.all(
      ["ripple", "bwk"].map((brand) =>
        prisma.redditTrendDigest.findFirst({
          where: { brand },
          orderBy: { date: "desc" },
          select: { id: true, brand: true, date: true, themes: true },
        })
      )
    ).then((rows) => rows.filter((r) => r !== null)),

    // Top posted content by views, last 30 days.
    prisma.carouselPost.findMany({
      where: {
        views: { not: null },
        generatedFor: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { views: "desc" },
      take: 8,
      select: {
        id: true,
        headline: true,
        lane: true,
        format: true,
        generatedFor: true,
        views: true,
        likes: true,
        comments: true,
        saves: true,
        shares: true,
        instagramUrl: true,
        tiktokUrl: true,
      },
    }),

    // Freshest competitor outliers (briefed first), last 14 days.
    prisma.competitorPost.findMany({
      where: {
        isOutlier: true,
        scrapedAt: {
          gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: [{ briefAt: { sort: "desc", nulls: "last" } }, { outlierScore: "desc" }],
      take: 8,
      select: {
        id: true,
        url: true,
        caption: true,
        views: true,
        likes: true,
        outlierScore: true,
        brief: true,
        briefAt: true,
        postedAt: true,
        account: {
          select: { handle: true, platform: true, brand: true, niche: true },
        },
      },
    }),

    prisma.competitorAccount.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const accountCounts = {
    active:
      accounts.find((a) => a.status === "ACTIVE")?._count._all ?? 0,
    paused:
      accounts.find((a) => a.status === "PAUSED")?._count._all ?? 0,
  };

  return NextResponse.json({ digests, topContent, outliers, accountCounts });
}
