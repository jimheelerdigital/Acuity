/**
 * GET /.well-known/assetlinks.json
 *
 * Android Digital Asset Links manifest. Google Play Services fetches
 * this when the user first taps a link that matches an `autoVerify`
 * intent filter (declared in apps/mobile/app.json android.intentFilters)
 * to decide whether to route the URL to the installed Acuity app or
 * to a browser. Without a verified assetlinks.json, Android shows the
 * "Open with…" disambiguation dialog every time, which feels broken.
 *
 * Format reference:
 * https://developer.android.com/training/app-links/verify-android-applinks
 *
 * Counterpart to the iOS AASA at
 * /.well-known/apple-app-site-association — they cover the same set
 * of paths (currently just /api/auth/verify-email) so the
 * magic-link / verification flow lands inside the app on both
 * platforms.
 *
 * SHA-256 fingerprint:
 *   Pulled from Google Play Console → App integrity → App signing
 *   key certificate → "SHA-256 certificate fingerprint" once the
 *   first build has been uploaded to Internal Testing. Until that
 *   exists, leave the placeholder below and add the real value
 *   before promoting the Closed Testing track to anything wider.
 *
 *   Local cmd if needed (against the EAS keystore):
 *     keytool -list -v -keystore <keystore.jks> -alias <key-alias>
 *
 * Why this is a Next.js Route Handler (not a static file in /public):
 * Same reason as the AASA — Google expects `Content-Type:
 * application/json` exactly. Route Handler lets us pin the header
 * regardless of file extension handling.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-static";

const ANDROID_PACKAGE = "com.heelerdigital.acuity";

// SHA-256 cert fingerprint of the EAS-managed Android signing
// keystore for com.heelerdigital.acuity. Populated 2026-06-03 from
// the eas credentials output ahead of the first Internal Testing
// build.
//
// Important next step (track for v1.3.x or v1.4): once Play App
// Signing takes over (which happens automatically when the AAB is
// uploaded), Play Console can re-sign artifacts with a different
// upload key + app signing key. If that re-sign happens, add the
// Play-Console-issued SHA-256 to this array. Both fingerprints can
// coexist — Google verifies a deep link against ANY entry. Failing
// to add the Play-issued fingerprint means production-installed
// Android users hit the "Open with…" picker on verify-email links
// even though Internal Testing builds work.
const SHA256_FINGERPRINTS: string[] = [
  "37:DA:A1:B5:85:66:A7:29:4B:2E:23:70:5C:F4:C8:F9:39:82:F5:46:82:3C:EF:37:4F:D1:12:A4:47:39:E8:71",
];

const assetlinks = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: ANDROID_PACKAGE,
      sha256_cert_fingerprints: SHA256_FINGERPRINTS,
    },
  },
];

export async function GET() {
  return NextResponse.json(assetlinks, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
