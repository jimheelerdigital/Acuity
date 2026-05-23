/**
 * GET /api/app/version-check
 *
 * Server-driven version-check endpoint. Mobile client calls this on
 * every launch (before auth gate). Response carries platform-specific
 * version config + display copy so we can change the prompt without
 * shipping a new app binary.
 *
 * Query:
 *   platform — "ios" | "android"; defaults to "ios" when missing.
 *
 * Response (200):
 *   {
 *     minimumVersion: string,    // e.g. "1.0.0"
 *     recommendedVersion: string, // e.g. "1.1.0"
 *     headline: string,
 *     body: string,
 *     ctaText: string,
 *     dismissible: boolean,
 *     appStoreUrl: string,
 *     releaseNotes: string[] | null,
 *   }
 *
 * Auth: NONE. This endpoint MUST fire on launch before the auth
 * gate so the modal can show on the very first frame for un-authed
 * users (e.g., the user logged out and is staring at a stale build
 * with a force-update active). No PII in the response — safe to be
 * publicly reachable.
 *
 * Caching: max-age=300 (5 min). Long enough to absorb a launch
 * thundering-herd at Vercel's edge; short enough that an emergency
 * force-update propagates quickly (worst-case 5 min delay for a
 * client whose CDN node still has a stale response). For instant
 * propagation across the whole install base, increment the file's
 * `recommendedVersion` AND ping the CDN to purge — `vercel cache
 * delete` works, or just redeploy.
 *
 * CORS: deliberately permissive. The mobile client fetches this
 * from the device, not the browser, so origin checks don't apply —
 * but expo-router's web-debug build runs in a browser and would
 * otherwise hit a CORS wall. Allow-origin: * is fine since the
 * payload is non-secret config.
 */

import { NextRequest, NextResponse } from "next/server";

import { configForPlatform } from "@/lib/app-version-config";

export const runtime = "nodejs";
// `dynamic = "force-dynamic"` is intentionally NOT set — we WANT
// Vercel's edge cache to serve this between rebuilds, gated only by
// the max-age header below. A static Next.js Route Handler with no
// per-request data dependencies will edge-cache cleanly.

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get("platform");
  const config = configForPlatform(platform);

  return NextResponse.json(config, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}

// Pre-flight handler for browsers that fire OPTIONS before GET on
// cross-origin fetches. Native mobile clients don't issue this, but
// expo-router's web-debug build does, and so do some VPN/proxy
// stacks that intercept-and-replay requests.
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
