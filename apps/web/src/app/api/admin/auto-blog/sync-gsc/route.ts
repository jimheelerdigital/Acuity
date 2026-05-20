/**
 * POST /api/admin/auto-blog/sync-gsc
 *
 * Syncs Google Search Console performance data (impressions, clicks, CTR,
 * average position) for ALL published blog posts. This endpoint can be
 * triggered manually from the admin dashboard or called by a cron.
 *
 * The pruner (auto-blog.ts) also syncs GSC data, but only for posts that
 * are 56+ days old. This endpoint syncs ALL posts regardless of age so
 * the dashboard always shows up-to-date metrics.
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { getPropertyPerformance } from "@/lib/google/search-console";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  // Fetch all published blog posts
  const posts = await prisma.contentPiece.findMany({
    where: {
      type: "BLOG",
      status: { in: ["AUTO_PUBLISHED", "DISTRIBUTED"] },
      distributedUrl: { not: null },
    },
    select: {
      id: true,
      slug: true,
      distributedUrl: true,
    },
  });

  if (posts.length === 0) {
    return NextResponse.json({ synced: 0, message: "No published posts to sync" });
  }

  // Fetch GSC performance for all /blog/* pages (last 30 days)
  const gscData = await getPropertyPerformance(30);

  if (!gscData) {
    return NextResponse.json(
      { error: "GSC API call failed — check GA4_SERVICE_ACCOUNT_KEY and Search Console access" },
      { status: 502 }
    );
  }

  // Build URL → performance map
  const gscByUrl = new Map(gscData.topPages.map((p) => [p.page, p]));

  const now = new Date();
  let synced = 0;
  let matched = 0;

  for (const post of posts) {
    const perf = post.distributedUrl ? gscByUrl.get(post.distributedUrl) : null;

    const impressions = perf?.impressions ?? 0;
    const clicks = perf?.clicks ?? 0;
    const ctr = perf?.ctr ?? 0;
    const avgPosition = perf?.position ?? 0;

    if (perf) matched++;

    await prisma.contentPiece.update({
      where: { id: post.id },
      data: {
        impressions,
        clicks,
        ctr,
        avgPosition,
        lastGscSyncAt: now,
      },
    });

    synced++;
  }

  return NextResponse.json({
    synced,
    matched,
    totalGscPages: gscData.topPages.length,
    syncedAt: now.toISOString(),
  });
}
