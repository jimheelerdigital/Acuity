/**
 * POST /api/auth/mobile-magic-link
 *
 * Mobile-flavored magic-link sender. Differs from NextAuth's
 * EmailProvider in one important way: the link in the email lands
 * the user at /auth/mobile-complete on the web, which then deep-links
 * back into the native app with a newly-minted session JWT in the URL
 * fragment (acuity://auth-callback?…).
 *
 * Why a separate endpoint from the web EmailProvider:
 *   - NextAuth's EmailProvider email callback (/api/auth/callback/email)
 *     sets a web session cookie and redirects to the callbackUrl. That
 *     behavior is correct for web — the user stays in Safari — but
 *     wrong for mobile, where we need to cross back into the native app.
 *   - Running both flows through the same link risks the mobile user
 *     getting signed into web Safari instead of the app.
 *
 * Token storage reuses the VerificationToken table with a "mobile:"
 * identifier prefix so the namespace stays disjoint from the other
 * flows (verify:, and NextAuth's bare-email identifiers).
 *
 * Magic-link signup is implicit: if the email doesn't correspond to
 * a user, we create one (no password) and bootstrap trial state.
 * This matches NextAuth's EmailProvider behavior.
 */

import { NextRequest, NextResponse } from "next/server";

import { magicLinkEmail } from "@/emails/magic-link";
import { randomToken } from "@/lib/auth-tokens";
import {
  checkRateLimit,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_PREFIX = "mobile:";
const TTL_HOURS = 24;

function publicOrigin(req: NextRequest): string {
  return process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "InvalidEmail" }, { status: 400 });
  }

  const rl = await checkRateLimit(limiters.authByEmail, `mobile-magic:${email}`);
  if (!rl.success) return rateLimitedResponse(rl);

  const { prisma } = await import("@/lib/prisma");

  // Sign-up on first touch — matches NextAuth EmailProvider behavior.
  // We only create the row here; bootstrap (trial, life areas, etc.)
  // runs at first actual sign-in in mobile-complete, keyed on
  // whether the user had emailVerified already.
  let user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) {
    user = await prisma.user.create({
      data: { email },
      select: { id: true },
    });
    // Bootstrap at create time — matches /api/auth/signup's flow so
    // the user's trial clock starts the moment they request the link,
    // not when they first click it. Two-request delay between email
    // send and click would otherwise eat into the 14-day trial.
    const { bootstrapNewUser } = await import("@/lib/bootstrap-user");
    await bootstrapNewUser({ userId: user.id, email });
  }

  const token = randomToken();
  const expires = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);

  await prisma.verificationToken.create({
    data: {
      identifier: `${MOBILE_PREFIX}${email}`,
      token,
      expires,
    },
  });

  const origin = publicOrigin(req);
  const completeUrl = `${origin}/auth/mobile-complete?token=${encodeURIComponent(token)}`;
  const { subject, html } = magicLinkEmail(completeUrl);
  const { getResendClient } = await import("@/lib/resend");
  await getResendClient().emails.send({
    from: process.env.EMAIL_FROM ?? "Acuity <hello@getacuity.io>",
    to: email,
    subject,
    html,
  });

  return NextResponse.json({ ok: true });
}
