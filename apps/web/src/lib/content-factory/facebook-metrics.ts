/**
 * Content Factory — Facebook Page post engagement metrics (2026-09-14).
 *
 * Companion to instagram-metrics.ts, but simpler: auto-published FB
 * posts store their externalId on the SocialPublish row at publish time,
 * so there is no permalink-matching dance — we look each object up by ID.
 *
 * Two node shapes exist (matching the two publish paths):
 * - feed posts   (publishFbPhotoPost → /feed)   — id "{pageId}_{postId}"
 * - videos/Reels (publishFbVideo → /videos)     — plain numeric id
 * The underscore in the ID is the discriminator.
 *
 * Metric availability varies: reactions/comments/shares come from the
 * object itself (pages_read_engagement); impressions ("views") need the
 * read_insights permission and are tolerated as null when the token
 * lacks it. FB has no "save" metric at all.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export interface FbMetrics {
  views: number | null;
  /** Unique accounts reached (2026-09-30, once read_insights was granted). */
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

function tokenFor(accountKey: string): string | null {
  const raw =
    accountKey === "bwk"
      ? process.env.META_BWK_ACCESS_TOKEN
      : accountKey === "mythicals"
        ? process.env.META_MYTHICALS_ACCESS_TOKEN
        : process.env.IG_ACCESS_TOKEN;
  const v = raw?.trim();
  return v ? v : null;
}

export function facebookMetricsConfigured(accountKey = "ripple"): boolean {
  return !!tokenFor(accountKey);
}

async function graphGet(
  path: string,
  params: Record<string, string>,
  token: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH}/${path}?${qs}`);
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(
      `FB Graph API ${path} failed: ${json.error?.message ?? `HTTP ${res.status}`}`
    );
  }
  return json;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function insightValue(json: any, metric: string): number | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const item = (json.data ?? []).find((d: any) => d.name === metric);
  const value = item?.values?.[0]?.value;
  return typeof value === "number" ? value : null;
}

/**
 * Fetch engagement metrics for one published FB object by external ID.
 * Throws only when the object itself can't be read (deleted post, bad
 * token); missing individual metrics degrade to null.
 */
export async function fetchFbPostMetrics(
  externalId: string,
  accountKey = "ripple"
): Promise<FbMetrics> {
  const token = tokenFor(accountKey);
  if (!token) {
    throw new Error(`No FB access token configured for account "${accountKey}"`);
  }

  const out: FbMetrics = { views: null, reach: null, likes: null, comments: null, shares: null };
  const isFeedPost = externalId.includes("_");

  if (isFeedPost) {
    const post = await graphGet(
      externalId,
      {
        fields:
          "reactions.summary(true).limit(0),comments.summary(true).limit(0),shares",
      },
      token
    );
    out.likes = post.reactions?.summary?.total_count ?? null;
    out.comments = post.comments?.summary?.total_count ?? null;
    out.shares = post.shares?.count ?? null;
    // 2026-09-30: post_impressions / post_impressions_unique are retired
    // (Graph error #100). Current names: post_media_view (views) and
    // post_total_media_view_unique (reach). Needs read_insights.
    try {
      const insights = await graphGet(
        `${externalId}/insights`,
        { metric: "post_media_view,post_total_media_view_unique" },
        token
      );
      out.views = insightValue(insights, "post_media_view");
      out.reach = insightValue(insights, "post_total_media_view_unique");
    } catch {
      // read_insights not granted or metric unsupported — views stay null
    }
  } else {
    const video = await graphGet(
      externalId,
      { fields: "likes.summary(true).limit(0),comments.summary(true).limit(0)" },
      token
    );
    out.likes = video.likes?.summary?.total_count ?? null;
    out.comments = video.comments?.summary?.total_count ?? null;
    // Reels (2026-09-30): plays come from fb_reels_total_plays /
    // blue_reels_play_count; total_video_views is the legacy name for
    // non-reel videos. Fetch everything once and take the first present.
    try {
      const insights = await graphGet(`${externalId}/video_insights`, {}, token);
      out.views =
        insightValue(insights, "fb_reels_total_plays") ??
        insightValue(insights, "blue_reels_play_count") ??
        insightValue(insights, "total_video_views");
      out.reach =
        insightValue(insights, "post_impressions_unique") ??
        insightValue(insights, "total_video_impressions_unique");
    } catch {
      // video insights unavailable — views stay null
    }
  }

  return out;
}
