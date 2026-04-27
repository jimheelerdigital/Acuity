import "server-only";

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/**
 * Verify an Apple ID token.
 *
 * Apple signs identity tokens with one of a rotating set of RSA keys
 * published at https://appleid.apple.com/auth/keys (JWKS endpoint).
 * `createRemoteJWKSet` from jose handles fetch + cache + key-id
 * lookup automatically. The default cooldown (30s between fetches
 * when a kid isn't found) is fine for our throughput.
 *
 * Required claims after verification:
 *   - iss === "https://appleid.apple.com"
 *   - aud matches one of EXPECTED_APPLE_AUDIENCES (the iOS bundle id
 *     and, optionally, a web Services ID)
 *   - sub (Apple's stable per-user identifier — used as the lookup
 *     key on User.appleSubject)
 *
 * Optional but useful claims:
 *   - email (may be a real address, a private-relay address, or
 *     missing on subsequent sign-ins)
 *   - email_verified ("true" | "false")
 *   - is_private_email ("true" | "false") — relay flag
 *
 * Throws an Error on any verification failure (signature, audience,
 * expiry, etc). Caller maps that to a 401 response.
 */

const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";

const APPLE_ISSUER = "https://appleid.apple.com";

let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS() {
  if (!cachedJWKS) {
    cachedJWKS = createRemoteJWKSet(new URL(APPLE_JWKS_URL));
  }
  return cachedJWKS;
}

export type AppleIdTokenClaims = JWTPayload & {
  email?: string;
  email_verified?: "true" | "false" | boolean;
  is_private_email?: "true" | "false" | boolean;
  /** Stable per-user identifier from Apple. Always set. */
  sub: string;
};

/**
 * Returns the configured set of acceptable `aud` values.
 *
 * For the mobile flow Apple sets `aud` to the iOS app's bundle ID.
 * For an optional web flow (NextAuth Apple provider) Apple sets
 * `aud` to the Services ID created in the developer portal. Both
 * must be tracked here so a forged token issued for a sibling
 * project cannot redeem a session.
 */
export function expectedAppleAudiences(): string[] {
  // Hardcoded bundle ID is fine — public information, matches
  // app.json `ios.bundleIdentifier`. Env-overridable if we ever
  // ship under a different bundle (white-label / staging build).
  const iosBundle =
    process.env.APPLE_IOS_BUNDLE_ID ?? "com.heelerdigital.acuity";
  const webServicesId = process.env.APPLE_CLIENT_ID; // optional, web flow only
  return [iosBundle, webServicesId].filter(
    (x): x is string => typeof x === "string" && x.length > 0
  );
}

export async function verifyAppleIdToken(
  idToken: string
): Promise<AppleIdTokenClaims> {
  const audiences = expectedAppleAudiences();
  if (audiences.length === 0) {
    throw new Error("Server not configured: no Apple audiences available");
  }

  // jose throws on signature failure, expired tokens, audience
  // mismatch, issuer mismatch, etc. Caller wraps for the 401 response.
  const { payload } = await jwtVerify(idToken, getJWKS(), {
    issuer: APPLE_ISSUER,
    audience: audiences,
    // Skew tolerance — Apple tokens carry exp + nbf; allow a
    // 60-second clock skew to absorb minor drift between Vercel and
    // Apple's clocks.
    clockTolerance: "60s",
  });

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("Apple token missing sub claim");
  }

  return payload as AppleIdTokenClaims;
}
