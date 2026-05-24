/**
 * GET /api/calendar/connect
 *
 * Kicks off the Google Calendar OAuth handshake. The user must be
 * signed in (cookie or mobile-bearer). We sign a state HMAC with
 * their userId so the callback can verify the redirect belongs to
 * them and rebuild the session-less side of the flow.
 *
 * Returns a 302 to Google's consent page. Mobile callers open this
 * via expo-web-browser; web users see a normal cross-origin redirect.
 */

import { NextRequest, NextResponse } from "next/server";

import { buildAuthUrl, signState } from "@/lib/calendar/oauth";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = signState(userId);
  const url = buildAuthUrl(state);
  return NextResponse.redirect(url, { status: 302 });
}
