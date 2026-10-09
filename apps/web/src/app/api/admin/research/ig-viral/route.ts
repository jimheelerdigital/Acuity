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

  // Calls Apify directly rather than scrapeHashtagPosts: that helper drops
  // items without queryTag, and this actor's output shape varies (10-08 run
  // returned 0 through it). Reels report views as videoPlayCount or
  // videoViewCount depending on the actor version.
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_TOKEN not set" }, { status: 500 });
  const actor = process.env.APIFY_IG_HASHTAG_ACTOR || "apify~instagram-hashtag-scraper";
  const res = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hashtags, resultsLimit: limitPerTag, resultsType: "reels" }),
  });
  if (!res.ok) {
    return NextResponse.json({ error: `Apify ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}` }, { status: 502 });
  }
  type Item = Record<string, unknown>;
  const items = (await res.json()) as Item[];
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const videos = items
    .filter((it) => !it.error)
    .map((it) => ({
      tag: String(it.queryTag ?? it.hashtag ?? it.inputUrl ?? ""),
      ownerUsername: (it.ownerUsername as string) ?? null,
      views: n(it.videoPlayCount) ?? n(it.videoViewCount) ?? n(it.playCount),
      likes: n(it.likesCount),
      comments: n(it.commentsCount),
      postedAt: (it.timestamp as string) ?? null,
      type: (it.type as string) ?? null,
      webUrl: (it.url as string) ?? (it.shortCode ? `https://www.instagram.com/reel/${it.shortCode}/` : null),
      caption: ((it.caption as string) ?? "").slice(0, 400),
    }))
    .filter((v) => (v.views ?? 0) > 0)
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  return NextResponse.json({
    scraped: items.length,
    sampleKeys: items[0] ? Object.keys(items[0]).slice(0, 60) : [],
    sampleError: items.find((it) => it.error) ?? null,
    videos: videos.slice(0, 150),
  });
}
