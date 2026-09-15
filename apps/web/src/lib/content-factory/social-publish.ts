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
 * - "bwk" — optional, for when Build With Key gets its own IG/FB:
 *     META_BWK_ACCESS_TOKEN, META_BWK_IG_USER_ID, META_BWK_FB_PAGE_ID
 *   Until those exist, BWK lanes FALL BACK to the Ripple account
 *   (Keenan's call 2026-09-10 — capture all markets from one page until
 *   dedicated BWK accounts are set up).
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

export type SocialAccountKey = "ripple" | "bwk";
export type SocialPlatform = "instagram" | "facebook" | "tiktok";

export interface SocialAccount {
  key: SocialAccountKey;
  accessToken: string;
  igUserId: string | null;
  fbPageId: string | null;
}

export function autoPublishEnabled(): boolean {
  return process.env.SOCIAL_AUTOPUBLISH_ENABLED === "1";
}

function rippleAccount(): SocialAccount | null {
  const accessToken = process.env.IG_ACCESS_TOKEN;
  if (!accessToken) return null;
  return {
    key: "ripple",
    accessToken,
    igUserId: process.env.IG_USER_ID ?? null,
    fbPageId: process.env.FB_PAGE_ID ?? null,
  };
}

function bwkAccount(): SocialAccount | null {
  const accessToken = process.env.META_BWK_ACCESS_TOKEN;
  if (!accessToken) return null;
  return {
    key: "bwk",
    accessToken,
    igUserId: process.env.META_BWK_IG_USER_ID ?? null,
    fbPageId: process.env.META_BWK_FB_PAGE_ID ?? null,
  };
}

/**
 * Which Meta account a lane posts to. BWK lanes prefer the dedicated BWK
 * account but fall back to Ripple until one exists.
 */
export function resolveAccount(lane: string | null): SocialAccount | null {
  const isBwk = (BWK_LANES as readonly string[]).includes(lane ?? "");
  if (isBwk) {
    const bwk = bwkAccount();
    if (bwk) return bwk;
  }
  return rippleAccount();
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
