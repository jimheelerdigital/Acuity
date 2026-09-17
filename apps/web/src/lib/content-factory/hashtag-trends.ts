/**
 * Content Factory — Hashtag top-video feed (2026-09-17, per Keenan:
 * "I want a link to the top 3 performing videos that day for specific
 * hashtags so I can recreate those talking head videos and go viral on
 * BWK... and recreate posts on ripple").
 *
 * FLOW: the 3:30 UTC competitor-scrape cron also scrapes every ACTIVE
 * HashtagWatch's TikTok hashtag feed via Apify and upserts the videos.
 * The admin "Top Videos" tab then shows, per brand, the top 3 by views
 * among recently-posted videos — links Keenan opens and recreates
 * himself. This feed is for HUMAN recreation, not the automated lanes
 * (the competitor-mimic pipeline covers those).
 *
 * TikTok-only by design: hashtag feeds there expose real play counts.
 * ACCESS: requires APIFY_TOKEN. Every failure is SOFT — errors land on
 * the watch row for the dashboard and never break the cron.
 */

import { runApifyActor } from "./competitor-mimic";

/** Videos pulled per hashtag per scrape. */
const VIDEOS_PER_TAG = 30;

interface ScrapedVideo {
  externalId: string;
  url: string;
  authorHandle: string | null;
  caption: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  thumbnailUrl: string | null;
  postedAt: Date | null;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** TikTok hashtag feed scrape → normalized videos. */
async function scrapeHashtagFeed(tag: string): Promise<ScrapedVideo[]> {
  const items = await runApifyActor("clockworks~tiktok-hashtag-scraper", {
    hashtags: [tag],
    resultsPerPage: VIDEOS_PER_TAG,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
  });
  return items
    .map((it): ScrapedVideo | null => {
      const id = str(it.id);
      if (!id) return null;
      const meta = (it.videoMeta ?? {}) as Record<string, unknown>;
      const author = (it.authorMeta ?? {}) as Record<string, unknown>;
      const handle = str(author.name);
      const ts = str(it.createTimeISO);
      return {
        externalId: id,
        url:
          str(it.webVideoUrl) ||
          (handle ? `https://www.tiktok.com/@${handle}/video/${id}` : ""),
        authorHandle: handle || null,
        caption: str(it.text).slice(0, 2000),
        views: num(it.playCount),
        likes: num(it.diggCount),
        comments: num(it.commentCount),
        shares: num(it.shareCount),
        thumbnailUrl: str(meta.coverUrl) || null,
        postedAt: ts ? new Date(ts) : null,
      };
    })
    .filter((v): v is ScrapedVideo => v !== null && v.url !== "");
}

/**
 * Scrape one watched hashtag and upsert its videos. Records the error
 * on the watch row on failure (and returns 0) so the dashboard can
 * surface it.
 */
export async function scrapeHashtag(watchId: string): Promise<number> {
  const { prisma } = await import("@/lib/prisma");
  const watch = await prisma.hashtagWatch.findUniqueOrThrow({
    where: { id: watchId },
  });

  let videos: ScrapedVideo[];
  try {
    videos = await scrapeHashtagFeed(watch.tag);
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500);
    console.warn(`[hashtag-trends] scrape failed #${watch.tag}:`, msg);
    await prisma.hashtagWatch.update({
      where: { id: watch.id },
      data: { scrapeError: msg },
    });
    return 0;
  }

  for (const v of videos) {
    await prisma.hashtagVideo.upsert({
      where: { watchId_externalId: { watchId: watch.id, externalId: v.externalId } },
      update: {
        views: v.views,
        likes: v.likes,
        comments: v.comments,
        shares: v.shares,
        scrapedAt: new Date(),
      },
      create: {
        watchId: watch.id,
        externalId: v.externalId,
        url: v.url,
        authorHandle: v.authorHandle,
        caption: v.caption || null,
        views: v.views,
        likes: v.likes,
        comments: v.comments,
        shares: v.shares,
        thumbnailUrl: v.thumbnailUrl,
        postedAt: v.postedAt,
      },
    });
  }

  await prisma.hashtagWatch.update({
    where: { id: watch.id },
    data: { lastScrapedAt: new Date(), scrapeError: null },
  });
  console.log(`[hashtag-trends] #${watch.tag}: ${videos.length} videos`);
  return videos.length;
}

/** Scrape every ACTIVE watched hashtag (all brands). Returns tags scraped. */
export async function scrapeAllHashtags(): Promise<number> {
  const { prisma } = await import("@/lib/prisma");
  if (!process.env.APIFY_TOKEN) {
    console.warn("[hashtag-trends] APIFY_TOKEN not set — skipping scrape");
    return 0;
  }
  const watches = await prisma.hashtagWatch.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });
  let ok = 0;
  for (const w of watches) {
    if ((await scrapeHashtag(w.id)) > 0) ok++;
  }
  return ok;
}

export interface TopVideo {
  id: string;
  url: string;
  tag: string;
  authorHandle: string | null;
  caption: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  postedAt: Date | null;
}

/**
 * Top videos for a brand across all its ACTIVE hashtags, ranked by
 * views. Prefers videos posted in the last 3 days ("that day" energy);
 * widens to 7 days when fresh ones are scarce so the panel never sits
 * empty. Dedupes videos that appear under multiple watched hashtags.
 */
export async function getTopVideos(
  brand: "ripple" | "bwk",
  take = 3
): Promise<TopVideo[]> {
  const { prisma } = await import("@/lib/prisma");

  const pick = async (sinceDays: number) => {
    const rows = await prisma.hashtagVideo.findMany({
      where: {
        postedAt: { gte: new Date(Date.now() - sinceDays * 24 * 3600 * 1000) },
        watch: { brand, status: "ACTIVE" },
      },
      orderBy: { views: "desc" },
      take: take * 4, // headroom for cross-tag duplicates
      select: {
        id: true,
        externalId: true,
        url: true,
        authorHandle: true,
        caption: true,
        views: true,
        likes: true,
        comments: true,
        shares: true,
        postedAt: true,
        watch: { select: { tag: true } },
      },
    });
    const seen = new Set<string>();
    const out: TopVideo[] = [];
    for (const r of rows) {
      if (seen.has(r.externalId)) continue;
      seen.add(r.externalId);
      out.push({
        id: r.id,
        url: r.url,
        tag: r.watch.tag,
        authorHandle: r.authorHandle,
        caption: r.caption,
        views: r.views,
        likes: r.likes,
        comments: r.comments,
        shares: r.shares,
        postedAt: r.postedAt,
      });
      if (out.length >= take) break;
    }
    return out;
  };

  const fresh = await pick(3);
  return fresh.length >= take ? fresh : pick(7);
}
