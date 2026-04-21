/**
 * POST /api/auth/mobile-signup
 *
 * Mobile email/password signup. Mirrors /api/auth/signup exactly —
 * same validation, same rate limit, same email-verification
 * requirement. The only reason it's a separate route is so the
 * mobile app can hit a path that clearly implies "no web cookie
 * involved".
 *
 * Returns 200 { ok, requiresVerification } instead of a session
 * token — the user must verify their email before sign-in, same
 * as the web.
 */

import { NextRequest, NextResponse } from "next/server";

import { verificationEmail } from "@/emails/verification";
import { randomToken } from "@/lib/auth-tokens";
import { hashPassword, validatePassword } from "@/lib/passwords";
import {
  checkRateLimit,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFY_PREFIX = "verify:";
const VERIFY_TTL_HOURS = 24;

/**
 * Canonical public URL used inside the verification email.
 * `req.nextUrl.origin` works on web but on mobile, the request may
 * hit an internal Vercel preview URL or have a missing Host; fall
 * back to NEXTAUTH_URL which is always the production origin.
 */
function publicOrigin(req: NextRequest): string {
  return process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
    name?: unknown;
    referralCode?: unknown;
  } | null;
  const referralCode =
    typeof body?.referralCode === "string" && body.referralCode.trim().length > 0
      ? body.referralCode.trim().slice(0, 16)
      : null;

  const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const name = typeof body?.name === "string" && body.name.trim()
    ? body.name.trim().slice(0, 100)
    : null;

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "InvalidEmail" }, { status: 400 });
  }

  const pw = validatePassword(password);
  if (!pw.ok) {
    return NextResponse.json(
      { error: "WeakPassword", message: pw.message },
      { status: 400 }
    );
  }

  const rl = await checkRateLimit(limiters.authByEmail, `mobile-signup:${email}`);
  if (!rl.success) return rateLimitedResponse(rl);

  const { prisma } = await import("@/lib/prisma");
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, emailVerified: true },
  });

  if (existing?.passwordHash) {
    return NextResponse.json({ error: "AlreadyRegistered" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const verifyToken = randomToken();
  const verifyExpires = new Date(Date.now() + VERIFY_TTL_HOURS * 60 * 60 * 1000);

  let userId: string;
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, ...(name ? { name } : {}) },
    });
    userId = existing.id;
  } else {
    const created = await prisma.user.create({
      data: { email, name, passwordHash },
      select: { id: true },
    });
    userId = created.id;

    const { bootstrapNewUser } = await import("@/lib/bootstrap-user");
    await bootstrapNewUser({ userId, email, referralCodeFromSignup: referralCode });
  }

  await prisma.verificationToken.create({
    data: {
      identifier: `${VERIFY_PREFIX}${email}`,
      token: verifyToken,
      expires: verifyExpires,
    },
  });

  if (!existing || !existing.emailVerified) {
    const verifyUrl = `${publicOrigin(req)}/api/auth/verify-email?token=${encodeURIComponent(verifyToken)}`;
    const { subject, html } = verificationEmail(verifyUrl);
    const { getResendClient } = await import("@/lib/resend");
    await getResendClient().emails.send({
      from: process.env.EMAIL_FROM ?? "Acuity <hello@getacuity.io>",
      to: email,
      subject,
      html,
    });
  }

  return NextResponse.json({
    ok: true,
    requiresVerification: !existing || !existing.emailVerified,
  });
}
