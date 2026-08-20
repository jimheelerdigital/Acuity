/**
 * Content Factory — Instagram engagement metrics via the Meta Graph API.
 *
 * Pulls views/likes/comments/saves/shares for manually-posted carousels.
 * The admin stores the post's permalink (pasted by Keenan); we match it
 * against the IG account's media list because the Graph API can't look a
 * media object up by its public URL/shortcode.
 *
 * Env (Vercel):
 * - IG_ACCESS_TOKEN — long-lived Page access token (never expires) from
 *   Keenan's Meta developer app, for the FB page linked to the IG account
 * - IG_USER_ID — the Instagram Business account ID (the 1784… number,
 *   NOT the @handle)
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export function instagramConfigured(): boolean {
  return !!process.env.IG_ACCESS_TOKEN && !!process.env.IG_USER_ID;
}

export interface IgMetrics {
  views: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
}

interface IgMedia {
  id: string;
  permalink: string;
  like_count?: number;
  comments_count?: number;
}

/**
 * Normalize an IG URL for matching: strip protocol, www, query, trailing
 * slash. Permalinks look like https://www.instagram.com/p/SHORTCODE/ (or
 * /reel/); pasted URLs often carry ?igsh=… share params.
 */
function normalizeIgUrl(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("?")[0]
    .replace(/\/+$/, "")
    .toLowerCase();
}

async function graphGet(path: string, params: Record<string, string>): Promise<any> {
  const token = process.env.IG_ACCESS_TOKEN!;
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH}/${path}?${qs}`);
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(
      `IG Graph API ${path} failed: ${json.error?.message ?? `HTTP ${res.status}`}`
    );
  }
  return json;
}

/**
 * Fetch the account's recent media (up to ~200) and index by normalized
 * permalink. One call per refresh run, shared across all posts.
 */
export async function fetchIgMediaIndex(): Promise<Map<string, IgMedia>> {
  const igUserId = process.env.IG_USER_ID!;
  const index = new Map<string, IgMedia>();

  let json = await graphGet(`${igUserId}/media`, {
    fields: "id,permalink,like_count,comments_count",
    limit: "50",
  });

  for (let page = 0; page < 4; page++) {
    for (const m of (json.data ?? []) as IgMedia[]) {
      if (m.permalink) index.set(normalizeIgUrl(m.permalink), m);
    }
    // paging.next is a full URL with the token baked in — use it raw.
    const next = json.paging?.next as string | undefined;
    if (!next) break;
    const res = await fetch(next);
    json = await res.json();
    if (!res.ok || json.error) break;
  }

  return index;
}

/**
 * Pull insight metrics for one media object. `views`, `saved`, and
 * `shares` come from /insights (metric support varies by media type —
 * unsupported metrics are fetched individually and tolerated as null);
 * likes/comments come from the media object itself (always available).
 */
export async function fetchIgMediaMetrics(media: IgMedia): Promise<IgMetrics> {
  const out: IgMetrics = {
    views: null,
    likes: media.like_count ?? null,
    comments: media.comments_count ?? null,
    saves: null,
    shares: null,
  };

  const INSIGHT_METRICS: { name: string; key: "views" | "saves" | "shares" }[] = [
    { name: "views", key: "views" },
    { name: "saved", key: "saves" },
    { name: "shares", key: "shares" },
  ];

  const readValues = (json: any) => {
    for (const item of json.data ?? []) {
      const target = INSIGHT_METRICS.find((m) => m.name === item.name);
      const value = item.values?.[0]?.value;
      if (target && typeof value === "number") out[target.key] = value;
    }
  };

  try {
    // Try all three in one call first.
    const json = await graphGet(`${media.id}/insights`, {
      metric: INSIGHT_METRICS.map((m) => m.name).join(","),
    });
    readValues(json);
  } catch {
    // Some media types reject some metrics — fall back to one-by-one so a
    // single unsupported metric doesn't zero out the rest.
    for (const m of INSIGHT_METRICS) {
      try {
        readValues(await graphGet(`${media.id}/insights`, { metric: m.name }));
      } catch {
        // metric unsupported for this media type — leave null
      }
    }
  }

  return out;
}

/**
 * Look up a pasted IG post URL in the media index.
 */
export function matchIgMedia(
  index: Map<string, IgMedia>,
  pastedUrl: string
): IgMedia | null {
  return index.get(normalizeIgUrl(pastedUrl)) ?? null;
}
