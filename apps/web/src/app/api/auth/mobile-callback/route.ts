/**
 * POST /api/auth/mobile-callback
 *
 * Exchanges a Google ID token (obtained by the native iOS app via
 * expo-auth-session) for a NextAuth-compatible session JWT that the
 * mobile app stores in expo-secure-store and sends back as a Bearer
 * token on subsequent API calls.
 *
 * Flow:
 *   1. Client POSTs { googleIdToken }.
 *   2. Server verifies the ID token against Google's tokeninfo
 *      endpoint — checks signature, audience (our iOS client ID),
 *      expiry.
 *   3. Server finds the user by email or creates one; if created,
 *      also seeds the trial clock + LifeMapArea + UserMemory + fires
 *      trial_started via bootstrapNewUser.
 *   4. Server issues a NextAuth-encoded JWT using the same
 *      NEXTAUTH_SECRET + payload shape as the web session cookie.
 *   5. Response: { sessionToken, expiresAt, user: {...} }.
 *
 * SECURITY:
 *   - Rate-limited via the `auth` limiter (5/15min/IP, matches
 *     /api/auth/signin POST).
 *   - Google's tokeninfo endpoint verifies the signature for us —
 *     no need for jose / google-auth-library. One network round-trip
 *     per sign-in is acceptable; login is not a hot path.
 *   - Audience MUST match EXPECTED_IOS_AUDIENCES. Accepting a token
 *     issued for a different client = account takeover surface.
 *   - The issued JWT uses the same 30-day maxAge as the web cookie.
 *     Shorter would be safer (mobile has no automatic re-auth on
 *     expiry without a refresh-token mechanism we don't have yet);
 *     longer would drift from web. Stay aligned for now.
 */

import { NextRequest, NextResponse } from "next/server";

import {
  issueMobileSessionToken,
  mobileSessionResponse,
} from "@/lib/mobile-session";
import { checkRateLimit, limiters, rateLimitedResponse } from "@/lib/rate-limit";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOKEN_INFO_URL = "https://oauth2.googleapis.com/tokeninfo";

/**
 * Expected audience claims on the Google ID token. iOS OAuth clients
 * use the reversed-DNS client ID as the `aud` claim. Jim populates
 * GOOGLE_IOS_CLIENT_ID in Vercel Production after creating the iOS
 * OAuth client in Google Cloud Console.
 *
 * If we later ship an Android app, add the Android client ID to this
 * list. Google returns the audience on tokeninfo, so we just need
 * exact-match membership.
 */
function expectedAudiences(): string[] {
  const iosId = process.env.GOOGLE_IOS_CLIENT_ID;
  const webId = process.env.GOOGLE_CLIENT_ID;
  // We accept the web client ID too because some Expo configurations
  // (especially Expo Go during development) sign tokens against the
  // web client. For production App Store builds the iOS client is
  // authoritative.
  return [iosId, webId].filter((x): x is string => Boolean(x));
}

type TokenInfo = {
  aud?: string;
  email?: string;
  email_verified?: string;
  name?: string;
  picture?: string;
  sub?: string;
  exp?: string;
  error_description?: string;
};

export async function POST(req: NextRequest) {
  // ── Rate limit by IP (no user id pre-auth) ─────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const rl = await checkRateLimit(limiters.auth, `ip:${ip}`);
  if (!rl.success) return rateLimitedResponse(rl);

  // ── Parse body ─────────────────────────────────────────────────
  const body = (await req.json().catch(() => null)) as {
    googleIdToken?: unknown;
  } | null;
  const googleIdToken =
    typeof body?.googleIdToken === "string" ? body.googleIdToken : null;
  if (!googleIdToken) {
    return NextResponse.json(
      { error: "Missing googleIdToken" },
      { status: 400 }
    );
  }

  // ── Verify token with Google ───────────────────────────────────
  let info: TokenInfo;
  try {
    const res = await fetch(
      `${TOKEN_INFO_URL}?id_token=${encodeURIComponent(googleIdToken)}`,
      { cache: "no-store" }
    );
    info = (await res.json()) as TokenInfo;
    // Log the tokeninfo shape on every call (keys only, no raw token
    // fields) so the Vercel logs capture enough to diagnose audience
    // mismatches without leaking credentials.
    safeLog.info("mobile-callback.google.tokeninfo", {
      httpStatus: res.status,
      aud: info.aud,
      emailVerified: info.email_verified,
      hasEmail: Boolean(info.email),
      hasSub: Boolean(info.sub),
      exp: info.exp,
      errorDescription: info.error_description,
      expectedAudiences: expectedAudiences(),
    });
    if (!res.ok || info.error_description) {
      return NextResponse.json(
        { error: "Google token verification failed" },
        { status: 401 }
      );
    }
  } catch (err) {
    console.error("[mobile-callback] tokeninfo fetch threw:", err);
    return NextResponse.json(
      { error: "Could not reach Google token endpoint" },
      { status: 502 }
    );
  }

  const email = info.email?.toLowerCase().trim();
  if (!email) {
    return NextResponse.json(
      { error: "Token missing email claim" },
      { status: 400 }
    );
  }

  // Google returns email_verified as a string "true"/"false".
  if (info.email_verified !== "true") {
    return NextResponse.json(
      { error: "Google email not verified" },
      { status: 400 }
    );
  }

  // Audience check — the whole security story leans on this.
  const allowed = expectedAudiences();
  if (allowed.length === 0) {
    console.error(
      "[mobile-callback] Neither GOOGLE_IOS_CLIENT_ID nor GOOGLE_CLIENT_ID is set; rejecting."
    );
    return NextResponse.json(
      { error: "Server not configured for mobile OAuth" },
      { status: 503 }
    );
  }
  if (!info.aud || !allowed.includes(info.aud)) {
    safeLog.info("mobile-callback.audience.reject", {
      aud: info.aud,
      allowed,
      email,
    });
    return NextResponse.json(
      {
        error: "Token issued for a different client",
        // Include both sides in the response body so the mobile
        // client's logs show the mismatch without needing server
        // log access. Safe to expose: these are public client ids.
        debug: { tokenAud: info.aud, expectedAudiences: allowed },
      },
      { status: 401 }
    );
  }

  // Expiry check. Google tokeninfo rejects expired tokens at the
  // endpoint, but double-check here so a clock-skewed response can't
  // slip through.
  if (info.exp) {
    const expMs = Number(info.exp) * 1000;
    if (Number.isFinite(expMs) && expMs < Date.now()) {
      return NextResponse.json(
        { error: "Token expired" },
        { status: 401 }
      );
    }
  }

  // ── Find or create user ────────────────────────────────────────
  const { prisma } = await import("@/lib/prisma");

  let user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      subscriptionStatus: true,
      trialEndsAt: true,
    },
  });

  let wasCreated = false;
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: info.name ?? null,
        image: info.picture ?? null,
        emailVerified: new Date(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        subscriptionStatus: true,
        trialEndsAt: true,
      },
    });
    wasCreated = true;

    // NextAuth's createUser event hook doesn't fire here (we bypassed
    // the adapter). Trigger the same side-effects manually.
    const { bootstrapNewUser } = await import("@/lib/bootstrap-user");
    await bootstrapNewUser({ userId: user.id, email: user.email });

    // bootstrapNewUser mutates subscriptionStatus + trialEndsAt — re-read.
    const refreshed = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        subscriptionStatus: true,
        trialEndsAt: true,
      },
    });
    if (refreshed) user = refreshed;
  }

  // ── Issue NextAuth-compatible session JWT ──────────────────────
  let sessionToken: string;
  let expiresAt: string;
  try {
    ({ sessionToken, expiresAt } = await issueMobileSessionToken(user));
  } catch (err) {
    console.error("[mobile-callback]", err);
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 503 }
    );
  }

  safeLog.info("mobile-callback.success", {
    userId: user.id,
    email: user.email,
    wasCreated,
  });

  return NextResponse.json(
    mobileSessionResponse({ sessionToken, expiresAt, user })
  );
}
