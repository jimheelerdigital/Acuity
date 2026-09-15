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

export function laneWantsReel(lane: string | null): boolean {
  return (REEL_LANES as readonly string[]).includes(lane ?? "");
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

export type SocialAccountKey = "ripple" | "bwk";
export type SocialPlatform = "instagram" | "facebook" | "tiktok";

// ─── Prime-time scheduling (2026-09-15, per Keenan: "make sure ALL
// posts on social media are at prime time social media hours for the
// US") ───────────────────────────────────────────────────────────────
// Windows are EASTERN time (~47% of the US lives in ET; Central lags by
// one hour, so ET windows serve both coasts' peaks). Sources: Sprout
// Social 2026 (2B engagements), Buffer 2026 (7M TikTok posts):
// - Instagram peaks 9am-1pm + 5-7pm ET weekdays → 11am-7pm window
// - Facebook peaks 8am-1pm ET, dead after 6pm → 9am-6pm window
// - TikTok rows are INBOX DRAFT deliveries, not posts — Keenan posts
//   them by hand through the day, so they all land FIRST THING IN THE
//   MORNING (7-10am ET = 6-9am CT, per Keenan 2026-09-15: "tiktok i
//   want first thing in the morning so i can go in throughout the day
//   to post them"). Short stagger — delivery time isn't engagement
//   time.
export const PLATFORM_WINDOWS: Record<
  SocialPlatform,
  { openMin: number; closeMin: number; staggerMs: number }
> = {
  instagram: { openMin: 11 * 60, closeMin: 19 * 60, staggerMs: 50 * 60_000 },
  facebook: { openMin: 9 * 60, closeMin: 18 * 60, staggerMs: 50 * 60_000 },
  tiktok: { openMin: 7 * 60, closeMin: 10 * 60, staggerMs: 5 * 60_000 },
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
function env(name: string): string | null {
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
 * Which Meta account a lane posts to. BWK lanes use ONLY the dedicated
 * BWK account — null until META_BWK_* creds exist, which means no IG/FB
 * for BWK (men's content must never land on Ripple's women-audience
 * pages; TikTok is BWK's only live platform for now).
 */
export function resolveAccount(lane: string | null): SocialAccount | null {
  const isBwk = (BWK_LANES as readonly string[]).includes(lane ?? "");
  return isBwk ? bwkAccount() : rippleAccount();
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

  const photoIds: string[] = [];
  for (const url of imageUrls) {
    const photo = await graphPost(
      `${account.fbPageId}/photos`,
      { url, published: "false" },
      account.accessToken
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
    account.accessToken
  );
  const postId = String(post.id);

  let permalink: string | null = null;
  try {
    const detail = await graphGet(
      postId,
      { fields: "permalink_url" },
      account.accessToken
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
 * Publish the same slideshow video to the Facebook Page as a video post
 * (file_url upload — Meta fetches the MP4 from Supabase itself).
 */
export async function publishFbVideo(
  account: SocialAccount,
  videoUrl: string,
  caption: string
): Promise<PublishResult> {
  if (!account.fbPageId) {
    throw new Error(`FB page id not configured for account "${account.key}"`);
  }
  const post = await graphPost(
    `${account.fbPageId}/videos`,
    { file_url: videoUrl, description: caption },
    account.accessToken
  );
  const videoId = String(post.id);

  let permalink: string | null = null;
  try {
    const detail = await graphGet(
      videoId,
      { fields: "permalink_url" },
      account.accessToken
    );
    const p = detail.permalink_url as string | undefined;
    // Video permalink_url comes back relative ("/{page}/videos/{id}/").
    permalink = p ? (p.startsWith("http") ? p : `https://www.facebook.com${p}`) : null;
  } catch {
    // nice-to-have
  }
  return { externalId: videoId, permalink };
}
