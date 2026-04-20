/**
 * POST /api/auth/mobile-login
 *
 * Mobile counterpart to NextAuth's CredentialsProvider. Accepts
 * { email, password } and, on success, returns a NextAuth-compatible
 * JWT the mobile app stores in SecureStore + sends as Bearer.
 *
 * Shares the credential check with auth.ts's authorize() — both run
 * through the same bcrypt verify + emailVerified gate. If we ever
 * add 2FA, this is one of two places to wire it (the other being
 * the CredentialsProvider authorize() in auth.ts).
 *
 * Response:
 *   200 { sessionToken, expiresAt, user: {...} }
 *   400 { error: "InvalidCredentials" | "EmailNotVerified" }
 *   429 { error: "RateLimited" }
 */

import { NextRequest, NextResponse } from "next/server";

import { verifyPassword } from "@/lib/passwords";
import {
  checkRateLimit,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";
import {
  issueMobileSessionToken,
  mobileSessionResponse,
} from "@/lib/mobile-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
  } | null;
  const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "InvalidCredentials" }, { status: 400 });
  }

  const rl = await checkRateLimit(limiters.authByEmail, `mobile-login:${email}`);
  if (!rl.success) return rateLimitedResponse(rl);

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      passwordHash: true,
      emailVerified: true,
      subscriptionStatus: true,
      trialEndsAt: true,
    },
  });

  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: "InvalidCredentials" }, { status: 400 });
  }
  const match = await verifyPassword(password, user.passwordHash);
  if (!match) {
    return NextResponse.json({ error: "InvalidCredentials" }, { status: 400 });
  }
  if (!user.emailVerified) {
    return NextResponse.json({ error: "EmailNotVerified" }, { status: 400 });
  }

  const { sessionToken, expiresAt } = await issueMobileSessionToken(user);
  return NextResponse.json(
    mobileSessionResponse({ sessionToken, expiresAt, user })
  );
}
