/**
 * POST /api/auth/mobile-email-code/verify  { email, code }
 *   → mobile session (same shape as every other app sign-in) + isNewUser
 *
 * Checks the 6-digit code and signs the user in. First use creates the
 * account (signupMethod "mobile-email-code") with the standard trial
 * bootstrap — the same thing Apple/Google sign-in does — and marks the email
 * verified (they proved they own the inbox).
 */

import { NextRequest, NextResponse } from "next/server";

import { checkCode, normalizeEmail } from "@/lib/email-code";
import { issueMobileSessionToken, mobileSessionResponse } from "@/lib/mobile-session";
import {
  checkRateLimit,
  identifierFromRequest,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  image: true,
  emailVerified: true,
  subscriptionStatus: true,
  subscriptionSource: true,
  trialEndsAt: true,
  totalRecordings: true,
  tourCompletedAt: true,
  onboarding: { select: { completedAt: true, currentStep: true } },
} as const;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { email?: unknown; code?: unknown } | null;
  const email = normalizeEmail(body?.email);
  const code = typeof body?.code === "string" ? body.code.replace(/\s+/g, "") : "";
  if (!email || !code) return NextResponse.json({ error: "InvalidCode" }, { status: 400 });

  const rl = await checkRateLimit(limiters.auth, identifierFromRequest(req, "email-code-verify"));
  if (!rl.success) return rateLimitedResponse(rl);
  // Per-email cap too (2026-10-18): IP limits don't stop a rotating
  // guesser, and each re-requested code starts at 0 tries.
  const byEmail = await checkRateLimit(limiters.emailCodeVerifyByEmail, `email-code-verify:${email}`);
  if (!byEmail.success) return rateLimitedResponse(byEmail);

  const result = await checkCode(email, code);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const { prisma } = await import("@/lib/prisma");
  let user = await prisma.user.findUnique({ where: { email }, select: USER_SELECT });
  let isNewUser = false;

  if (!user) {
    // New account — IP cap against trial farming, same as other signups.
    const ipCap = await checkRateLimit(limiters.signupByIp, identifierFromRequest(req, "signup"));
    if (!ipCap.success) return rateLimitedResponse(ipCap);

    const { trialDaysForEmail, bootstrapNewUser } = await import("@/lib/bootstrap-user");
    const trialEndsAt = new Date(Date.now() + (await trialDaysForEmail(email)) * 86_400_000);
    try {
      const created = await prisma.user.create({
        data: {
          email,
          emailVerified: new Date(),
          subscriptionStatus: "TRIAL",
          trialEndsAt,
          signupMethod: "mobile-email-code",
        },
        select: { id: true },
      });
      await bootstrapNewUser({ userId: created.id, email, signupMethod: "mobile-email-code" });
      isNewUser = true;
    } catch (err) {
      // Lost a race with a parallel verify for the same email — fall through
      // to the existing row.
      if ((err as { code?: string } | null)?.code !== "P2002") throw err;
    }
    user = await prisma.user.findUnique({ where: { email }, select: USER_SELECT });
    if (!user) return NextResponse.json({ error: "InvalidCode" }, { status: 400 });
  } else if (!user.emailVerified) {
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
  }

  const { sessionToken, expiresAt } = await issueMobileSessionToken(user);
  const payload = await mobileSessionResponse({ sessionToken, expiresAt, user });
  return NextResponse.json({ ...payload, isNewUser });
}
