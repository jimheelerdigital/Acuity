/**
 * Content Factory — Threads auto-publishing (2026-09-23).
 *
 * Every post that goes to Instagram also goes to Threads: the same 4:5
 * feed images as a carousel (Threads allows up to 20 items), or the
 * rendered slideshow MP4 as a single VIDEO post for reel lanes. Same
 * container → poll → publish flow as IG, against graph.threads.net.
 *
 * Env (per brand, trimmed — see env() in social-publish.ts):
 *   THREADS_RIPPLE_USER_ID / THREADS_RIPPLE_ACCESS_TOKEN
 *   THREADS_BWK_USER_ID / THREADS_BWK_ACCESS_TOKEN
 * A brand without both gets no threads rows at all.
 *
 * TOKEN LIFETIME: long-lived Threads tokens last 60 days. Refresh before
 * expiry (GET graph.threads.net/refresh_access_token?grant_type=
 * th_refresh_token) and update the Vercel env var — an expired token
 * shows up as FAILED threads rows with an OAuth error.
 */

import { env, type PublishResult, type SocialAccountKey } from "./social-publish";

const THREADS = "https://graph.threads.net/v1.0";

export const THREADS_MAX_CAROUSEL_ITEMS = 20;
/** Threads post text limit. */
export const THREADS_TEXT_MAX = 500;

export interface ThreadsAccount {
  key: SocialAccountKey;
  userId: string;
  accessToken: string;
}

export function threadsAccount(brand: SocialAccountKey): ThreadsAccount | null {
  const prefix = brand === "bwk" ? "THREADS_BWK" : "THREADS_RIPPLE";
  const userId = env(`${prefix}_USER_ID`);
  const accessToken = env(`${prefix}_ACCESS_TOKEN`);
  if (!userId || !accessToken) return null;
  return { key: brand, userId, accessToken };
}

const isTagLine = (l: string) => /^(#[\p{L}\p{N}_]+\s*)+$/u.test(l.trim());

/**
 * Fit the caption to Threads. Threads links only ONE topic tag per post
 * (extra #tags render as plain text), so the hashtag line collapses to
 * its first tag. Over 500 chars, whole lines drop from the bottom of the
 * body — never mid-line — while the question line (the comment trigger)
 * is kept; a single over-long line is cut at a word boundary as a last
 * resort.
 */
export function fitThreadsText(caption: string): string {
  const lines = caption.split("\n");
  const firstTag = lines.find(isTagLine)?.trim().split(/\s+/)[0] ?? null;
  const body = lines.filter((l) => !isTagLine(l));
  while (body.length && !body[body.length - 1].trim()) body.pop();

  const assemble = (b: string[]) =>
    [b.join("\n").replace(/\n{3,}/g, "\n\n").trim(), firstTag]
      .filter(Boolean)
      .join("\n\n");
  let text = assemble(body);
  if (text.length <= THREADS_TEXT_MAX) return text;

  // Drop whole lines bottom-up, sparing the opening line and the
  // question, until it fits.
  let qIdx = -1;
  for (let i = body.length - 1; i >= 0; i--) {
    if (body[i].trim().endsWith("?")) {
      qIdx = i;
      break;
    }
  }
  const kept = [...body];
  for (let i = kept.length - 1; i > 0 && assemble(kept).length > THREADS_TEXT_MAX; i--) {
    if (i === qIdx) continue;
    kept.splice(i, 1);
    if (i < qIdx) qIdx--;
  }
  text = assemble(kept);
  if (text.length <= THREADS_TEXT_MAX) return text;

  const cut = text.slice(0, THREADS_TEXT_MAX - 1);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > THREADS_TEXT_MAX / 2 ? cut.slice(0, atWord) : cut).trimEnd()}…`;
}

async function threadsCall(
  method: "GET" | "POST",
  path: string,
  params: Record<string, string>,
  accessToken: string
): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ ...params, access_token: accessToken });
  const res =
    method === "POST"
      ? await fetch(`${THREADS}/${path}`, { method: "POST", body: qs })
      : await fetch(`${THREADS}/${path}?${qs}`);
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    [k: string]: unknown;
  };
  if (!res.ok || json.error) {
    throw new Error(
      `Threads API ${method} ${path} failed: ${json.error?.message ?? `HTTP ${res.status}`}`
    );
  }
  return json;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait for a Threads container to finish processing (status FINISHED). */
async function waitForThreadsContainer(
  containerId: string,
  accessToken: string,
  attempts = 20,
  intervalMs = 3000
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const json = await threadsCall(
      "GET",
      containerId,
      { fields: "status,error_message" },
      accessToken
    );
    const status = json.status as string | undefined;
    if (status === "FINISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(
        `Threads container ${containerId} status: ${status}${json.error_message ? ` — ${json.error_message}` : ""}`
      );
    }
    await sleep(intervalMs);
  }
  throw new Error(`Threads container ${containerId} never reached FINISHED`);
}

async function publishContainer(
  account: ThreadsAccount,
  creationId: string
): Promise<PublishResult> {
  const published = await threadsCall(
    "POST",
    `${account.userId}/threads_publish`,
    { creation_id: creationId },
    account.accessToken
  );
  const mediaId = String(published.id);

  let permalink: string | null = null;
  try {
    const media = await threadsCall(
      "GET",
      mediaId,
      { fields: "permalink" },
      account.accessToken
    );
    permalink = (media.permalink as string | undefined) ?? null;
  } catch {
    // nice-to-have — the publish itself succeeded
  }
  return { externalId: mediaId, permalink };
}

/**
 * Image carousel (2-20 items): one is_carousel_item container per image,
 * then a CAROUSEL container with children + text, then threads_publish.
 * A single image posts as a plain IMAGE container.
 */
export async function publishThreadsCarousel(
  account: ThreadsAccount,
  imageUrls: string[],
  caption: string
): Promise<PublishResult> {
  const urls = imageUrls.slice(0, THREADS_MAX_CAROUSEL_ITEMS);
  if (urls.length === 0) throw new Error("No images to publish");
  const text = fitThreadsText(caption);

  let creationId: string;
  if (urls.length === 1) {
    const single = await threadsCall(
      "POST",
      `${account.userId}/threads`,
      { media_type: "IMAGE", image_url: urls[0], text },
      account.accessToken
    );
    creationId = String(single.id);
  } else {
    const childIds: string[] = [];
    for (const url of urls) {
      const child = await threadsCall(
        "POST",
        `${account.userId}/threads`,
        { media_type: "IMAGE", image_url: url, is_carousel_item: "true" },
        account.accessToken
      );
      childIds.push(String(child.id));
      await sleep(500); // stay friendly with rate limits
    }
    const carousel = await threadsCall(
      "POST",
      `${account.userId}/threads`,
      { media_type: "CAROUSEL", children: childIds.join(","), text },
      account.accessToken
    );
    creationId = String(carousel.id);
  }

  await waitForThreadsContainer(creationId, account.accessToken);
  return publishContainer(account, creationId);
}

/**
 * Rendered slideshow MP4 as a single VIDEO post. Video processing is
 * slower than images, so the poll gets the IG-reel budget (40 × 5s).
 */
export async function publishThreadsVideo(
  account: ThreadsAccount,
  videoUrl: string,
  caption: string
): Promise<PublishResult> {
  const container = await threadsCall(
    "POST",
    `${account.userId}/threads`,
    { media_type: "VIDEO", video_url: videoUrl, text: fitThreadsText(caption) },
    account.accessToken
  );
  const creationId = String(container.id);
  await waitForThreadsContainer(creationId, account.accessToken, 40, 5000);
  return publishContainer(account, creationId);
}
