/**
 * GET /api/integrations/calendar/google/callback
 *
 * Google redirects here after the consent screen for Google Calendar
 * direct sign-in (2026-10-28). The HMAC-signed `state` is the identity
 * proof (no session cookie needed; Google's cross-site redirect may drop
 * it) and says where to send the person back: /account (web) or
 * acuity://integrations (app).
 *
 * On success:
 *   1. Tokens are stored encrypted in CalendarConnection (provider "google").
 *   2. The person's connected calendar becomes "google" → "primary", with
 *      auto-add on, replacing a phone calendar if one was connected.
 *   3. Open tasks due today or later are queued and a server drain is
 *      requested, so they land in Google Calendar within seconds.
 *
 * Status codes on the return URL (`gcal=`): connected | denied | error |
 * no_token | scope (calendar access unticked) | in_use (that Google
 * account is connected to another Ripple account) | unavailable (flag off).
 */

import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { encryptToken } from "@/lib/calendar/encryption";
import {
  APP_RETURN_URL,
  exchangeGoogleDirectCode,
  GOOGLE_DIRECT_FLAG,
  GOOGLE_EVENTS_SCOPE,
  GOOGLE_PROVIDER,
  GOOGLE_TARGET_CALENDAR,
  verifyGoogleDirectState,
  type ReturnTarget,
} from "@/lib/calendar/google-direct";
import { requestServerCalendarDrain } from "@/lib/calendar/server-drain-request";
import { queueConnectCatchUp } from "@/lib/enqueue-sync";
import { isEnabled } from "@/lib/feature-flags";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function returnUrl(req: Request, ret: ReturnTarget, status: string): string {
  if (ret === "app") return `${APP_RETURN_URL}?gcal=${encodeURIComponent(status)}`;
  const url = new URL("/account", req.url);
  url.searchParams.set("gcal", status);
  url.hash = "integrations";
  return url.toString();
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const verified = verifyGoogleDirectState(params.get("state") ?? "");
  const ret: ReturnTarget = verified?.ret ?? "web";
  const back = (status: string) => NextResponse.redirect(returnUrl(req, ret, status), { status: 302 });

  if (!verified) {
    safeLog.warn("calendar.google.callback.bad_state");
    return back("error");
  }
  const { userId } = verified;

  if (params.get("error")) {
    safeLog.info("calendar.google.callback.denied", { userId, error: params.get("error") });
    return back("denied");
  }
  const code = params.get("code");
  if (!code) return back("error");

  if (!(await isEnabled(userId, GOOGLE_DIRECT_FLAG))) return back("unavailable");

  let tokens;
  try {
    tokens = await exchangeGoogleDirectCode(code);
  } catch (err) {
    safeLog.error("calendar.google.callback.exchange_failed", {
      userId,
      err: err instanceof Error ? err.message : "unknown",
    });
    return back("error");
  }

  // Granular consent: the person can untick calendar access and still
  // finish. Without calendar.events every write would 403.
  if (!tokens.grantedScopes.includes(GOOGLE_EVENTS_SCOPE)) {
    safeLog.info("calendar.google.callback.scope_missing", { userId });
    return back("scope");
  }
  if (!tokens.refreshToken) {
    safeLog.warn("calendar.google.callback.no_refresh_token", { userId });
    return back("no_token");
  }
  if (!tokens.sub) {
    safeLog.warn("calendar.google.callback.no_sub", { userId });
    return back("error");
  }

  const { prisma } = await import("@/lib/prisma");
  const tokenData = {
    providerAccountId: tokens.sub,
    refreshToken: encryptToken(tokens.refreshToken),
    accessToken: tokens.accessToken ? encryptToken(tokens.accessToken) : null,
    tokenExpiresAt: tokens.expiresAt,
    accountEmail: tokens.email,
    grantedScopes: tokens.grantedScopes.join(" "),
    lastError: null,
    lastErrorAt: null,
  };
  try {
    await prisma.calendarConnection.upsert({
      where: { userId_provider: { userId, provider: GOOGLE_PROVIDER } },
      create: { userId, provider: GOOGLE_PROVIDER, ...tokenData },
      update: tokenData,
    });
  } catch (err) {
    // @@unique([provider, providerAccountId]): this Google account is
    // already connected to a different Ripple account. Not revoked here:
    // revoking would also end the other account's connection.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      safeLog.warn("calendar.google.callback.account_in_use", { userId });
      return back("in_use");
    }
    safeLog.error("calendar.google.callback.persist_failed", {
      userId,
      err: err instanceof Error ? err.message : "unknown",
    });
    return back("error");
  }

  const prior = await prisma.user.findUnique({
    where: { id: userId },
    select: { calendarConnectedProvider: true },
  });
  await prisma.user.update({
    where: { id: userId },
    data: {
      calendarConnectedProvider: GOOGLE_PROVIDER,
      calendarConnectedAt: new Date(),
      targetCalendarId: GOOGLE_TARGET_CALENDAR,
      autoSendTasks: true,
    },
  });
  // Queued phone-calendar deletions carry phone event ids; they mean
  // nothing to Google and no phone will drain them any more.
  if (prior?.calendarConnectedProvider && prior.calendarConnectedProvider !== GOOGLE_PROVIDER) {
    await prisma.calendarDeletion.deleteMany({ where: { userId } });
  }

  const queued = await queueConnectCatchUp(prisma, userId);
  await requestServerCalendarDrain(userId);

  safeLog.info("calendar.google.callback.connected", {
    userId,
    queued,
    priorProvider: prior?.calendarConnectedProvider ?? null,
  });
  return back("connected");
}
