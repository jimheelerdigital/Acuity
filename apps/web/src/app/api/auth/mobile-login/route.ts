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
 * Rate limiting: deliberately not applied here (2026-05-22, v1.1
 * ship-blocker fix). Acuity is a personal journaling app, not a
 * banking app — the credential-stuffing risk that justifies harsh
 * lockouts doesn't apply, and App Review reviewers + real users
 * mistyping once shouldn't get a one-hour wall. Forgot-password
 * and magic-link routes keep their per-email caps (email-send
 * abuse is a different attack surface); signup keeps its
 * IP-based cap against trial farming.
 *
 * Response:
 *   200 { sessionToken, expiresAt, user: {...} }
 *   401 { error: "InvalidCredentials" }
 *   400 { error: "EmailNotVerified" }
 */

import { NextRequest, NextResponse } from "next/server";

import { issueMobileSessionToken, mobileSessionResponse } from "@/lib/mobile-session";
import { verifyPassword } from "@/lib/passwords";

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
    return NextResponse.json({ error: "InvalidCredentials" }, { status: 401 });
  }

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
      // Surfaced so the first-login tour gate can decide at sign-in and not
      // fire for existing users on a fresh install (vc24 bug — see
      // docs/specs/onboarding-tour-and-keyboard-bugs.md #1).
      totalRecordings: true,
      tourCompletedAt: true,
      onboarding: { select: { completedAt: true, currentStep: true } },
    },
  });

  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: "InvalidCredentials" }, { status: 401 });
  }
  const match = await verifyPassword(password, user.passwordHash);
  if (!match) {
    return NextResponse.json({ error: "InvalidCredentials" }, { status: 401 });
  }
  if (!user.emailVerified) {
    // EmailNotVerified is a state issue (valid creds, account not ready),
    // not an auth failure — keep at 400 so the mobile client can route
    // to a resend-verification UX rather than a "wrong password" toast.
    return NextResponse.json({ error: "EmailNotVerified" }, { status: 400 });
  }

  const { sessionToken, expiresAt } = await issueMobileSessionToken(user);
  return NextResponse.json(
    mobileSessionResponse({ sessionToken, expiresAt, user })
  );
}
