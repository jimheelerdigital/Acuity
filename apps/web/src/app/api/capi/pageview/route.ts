/**
 * POST /api/capi/pageview — Fire a server-side Meta CAPI PageView event.
 *
 * Called from the /start client component on mount. Accepts the page URL
 * and optional fbclid. Returns the event_id so the browser pixel can
 * deduplicate.
 */

import { NextRequest, NextResponse } from "next/server";

import {
  sendConversionEvent,
  generateEventId,
  getClientIp,
  extractFbCookies,
} from "@/lib/meta-capi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const pageUrl = typeof body?.url === "string" ? body.url : undefined;
  const fbclid = typeof body?.fbclid === "string" ? body.fbclid : undefined;

  const eventId = generateEventId("PageView");
  const reqHeaders = req.headers;

  sendConversionEvent({
    eventName: "PageView",
    eventId,
    eventSourceUrl: pageUrl || "https://getacuity.io/start",
    userData: {
      ip: getClientIp(reqHeaders),
      userAgent: reqHeaders.get("user-agent") || undefined,
      fbclid,
      ...extractFbCookies(reqHeaders.get("cookie")),
    },
  }).catch(() => {}); // fire-and-forget

  return NextResponse.json({ eventId });
}
