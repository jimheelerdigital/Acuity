/**
 * POST /api/auth/mobile-callback-apple
 *
 * Mirror of /api/auth/mobile-callback (Google) for Sign in with Apple.
 * App Store Guideline 4.8 mandates this whenever a third-party sign-in
 * is offered.
 *
 * Flow:
 *   1. Mobile client calls AppleAuthentication.signInAsync() and gets
 *      back an identityToken + (on first sign-in) the user's
 *      fullName/email. POSTs them here.
 *   2. Server verifies the identityToken against Apple's JWKS via
 *      apps/web/src/lib/apple-jwks::verifyAppleIdToken (issuer +
 *      audience + signature + expiry).
 *   3. Server finds-or-creates the User row, keyed on Apple's `sub`
 *      claim (User.appleSubject). Falls back to email match for
 *      users who already have a Google or password account on the
 *      same address — links the appleSubject to that row instead of
 *      creating a duplicate.
 *   4. Server issues a NextAuth-compatible session JWT via the same
 *      issueMobileSessionToken() helper that Google uses.
 *   5. Response: { sessionToken, expiresAt, user: {...} }.
 *
 * Apple privacy quirks handled here:
 *   - email is OFTEN absent on subsequent sign-ins. Use sub as the
 *     primary lookup key.
 *   - email may be a private-relay address (@privaterelay.appleid.com)
 *     when the user opted out of sharing. We store it as-is and
 *     rely on the canonicalizeEmail() plus-addressing fix to handle
 *     trial-reset protection.
 *   - fullName is ONLY returned on the first sign-in. Mobile client
 *     stashes it in expo-secure-store on first auth and re-sends on
 *     subsequent sign-ins — but server-side we tolerate it being
 *     missing entirely on returns.
 *
 * Schema requirement: User.appleSubject String? @unique. Run
 * `npx prisma db push` from home network before deploying this route.
 */

import { NextRequest, NextResponse } from "next/server";

import {
  issueMobileSessionToken,
  mobileSessionResponse,
} from "@/lib/mobile-session";
import { checkRateLimit, limiters, rateLimitedResponse } from "@/lib/rate-limit";
import { safeLog } from "@/lib/safe-log";
import { verifyAppleIdToken } from "@/lib/apple-jwks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ApplePostBody = {
  identityToken?: unknown;
  /** Apple's stable user id (`user` field from the SDK response).
   *  Same as the `sub` claim — defense in depth for clients that pass
   *  it explicitly. */
  appleUserId?: unknown;
  /** Mobile-cached on first auth, re-sent on subsequent sign-ins so
   *  the user's display name persists. Apple only returns these on
   *  the first auth. */
  fullName?: { givenName?: unknown; familyName?: unknown } | null;
  /** Same caching note as fullName. */
  email?: unknown;
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
  const body = (await req.json().catch(() => null)) as ApplePostBody | null;
  const identityToken =
    typeof body?.identityToken === "string" ? body.identityToken : null;
  if (!identityToken) {
    return NextResponse.json(
      { error: "Missing identityToken" },
      { status: 400 }
    );
  }

  const cachedFullName = (() => {
    if (!body?.fullName || typeof body.fullName !== "object") return null;
    const given =
      typeof body.fullName.givenName === "string"
        ? body.fullName.givenName.trim()
        : "";
    const family =
      typeof body.fullName.familyName === "string"
        ? body.fullName.familyName.trim()
        : "";
    const combined = `${given} ${family}`.trim();
    return combined.length > 0 ? combined.slice(0, 100) : null;
  })();
  const cachedEmail =
    typeof body?.email === "string" ? body.email.toLowerCase().trim() : null;

  // ── Verify the Apple identity token ────────────────────────────
  let claims: Awaited<ReturnType<typeof verifyAppleIdToken>>;
  try {
    claims = await verifyAppleIdToken(identityToken);
  } catch (err) {
    safeLog.info("mobile-callback-apple.verify.fail", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Apple token verification failed" },
      { status: 401 }
    );
  }

  // Sanity-check the body's `appleUserId` matches the verified `sub`
  // when the client bothered to send it. Mismatch = forged client
  // payload; reject.
  if (
    typeof body?.appleUserId === "string" &&
    body.appleUserId !== claims.sub
  ) {
    safeLog.info("mobile-callback-apple.sub.mismatch", {
      tokenSub: claims.sub,
      bodyAppleUserId: body.appleUserId,
    });
    return NextResponse.json(
      { error: "Apple user id does not match token sub" },
      { status: 401 }
    );
  }

  // Email reconciliation:
  //   - claims.email is present on first sign-in
  //   - subsequent sign-ins may omit email; the client-cached email
  //     fills in
  //   - if both are present, they must match (defense against client
  //     stuffing a different email)
  const tokenEmail =
    typeof claims.email === "string" ? claims.email.toLowerCase().trim() : null;
  if (tokenEmail && cachedEmail && tokenEmail !== cachedEmail) {
    safeLog.info("mobile-callback-apple.email.mismatch", {
      tokenEmail,
      cachedEmail,
    });
    return NextResponse.json(
      { error: "Cached email does not match token" },
      { status: 401 }
    );
  }
  const email = tokenEmail ?? cachedEmail;

  // ── Find or create the user ────────────────────────────────────
  // Lookup priority:
  //   1. By appleSubject (definitive — same Apple ID = same row)
  //   2. By email (link existing Google/password account to Apple)
  //   3. Create new
  const { prisma } = await import("@/lib/prisma");

  type UserShape = {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    subscriptionStatus: string;
    trialEndsAt: Date | null;
    appleSubject: string | null;
  };

  let user: UserShape | null = await prisma.user.findFirst({
    where: { appleSubject: claims.sub },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      appleSubject: true,
    },
  });

  let wasCreated = false;
  let wasLinked = false;

  if (!user && email) {
    // Account-link path: a User already exists with this email (e.g.,
    // signed up via Google or password); attach Apple to it.
    const existing = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        appleSubject: true,
      },
    });
    if (existing) {
      user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          appleSubject: claims.sub,
          // Don't overwrite name/email — they may have been edited
          // since signup. Apple may also send no name on subsequent
          // sign-ins, so we shouldn't trust this side.
        },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          subscriptionStatus: true,
          trialEndsAt: true,
          appleSubject: true,
        },
      });
      wasLinked = true;
    }
  }

  if (!user) {
    if (!email) {
      // First-ever Apple sign-in for this user, but the token didn't
      // carry email AND the client didn't cache one. We can't safely
      // create a User row without an email — there are too many
      // downstream code paths that key off email (Stripe, weekly
      // digests, account delete confirm). Refuse and ask the client
      // to retry with the cached email it should have stashed on
      // first auth.
      return NextResponse.json(
        {
          error:
            "Apple sign-in requires email on first auth. Please sign out of Apple ID and try again.",
        },
        { status: 400 }
      );
    }

    user = await prisma.user.create({
      data: {
        email,
        name: cachedFullName,
        emailVerified: new Date(), // Apple verifies before issuing the token
        appleSubject: claims.sub,
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        appleSubject: true,
      },
    });
    wasCreated = true;

    const { bootstrapNewUser } = await import("@/lib/bootstrap-user");
    await bootstrapNewUser({ userId: user.id, email: user.email });

    const refreshed = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        appleSubject: true,
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
    console.error("[mobile-callback-apple]", err);
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 503 }
    );
  }

  safeLog.info("mobile-callback-apple.success", {
    userId: user.id,
    email: user.email,
    wasCreated,
    wasLinked,
    isPrivateRelay:
      claims.is_private_email === true ||
      claims.is_private_email === "true",
  });

  return NextResponse.json(
    mobileSessionResponse({ sessionToken, expiresAt, user })
  );
}
