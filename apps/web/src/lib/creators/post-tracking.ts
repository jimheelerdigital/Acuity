import "server-only";

/**
 * Creator post tracking (2026-10-31, per Keenan). Creators tag Ripple and use
 * #ripple; a daily scan of each creator's own recent posts adds those to
 * their dashboard, refreshes view counts, and on day VIEW_BONUS_WINDOW_DAYS
 * locks the count and pays the view bonus it reached.
 *
 * Only the creator's own profile is scanned, so a match there is theirs.
 * A post matches on any of: #ripple, a tag / mention / collab with a Ripple
 * account, the creator's code or a goripple.io link in the caption.
 * Posts the creator logged by hand are tracked the same way.
 */
import { runApifyActor } from "@/lib/content-factory/competitor-mimic";
import { prisma } from "@/lib/prisma";
import { safeLog } from "@/lib/safe-log";

import { SCAN_LOOKBACK_DAYS, VIEW_BONUS_WINDOW_DAYS } from "./config";
import { awardViewBonusFor } from "./ledger";
import { externalIdFromUrl, isRipplePost, platformOfUrl, type ScannedPost } from "./post-match";

export { externalIdFromUrl, isRipplePost, platformOfUrl };

const DAY_MS = 24 * 60 * 60 * 1000;
/** Posts per creator per scan; creators rarely post more in the lookback. */
const SCAN_POSTS = 12;
/** If day-14 views can't be fetched, give up and use the last seen count after this many extra days. */
const FINALIZE_GRACE_DAYS = 3;


function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
}
function names(v: unknown, key = "username"): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x : str((x as Record<string, unknown>)?.[key])))
    .filter(Boolean)
    .map((x) => x.replace(/^@/, "").toLowerCase());
}

function fromInstagram(it: Record<string, unknown>): ScannedPost | null {
  const code = str(it.shortCode);
  if (!code) return null;
  const ts = str(it.timestamp);
  return {
    externalId: code,
    url: str(it.url) || `https://www.instagram.com/p/${code}/`,
    caption: str(it.caption).slice(0, 4000),
    // Reels report plays; photo posts have no view count.
    views: num(it.videoPlayCount) ?? num(it.videoViewCount),
    postedAt: ts ? new Date(ts) : null,
    people: [...names(it.mentions), ...names(it.taggedUsers), ...names(it.coauthorProducers)],
    hashtags: names(it.hashtags, "name"),
  };
}

function fromTikTok(it: Record<string, unknown>, handle: string): ScannedPost | null {
  const id = str(it.id);
  if (!id) return null;
  const ts = str(it.createTimeISO);
  return {
    externalId: id,
    url: str(it.webVideoUrl) || `https://www.tiktok.com/@${handle}/video/${id}`,
    caption: str(it.text).slice(0, 4000),
    views: num(it.playCount),
    postedAt: ts ? new Date(ts) : null,
    people: names(it.mentions, "username").concat(names(it.mentions, "uniqueId")),
    hashtags: names(it.hashtags, "name"),
  };
}

async function scanProfile(platform: string, handle: string): Promise<ScannedPost[]> {
  const h = handle.replace(/^@/, "");
  if (platform === "tiktok") {
    const items = await runApifyActor("clockworks~tiktok-profile-scraper", {
      profiles: [h],
      resultsPerPage: SCAN_POSTS,
      profileScrapeSections: ["videos"],
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: false,
    });
    return items.map((it) => fromTikTok(it, h)).filter((p): p is ScannedPost => p !== null);
  }
  const items = await runApifyActor("apify~instagram-scraper", {
    directUrls: [`https://www.instagram.com/${h}/`],
    resultsType: "posts",
    resultsLimit: SCAN_POSTS,
    onlyPostsNewerThan: `${SCAN_LOOKBACK_DAYS} days`,
    addParentData: false,
  });
  return items.map(fromInstagram).filter((p): p is ScannedPost => p !== null);
}

/** Current view count of one post, or null if it can't be read. */
async function fetchViews(url: string): Promise<number | null> {
  const platform = platformOfUrl(url);
  if (platform === "tiktok") {
    const items = await runApifyActor("clockworks~tiktok-scraper", {
      postURLs: [url],
      resultsPerPage: 1,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
    });
    return items[0] && !items[0].error ? num(items[0].playCount) : null;
  }
  if (platform === "instagram") {
    const items = await runApifyActor("apify~instagram-scraper", {
      directUrls: [url],
      resultsType: "posts",
      resultsLimit: 1,
      addParentData: false,
    });
    const it = items[0];
    return it && !it.error ? num(it.videoPlayCount) ?? num(it.videoViewCount) : null;
  }
  return null;
}

/** Active creators the daily scan covers (test creator excluded). */
export async function creatorsToScan() {
  return prisma.ugcCreator.findMany({
    where: {
      status: "deal",
      referralCode: { not: null },
      platform: { in: ["instagram", "tiktok"] },
      NOT: { handle: { startsWith: "zz_" } },
    },
    select: { id: true },
  });
}

/**
 * Scan one creator's recent posts: add new Ripple posts, refresh views on
 * posts still inside the window. One Apify run; the job calls this once per
 * creator in its own step so a slow profile can't time out the rest.
 */
export async function scanCreatorPosts(creatorId: string, now: Date = new Date()) {
  const c = await prisma.ugcCreator.findUniqueOrThrow({
    where: { id: creatorId },
    select: { id: true, handle: true, platform: true, referralCode: true },
  });
  let added = 0;
  let refreshed = 0;
  let scanned: ScannedPost[];
  try {
    scanned = await scanProfile(c.platform, c.handle);
  } catch (err) {
    safeLog.warn("creators.post-scan.failed", { handle: c.handle, err: err instanceof Error ? err.message : String(err) });
    return { handle: c.handle, added, refreshed, failed: true };
  }
  const existing = await prisma.creatorPost.findMany({
    where: { creatorId: c.id },
    select: { id: true, url: true, externalId: true, finalizedAt: true },
  });
  for (const p of scanned) {
    if (p.postedAt && now.getTime() - p.postedAt.getTime() > SCAN_LOOKBACK_DAYS * DAY_MS) continue;
    const match = existing.find((e) => e.externalId === p.externalId || externalIdFromUrl(e.url) === p.externalId);
    if (match) {
      if (match.finalizedAt) continue;
      await prisma.creatorPost.update({
        where: { id: match.id },
        data: { externalId: p.externalId, caption: p.caption || undefined, views: p.views, viewsCheckedAt: now },
      });
      refreshed++;
      continue;
    }
    if (!isRipplePost(p, c.referralCode)) continue;
    try {
      await prisma.creatorPost.create({
        data: {
          creatorId: c.id,
          url: p.url,
          platform: c.platform,
          postedAt: p.postedAt ?? now,
          source: "auto",
          externalId: p.externalId,
          caption: p.caption || null,
          views: p.views,
          viewsCheckedAt: now,
        },
      });
      added++;
    } catch (err) {
      // Same URL already logged (unique creatorId+url): fine.
      if ((err as { code?: string })?.code !== "P2002") throw err;
    }
  }
  return { handle: c.handle, added, refreshed, failed: false };
}

/** Posts that reached day VIEW_BONUS_WINDOW_DAYS and haven't been locked. */
export async function postsDueForFinal(now: Date = new Date()) {
  return prisma.creatorPost.findMany({
    where: {
      finalizedAt: null,
      postedAt: { lte: new Date(now.getTime() - VIEW_BONUS_WINDOW_DAYS * DAY_MS) },
      creator: { NOT: { handle: { startsWith: "zz_" } } },
    },
    select: { id: true },
    orderBy: { postedAt: "asc" },
    take: 40,
  });
}

/**
 * Lock one post's views at day VIEW_BONUS_WINDOW_DAYS and pay the view bonus
 * it reached. If the count can't be read, retries on later days, then
 * settles on the last count the scan saw.
 */
export async function finalizeCreatorPost(postId: string, now: Date = new Date()) {
  const p = await prisma.creatorPost.findUniqueOrThrow({
    where: { id: postId },
    select: { id: true, url: true, postedAt: true, views: true, finalizedAt: true },
  });
  if (p.finalizedAt) return { postId, skipped: true };
  let views: number | null = null;
  try {
    views = await fetchViews(p.url);
  } catch (err) {
    safeLog.warn("creators.post-final.fetch-failed", { postId, err: err instanceof Error ? err.message : String(err) });
  }
  if (views == null) {
    const overdue = now.getTime() - p.postedAt.getTime() > (VIEW_BONUS_WINDOW_DAYS + FINALIZE_GRACE_DAYS) * DAY_MS;
    if (!overdue && platformOfUrl(p.url)) return { postId, retry: true };
    views = p.views ?? 0;
  }
  await prisma.creatorPost.update({
    where: { id: p.id },
    data: { finalViews: views, finalizedAt: now, views, viewsCheckedAt: now },
  });
  const award = await awardViewBonusFor(p.id, views, "creators/post-tracking");
  return { postId, views, paidCents: award?.amount ?? 0 };
}
