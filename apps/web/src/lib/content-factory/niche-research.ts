/**
 * Niche Research Lab — Apify-backed competitor/inspiration scraping
 * (2026-08-24, per Keenan).
 *
 * Tracked NicheAccounts are scraped nightly via Apify's Instagram profile
 * scraper. Each account's recent posts are upserted as NichePost rows with
 * an engagementRatio (performance vs the account's own median), which the
 * topic generator, weekly strategy memo, and engagement queue all rank by.
 *
 * NO auto-engagement anywhere in this system: we only READ public data.
 * Commenting/liking stays manual via the admin engagement queue.
 */

const APIFY_BASE = "https://api.apify.com/v2";

/** Actor for Instagram profile + recent posts. Swappable via env. */
const IG_ACTOR = process.env.APIFY_IG_ACTOR || "apify~instagram-profile-scraper";

export function apifyConfigured(): boolean {
  return Boolean(process.env.APIFY_TOKEN);
}

export type ScrapedPost = {
  externalId: string; // IG shortcode
  url: string;
  caption: string | null;
  hashtags: string[];
  mediaType: string | null; // Image | Video | Sidecar
  thumbnailUrl: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  postedAt: Date;
};

export type ScrapedProfile = {
  handle: string;
  displayName: string | null;
  followers: number | null;
  posts: ScrapedPost[];
};

type ApifyLatestPost = {
  type?: string;
  shortCode?: string;
  caption?: string;
  hashtags?: string[];
  url?: string;
  commentsCount?: number;
  likesCount?: number;
  videoViewCount?: number;
  timestamp?: string;
  displayUrl?: string;
};

type ApifyProfileItem = {
  username?: string;
  fullName?: string;
  followersCount?: number;
  latestPosts?: ApifyLatestPost[];
  error?: string;
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;

/**
 * Scrape Instagram profiles (+ their ~12 latest posts each) in one Apify
 * run. Uses run-sync-get-dataset-items so no polling is needed; the caller
 * (an Inngest step) owns the timeout budget.
 */
export async function scrapeInstagramProfiles(
  handles: string[]
): Promise<ScrapedProfile[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is not set");
  if (handles.length === 0) return [];

  const res = await fetch(
    `${APIFY_BASE}/acts/${IG_ACTOR}/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: handles }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apify ${IG_ACTOR} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const items = (await res.json()) as ApifyProfileItem[];

  return items
    .filter((it) => it.username && !it.error)
    .map((it) => ({
      handle: it.username!.toLowerCase(),
      displayName: it.fullName || null,
      followers: num(it.followersCount),
      posts: (it.latestPosts || [])
        .filter((p) => p.shortCode && p.timestamp)
        .map((p) => ({
          externalId: p.shortCode!,
          url: p.url || `https://www.instagram.com/p/${p.shortCode}/`,
          caption: p.caption || null,
          hashtags: (p.hashtags || []).map((h) => h.replace(/^#/, "").toLowerCase()),
          mediaType: p.type || null,
          thumbnailUrl: p.displayUrl || null,
          views: num(p.videoViewCount),
          likes: num(p.likesCount),
          comments: num(p.commentsCount),
          postedAt: new Date(p.timestamp!),
        })),
    }));
}

/** Actor for Instagram hashtag top-post sampling. Swappable via env. */
const IG_HASHTAG_ACTOR =
  process.env.APIFY_IG_HASHTAG_ACTOR || "apify~instagram-hashtag-scraper";

export type HashtagPost = {
  tag: string;
  ownerUsername: string | null;
  shortCode: string | null;
  caption: string | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
  postedAt: Date | null;
};

type ApifyHashtagItem = {
  queryTag?: string;
  ownerUsername?: string;
  shortCode?: string;
  caption?: string;
  likesCount?: number;
  commentsCount?: number;
  videoViewCount?: number;
  timestamp?: string;
  error?: string;
};

/**
 * Sample recent top posts for a set of hashtags. Powers both hashtag
 * scoring (median engagement per tag) and account discovery (creators
 * who show up in the niche's top posts but aren't tracked yet).
 */
export async function scrapeHashtagPosts(
  tags: string[],
  limitPerTag = 20
): Promise<HashtagPost[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is not set");
  if (tags.length === 0) return [];

  const res = await fetch(
    `${APIFY_BASE}/acts/${IG_HASHTAG_ACTOR}/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hashtags: tags.map((t) => t.replace(/^#/, "")),
        resultsLimit: limitPerTag,
        resultsType: "posts",
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Apify ${IG_HASHTAG_ACTOR} failed (${res.status}): ${body.slice(0, 300)}`
    );
  }
  const items = (await res.json()) as ApifyHashtagItem[];

  return items
    .filter((it) => !it.error && it.queryTag)
    .map((it) => ({
      tag: it.queryTag!.replace(/^#/, "").toLowerCase(),
      ownerUsername: it.ownerUsername?.toLowerCase() || null,
      shortCode: it.shortCode || null,
      caption: it.caption || null,
      likes: num(it.likesCount),
      comments: num(it.commentsCount),
      views: num(it.videoViewCount),
      postedAt: it.timestamp ? new Date(it.timestamp) : null,
    }));
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Engagement ratio per post: (likes + comments) vs the account's median
 * (likes + comments) across the supplied posts. 1.0 = typical for that
 * account, 2.0 = a breakout post. Normalizing per-account means a small
 * account's viral post outranks a big account's average one — which is
 * exactly the "what should WE emulate" signal.
 */
export function computeEngagementRatios(
  posts: { likes: number | null; comments: number | null }[]
): (number | null)[] {
  const engagement = posts.map((p) =>
    p.likes === null && p.comments === null ? null : (p.likes || 0) + (p.comments || 0)
  );
  const known = engagement.filter((e): e is number => e !== null).sort((a, b) => a - b);
  if (known.length < 3) return posts.map(() => null); // too few points for a baseline
  const mid = Math.floor(known.length / 2);
  const median =
    known.length % 2 ? known[mid] : (known[mid - 1] + known[mid]) / 2;
  if (median <= 0) return posts.map(() => null);
  return engagement.map((e) => (e === null ? null : Number((e / median).toFixed(2))));
}
