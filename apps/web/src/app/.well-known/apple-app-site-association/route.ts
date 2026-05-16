/**
 * GET /.well-known/apple-app-site-association
 *
 * Apple Universal Links manifest. Apple's CDN fetches this once per
 * device (and caches aggressively) when the app is installed. The
 * `applinks` block tells iOS which URL paths on getacuity.io should
 * be intercepted and routed to the installed Acuity app instead of
 * Safari.
 *
 * Stage 1 (2026-05-15) scope per Slice B: ONLY the email-verification
 * path is intercepted. Other site URLs continue to open in the
 * browser. Adding paths later requires re-fetching the AASA — Apple
 * caches per-app on install and re-checks on subsequent installs +
 * via the CDN's swcd (Sniffed Web Content Delivery) headers.
 *
 * Format reference:
 * https://developer.apple.com/documentation/xcode/supporting-associated-domains
 *
 * Why this is a Next.js Route Handler (not a static file in /public):
 * Apple requires the response Content-Type to be `application/json`.
 * Static files served via Next.js's /public have a default content
 * type guess based on extension; `apple-app-site-association` has no
 * extension and would be served as application/octet-stream, which
 * Apple's CDN may reject or downgrade. Route Handler lets us pin the
 * header exactly.
 *
 * appID format: `<TEAM_ID>.<bundle_id>`. Team ID ZNF9ZJ4NVX confirmed
 * via EAS build credentials output. Bundle ID from app.json.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-static";

const APPLE_APP_ID = "ZNF9ZJ4NVX.com.heelerdigital.acuity";

const aasa = {
  applinks: {
    apps: [],
    details: [
      {
        appIDs: [APPLE_APP_ID],
        components: [
          {
            // Match exactly /api/auth/verify-email with a token query
            // parameter. Other /api/auth/* paths (signup, magic-link,
            // etc.) continue to open in Safari as before — we only
            // want the verify-email path to deep-link into the app.
            "/": "/api/auth/verify-email",
            "?": { token: "?*" },
            comment: "Email verification link routes into the iOS app.",
          },
        ],
      },
    ],
  },
};

export async function GET() {
  return NextResponse.json(aasa, {
    headers: {
      "Content-Type": "application/json",
      // Apple's swcd caches for hours; setting an explicit cache
      // header lets us update the AASA without waiting for the
      // default CDN TTL.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
