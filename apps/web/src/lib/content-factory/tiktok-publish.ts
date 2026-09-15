/**
 * Content Factory — TikTok Content Posting API (2026-09-14, per Keenan:
 * "let's build the TikTok side out ... I've had a ton of success with
 * the TikTok side").
 *
 * FORMAT SPLIT (2026-09-14, per Keenan): "tiktok = photo/slideshow
 * carousels with suggested audio over. instagram/facebook = video to
 * keep content intact." So TikTok gets PHOTO posts (up to 35 images),
 * never the rendered MP4s — TikTok's photo mode is also the only place
 * its auto/suggested music exists.
 *
 * PHASE 1 — INBOX DRAFTS. The cron sends each post's slide images to
 * Keenan's TikTok INBOX as a photo draft. He opens TikTok, the draft is
 * waiting, TikTok suggests audio in the editor, he adds the caption
 * from the content email and posts. Drafts need NO app audit (direct
 * posting is forced private until TikTok reviews the app).
 *
 * PHASE 2 (post-audit): DIRECT_POST with auto_add_music=true — fully
 * hands-off.
 *
 * URL RULE: photo posts only support PULL_FROM_URL, and TikTok only
 * pulls from the app's VERIFIED domain (goripple.io). Slide images live
 * on Supabase, so callers must pass URLs proxied through
 * /api/content-factory/image/... — see proxiedImageUrl().
 *
 * TOKENS: TikTok access tokens live 24h and the refresh token ROTATES
 * on every refresh, so they live in the SocialToken table (not env).
 * Env only holds the app identity: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET.
 * The one-time OAuth happens at /api/integrations/tiktok/connect.
 */

const OPEN_API = "https://open.tiktokapis.com/v2";
const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";

/** Scopes: user info for the "connected as" check, upload for drafts. */
export const TIKTOK_SCOPES = "user.info.basic,video.upload";

/** TikTok photo posts cap at 35 images. */
export const TIKTOK_MAX_PHOTOS = 35;

/** Refresh the access token when it has less than this long left. */
const REFRESH_MARGIN_MS = 10 * 60_000;

export function tiktokConfigured(): boolean {
  return Boolean(
    process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET
  );
}

export function tiktokAuthorizeUrl(redirectUri: string, state: string): string {
  const qs = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
    scope: TIKTOK_SCOPES,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
  });
  return `${AUTH_URL}?${qs}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  open_id?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(
  params: Record<string, string>
): Promise<TokenResponse> {
  const res = await fetch(`${OPEN_API}/oauth/token/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
      client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "",
      ...params,
    }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error || !json.access_token) {
    throw new Error(
      `TikTok token request failed: ${json.error_description ?? json.error ?? `HTTP ${res.status}`}`
    );
  }
  return json;
}

/** One-time code→token exchange (used by the OAuth callback). */
export async function exchangeTikTokCode(
  code: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  openId: string | null;
}> {
  const json = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  return {
    accessToken: json.access_token!,
    refreshToken: json.refresh_token ?? "",
    expiresAt: new Date(Date.now() + (json.expires_in ?? 86_400) * 1000),
    openId: json.open_id ?? null,
  };
}

/** display_name lookup for the "connected as X" confirmation page. */
export async function fetchTikTokDisplayName(
  accessToken: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `${OPEN_API}/user/info/?fields=open_id,display_name`,
      { headers: { authorization: `Bearer ${accessToken}` } }
    );
    const json = (await res.json()) as {
      data?: { user?: { display_name?: string } };
    };
    return json.data?.user?.display_name ?? null;
  } catch {
    return null;
  }
}

/**
 * Load a valid access token for the account, refreshing (and persisting
 * the ROTATED refresh token) when it's near expiry. Returns null when
 * the account was never connected — callers mark the row SKIPPED.
 * Throws when a refresh fails (token revoked → reconnect needed).
 */
export async function getTikTokAccessToken(
  accountKey: string
): Promise<string | null> {
  const { prisma } = await import("@/lib/prisma");
  const row = await prisma.socialToken.findUnique({
    where: { provider_accountKey: { provider: "tiktok", accountKey } },
  });
  if (!row) return null;

  if (row.expiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) {
    return row.accessToken;
  }

  try {
    const json = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: row.refreshToken,
    });
    const updated = await prisma.socialToken.update({
      where: { id: row.id },
      data: {
        accessToken: json.access_token!,
        // TikTok rotates refresh tokens — always store the returned one.
        refreshToken: json.refresh_token ?? row.refreshToken,
        expiresAt: new Date(Date.now() + (json.expires_in ?? 86_400) * 1000),
        lastError: null,
      },
    });
    return updated.accessToken;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.socialToken.update({
      where: { id: row.id },
      data: { lastError: message },
    });
    throw new Error(
      `TikTok token refresh failed (reconnect at /api/integrations/tiktok/connect): ${message}`
    );
  }
}

/**
 * Rewrite a Supabase public-storage image URL to the goripple.io proxy
 * (/api/content-factory/image/...) so TikTok's PULL_FROM_URL accepts it
 * (it only pulls from the app's verified domain). Non-Supabase URLs are
 * returned untouched.
 */
export function proxiedImageUrl(imageUrl: string): string {
  const marker = "/storage/v1/object/public/content-factory/";
  const idx = imageUrl.indexOf(marker);
  if (idx === -1) return imageUrl;
  const base = (
    process.env.NEXTAUTH_URL ??
    process.env.APP_URL ??
    "https://goripple.io"
  ).replace(/\/$/, "");
  return `${base}/api/content-factory/image/${imageUrl.slice(idx + marker.length)}`;
}

/**
 * Send a photo slideshow to the user's TikTok inbox as a draft
 * (post_mode MEDIA_UPLOAD). TikTok pulls the images itself, the draft
 * shows up in the app where TikTok's editor suggests audio. Returns
 * the publish_id.
 */
export async function publishTikTokPhotoDraft(
  accessToken: string,
  imageUrls: string[],
  title: string
): Promise<{ publishId: string }> {
  const photos = imageUrls.slice(0, TIKTOK_MAX_PHOTOS).map(proxiedImageUrl);
  if (photos.length === 0) throw new Error("No images to publish");

  const initRes = await fetch(`${OPEN_API}/post/publish/content/init/`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      post_info: {
        title: title.slice(0, 90),
      },
      source_info: {
        source: "PULL_FROM_URL",
        photo_images: photos,
        photo_cover_index: 0,
      },
      post_mode: "MEDIA_UPLOAD",
      media_type: "PHOTO",
    }),
  });
  const init = (await initRes.json()) as {
    data?: { publish_id?: string };
    error?: { code?: string; message?: string };
  };
  if (
    !initRes.ok ||
    (init.error?.code && init.error.code !== "ok") ||
    !init.data?.publish_id
  ) {
    throw new Error(
      `TikTok photo draft init failed: ${init.error?.message ?? `HTTP ${initRes.status}`}`
    );
  }
  return { publishId: init.data.publish_id };
}

/**
 * One status check after upload — catches immediate rejections
 * (format/duration violations) so they land in the queue row's error
 * column instead of silently never appearing in the inbox.
 */
export async function fetchTikTokPublishStatus(
  accessToken: string,
  publishId: string
): Promise<{ status: string; failReason: string | null }> {
  const res = await fetch(`${OPEN_API}/post/publish/status/fetch/`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ publish_id: publishId }),
  });
  const json = (await res.json()) as {
    data?: { status?: string; fail_reason?: string };
    error?: { code?: string; message?: string };
  };
  if (!res.ok || (json.error?.code && json.error.code !== "ok")) {
    throw new Error(
      `TikTok status fetch failed: ${json.error?.message ?? `HTTP ${res.status}`}`
    );
  }
  return {
    status: json.data?.status ?? "UNKNOWN",
    failReason: json.data?.fail_reason ?? null,
  };
}
