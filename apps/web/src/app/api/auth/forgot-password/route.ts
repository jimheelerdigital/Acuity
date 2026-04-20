/**
 * POST /api/auth/forgot-password
 *
 * Triggers the password-reset flow. Shared between web and mobile.
 * Always responds 200 regardless of whether the email belongs to an
 * actual account — account-existence probing is a pre-auth
 * reconnaissance target.
 *
 * Side effect (only for real accounts that have a passwordHash):
 *   - Generates a random reset token, stores it + a 1-hour expiry
 *     on the User row, sends a reset email.
 *
 * OAuth-only users (no passwordHash) intentionally get no email —
 * there's nothing to reset. They'll see the same "check your inbox"
 * confirmation but can still sign in with Google.
 *
 * Rate-limited 5/hour per email to prevent the endpoint from being
 * used as a spam cannon against a victim's inbox.
 */

import { NextRequest, NextResponse } from "next/server";

import { passwordResetEmail } from "@/emails/password-reset";
import { randomToken } from "@/lib/auth-tokens";
import {
  checkRateLimit,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "InvalidEmail" }, { status: 400 });
  }

  const rl = await checkRateLimit(limiters.authByEmail, `forgot:${email}`);
  if (!rl.success) return rateLimitedResponse(rl);

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  if (user?.passwordHash) {
    const token = randomToken();
    const expires = new Date(Date.now() + RESET_TTL_MS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: token,
        resetTokenExpires: expires,
      },
    });

    const origin = req.nextUrl.origin;
    const resetUrl = `${origin}/auth/reset-password?token=${encodeURIComponent(token)}`;
    const { subject, html } = passwordResetEmail(resetUrl);
    const { getResendClient } = await import("@/lib/resend");
    await getResendClient().emails.send({
      from: process.env.EMAIL_FROM ?? "Acuity <hello@getacuity.io>",
      to: email,
      subject,
      html,
    });
  }

  // Always 200 — never leak account existence.
  return NextResponse.json({ ok: true });
}
