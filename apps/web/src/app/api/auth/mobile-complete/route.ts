/**
 * POST /api/auth/mobile-complete
 *
 * Called by the /auth/mobile-complete web landing page (and,
 * optionally, by the native app itself if it catches the deep link
 * with the raw token). Consumes a mobile-magic-link token and
 * returns a NextAuth session JWT so the app can store it and proceed
 * as if the user just signed in with Google.
 *
 * Two-step flow:
 *   1. User requests link via /api/auth/mobile-magic-link → email
 *      with link to /auth/mobile-complete?token=X.
 *   2. User taps the link in mobile mail → iOS Safari opens it →
 *      landing page POSTs here with { token } → receives
 *      { sessionToken } → redirects to acuity://auth-callback?…
 *      → native app catches the deep link, stores token.
 *
 * Consumes the token on success (single-use) and marks the user
 * emailVerified (they demonstrably control the inbox).
 */

import { NextRequest, NextResponse } from "next/server";

import {
  checkRateLimit,
  identifierFromRequest,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";
import {
  issueMobileSessionToken,
  mobileSessionResponse,
} from "@/lib/mobile-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MOBILE_PREFIX = "mobile:";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token) {
    return NextResponse.json({ error: "InvalidToken" }, { status: 400 });
  }

  // IP-scope the completion — the token itself is single-use and
  // 24-hour-scoped, so this is just a safety net on guessing.
  const rl = await checkRateLimit(
    limiters.auth,
    identifierFromRequest(req, "mobile-complete")
  );
  if (!rl.success) return rateLimitedResponse(rl);

  const { prisma } = await import("@/lib/prisma");

  const record = await prisma.verificationToken.findUnique({
    where: { token },
  });
  if (!record || !record.identifier.startsWith(MOBILE_PREFIX)) {
    return NextResponse.json({ error: "InvalidToken" }, { status: 400 });
  }
  if (record.expires < new Date()) {
    await prisma.verificationToken.delete({ where: { token } }).catch(() => {});
    return NextResponse.json({ error: "ExpiredToken" }, { status: 400 });
  }

  const email = record.identifier.slice(MOBILE_PREFIX.length);
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      emailVerified: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      onboarding: { select: { completedAt: true, currentStep: true } },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "UserNotFound" }, { status: 400 });
  }

  // Mark verified on first successful magic-link click + consume
  // the token in one transaction so a retry after a partial
  // failure doesn't leak the token.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: user.emailVerified ?? new Date() },
    }),
    prisma.verificationToken.delete({ where: { token } }),
  ]);

  const { sessionToken, expiresAt } = await issueMobileSessionToken(user);
  return NextResponse.json(
    mobileSessionResponse({ sessionToken, expiresAt, user })
  );
}
