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

// TODO(jim): replace with the real SHA-256 cert fingerprint from
// Play Console → App integrity → App signing key certificate, after
// the first AAB has been uploaded to Internal Testing. Until then,
// Android App Links won't verify and the OS will fall back to the
// "Open with…" picker. Format: uppercase hex bytes separated by
// colons (`AB:CD:EF:...`).
const SHA256_FINGERPRINTS: string[] = [
  // "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00",
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
