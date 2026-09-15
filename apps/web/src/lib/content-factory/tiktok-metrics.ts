/**
 * Content Factory — TikTok engagement metrics via the Display API
 * (2026-09-15, per Keenan: "the main issue is the lack of tiktok
 * insight. we have a ton more success there than other platforms. is
 * there any way to get that feedback too?").
 *
 * /v2/video/list/ returns view/like/comment/share counts for the
 * AUTHORIZED account's public videos — sandbox apps can call it for
 * their target users, so no app review is needed. Requires the
 * video.list scope (added to TIKTOK_SCOPES 2026-09-15): tokens granted
 * before then lack it, so BOTH accounts must run the connect flow once
 * more after the scope ships.
 *
 * MATCHING: drafts are posted manually from the TikTok inbox, so the
 * final video ID is never known at publish time. Every draft carries
 * its post's headline as the title (publishTikTokPhotoDraft slices it
 * to 90 chars), so videos are matched back to SocialPublish rows by
 * normalized title + created-after-delivery; duplicate headlines pick
 * the video closest in time to the draft delivery. A matched video's
 * share_url is stored in the row's permalink, and later refreshes
 * re-match by that URL first (stable against re-used headlines).
 *
 * UNMATCHED rows keep null metrics on purpose: a draft Keenan never
 * posted (or retitled in the app) is MISSING data, not zero engagement
 * — counting it as zero would poison the lane feedback loop.
 */

const OPEN_API = "https://open.tiktokapis.com/v2";

const VIDEO_FIELDS =
  "id,create_time,title,video_description,share_url,view_count,like_count,comment_count,share_count";

export interface TikTokVideo {
  id: string;
  createTime: Date;
  title: string;
  description: string;
  shareUrl: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

interface VideoListResponse {
  data?: {
    videos?: Array<{
      id?: string;
      create_time?: number;
      title?: string;
      video_description?: string;
      share_url?: string;
      view_count?: number;
      like_count?: number;
      comment_count?: number;
      share_count?: number;
    }>;
    cursor?: number;
    has_more?: boolean;
  };
  error?: { code?: string; message?: string };
}

/**
 * Page through the account's public videos, newest first. Capped so a
 * prolific account can't blow the nightly run's time budget.
 */
export async function fetchTikTokVideos(
  accessToken: string,
  maxVideos = 200
): Promise<TikTokVideo[]> {
  const videos: TikTokVideo[] = [];
  let cursor: number | undefined;

  while (videos.length < maxVideos) {
    const res = await fetch(`${OPEN_API}/video/list/?fields=${VIDEO_FIELDS}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }),
    });
    const json = (await res.json()) as VideoListResponse;
    if (!res.ok || (json.error?.code && json.error.code !== "ok")) {
      throw new Error(
        `TikTok video.list failed: ${json.error?.message ?? `HTTP ${res.status}`} (code ${json.error?.code ?? "?"})`
      );
    }
    for (const v of json.data?.videos ?? []) {
      if (!v.id) continue;
      videos.push({
        id: v.id,
        createTime: new Date((v.create_time ?? 0) * 1000),
        title: v.title ?? "",
        description: v.video_description ?? "",
        shareUrl: v.share_url ?? null,
        views: v.view_count ?? null,
        likes: v.like_count ?? null,
        comments: v.comment_count ?? null,
        shares: v.share_count ?? null,
      });
    }
    if (!json.data?.has_more || json.data.videos?.length === 0) break;
    cursor = json.data.cursor;
    await new Promise((r) => setTimeout(r, 200));
  }
  return videos;
}

/** Case/punctuation-insensitive comparison key for title matching. */
function normTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Draft titles are the headline sliced to 90 chars — mirror that. */
function headlineKey(headline: string): string {
  return normTitle(headline.slice(0, 90));
}

export interface TikTokRefreshResult {
  matched: number;
  unmatched: number;
  errors: string[];
}

/**
 * Nightly refresh: for each connected account, pull the video list and
 * write engagement onto the matched POSTED tiktok SocialPublish rows.
 * The lane feedback loop (performance.ts) sums SocialPublish rows, so
 * matched numbers flow into generation with zero loop changes.
 */
export async function refreshTikTokMetrics(): Promise<TikTokRefreshResult> {
  const { prisma } = await import("@/lib/prisma");
  const { getTikTokAccessToken } = await import("./tiktok-publish");

  const result: TikTokRefreshResult = { matched: 0, unmatched: 0, errors: [] };
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);

  for (const accountKey of ["ripple", "bwk"] as const) {
    let accessToken: string | null = null;
    try {
      accessToken = await getTikTokAccessToken(accountKey);
    } catch (err) {
      result.errors.push(
        `${accountKey}: token refresh failed — ${err instanceof Error ? err.message : err}`
      );
      continue;
    }
    if (!accessToken) continue; // never connected — nothing to do

    let videos: TikTokVideo[];
    try {
      videos = await fetchTikTokVideos(accessToken);
    } catch (err) {
      // Most likely cause pre-reconnect: token lacks the video.list
      // scope. Surface it loudly — this is the fix-me signal.
      result.errors.push(
        `${accountKey}: ${err instanceof Error ? err.message : err}`
      );
      continue;
    }

    const rows = await prisma.socialPublish.findMany({
      where: {
        platform: "tiktok",
        status: "POSTED",
        accountKey,
        postedAt: { gte: ninetyDaysAgo },
      },
      select: {
        id: true,
        postedAt: true,
        permalink: true,
        carouselPost: { select: { headline: true } },
      },
    });

    const usedVideoIds = new Set<string>();

    // Pass 1 — rows already matched in a previous run re-match by URL.
    for (const row of rows) {
      if (!row.permalink) continue;
      const video = videos.find((v) => v.shareUrl === row.permalink);
      if (!video) continue;
      usedVideoIds.add(video.id);
      await prisma.socialPublish.update({
        where: { id: row.id },
        data: {
          views: video.views,
          likes: video.likes,
          comments: video.comments,
          shares: video.shares,
          metricsAt: new Date(),
        },
      });
      result.matched++;
    }

    // Pass 2 — first-time matches by title + posted-after-delivery.
    for (const row of rows) {
      if (row.permalink) continue;
      const key = headlineKey(row.carouselPost.headline);
      if (!key) {
        result.unmatched++;
        continue;
      }
      // 6h clock slack: TikTok create_time vs our postedAt (delivery).
      const earliest = (row.postedAt?.getTime() ?? 0) - 6 * 3_600_000;
      const candidates = videos.filter(
        (v) =>
          !usedVideoIds.has(v.id) &&
          v.createTime.getTime() >= earliest &&
          (normTitle(v.title) === key || normTitle(v.description) === key)
      );
      if (candidates.length === 0) {
        result.unmatched++;
        continue;
      }
      // Duplicate headlines: the video posted soonest after THIS
      // delivery is the right one.
      candidates.sort(
        (a, b) =>
          Math.abs(a.createTime.getTime() - (row.postedAt?.getTime() ?? 0)) -
          Math.abs(b.createTime.getTime() - (row.postedAt?.getTime() ?? 0))
      );
      const video = candidates[0];
      usedVideoIds.add(video.id);
      await prisma.socialPublish.update({
        where: { id: row.id },
        data: {
          permalink: video.shareUrl,
          externalId: video.id,
          views: video.views,
          likes: video.likes,
          comments: video.comments,
          shares: video.shares,
          metricsAt: new Date(),
        },
      });
      result.matched++;
    }
  }
  return result;
}
