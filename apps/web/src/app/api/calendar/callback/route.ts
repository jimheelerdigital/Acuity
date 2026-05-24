/**
 * GET /api/calendar/callback
 *
 * Google redirects here with `?code=...&state=...` after the user
 * grants (or denies) calendar.readonly consent. We:
 *
 *   1. Verify the HMAC-signed state — proves the redirect originated
 *      from /connect on this server for the user it claims to belong
 *      to. No session cookie is required here (Google may strip it on
 *      cross-site redirect); the state HMAC IS the identity proof.
 *   2. Exchange the code for tokens.
 *   3. Encrypt + persist the refresh token to User.googleCalendar*.
 *   4. Redirect the user back to /account?calendar=connected so the UI
 *      can refresh the connected state without a banner toast.
 *
 * Failure modes:
 *   - Missing code (user denied) → redirect to /account?calendar=denied
 *   - State mismatch / expired   → redirect to /account?calendar=error
 *   - Google returned no refresh_token → /account?calendar=no_token
 *     (rare; only happens if the user previously consented without
 *      `prompt=consent` somewhere and revoked our offline access)
 */

import { NextRequest, NextResponse } from "next/server";

import { encryptToken } from "@/lib/calendar/encryption";
import { exchangeCode, verifyState } from "@/lib/calendar/oauth";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function redirectToAccount(req: NextRequest, status: string): NextResponse {
  const url = new URL("/account", req.url);
  url.searchParams.set("calendar", status);
  return NextResponse.redirect(url, { status: 302 });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  if (error) {
    safeLog.info("calendar.callback.user_denied", { error });
    return redirectToAccount(req, "denied");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return redirectToAccount(req, "error");
  }

  const userId = verifyState(state);
  if (!userId) {
    safeLog.warn("calendar.callback.bad_state");
    return redirectToAccount(req, "error");
  }

  let tokens;
  try {
    tokens = await exchangeCode(code);
  } catch (err) {
    safeLog.error("calendar.callback.exchange_failed", {
      userId,
      err: err instanceof Error ? err.message : "unknown",
    });
    return redirectToAccount(req, "error");
  }

  if (!tokens.refreshToken) {
    // Google omits refresh_token on re-consent if the user already
    // granted offline access in the past and didn't pass prompt=consent.
    // We DO pass prompt=consent in buildAuthUrl, so this should be
    // rare — but if it happens, surface a friendly status so the UI
    // can prompt them to retry.
    safeLog.warn("calendar.callback.no_refresh_token", { userId });
    return redirectToAccount(req, "no_token");
  }

  const encrypted = encryptToken(tokens.refreshToken);
  const { prisma } = await import("@/lib/prisma");
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        googleCalendarRefreshToken: encrypted,
        googleCalendarEmail: tokens.email,
        googleCalendarConnectedAt: new Date(),
        // Leave LastSyncedAt null until the first sync run actually
        // pulls events — we don't want to claim a sync happened
        // before it did.
      },
    });
  } catch (err) {
    safeLog.error("calendar.callback.persist_failed", {
      userId,
      err: err instanceof Error ? err.message : "unknown",
    });
    return redirectToAccount(req, "error");
  }

  safeLog.info("calendar.callback.connected", { userId });
  return redirectToAccount(req, "connected");
}
