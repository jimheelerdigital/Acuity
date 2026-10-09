/**
 * POST /api/admin/research/ig-viral
 *
 * One-off viral Instagram research (2026-10-08, per Keenan: "scrape me the
 * top 10 viral videos for women that're looking for our niche problem solved
 * ... use the apify scraper"). Runs the Apify Instagram hashtag scraper
 * (lib/content-factory/niche-research.ts) for the given hashtags and returns
 * the video posts sorted by views. APIFY_TOKEN is Vercel-sensitive, so this
 * has to run on the server. Read-only: nothing is stored or posted.
 *
 * Body: { "hashtags": ["mentalload", ...], "limitPerTag": 30 }
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }
  const body = (await req.json().catch(() => ({}))) as { hashtags?: unknown; limitPerTag?: unknown };
  const hashtags = (Array.isArray(body.hashtags) ? body.hashtags : [])
    .map((t) => String(t).replace(/^#/, "").trim())
    .filter((t) => /^[\p{L}\p{N}_]{2,60}$/u.test(t))
    .slice(0, 20);
  if (!hashtags.length) return NextResponse.json({ error: "hashtags required" }, { status: 400 });
  const limitPerTag = Math.min(Math.max(Number(body.limitPerTag) || 30, 5), 60);

  const { scrapeHashtagPosts } = await import("@/lib/content-factory/niche-research");
  const posts = await scrapeHashtagPosts(hashtags, limitPerTag);
  const videos = posts
    .filter((p) => p.views != null && p.views > 0)
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  return NextResponse.json({ scraped: posts.length, videos: videos.slice(0, 150) });
}
