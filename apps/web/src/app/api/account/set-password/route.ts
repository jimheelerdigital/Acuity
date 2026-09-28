/**
 * POST /api/account/set-password
 *
 * "Create a password for the app" on the funnel success screen (2026-09-28,
 * per Keenan: mirror what web-to-app funnels do). The test funnels create
 * the account at the email step with a random password she never sees, so
 * the app's email+password sign-in was useless to her. Standard practice is
 * a password box right after payment; this backs it.
 *
 * Signed-in owner only, and only within 48h of account creation (the
 * post-purchase window). Older accounts use forgot-password. If the email
 * isn't verified yet, the confirmation email is re-sent, because the app's
 * password sign-in requires a verified email (api/auth/mobile-login).
 *
 * Body: { password }  200: { ok: true, needsVerification: boolean }
 */
import { NextRequest, NextResponse } from "next/server";

import { welcomeVerifyEmail } from "@/emails/welcome-verify";
import { randomToken } from "@/lib/auth-tokens";
import { signUnsubscribeToken } from "@/lib/email-tokens";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { hashPassword, validatePassword } from "@/lib/passwords";
import { checkRateLimit, limiters, rateLimitedResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WINDOW_MS = 48 * 60 * 60 * 1000;
const VERIFY_TTL_HOURS = 24;

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(limiters.authByEmail, `set-password:${userId}`);
  if (!rl.success) return rateLimitedResponse(rl);

  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  const v = validatePassword(password);
  if (!v.ok) return NextResponse.json({ error: v.message }, { status: 400 });

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, createdAt: true, emailVerified: true, foundingMemberNumber: true } });
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (Date.now() - user.createdAt.getTime() > WINDOW_MS) {
    return NextResponse.json({ error: "Use 'Forgot password' to change an existing password." }, { status: 403 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });

  const needsVerification = !user.emailVerified;
  if (needsVerification) {
    const token = randomToken();
    await prisma.verificationToken.create({
      data: { identifier: `verify:${user.email}`, token, expires: new Date(Date.now() + VERIFY_TTL_HOURS * 3600_000) },
    });
    const origin = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
    const { subject, html } = welcomeVerifyEmail({
      firstName: (user.name ?? "").trim().split(/\s+/)[0] || "friend",
      verifyUrl: `${origin}/api/auth/verify-email?token=${encodeURIComponent(token)}`,
      unsubscribeUrl: `${origin}/api/emails/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(user.id, "onboarding"))}`,
      foundingMemberNumber: user.foundingMemberNumber ?? null,
    });
    try {
      const { sendEmailOrThrow } = await import("@/lib/resend");
      await sendEmailOrThrow({ from: process.env.EMAIL_FROM ?? "Ripple <hello@getacuity.io>", to: user.email, subject, html });
    } catch (err) {
      console.error("[set-password] verify email send failed:", err);
    }
  }
  return NextResponse.json({ ok: true, needsVerification });
}
