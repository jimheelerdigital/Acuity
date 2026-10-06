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
 *   YOUTUBE_RIPPLE_REFRESH_TOKEN / YOUTUBE_BWK_REFRESH_TOKEN /
 *   YOUTUBE_MYTHICALS_REFRESH_TOKEN — one per channel
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
  // One channel per brand (2026-10-05: Mythicals got its own channel; it
  // used to fall through to Ripple's token).
  const TOKEN_ENV: Record<SocialAccountKey, string> = {
    ripple: "YOUTUBE_RIPPLE_REFRESH_TOKEN",
    bwk: "YOUTUBE_BWK_REFRESH_TOKEN",
    mythicals: "YOUTUBE_MYTHICALS_REFRESH_TOKEN",
  };
  const refreshToken = env(TOKEN_ENV[brand]);
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
 * Category per brand (2026-10-06): Legendary Mythicals is Entertainment (24);
 * Ripple / BWK stay People & Blogs (22).
 */
export function youtubeCategory(brand: SocialAccountKey): string {
  return brand === "mythicals" ? "24" : "22";
}

/**
 * Description per brand (2026-10-06, after the channel's advanced-features
 * verification made description links clickable): Mythicals adds the quiz
 * link, the brand's one funnel, above the hashtags.
 */
export function youtubeDescription(brand: SocialAccountKey, caption: string): string {
  const body = clean(caption);
  const link = brand === "mythicals" ? "Which legendary creature are you? Take the quiz: https://legendarymythicals.com/quiz" : "";
  const text = link ? `${link}\n\n${body}` : body;
  return text.slice(0, DESCRIPTION_MAX);
}

/**
 * Upload the rendered reel MP4 as a public Short. Returns the video id +
 * the /shorts/ permalink.
 */
export async function publishYoutubeShort(
  account: YoutubeAccount,
  videoUrl: string,
  opts: { headline: string | null; caption: string; coverUrl?: string | null }
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
        description: youtubeDescription(account.key, opts.caption),
        categoryId: youtubeCategory(account.key),
        ...(tags.length ? { tags } : {}),
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
        // Altered/synthetic content disclosure (2026-10-06, per Keenan): our
        // visuals and animation are AI-generated and realistic, which YouTube
        // requires creators to disclose.
        containsSyntheticMedia: true,
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
  if (opts.coverUrl) await setThumbnail(token, json.id, opts.coverUrl);
  return {
    externalId: json.id,
    permalink: `https://www.youtube.com/shorts/${json.id}`,
  };
}

/**
 * Custom thumbnail = the post's titled cover slide (2026-10-05, per Keenan:
 * "upload true cover photos for all posts on instagram and youtube").
 * thumbnails.set (50 units, youtube.upload scope). YouTube only accepts
 * custom thumbnails from phone-verified channels, and custom Shorts
 * thumbnails are rolling out to Partner Program channels first, so this
 * fails open: a refusal is logged and the Short stays up.
 */
async function setThumbnail(token: string, videoId: string, coverUrl: string): Promise<void> {
  // Result beside the upload so ops can see it without Inngest logs
  // (2026-10-05: the first prod thumbnails silently didn't stick).
  const note = async (status: Record<string, unknown>) => {
    try {
      const { supabase } = await import("@/lib/supabase.server");
      await supabase.storage
        .from("content-factory")
        .upload(`youtube-thumbs/${videoId}.json`, Buffer.from(JSON.stringify({ at: new Date().toISOString(), coverUrl, ...status })), {
          contentType: "application/json",
          upsert: true,
        });
    } catch {
      // status is best-effort
    }
  };
  try {
    const res = await fetch(coverUrl);
    if (!res.ok) throw new Error(`cover download HTTP ${res.status}`);
    const { default: sharp } = await import("sharp");
    // YouTube caps thumbnails at 2 MB.
    const jpg = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(1080, 1920, { fit: "cover" })
      .jpeg({ quality: 82 })
      .toBuffer();
    const up = await fetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`,
      { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" }, body: jpg }
    );
    if (!up.ok) throw new Error(`HTTP ${up.status}: ${(await up.text().catch(() => "")).slice(0, 300)}`);
    console.log(`[youtube-publish] thumbnail set for ${videoId}`);
    await note({ ok: true });
  } catch (err) {
    console.warn(`[youtube-publish] thumbnail not set for ${videoId} (Short is live): ${err instanceof Error ? err.message : err}`);
    await note({ ok: false, error: String(err instanceof Error ? err.message : err).slice(0, 500) });
  }
}

/**
 * Bring an already-posted Short up to the current settings (2026-10-06,
 * after advanced-features verification): re-apply the cover thumbnail, and
 * update description (quiz link), category and the AI disclosure. The
 * metadata update needs the full "youtube" scope; with an upload-only token
 * it fails and is reported, while the thumbnail (upload scope) still applies.
 */
export async function refreshShortMetadata(
  account: YoutubeAccount,
  videoId: string,
  opts: { headline: string | null; caption: string; coverUrl?: string | null }
): Promise<{ metadata: string; thumbnail: string }> {
  const token = await accessToken(account);
  const tags = (opts.caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.slice(1));
  let metadata = "ok";
  try {
    const res = await fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet,status", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({
        id: videoId,
        snippet: {
          title: shortsTitle(opts.headline),
          description: youtubeDescription(account.key, opts.caption),
          categoryId: youtubeCategory(account.key),
          ...(tags.length ? { tags } : {}),
        },
        status: { privacyStatus: "public", selfDeclaredMadeForKids: false, containsSyntheticMedia: true },
      }),
    });
    if (!res.ok) metadata = `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
  } catch (err) {
    metadata = err instanceof Error ? err.message : String(err);
  }
  let thumbnail = "skipped (no cover)";
  if (opts.coverUrl) {
    await setThumbnail(token, videoId, opts.coverUrl);
    const { supabase } = await import("@/lib/supabase.server");
    const { data } = await supabase.storage.from("content-factory").download(`youtube-thumbs/${videoId}.json`);
    thumbnail = data ? ((JSON.parse(await data.text()) as { ok?: boolean; error?: string }).ok ? "ok" : `failed: ${(JSON.parse(await data.text()) as { error?: string }).error?.slice(0, 160)}`) : "unknown";
  }
  return { metadata, thumbnail };
}
