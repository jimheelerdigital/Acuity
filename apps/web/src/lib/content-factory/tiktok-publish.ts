/**
 * Content Factory — TikTok Content Posting API (2026-09-14, per Keenan:
 * "let's build the TikTok side out ... I've had a ton of success with
 * the TikTok side").
 *
 * PHASE 1 — INBOX DRAFTS. The cron uploads each rendered slideshow MP4
 * (the same file the IG Reel uses) to Keenan's TikTok INBOX as a draft
 * via the FILE_UPLOAD flow. He opens TikTok, the video is waiting in
 * notifications, he adds trending audio + the caption from the content
 * email, and posts. This deliberately keeps a human in the loop because
 * trending-sound selection is where his TikTok wins come from — and it
 * needs NO app audit (unaudited apps can upload drafts; direct posting
 * would be forced private until TikTok reviews the app).
 *
 * PHASE 2 (later, post-audit): direct publish with auto_add_music.
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

/** Inbox uploads cap at 64MB per chunk; our slideshows are a few MB. */
const MAX_VIDEO_BYTES = 64 * 1024 * 1024;

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

interface InboxInitResponse {
  data?: { publish_id?: string; upload_url?: string };
  error?: { code?: string; message?: string };
}

/**
 * Upload an MP4 to the user's TikTok inbox as a draft. Single-chunk
 * FILE_UPLOAD (our slideshow reels are a few MB, well under the 64MB
 * single-chunk cap). Returns the publish_id TikTok assigns.
 */
export async function uploadTikTokInboxDraft(
  accessToken: string,
  video: Buffer
): Promise<{ publishId: string }> {
  if (video.length === 0) throw new Error("Empty video buffer");
  if (video.length > MAX_VIDEO_BYTES) {
    throw new Error(
      `Video too large for single-chunk inbox upload (${video.length} bytes > 64MB)`
    );
  }

  const initRes = await fetch(`${OPEN_API}/post/publish/inbox/video/init/`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      source_info: {
        source: "FILE_UPLOAD",
        video_size: video.length,
        chunk_size: video.length,
        total_chunk_count: 1,
      },
    }),
  });
  const init = (await initRes.json()) as InboxInitResponse;
  if (
    !initRes.ok ||
    (init.error?.code && init.error.code !== "ok") ||
    !init.data?.upload_url ||
    !init.data.publish_id
  ) {
    throw new Error(
      `TikTok inbox init failed: ${init.error?.message ?? `HTTP ${initRes.status}`}`
    );
  }

  const putRes = await fetch(init.data.upload_url, {
    method: "PUT",
    headers: {
      "content-type": "video/mp4",
      "content-range": `bytes 0-${video.length - 1}/${video.length}`,
    },
    body: new Uint8Array(video),
  });
  if (!putRes.ok) {
    throw new Error(
      `TikTok video upload failed: HTTP ${putRes.status} ${await putRes
        .text()
        .then((t) => t.slice(0, 300))
        .catch(() => "")}`
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
