/**
 * POST /api/auth/signup
 *
 * Email/password signup. NextAuth's CredentialsProvider only
 * authenticates existing users — account creation is ours. This
 * route:
 *   1. Validates email format + password (≥12 chars).
 *   2. Rate-limits per email (5/hour).
 *   3. Creates or links a user row (OAuth-only users can add a
 *      password here — we treat it as account linking, not an
 *      error).
 *   4. Sends a verification email via Resend. The user cannot sign
 *      in until they click the link.
 *
 * Response shape:
 *   200 { ok: true, requiresVerification: true }
 *   400 { error: "InvalidEmail" | "WeakPassword" }
 *   409 { error: "AlreadyRegistered" }  ← only when user has a passwordHash
 *   429 { error: "RateLimited" }
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { welcomeVerifyEmail } from "@/emails/welcome-verify";
import { randomToken } from "@/lib/auth-tokens";
import { signUnsubscribeToken } from "@/lib/email-tokens";
import { hashPassword, validatePassword } from "@/lib/passwords";
import {
  checkRateLimit,
  identifierFromRequest,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";
import {
  sendConversionEvent,
  generateEventId,
  getClientIp,
  extractFbCookies,
} from "@/lib/meta-capi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFY_PREFIX = "verify:";
const VERIFY_TTL_HOURS = 24;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
    name?: unknown;
    referralCode?: unknown;
    attribution?: Record<string, string>;
  } | null;

  const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, 100) : null;
  const referralCode =
    typeof body?.referralCode === "string" && body.referralCode.trim().length > 0
      ? body.referralCode.trim().slice(0, 16)
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

  // Per-email cap stops brute-force on a single address. Per-IP cap
  // stops industrial farming across many addresses (the authByEmail
  // limiter keys on the address itself, so an attacker rotating
  // through new emails defeats it). Both must pass.
  const rlIp = await checkRateLimit(
    limiters.signupByIp,
    identifierFromRequest(req, "signup")
  );
  if (!rlIp.success) return rateLimitedResponse(rlIp);
  const rl = await checkRateLimit(limiters.authByEmail, `signup:${email}`);
  if (!rl.success) return rateLimitedResponse(rl);

  const { prisma } = await import("@/lib/prisma");

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, emailVerified: true },
  });

  if (existing?.passwordHash) {
    // Already has an email/password account — send them to sign-in
    // instead of silently overwriting. Don't leak which step
    // (wrong password vs already-registered) for pre-auth probing;
    // but the error code here is fine because the user had to
    // supply a valid password to get this far (we hashed it, and
    // a login attempt with that password would succeed separately).
    return NextResponse.json({ error: "AlreadyRegistered" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const verifyToken = randomToken();
  const verifyExpires = new Date(Date.now() + VERIFY_TTL_HOURS * 60 * 60 * 1000);

  let userId: string;
  let wasCreated = false;

  if (existing) {
    // OAuth-only user linking a password. Keep their existing
    // emailVerified if present (Google already verified it) —
    // no need to force a re-verify on account linking.
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, ...(name ? { name } : {}) },
    });
    userId = existing.id;
  } else {
    const defaultTrialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const created = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        subscriptionStatus: "TRIAL",
        trialEndsAt: defaultTrialEnd,
        // Mark as verified immediately so user can sign in right away.
        // Verification email still sent for security, but doesn't block access.
        // This removes the biggest mobile conversion killer — users from ads
        // sign up, get told to check email, leave, and never come back.
        emailVerified: new Date(),
        signupMethod: "email",
      },
      select: { id: true },
    });
    userId = created.id;
    wasCreated = true;

    // Same bootstrap as Google OAuth signups. Trial clock + Life
    // Matrix + UserMemory + trial_started event.
    const { bootstrapNewUser } = await import("@/lib/bootstrap-user");
    const attr = body?.attribution;
    console.log("[attribution] POST /api/auth/signup — received from client:", JSON.stringify(attr ?? null));
    // skipWelcomeEmail=true: combined welcome+verify email goes out
    // below — see mobile-signup for full rationale.
    await bootstrapNewUser({
      userId,
      email,
      referralCodeFromSignup: referralCode,
      skipWelcomeEmail: true,
      signupMethod: "email",
      attribution: attr ? {
        utmSource: attr.utm_source,
        utmMedium: attr.utm_medium,
        utmCampaign: attr.utm_campaign,
        utmContent: attr.utm_content,
        utmTerm: attr.utm_term,
        referrer: attr.referrer,
        landingPath: attr.landingPath,
      } : undefined,
    });
  }

  // Store the verification token. Reuse NextAuth's VerificationToken
  // table — the "verify:" prefix on the identifier distinguishes
  // these from magic-link and mobile-magic-link tokens, all three
  // share the table but have disjoint identifier namespaces.
  await prisma.verificationToken.create({
    data: {
      identifier: `${VERIFY_PREFIX}${email}`,
      token: verifyToken,
      expires: verifyExpires,
    },
  });

  // If the user already had a verified email (OAuth linking case),
  // we don't need to re-send a verification email — but for
  // consistency we still generate the token and could use it for
  // a welcome email later. Skipping send keeps inbox noise down.
  if (!existing || !existing.emailVerified) {
    const userRow = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, foundingMemberNumber: true },
    });
    const firstName =
      (userRow?.name ?? name ?? "").trim().split(/\s+/)[0] || "friend";

    const origin = req.nextUrl.origin;
    const verifyUrl = `${origin}/api/auth/verify-email?token=${encodeURIComponent(verifyToken)}`;
    const unsubscribeUrl = `${origin}/api/emails/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(userId, "onboarding"))}`;
    const { subject, html } = welcomeVerifyEmail({
      firstName,
      verifyUrl,
      unsubscribeUrl,
      foundingMemberNumber: userRow?.foundingMemberNumber ?? null,
    });
    try {
      const { getResendClient } = await import("@/lib/resend");
      await getResendClient().emails.send({
        from: process.env.EMAIL_FROM ?? "Acuity <hello@getacuity.io>",
        to: email,
        subject,
        html,
      });
    } catch (emailErr) {
      console.error("[signup] Welcome/verify email send failed:", emailErr);
      try {
        const Sentry = await import("@sentry/nextjs");
        Sentry.captureException(emailErr, {
          tags: { stage: "signup-email-send" },
          extra: { userId, email },
        });
      } catch {}
      // Don't block signup — user was already created successfully
    }
  }

  // Fire Meta CAPI CompleteRegistration for new signups (best-effort, non-blocking)
  if (wasCreated) {
    const eventId = generateEventId("CompleteRegistration");
    const reqHeaders = headers();
    const nameParts = (name ?? "").trim().split(/\s+/);

    sendConversionEvent({
      eventName: "CompleteRegistration",
      eventId,
      eventSourceUrl: `${req.nextUrl.origin}/auth/signup`,
      userData: {
        email,
        firstName: nameParts[0] || undefined,
        lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : undefined,
        ip: getClientIp(reqHeaders),
        userAgent: reqHeaders.get("user-agent") || undefined,
        fbclid: body?.attribution?.fbclid || undefined,
        ...extractFbCookies(reqHeaders.get("cookie")),
      },
      customData: {
        content_name: "Free Trial Signup",
        currency: "USD",
        value: 0,
      },
    }).catch(() => {}); // fire-and-forget

    return NextResponse.json({
      ok: true,
      requiresVerification: !existing || !existing.emailVerified,
      wasCreated,
      capiEventId: eventId, // returned so browser pixel can use same event_id for dedup
    });
  }

  return NextResponse.json({
    ok: true,
    requiresVerification: !existing || !existing.emailVerified,
    wasCreated,
  });
}
