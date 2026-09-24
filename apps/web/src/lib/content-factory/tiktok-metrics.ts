/**
 * Content Factory — our own TikTok numbers via Apify (2026-09-24, per
 * Keenan: "can you use apify to look at my tiktok posts?").
 *
 * TikTok posting is manual and the official Display API isn't offered to
 * our app, so a public-profile scrape is the only source of views/likes/
 * shares/saves for @getripple and @buildwithkey. Daily, latest
 * VIDEOS_PER_ACCOUNT videos per account, plus the full history on Sundays.
 *
 * Cost: clockworks~tiktok-profile-scraper is pay-per-result, $0.002/video
 * (Bronze). Daily 2 × 40 ≈ $4.80/month + weekly full (~400 videos, $0.80)
 * ≈ $3.50/month.
 *
 * Matching: a scraped video is tied to the CarouselPost it came from by
 * caption (Keenan pastes the emailed caption). A match stamps
 * CarouselPost.tiktokUrl and mirrors the numbers onto a SocialPublish
 * "tiktok" row, which the lane learning loop (performance.ts) already sums.
 * Hashtag-only captions can't be matched — those videos still get stored.
 *
 * Soft everywhere: no token / Apify failure → logged, nothing thrown.
 */

import { prisma } from "@/lib/prisma";

const APIFY_BASE = "https://api.apify.com/v2/acts";
/** Daily: the newest videos, which are still climbing. */
const VIDEOS_PER_ACCOUNT = 40;
/**
 * Weekly (Sundays) / on demand: EVERY video, so older winners' numbers stay
 * current too — the latest-40 window alone is ~6 days of BWK and hid its
 * best performers (Keenan, 2026-09-24: "the bwk has way more saves, shares").
 * Public counts were verified identical to TikTok's own video page.
 */
const FULL_HISTORY_LIMIT = 500;

export const TIKTOK_ACCOUNTS: Array<{ key: "ripple" | "bwk"; handle: string }> = [
  { key: "ripple", handle: process.env.TIKTOK_RIPPLE_HANDLE?.trim() || "getripple" },
  { key: "bwk", handle: process.env.TIKTOK_BWK_HANDLE?.trim() || "buildwithkey" },
];

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

/** Lowercased caption with hashtags, mentions, punctuation and emoji removed. */
export function normalizeCaption(caption: string | null | undefined): string {
  return (caption ?? "")
    .toLowerCase()
    .replace(/[#@][\w.]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function scrapeAccount(handle: string, limit: number): Promise<Raw[]> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) throw new Error("APIFY_TOKEN not set");
  const res = await fetch(
    `${APIFY_BASE}/clockworks~tiktok-profile-scraper/run-sync-get-dataset-items?token=${token}&timeout=240`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profiles: [handle],
        resultsPerPage: limit,
        profileScrapeSections: ["videos"],
        profileSorting: "latest",
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadSubtitles: false,
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apify ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as Raw[];
}

/**
 * Find the CarouselPost a TikTok video came from: same brand's posts
 * generated up to 10 days before the video, whose caption (minus hashtags)
 * matches on the first 40 normalized characters.
 */
async function matchCarouselPost(
  accountKey: "ripple" | "bwk",
  caption: string,
  postedAt: Date | null
): Promise<string | null> {
  const anchor = postedAt ?? new Date();
  const norm = normalizeCaption(caption);
  if (norm.length < 20) return matchByPostedTap(accountKey, postedAt); // hashtag-only / too short
  const key = norm.slice(0, 40);
  const candidates = await prisma.carouselPost.findMany({
    where: {
      generatedFor: {
        gte: new Date(anchor.getTime() - 10 * 86_400_000),
        lte: new Date(anchor.getTime() + 86_400_000),
      },
    },
    select: { id: true, caption: true, lane: true },
  });
  const { laneBrand } = await import("@/lib/content-factory/social-publish");
  for (const c of candidates) {
    if (!normalizeCaption(c.caption).startsWith(key)) continue;
    if ((await laneBrand(c.lane)) !== accountKey) continue;
    return c.id;
  }
  return matchByPostedTap(accountKey, postedAt);
}

/**
 * Fallback match: the "✓ I posted this on TikTok" email button records a
 * tap time on an otherwise empty TikTok SocialPublish row. The video whose
 * publish time falls within 6h BEFORE that tap is almost certainly it
 * (Keenan posts, then taps). Closest tap wins; each row is claimed once
 * because a matched row gets its externalId set.
 */
async function matchByPostedTap(
  accountKey: "ripple" | "bwk",
  postedAt: Date | null
): Promise<string | null> {
  if (!postedAt) return null;
  const taps = await prisma.socialPublish.findMany({
    where: {
      platform: "tiktok",
      accountKey,
      status: "POSTED",
      externalId: null,
      postedAt: { gte: postedAt, lte: new Date(postedAt.getTime() + 6 * 3_600_000) },
    },
    orderBy: { postedAt: "asc" },
    select: { carouselPostId: true },
    take: 1,
  });
  return taps[0]?.carouselPostId ?? null;
}

export interface TikTokRefreshResult {
  account: string;
  fetched: number;
  matched: number;
  error?: string;
}

export async function refreshTikTokAccount(
  account: { key: "ripple" | "bwk"; handle: string },
  opts: { full?: boolean } = {}
): Promise<TikTokRefreshResult> {
  let items: Raw[];
  try {
    items = await scrapeAccount(account.handle, opts.full ? FULL_HISTORY_LIMIT : VIDEOS_PER_ACCOUNT);
  } catch (err) {
    return { account: account.handle, fetched: 0, matched: 0, error: err instanceof Error ? err.message : String(err) };
  }

  let matched = 0;
  for (const it of items) {
    const videoId = str(it.id);
    if (!videoId) continue;
    const meta = (it.videoMeta ?? {}) as Raw;
    const ts = str(it.createTimeISO);
    const postedAt = ts ? new Date(ts) : null;
    const caption = str(it.text).slice(0, 2200);
    const url = str(it.webVideoUrl) || `https://www.tiktok.com/@${account.handle}/video/${videoId}`;
    const metrics = {
      views: num(it.playCount),
      likes: num(it.diggCount),
      comments: num(it.commentCount),
      shares: num(it.shareCount),
      saves: num(it.collectCount),
    };

    const existing = await prisma.tikTokVideo.findUnique({ where: { videoId }, select: { carouselPostId: true } });
    const carouselPostId = existing?.carouselPostId ?? (await matchCarouselPost(account.key, caption, postedAt));

    await prisma.tikTokVideo.upsert({
      where: { videoId },
      create: {
        videoId,
        accountKey: account.key,
        handle: account.handle,
        url,
        caption,
        postedAt,
        durationSec: num(meta.duration),
        carouselPostId,
        ...metrics,
      },
      update: { ...metrics, caption, carouselPostId, lastScrapedAt: new Date() },
    });

    if (carouselPostId) {
      matched++;
      await prisma.carouselPost.updateMany({
        where: { id: carouselPostId, tiktokUrl: null },
        data: { tiktokUrl: url },
      });
      await prisma.socialPublish.upsert({
        where: {
          carouselPostId_platform_accountKey: { carouselPostId, platform: "tiktok", accountKey: account.key },
        },
        create: {
          carouselPostId,
          platform: "tiktok",
          accountKey: account.key,
          status: "POSTED",
          externalId: videoId,
          permalink: url,
          scheduledAt: postedAt ?? new Date(),
          postedAt,
          ...metrics,
          metricsAt: new Date(),
        },
        update: {
          status: "POSTED",
          externalId: videoId,
          permalink: url,
          postedAt,
          error: null,
          ...metrics,
          metricsAt: new Date(),
        },
      });
    }
  }

  return { account: account.handle, fetched: items.length, matched };
}
