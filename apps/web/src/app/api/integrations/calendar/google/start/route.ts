/**
 * GET /api/integrations/calendar/google/start
 *
 * Starts Google Calendar direct sign-in (2026-10-28). See
 * lib/calendar/google-direct.ts for the design.
 *
 *   Web:    a plain link from /account → 302 to Google's consent page
 *           (session cookie identifies the person).
 *   App:    `?format=json&return=app` with the mobile bearer → `{ url }`.
 *           The app opens it in an auth browser sheet
 *           (WebBrowser.openAuthSessionAsync) and the callback returns to
 *           acuity://integrations. The bearer never goes into the browser;
 *           the signed `state` carries the person's id instead.
 *
 * Gates (in order): auth, canSyncCalendar entitlement, the
 * calendar_google_direct feature flag (fails closed; 404 when off so the
 * feature's existence doesn't leak).
 */

import { NextRequest, NextResponse } from "next/server";

import {
  buildGoogleDirectAuthUrl,
  GOOGLE_DIRECT_FLAG,
  signGoogleDirectState,
  type ReturnTarget,
} from "@/lib/calendar/google-direct";
import { isEnabled } from "@/lib/feature-flags";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { requireEntitlement } from "@/lib/paywall";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function accountRedirect(req: NextRequest, status: string): NextResponse {
  const url = new URL("/account", req.url);
  url.searchParams.set("gcal", status);
  url.hash = "integrations";
  return NextResponse.redirect(url, { status: 302 });
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const wantsJson = params.get("format") === "json";
  const ret: ReturnTarget = params.get("return") === "app" ? "app" : "web";

  const userId = await getAnySessionUserId(req);
  if (!userId) {
    if (wantsJson) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = new URL("/auth/signin", req.url);
    url.searchParams.set("callbackUrl", "/account#integrations");
    return NextResponse.redirect(url, { status: 302 });
  }

  const gated = await requireEntitlement("canSyncCalendar", userId);
  if (!gated.ok) {
    return wantsJson ? gated.response : accountRedirect(req, "locked");
  }

  if (!(await isEnabled(userId, GOOGLE_DIRECT_FLAG))) {
    return wantsJson
      ? NextResponse.json({ error: "Not found" }, { status: 404 })
      : accountRedirect(req, "unavailable");
  }

  let url: string;
  try {
    url = buildGoogleDirectAuthUrl(signGoogleDirectState(userId, ret));
  } catch (err) {
    // Missing GOOGLE_CLIENT_ID / SECRET / NEXTAUTH_SECRET.
    safeLog.error("calendar.google.start.misconfigured", {
      userId,
      err: err instanceof Error ? err.message : "unknown",
    });
    return wantsJson
      ? NextResponse.json({ error: "Unavailable" }, { status: 503 })
      : accountRedirect(req, "error");
  }

  safeLog.info("calendar.google.start", { userId, ret });
  if (wantsJson) {
    return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.redirect(url, { status: 302 });
}
