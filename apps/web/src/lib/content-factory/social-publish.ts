/**
 * Content Factory — direct Meta Graph API auto-publishing (2026-09-10).
 *
 * Publishes finished photo carousels to Instagram (carousel post) and the
 * Facebook Page (multi-photo post) with ZERO middleman cost — no Ayrshare,
 * just the free Graph API. Slides' imageUrl values are public Supabase
 * Storage URLs, which the Graph API fetches directly.
 *
 * Accounts:
 * - "ripple" — reuses the metrics-refresh creds already in Vercel:
 *     IG_ACCESS_TOKEN (long-lived Page access token), IG_USER_ID
 *   plus one new var: FB_PAGE_ID (the Ripple Facebook Page ID).
 * - "bwk" — for when Build With Key gets its own IG/FB:
 *     META_BWK_ACCESS_TOKEN, META_BWK_IG_USER_ID, META_BWK_FB_PAGE_ID
 *   Until those exist, BWK lanes DO NOT post to IG/FB at all (Keenan's
 *   call 2026-09-14: "don't post bwk posts across insta/facebook yet" —
 *   reversing the 2026-09-10 fall-back-to-Ripple decision). BWK is
 *   TikTok-only until the Meta creds land; adding them to Vercel turns
 *   BWK IG/FB on with zero code changes.
 *
 * Master switch: SOCIAL_AUTOPUBLISH_ENABLED=1. Everything no-ops without
 * it, so this ships dark until the SocialPublish table is pushed and the
 * env vars are set.
 *
 * IG constraint: carousels max out at 10 images. All lanes now produce
 * ≤10 slides (BWK pick-lists downsized to 1 cover + 4-7 items,
 * 2026-09-14 per Keenan), so every lane auto-publishes.
 */

import { proxiedImageUrl } from "./tiktok-publish";

const GRAPH = "https://graph.facebook.com/v21.0";

export const IG_MAX_CAROUSEL_IMAGES = 10;

/** Lanes whose posts belong to the Build With Key brand. */
export const BWK_LANES = [
  "memento-men",
  "moody-men",
  "watching",
  "protocol",
  "phone-quote-men",
  "discipline-real",
  "future-texts",
] as const;

/**
 * Lanes eligible for auto-publishing — ALL of them since 2026-09-14
 * (per Keenan: "I want 5-10 automated posts going out daily to all
 * different social media lanes"). Every lane now produces ≤10 slides
 * (IG's carousel cap) after the BWK pick-list downsize to 1 cover +
 * 4-7 items, so nothing needs curation before it ships.
 */
export const AUTO_LANES = [
  "questions",
  "memento",
  "selfie",
  "phone-quote",
  "phone-quote-men",
  "memento-men",
  "moody-men",
  "watching",
  "protocol",
  // Five lanes added 2026-09-14 night — all ≤10 slides, auto-eligible.
  "texts-younger",
  "permission",
  "letter",
  "discipline-real",
  "future-texts",
] as const;

/**
 * HYBRID format experiment (2026-09-14, per Keenan: "i need music to be
 * a part of this auto posting" → "build it hybrid"). Lanes listed here
 * publish as slideshow REELS with library music baked in (the only way
 * the Graph API allows music); the rest stay silent swipeable photo
 * carousels. The metrics loop decides which format wins per lane —
 * flipping a lane is a one-line change here.
 */
export const REEL_LANES = ["memento", "selfie"] as const;

/**
 * Lanes that stay silent swipeable photo carousels. EMPTY since 2026-09-25
 * (per Keenan: "every single post on facebook/instagram needs to be a REEL
 * with MUSIC OVERLAY for ALL POST LANES"). This replaces the 09-24 "keep one
 * photo carousel each lane: discipline & muse" exception, and the paper
 * reset-guide lanes are reels too. Kept as a list so a carousel lane can
 * come back without re-plumbing.
 */
export const CAROUSEL_LANES: readonly string[] = [];

/**
 * Every other lane, both brands, publishes as a reel since 2026-09-24 (per
 * Keenan: "make everything a reel for both BWK and for Ripple across the
 * board"). The Graph API can't put music on a photo carousel, and music was
 * the ask. REEL_LANES is kept as the record of the 09-14 hybrid test. If a
 * lane has no music track, the cron still falls back to the silent carousel.
 */
export function laneWantsReel(lane: string | null): boolean {
  return !(CAROUSEL_LANES as readonly string[]).includes(lane ?? "");
}

/**
 * Trim legacy pick-list posts at publish time (2026-09-15, per Keenan —
 * a pre-retirement BWK post shipped all 18 slides to TikTok: "it sent 3
 * separate 'what gets counted' and 15 separate posts as part of it
 * instead of cutting it down like we discussed").
 *
 * Posts generated before the 2026-09-14 pick-list retirement carry 3
 * duplicate COVER slides + up to 15 items. Multiple covers is the
 * legacy tell — those posts publish as 1 cover + first 6 items (the
 * agreed go-live shape). New-format posts (1 cover + 4-7 items) pass
 * through untouched.
 */
export function trimLegacyPickList<T extends { kind: string }>(
  slides: T[]
): T[] {
  const covers = slides.filter((s) => s.kind === "COVER");
  if (covers.length <= 1) return slides;
  const items = slides.filter((s) => s.kind !== "COVER");
  return [covers[0], ...items.slice(0, 6)];
}

/**
 * Platform-optimized feed rendition (2026-09-22, per Keenan: "properly
 * crop facebook and instagram posts ... to fill the screen"). Slides
 * are 9:16 TikTok-native; IG/FB feeds max out at 4:5 portrait, so
 * sending raw 9:16 leaves Meta to crop/letterbox on its own. This
 * routes the image through the goripple.io proxy with `?ar=4x5`, which
 * center-crops to 1080x1350 — aligned with the slide design's 15%
 * top/bottom safe zone, so baked text survives. 1:1 is NOT used for
 * feeds: it would keep only the middle 56% and clip text.
 * Non-Supabase URLs pass through untouched (nothing to crop).
 */
export function feedCropUrl(imageUrl: string, ar: "4x5" | "1x1" = "4x5"): string {
  const proxied = proxiedImageUrl(imageUrl);
  if (proxied === imageUrl) return imageUrl;
  return `${proxied}?ar=${ar}`;
}

export type SocialAccountKey = "ripple" | "bwk";
export type SocialPlatform =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "youtube"
  | "threads";

// ─── Prime-time scheduling (2026-09-15, per Keenan: "make sure ALL
// posts on social media are at prime time social media hours for the
// US") ───────────────────────────────────────────────────────────────
// Windows are EASTERN time (~47% of the US lives in ET; Central lags by
// one hour, so ET windows serve both coasts' peaks). Sources: Sprout
// Social 2026 (2B engagements), Buffer 2026 (7M TikTok posts):
// - Instagram peaks 9am-1pm + 5-7pm ET weekdays → 12pm-7pm window
// - Facebook peaks 8am-1pm ET, dead after 6pm → 12pm-6pm window
// REVISED 2026-09-18, per Keenan: "it's pushing posts at 6 am pst, too
// early" — the queue is built overnight, so the first post always fired
// at window-open, and FB's old 9am ET open = 6am PT. Both windows now
// open at NOON ET (9am PT): nothing ships before 9am anywhere in the
// continental US, noon-1pm ET still catches the lunchtime peak, and IG
// keeps its 5-7pm ET evening peak. FB stagger tightened 50→45min so the
// shorter window still fits all 7 daily Ripple posts (360/45 = 8 slots).
// - TikTok rows are INBOX DRAFT deliveries, not posts — Keenan posts
//   them by hand through the day, so they all land FIRST THING IN THE
//   MORNING (7-10am ET = 6-9am CT, per Keenan 2026-09-15: "tiktok i
//   want first thing in the morning so i can go in throughout the day
//   to post them"). Short stagger — delivery time isn't engagement
//   time.
// - Threads (2026-09-23) rides IG's window — same Meta audience, same
//   lunchtime + evening peaks.
// - YouTube Shorts (2026-09-23) skew to afternoon/evening viewing, so
//   the window runs noon-9pm ET with an hourly stagger. Only reel lanes
//   upload (~2/day), well under the API's ~6 uploads/day quota.
export const PLATFORM_WINDOWS: Record<
  SocialPlatform,
  { openMin: number; closeMin: number; staggerMs: number }
> = {
  instagram: { openMin: 12 * 60, closeMin: 19 * 60, staggerMs: 50 * 60_000 },
  facebook: { openMin: 12 * 60, closeMin: 18 * 60, staggerMs: 45 * 60_000 },
  tiktok: { openMin: 7 * 60, closeMin: 10 * 60, staggerMs: 5 * 60_000 },
  threads: { openMin: 12 * 60, closeMin: 19 * 60, staggerMs: 50 * 60_000 },
  youtube: { openMin: 12 * 60, closeMin: 21 * 60, staggerMs: 60 * 60_000 },
};

const ET = "America/New_York";

/** Milliseconds to ADD to a UTC instant to get its ET wall-clock time. */
function etOffsetMs(d: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ET,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - d.getTime();
}

/**
 * Clamp an instant into the platform's ET posting window: inside the
 * window → unchanged; before it opens → today's open; after it closes →
 * tomorrow's open. (DST edge: the offset is taken at `t`, so a slot
 * computed across a spring-forward/fall-back boundary can be off by an
 * hour once a year — harmless for posting windows this wide.)
 */
export function clampToWindow(t: Date, platform: SocialPlatform): Date {
  const w = PLATFORM_WINDOWS[platform];
  const off = etOffsetMs(t);
  const wall = new Date(t.getTime() + off); // UTC fields = ET wall clock
  const mod = wall.getUTCHours() * 60 + wall.getUTCMinutes();
  if (mod >= w.openMin && mod < w.closeMin) return t;
  let openWallMs =
    Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) +
    w.openMin * 60_000;
  if (mod >= w.closeMin) openWallMs += 86_400_000;
  return new Date(openWallMs - off);
}

export interface SocialAccount {
  key: SocialAccountKey;
  accessToken: string;
  igUserId: string | null;
  fbPageId: string | null;
}

export function autoPublishEnabled(): boolean {
  return process.env.SOCIAL_AUTOPUBLISH_ENABLED === "1";
}

/**
 * Env values get trimmed: a trailing space pasted into a Vercel env var
 * (live incident 2026-09-14 — IG_USER_ID ended in " " and every Graph
 * call 404'd with "Object with ID '… ' does not exist") corrupts the
 * request path silently.
 */
export function env(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? v : null;
}

function rippleAccount(): SocialAccount | null {
  const accessToken = env("IG_ACCESS_TOKEN");
  if (!accessToken) return null;
  return {
    key: "ripple",
    accessToken,
    igUserId: env("IG_USER_ID"),
    fbPageId: env("FB_PAGE_ID"),
  };
}

function bwkAccount(): SocialAccount | null {
  const accessToken = env("META_BWK_ACCESS_TOKEN");
  if (!accessToken) return null;
  return {
    key: "bwk",
    accessToken,
    igUserId: env("META_BWK_IG_USER_ID"),
    fbPageId: env("META_BWK_FB_PAGE_ID"),
  };
}

/**
 * Which brand a lane belongs to. Legacy lanes come from the hard-coded
 * BWK_LANES list; DB-born lanes (lanes-as-data, 2026-09-15) carry
 * their brand on the ContentLane row. Every lane that can reach
 * publishing is either legacy-listed or DB-rowed, so the ripple
 * default only fires for null/historical lanes. The 5-minute cache
 * keeps the nightly per-post loops from hammering the table.
 */
let laneBrandCache: { map: Map<string, string>; at: number } | null = null;

export async function laneBrand(
  lane: string | null
): Promise<SocialAccountKey> {
  if (!lane) return "ripple";
  if ((BWK_LANES as readonly string[]).includes(lane)) return "bwk";
  if (!laneBrandCache || Date.now() - laneBrandCache.at > 5 * 60_000) {
    try {
      const { prisma } = await import("@/lib/prisma");
      const rows = await prisma.contentLane.findMany({
        select: { key: true, brand: true },
      });
      laneBrandCache = {
        map: new Map(rows.map((r) => [r.key, r.brand])),
        at: Date.now(),
      };
    } catch {
      // Table missing/unreachable — legacy list already answered above.
      laneBrandCache = { map: new Map(), at: Date.now() };
    }
  }
  return laneBrandCache.map.get(lane) === "bwk" ? "bwk" : "ripple";
}

/**
 * Which Meta account a lane posts to. BWK lanes use ONLY the dedicated
 * BWK account — null until META_BWK_* creds exist, which means no IG/FB
 * for BWK (men's content must never land on Ripple's women-audience
 * pages; TikTok is BWK's only live platform for now).
 */
export async function resolveAccount(
  lane: string | null
): Promise<SocialAccount | null> {
  return (await laneBrand(lane)) === "bwk" ? bwkAccount() : rippleAccount();
}

async function graphPost(
  path: string,
  params: Record<string, string>,
  accessToken: string
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ ...params, access_token: accessToken });
  const res = await fetch(`${GRAPH}/${path}`, { method: "POST", body });
  const json = (await res.json()) as {
    error?: { message?: string };
    [k: string]: unknown;
  };
  if (!res.ok || json.error) {
    throw new Error(
      `Graph API POST ${path} failed: ${json.error?.message ?? `HTTP ${res.status}`}`
    );
  }
  return json;
}

async function graphGet(
  path: string,
  params: Record<string, string>,
  accessToken: string
): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ ...params, access_token: accessToken });
  const res = await fetch(`${GRAPH}/${path}?${qs}`);
  const json = (await res.json()) as {
    error?: { message?: string };
    [k: string]: unknown;
  };
  if (!res.ok || json.error) {
    throw new Error(
      `Graph API GET ${path} failed: ${json.error?.message ?? `HTTP ${res.status}`}`
    );
  }
  return json;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait for an IG media container to finish server-side processing.
 * Meta fetches + processes each image asynchronously; publishing before
 * status FINISHED fails.
 */
async function waitForContainer(
  containerId: string,
  accessToken: string,
  attempts = 20,
  intervalMs = 3000
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const json = await graphGet(
      containerId,
      { fields: "status_code" },
      accessToken
    );
    const status = json.status_code as string | undefined;
    if (status === "FINISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(`IG container ${containerId} status: ${status}`);
    }
    await sleep(intervalMs);
  }
  throw new Error(`IG container ${containerId} never reached FINISHED`);
}

export interface PublishResult {
  externalId: string;
  permalink: string | null;
}

/**
 * Publish an image carousel to Instagram. Flow (Graph API v21):
 * 1. one container per image (is_carousel_item=true)
 * 2. one CAROUSEL container with children + caption
 * 3. media_publish
 * Single-image posts use a plain image container instead.
 */
export async function publishIgCarousel(
  account: SocialAccount,
  imageUrls: string[],
  caption: string
): Promise<PublishResult> {
  if (!account.igUserId) {
    throw new Error(`IG user id not configured for account "${account.key}"`);
  }
  const urls = imageUrls.slice(0, IG_MAX_CAROUSEL_IMAGES);
  if (urls.length === 0) throw new Error("No images to publish");

  let creationId: string;
  if (urls.length === 1) {
    const single = await graphPost(
      `${account.igUserId}/media`,
      { image_url: urls[0], caption },
      account.accessToken
    );
    creationId = String(single.id);
  } else {
    const childIds: string[] = [];
    for (const url of urls) {
      const child = await graphPost(
        `${account.igUserId}/media`,
        { image_url: url, is_carousel_item: "true" },
        account.accessToken
      );
      childIds.push(String(child.id));
      await sleep(500); // stay friendly with rate limits
    }
    const carousel = await graphPost(
      `${account.igUserId}/media`,
      { media_type: "CAROUSEL", children: childIds.join(","), caption },
      account.accessToken
    );
    creationId = String(carousel.id);
  }

  await waitForContainer(creationId, account.accessToken);

  const published = await graphPost(
    `${account.igUserId}/media_publish`,
    { creation_id: creationId },
    account.accessToken
  );
  const mediaId = String(published.id);

  let permalink: string | null = null;
  try {
    const media = await graphGet(
      mediaId,
      { fields: "permalink" },
      account.accessToken
    );
    permalink = (media.permalink as string | undefined) ?? null;
  } catch {
    // permalink is nice-to-have — the publish itself succeeded
  }

  return { externalId: mediaId, permalink };
}

/**
 * Page writes must be made AS the Page (live incident 2026-09-25: every BWK
 * Facebook post failed with "(#200) Unpublished posts must be posted to a
 * page as the page itself" and "(#100) No permission to publish the video",
 * because META_BWK_ACCESS_TOKEN is a user/system-user token). Exchange the
 * account token for the Page's own token; if the account token already is a
 * Page token (Ripple), the same call just returns it. Cached per process.
 */
const pageTokenCache = new Map<string, string>();
async function fbPageToken(account: SocialAccount): Promise<string> {
  const pageId = account.fbPageId;
  if (!pageId) return account.accessToken;
  const hit = pageTokenCache.get(pageId);
  if (hit) return hit;
  try {
    const json = await graphGet(pageId, { fields: "access_token" }, account.accessToken);
    const token = typeof json.access_token === "string" ? json.access_token : null;
    if (token) {
      pageTokenCache.set(pageId, token);
      return token;
    }
  } catch (err) {
    console.warn(`[social-publish] Page token lookup failed for ${account.key}: ${err instanceof Error ? err.message : err}`);
  }
  return account.accessToken;
}

/**
 * Publish a multi-photo post to the Facebook Page: upload each photo
 * unpublished, then create one feed post attaching them all.
 */
export async function publishFbPhotoPost(
  account: SocialAccount,
  imageUrls: string[],
  caption: string
): Promise<PublishResult> {
  if (!account.fbPageId) {
    throw new Error(`FB page id not configured for account "${account.key}"`);
  }
  if (imageUrls.length === 0) throw new Error("No images to publish");
  const pageToken = await fbPageToken(account);

  const photoIds: string[] = [];
  for (const url of imageUrls) {
    const photo = await graphPost(
      `${account.fbPageId}/photos`,
      { url, published: "false" },
      pageToken
    );
    photoIds.push(String(photo.id));
    await sleep(500);
  }

  const params: Record<string, string> = { message: caption };
  photoIds.forEach((id, i) => {
    params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
  });
  const post = await graphPost(
    `${account.fbPageId}/feed`,
    params,
    pageToken
  );
  const postId = String(post.id);

  let permalink: string | null = null;
  try {
    const detail = await graphGet(
      postId,
      { fields: "permalink_url" },
      pageToken
    );
    permalink = (detail.permalink_url as string | undefined) ?? null;
  } catch {
    // nice-to-have only
  }

  return { externalId: postId, permalink };
}

/**
 * Publish a rendered slideshow video as an Instagram REEL. Same
 * container flow as carousels but with media_type=REELS; video
 * processing is slower than images, so the status poll gets a bigger
 * budget (40 × 5s ≈ 200s).
 */
export async function publishIgReel(
  account: SocialAccount,
  videoUrl: string,
  caption: string
): Promise<PublishResult> {
  if (!account.igUserId) {
    throw new Error(`IG user id not configured for account "${account.key}"`);
  }
  const container = await graphPost(
    `${account.igUserId}/media`,
    { media_type: "REELS", video_url: videoUrl, caption },
    account.accessToken
  );
  const creationId = String(container.id);

  await waitForContainer(creationId, account.accessToken, 40, 5000);

  const published = await graphPost(
    `${account.igUserId}/media_publish`,
    { creation_id: creationId },
    account.accessToken
  );
  const mediaId = String(published.id);

  let permalink: string | null = null;
  try {
    const media = await graphGet(
      mediaId,
      { fields: "permalink" },
      account.accessToken
    );
    permalink = (media.permalink as string | undefined) ?? null;
  } catch {
    // nice-to-have
  }
  return { externalId: mediaId, permalink };
}

/**
 * Publish the slideshow video to the Facebook Page as a REEL
 * (2026-09-23, per Keenan: "the fb carousels still look low quality").
 * The legacy /videos feed endpoint gives 9:16 uploads the old feed
 * player and Meta's harshest transcode — burned-in text turns to mush.
 * The Reels surface serves visibly better renditions of the exact same
 * master. Three-phase flow: start → hand Meta the hosted file_url →
 * finish/publish. Callers should fall back to publishFbVideo on error.
 */
export async function publishFbReel(
  account: SocialAccount,
  videoUrl: string,
  caption: string
): Promise<PublishResult> {
  if (!account.fbPageId) {
    throw new Error(`FB page id not configured for account "${account.key}"`);
  }
  const pageToken = await fbPageToken(account);

  const start = await graphPost(
    `${account.fbPageId}/video_reels`,
    { upload_phase: "start" },
    pageToken
  );
  const videoId = String(start.video_id ?? "");
  const uploadUrl = String(start.upload_url ?? "");
  if (!videoId || !uploadUrl) {
    throw new Error(
      `FB Reels start phase returned no video_id/upload_url: ${JSON.stringify(start).slice(0, 300)}`
    );
  }

  // Meta pulls the MP4 from Supabase itself — no byte upload from us.
  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${pageToken}`,
      file_url: videoUrl,
    },
  });
  const upJson = (await up.json().catch(() => ({}))) as {
    success?: boolean;
    debug_info?: unknown;
  };
  if (!up.ok || upJson.success !== true) {
    throw new Error(
      `FB Reels upload phase failed (HTTP ${up.status}): ${JSON.stringify(upJson).slice(0, 300)}`
    );
  }

  await graphPost(
    `${account.fbPageId}/video_reels`,
    {
      upload_phase: "finish",
      video_id: videoId,
      video_state: "PUBLISHED",
      description: caption,
    },
    pageToken
  );

  // Reel permalinks are deterministic; processing finishes async on
  // Meta's side (same fire-and-forget contract as publishFbVideo).
  return {
    externalId: videoId,
    permalink: `https://www.facebook.com/reel/${videoId}`,
  };
}

/**
 * Publish the same slideshow video to the Facebook Page as a video post
 * (file_url upload — Meta fetches the MP4 from Supabase itself).
 * Since 2026-09-23 this is the FALLBACK path — publishFbReel is
 * preferred (better renditions); this legacy feed-video endpoint stays
 * for when the Reels flow rejects a file.
 */
export async function publishFbVideo(
  account: SocialAccount,
  videoUrl: string,
  caption: string
): Promise<PublishResult> {
  if (!account.fbPageId) {
    throw new Error(`FB page id not configured for account "${account.key}"`);
  }
  const pageToken = await fbPageToken(account);
  const post = await graphPost(
    `${account.fbPageId}/videos`,
    { file_url: videoUrl, description: caption },
    pageToken
  );
  const videoId = String(post.id);

  let permalink: string | null = null;
  try {
    const detail = await graphGet(
      videoId,
      { fields: "permalink_url" },
      pageToken
    );
    const p = detail.permalink_url as string | undefined;
    // Video permalink_url comes back relative ("/{page}/videos/{id}/").
    permalink = p ? (p.startsWith("http") ? p : `https://www.facebook.com${p}`) : null;
  } catch {
    // nice-to-have
  }
  return { externalId: videoId, permalink };
}
