/**
 * Google Calendar direct sign-in (2026-10-28) — OAuth, token storage and
 * connection state for the server-side "google" calendar provider.
 *
 * The person connects Google Calendar once (web /account, or the app's
 * calendar settings, which opens this same web flow in a browser sheet).
 * The server keeps an encrypted refresh token in CalendarConnection
 * (provider "google") and writes task events itself through the Google
 * Calendar API (lib/calendar/google-calendar-executor.ts). No phone needed.
 *
 * Not the same as the older read-only Google flow (lib/calendar/oauth.ts,
 * calendar.readonly, User.googleCalendar*, kill-switched). That one READS
 * events for entry context; this one WRITES task events. Separate tokens,
 * separate consent, so turning one on never widens the other.
 *
 * Scope: calendar.events only (create/update/delete events, least
 * privilege for writing tasks), plus openid + email to identify which
 * Google account was connected. calendar.events can't list calendars, so
 * events go to the account's "primary" calendar.
 *
 * Gated by the calendar_google_direct feature flag (fails closed) and the
 * canSyncCalendar entitlement.
 *
 * Redirect URIs to register on the Google OAuth client:
 *   https://goripple.io/api/integrations/calendar/google/callback
 *   http://localhost:3000/api/integrations/calendar/google/callback
 */

import { randomBytes } from "crypto";

import type { PrismaClient } from "@prisma/client";

import { decryptToken, encryptToken } from "@/lib/calendar/encryption";
import { signStatePayload, verifyStatePayload } from "@/lib/calendar/oauth";

export const GOOGLE_PROVIDER = "google" as const;
export const GOOGLE_DIRECT_FLAG = "calendar_google_direct" as const;
export const GOOGLE_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const GOOGLE_DIRECT_SCOPES = ["openid", "email", GOOGLE_EVENTS_SCOPE];
/** Calendar the events go to. calendar.events can't list calendars. */
export const GOOGLE_TARGET_CALENDAR = "primary";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const STATE_PURPOSE = "gcal_direct";
/** Refresh this long before Google's stated expiry. */
const ACCESS_TOKEN_SKEW_MS = 60_000;

export type FetchLike = typeof fetch;

/** Where the callback sends the person afterwards. */
export type ReturnTarget = "web" | "app";
/** App deep link (app.json scheme "acuity"); the app's openAuthSessionAsync waits for it. */
export const APP_RETURN_URL = "acuity://integrations";

/**
 * Thrown when Google says the refresh token is dead (revoked by the person,
 * password change, 6 months unused, scope removed) or the stored ciphertext
 * can't be decrypted. Callers mark the connection disconnected.
 */
export class GoogleAuthRevokedError extends Error {
  constructor(public readonly reason: string) {
    super(`google_auth_revoked:${reason}`);
    this.name = "GoogleAuthRevokedError";
  }
}

function clientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("google-direct: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing");
  }
  return { clientId, clientSecret };
}

export function googleDirectRedirectUri(): string {
  const base = process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? "https://goripple.io";
  return `${base.replace(/\/$/, "")}/api/integrations/calendar/google/callback`;
}

// ─── State ──────────────────────────────────────────────────────────

export function signGoogleDirectState(userId: string, ret: ReturnTarget): string {
  return signStatePayload({
    purpose: STATE_PURPOSE,
    userId,
    ret,
    issuedAt: Date.now(),
    nonce: randomBytes(8).toString("hex"),
  });
}

/** userId + return target, or null on tamper / expiry / wrong flow. */
export function verifyGoogleDirectState(
  state: string
): { userId: string; ret: ReturnTarget } | null {
  const p = verifyStatePayload(state);
  if (!p || p.purpose !== STATE_PURPOSE) return null;
  if (typeof p.userId !== "string" || !p.userId) return null;
  return { userId: p.userId, ret: p.ret === "app" ? "app" : "web" };
}

/**
 * Consent URL. `access_type=offline` + `prompt=consent` so Google always
 * returns a refresh token (it omits it on re-consent otherwise).
 * `include_granted_scopes` is deliberately NOT set: this connection should
 * carry only the scopes asked for here, not the sign-in or read-only ones.
 */
export function buildGoogleDirectAuthUrl(state: string, loginHint?: string | null): string {
  const { clientId } = clientCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleDirectRedirectUri(),
    response_type: "code",
    scope: GOOGLE_DIRECT_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

// ─── Token endpoint ─────────────────────────────────────────────────

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

async function postToken(fetchImpl: FetchLike, body: Record<string, string>) {
  const res = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  return { status: res.status, ok: res.ok, json };
}

/**
 * The id_token comes straight from Google's token endpoint over TLS, so
 * per OpenID Connect Core §3.1.3.7 its signature needn't be re-checked;
 * we only read `sub` + `email` from it.
 */
export function decodeIdTokenClaims(idToken: string | undefined): { sub: string | null; email: string | null } {
  if (!idToken) return { sub: null, email: null };
  try {
    const part = idToken.split(".")[1];
    const claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as {
      sub?: unknown;
      email?: unknown;
    };
    return {
      sub: typeof claims.sub === "string" ? claims.sub : null,
      email: typeof claims.email === "string" ? claims.email : null,
    };
  } catch {
    return { sub: null, email: null };
  }
}

export type GoogleDirectTokens = {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  grantedScopes: string[];
  sub: string | null;
  email: string | null;
};

export async function exchangeGoogleDirectCode(
  code: string,
  fetchImpl: FetchLike = fetch,
  now: Date = new Date()
): Promise<GoogleDirectTokens> {
  const { clientId, clientSecret } = clientCredentials();
  const { ok, status, json } = await postToken(fetchImpl, {
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: googleDirectRedirectUri(),
    grant_type: "authorization_code",
  });
  if (!ok) {
    throw new Error(`google-direct: code exchange failed (${status} ${json.error ?? "unknown"})`);
  }
  const { sub, email } = decodeIdTokenClaims(json.id_token);
  return {
    accessToken: json.access_token ?? null,
    refreshToken: json.refresh_token ?? null,
    expiresAt:
      typeof json.expires_in === "number"
        ? new Date(now.getTime() + json.expires_in * 1000)
        : null,
    grantedScopes: (json.scope ?? "").split(/\s+/).filter(Boolean),
    sub,
    email,
  };
}

/** Best-effort revoke at Google. A dangling grant beats a stuck user. */
export async function revokeGoogleToken(token: string, fetchImpl: FetchLike = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Stored connection + access tokens ──────────────────────────────

type ConnectionDb = Pick<PrismaClient, "calendarConnection">;

/**
 * A valid access token for the person's Google connection, refreshing it
 * (and persisting the new one, encrypted) when it's missing or about to
 * expire. Pass `forceRefresh` after a 401 from the Calendar API.
 *
 * Throws GoogleAuthRevokedError when there's no usable refresh token or
 * Google answers `invalid_grant`. Any other failure (network, 5xx) throws a
 * plain Error, which the executor treats as retryable.
 */
export async function getGoogleAccessToken(
  db: ConnectionDb,
  userId: string,
  opts: { fetchImpl?: FetchLike; now?: Date; forceRefresh?: boolean } = {}
): Promise<string> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  const conn = await db.calendarConnection.findUnique({
    where: { userId_provider: { userId, provider: GOOGLE_PROVIDER } },
    select: { id: true, accessToken: true, refreshToken: true, tokenExpiresAt: true },
  });
  if (!conn?.refreshToken) throw new GoogleAuthRevokedError("no_refresh_token");

  if (
    !opts.forceRefresh &&
    conn.accessToken &&
    conn.tokenExpiresAt &&
    conn.tokenExpiresAt.getTime() - ACCESS_TOKEN_SKEW_MS > now.getTime()
  ) {
    const cached = decryptToken(conn.accessToken);
    if (cached) return cached;
  }

  const refreshToken = decryptToken(conn.refreshToken);
  if (!refreshToken) throw new GoogleAuthRevokedError("undecryptable");

  const { clientId, clientSecret } = clientCredentials();
  const { ok, status, json } = await postToken(fetchImpl, {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  if (!ok || !json.access_token) {
    // invalid_grant = revoked / expired / password reset. unauthorized_client
    // can mean the OAuth client was deleted or the scope pulled; both need
    // the person to reconnect.
    if (json.error === "invalid_grant" || json.error === "unauthorized_client") {
      throw new GoogleAuthRevokedError(json.error);
    }
    throw new Error(`google-direct: token refresh failed (${status} ${json.error ?? "unknown"})`);
  }

  const expiresAt = new Date(now.getTime() + (json.expires_in ?? 3600) * 1000);
  await db.calendarConnection.update({
    where: { id: conn.id },
    data: {
      accessToken: encryptToken(json.access_token),
      tokenExpiresAt: expiresAt,
      // Google normally keeps the same refresh token; store a new one if sent.
      ...(json.refresh_token ? { refreshToken: encryptToken(json.refresh_token) } : {}),
      lastError: null,
      lastErrorAt: null,
    },
  });
  return json.access_token;
}

// ─── Connection lifecycle ───────────────────────────────────────────

type QueueDb = Pick<PrismaClient, "user" | "task" | "calendarDeletion">;

/**
 * Stop calendar sync for this person: clear the connected provider and
 * empty the queue (PENDING tasks back to NOT_SYNCED, queued deletions
 * dropped). Shared by POST /disconnect and the revoked-token path, so a
 * dead Google grant never leaves tasks to escalate to FAILED.
 */
export async function releaseCalendarQueue(db: QueueDb, userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { calendarConnectedProvider: null, calendarConnectedAt: null, targetCalendarId: null },
  });
  await db.task.updateMany({
    where: { userId, calendarSyncStatus: "PENDING" },
    data: { calendarSyncStatus: "NOT_SYNCED", calendarPendingSince: null },
  });
  await db.calendarDeletion.deleteMany({ where: { userId } });
}

/**
 * Google revoked our access (or the token can't be read). Wipe the stored
 * tokens, keep the row with lastError so the UI can say "Reconnect Google
 * Calendar", and, if Google is still the connected provider, release the
 * queue. Never throws.
 */
export async function markGoogleDisconnected(
  db: QueueDb & ConnectionDb,
  userId: string,
  reason: string
): Promise<void> {
  try {
    await db.calendarConnection.updateMany({
      where: { userId, provider: GOOGLE_PROVIDER },
      data: {
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        lastError: `revoked:${reason}`.slice(0, 300),
        lastErrorAt: new Date(),
      },
    });
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { calendarConnectedProvider: true },
    });
    if (user?.calendarConnectedProvider === GOOGLE_PROVIDER) {
      await releaseCalendarQueue(db, userId);
    }
  } catch (err) {
    console.warn(
      "[google-direct] markGoogleDisconnected failed (non-fatal):",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Revoke our Google grant (best-effort) and delete the stored tokens.
 * Used on disconnect and when the person switches to a phone calendar, so
 * only the connected provider ever holds a live grant. Never throws.
 * Returns false when a live token couldn't be revoked at Google.
 */
export async function dropGoogleConnection(
  db: ConnectionDb,
  userId: string,
  fetchImpl: FetchLike = fetch
): Promise<boolean> {
  try {
    const conn = await db.calendarConnection.findUnique({
      where: { userId_provider: { userId, provider: GOOGLE_PROVIDER } },
      select: { id: true, refreshToken: true },
    });
    if (!conn) return true;
    const token = conn.refreshToken ? decryptToken(conn.refreshToken) : null;
    const revoked = token ? await revokeGoogleToken(token, fetchImpl) : true;
    await db.calendarConnection.deleteMany({ where: { userId, provider: GOOGLE_PROVIDER } });
    return revoked;
  } catch (err) {
    console.warn(
      "[google-direct] dropGoogleConnection failed (non-fatal):",
      err instanceof Error ? err.message : err
    );
    return false;
  }
}

/** What /settings and /account show about the Google connection. */
export type GoogleConnectionStatus = {
  email: string | null;
  status: "connected" | "needs_reconnect";
} | null;

export async function googleConnectionStatus(
  db: ConnectionDb,
  userId: string
): Promise<GoogleConnectionStatus> {
  const conn = await db.calendarConnection.findUnique({
    where: { userId_provider: { userId, provider: GOOGLE_PROVIDER } },
    select: { accountEmail: true, refreshToken: true },
  });
  if (!conn) return null;
  return {
    email: conn.accountEmail,
    status: conn.refreshToken ? "connected" : "needs_reconnect",
  };
}
