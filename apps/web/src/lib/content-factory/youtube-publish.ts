/**
 * Content Factory — YouTube Shorts auto-publishing (2026-09-23).
 *
 * Every post that already renders a slideshow Reel MP4 (REEL_LANES — see
 * social-publish.ts) also goes up as a YouTube Short. Plain fetch against
 * the YouTube Data API v3 — no googleapis SDK:
 *   1. refresh token → short-lived access token (oauth2.googleapis.com)
 *   2. open a resumable upload session (snippet + status metadata)
 *   3. PUT the MP4 bytes (downloaded from Supabase) to the session URL
 *
 * Shorts detection is automatic for vertical videos ≤3 min; the reels
 * are 1080x1920 and ~40s max (≤11 slides × 3.5s), and the " #shorts"
 * title suffix is belt-and-braces.
 *
 * Env (all trimmed — see env() in social-publish.ts):
 *   YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET — one OAuth client, shared
 *   YOUTUBE_RIPPLE_REFRESH_TOKEN / YOUTUBE_BWK_REFRESH_TOKEN — per channel
 * A brand without all three gets no youtube rows at all.
 *
 * QUOTA: default 10,000 units/day per Cloud project, ~1,600 per upload
 * → ~6 uploads/day across BOTH channels. Unverified (un-audited) API
 * projects get uploads locked to private regardless of privacyStatus.
 */

import { env, type PublishResult, type SocialAccountKey } from "./social-publish";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

/** YouTube title cap is 100 chars; the suffix counts toward it. */
const TITLE_MAX = 100;
const SHORTS_SUFFIX = " #shorts";
/** Description cap is 5000 bytes — chars is close enough with headroom. */
const DESCRIPTION_MAX = 4900;

export interface YoutubeAccount {
  key: SocialAccountKey;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export function youtubeAccount(brand: SocialAccountKey): YoutubeAccount | null {
  const clientId = env("YOUTUBE_CLIENT_ID");
  const clientSecret = env("YOUTUBE_CLIENT_SECRET");
  const refreshToken = env(
    brand === "bwk" ? "YOUTUBE_BWK_REFRESH_TOKEN" : "YOUTUBE_RIPPLE_REFRESH_TOKEN"
  );
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { key: brand, clientId, clientSecret, refreshToken };
}

/** YouTube rejects "<" and ">" anywhere in title/description. */
function clean(s: string): string {
  return s.replace(/[<>]/g, "");
}

/** Headline → Shorts title, cut at a word boundary to fit the suffix. */
export function shortsTitle(headline: string | null): string {
  const base = clean(headline ?? "").replace(/\s+/g, " ").trim() || "New post";
  const room = TITLE_MAX - SHORTS_SUFFIX.length;
  if (base.length <= room) return base + SHORTS_SUFFIX;
  const cut = base.slice(0, room - 1);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > room / 2 ? cut.slice(0, atWord) : cut).trimEnd()}…${SHORTS_SUFFIX}`;
}

async function accessToken(account: YoutubeAccount): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      client_id: account.clientId,
      client_secret: account.clientSecret,
      refresh_token: account.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    // invalid_grant = refresh token revoked/expired (Testing-mode OAuth
    // apps expire refresh tokens after 7 days — publish the app).
    throw new Error(
      `YouTube token refresh failed for "${account.key}": ${json.error ?? `HTTP ${res.status}`}${json.error_description ? ` — ${json.error_description}` : ""}`
    );
  }
  return json.access_token;
}

/**
 * Upload the rendered reel MP4 as a public Short. Returns the video id +
 * the /shorts/ permalink.
 */
export async function publishYoutubeShort(
  account: YoutubeAccount,
  videoUrl: string,
  opts: { headline: string | null; caption: string }
): Promise<PublishResult> {
  const video = await fetch(videoUrl);
  if (!video.ok) {
    throw new Error(`Reel download failed (HTTP ${video.status}): ${videoUrl}`);
  }
  const bytes = await video.arrayBuffer();

  const token = await accessToken(account);
  const tags = (opts.caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.slice(1));

  const session = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(bytes.byteLength),
    },
    body: JSON.stringify({
      snippet: {
        title: shortsTitle(opts.headline),
        description: clean(opts.caption).slice(0, DESCRIPTION_MAX),
        categoryId: "22", // People & Blogs
        ...(tags.length ? { tags } : {}),
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
      },
    }),
  });
  const uploadUri = session.headers.get("location");
  if (!session.ok || !uploadUri) {
    const detail = await session.text().catch(() => "");
    // quotaExceeded / uploadLimitExceeded surface here.
    throw new Error(
      `YouTube upload session failed (HTTP ${session.status}): ${detail.slice(0, 300)}`
    );
  }

  const put = await fetch(uploadUri, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4" },
    body: bytes,
  });
  const json = (await put.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };
  if (!put.ok || !json.id) {
    throw new Error(
      `YouTube upload failed (HTTP ${put.status}): ${json.error?.message ?? JSON.stringify(json).slice(0, 300)}`
    );
  }
  return {
    externalId: json.id,
    permalink: `https://www.youtube.com/shorts/${json.id}`,
  };
}
