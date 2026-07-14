/**
 * Google OAuth helpers for the Calendar Integration.
 *
 * NOT the same flow as NextAuth's Google sign-in provider — that one
 * stays untouched so existing users don't get their sessions disturbed.
 * This is a separate OAuth handshake that the user explicitly opts
 * into from /account → Connect Calendar. The only thing it shares
 * with NextAuth is the underlying GOOGLE_CLIENT_ID / SECRET pair (one
 * Google Cloud Console OAuth client, two redirect URIs registered).
 *
 * Required redirect URIs on the Google Cloud Console OAuth client:
 *   - https://getacuity.io/api/calendar/callback         (prod)
 *   - http://localhost:3000/api/calendar/callback        (dev)
 *
 * Scopes requested:
 *   - openid (so we get an id_token to identify the connecting account)
 *   - email
 *   - https://www.googleapis.com/auth/calendar.readonly
 *
 * State parameter: an HMAC-signed payload binding the OAuth callback
 * to the originating user's session. Prevents CSRF + cross-user token
 * theft via copy-paste of a callback URL.
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

import { google, type Auth } from "googleapis";

import { CALENDAR_INTEGRATION_ENABLED } from "@acuity/shared";

export const CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.readonly",
];

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — Google's redirect typically takes < 30s

function redirectUri(): string {
  const base =
    process.env.NEXTAUTH_URL ??
    process.env.APP_URL ??
    "https://getacuity.io";
  return `${base.replace(/\/$/, "")}/api/calendar/callback`;
}

export function calendarOAuthClient(): Auth.OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "calendar/oauth: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing"
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri());
}

/**
 * Build the consent URL the user is redirected to. We force `prompt=
 * consent` because Google won't return a refresh_token on subsequent
 * authorizations otherwise — without it, a user who re-connects from
 * a different device would land here with no refresh token to store.
 */
export function buildAuthUrl(state: string): string {
  // Kill switch: never build a Google consent URL while the integration is
  // off (Google verification pending). Defense-in-depth behind the route
  // guard so no code path can start the broken flow.
  if (!CALENDAR_INTEGRATION_ENABLED) {
    throw new Error("calendar integration disabled");
  }
  const oauth = calendarOAuthClient();
  return oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: CALENDAR_SCOPES,
    state,
  });
}

interface StatePayload {
  userId: string;
  issuedAt: number;
  nonce: string;
}

function stateKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("calendar/oauth: NEXTAUTH_SECRET required for state HMAC");
  }
  return Buffer.from(secret, "utf8");
}

/**
 * Sign a state payload with HMAC-SHA256. Returns the base64url string
 * to embed in the auth URL.
 */
export function signState(userId: string): string {
  const payload: StatePayload = {
    userId,
    issuedAt: Date.now(),
    nonce: randomBytes(8).toString("hex"),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", stateKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/**
 * Verify a state string returned by Google. Returns the userId on
 * success, null on tamper / expiry / shape errors.
 */
export function verifyState(state: string): string | null {
  try {
    const parts = state.split(".");
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expected = createHmac("sha256", stateKey()).update(body).digest();
    const actual = Buffer.from(sig, "base64url");
    if (expected.length !== actual.length) return null;
    if (!timingSafeEqual(expected, actual)) return null;
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as StatePayload;
    if (Date.now() - payload.issuedAt > STATE_TTL_MS) return null;
    if (!payload.userId) return null;
    return payload.userId;
  } catch {
    return null;
  }
}

/**
 * Exchange an authorization code for tokens. Returns the refresh
 * token, the connecting account's email (from the id_token), and the
 * raw token set if the caller needs the access_token immediately.
 */
export async function exchangeCode(code: string): Promise<{
  refreshToken: string | null;
  email: string | null;
  accessToken: string | null;
  expiresAt: number | null;
}> {
  const oauth = calendarOAuthClient();
  const { tokens } = await oauth.getToken(code);
  const refreshToken = tokens.refresh_token ?? null;
  const accessToken = tokens.access_token ?? null;
  const expiresAt = tokens.expiry_date ?? null;

  // Pull the connecting account's email from the id_token so the UI
  // can show "Connected as foo@gmail.com" — this is the calendar
  // owner's address, which may differ from the Ripple sign-in email
  // (e.g. user signed up with personal Gmail, connects work calendar).
  let email: string | null = null;
  if (tokens.id_token) {
    try {
      const ticket = await oauth.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      email = ticket.getPayload()?.email ?? null;
    } catch {
      // Non-fatal — we still have the refresh token. Email shown
      // as "Connected" with no address.
    }
  }

  return { refreshToken, email, accessToken, expiresAt };
}

/**
 * Revoke a refresh token at Google. Best-effort: if Google's endpoint
 * returns non-2xx we still clear the column locally — a dangling
 * token at Google is preferable to a user who can't disconnect.
 */
export async function revokeRefreshToken(refreshToken: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    return res.ok;
  } catch {
    return false;
  }
}
