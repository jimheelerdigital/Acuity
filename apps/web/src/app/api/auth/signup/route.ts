/**
 * POST /api/auth/signup
 *
 * Email/password signup. NextAuth's CredentialsProvider only
 * authenticates existing users — account creation is ours. This
 * route:
 *   1. Validates email format + password (≥12 chars).
 *   2. Rate-limits per email (5/hour).
 *   3. Creates a user row. Never links: an existing account (any
 *      sign-in method) is a 409. Adding a password to an existing
 *      account requires email proof — Forgot password → reset-password.
 *   4. Sends a verification email via Resend. The user cannot sign
 *      in until they click the link.
 *
 * Response shape:
 *   200 { ok: true, requiresVerification: true }
 *   400 { error: "InvalidEmail" | "WeakPassword" }
 *   409 { error: "AlreadyRegistered", next: "signin" }  ← ANY existing account
 *       (2026-10-18: previously only when a passwordHash existed; a
 *       passwordless account silently got the caller's password — a
 *       takeover with nothing but an email address)
 *   429 { error: "RateLimited" }
 */

import { NextRequest, NextResponse } from "next/server";

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
    console.warn("[SIGNUP_FAIL]", JSON.stringify({ reason: "InvalidEmail", method: "email", timestamp: new Date().toISOString() }));
    return NextResponse.json({ error: "InvalidEmail" }, { status: 400 });
  }

  const pw = validatePassword(password);
  if (!pw.ok) {
    console.warn("[SIGNUP_FAIL]", JSON.stringify({ reason: "WeakPassword", method: "email", timestamp: new Date().toISOString() }));
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
  if (!rlIp.success) {
    console.warn("[SIGNUP_FAIL]", JSON.stringify({ reason: "RateLimited", source: "ip", method: "email", timestamp: new Date().toISOString() }));
    return rateLimitedResponse(rlIp);
  }
  const rl = await checkRateLimit(limiters.authByEmail, `signup:${email}`);
  if (!rl.success) {
    console.warn("[SIGNUP_FAIL]", JSON.stringify({ reason: "RateLimited", source: "email", method: "email", timestamp: new Date().toISOString() }));
    return rateLimitedResponse(rl);
  }

  const { prisma } = await import("@/lib/prisma");

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, emailVerified: true },
  });

  if (existing) {
    // Any existing account — with OR without a password — is a 409.
    //
    // 2026-10-18 (account-takeover fix): this route used to write the new
    // password onto an existing Google / Apple / email-code account with
    // no proof the caller owns the mailbox, which let anyone who knew an
    // email sign in as that person. Setting a password on an existing
    // account now goes through the email-proof paths only: Forgot
    // password (emailed token → /api/auth/reset-password) or a signed-in
    // session. Same response whether or not a password exists, so this
    // leaks nothing beyond what it already did.
    console.warn("[SIGNUP_FAIL]", JSON.stringify({ reason: "AlreadyRegistered", method: "email", timestamp: new Date().toISOString() }));
    return NextResponse.json(
      { error: "AlreadyRegistered", next: "signin" },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);
  const verifyToken = randomToken();
  const verifyExpires = new Date(Date.now() + VERIFY_TTL_HOURS * 60 * 60 * 1000);

  let userId: string;
  let wasCreated = false;

  {
    // Single source of truth for trial length: trialDaysForEmail (14
    // standard, 3 for re-signups within 90d — anti-abuse). bootstrapNewUser
    // re-derives the same base below + adds founding/referral bonuses.
    const { trialDaysForEmail } = await import("@/lib/bootstrap-user");
    const defaultTrialEnd = new Date(
      Date.now() + (await trialDaysForEmail(email)) * 24 * 60 * 60 * 1000
    );
    const created = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        subscriptionStatus: "TRIAL",
        trialEndsAt: defaultTrialEnd,
        // NOT auto-verified (2026-10-18). Sign-in still doesn't gate on
        // verification (Keenan, 2026-09-28) — nothing about the user's
        // own experience changes. What "unverified" now controls is the
        // other direction: if Google/Apple later sign in with this email,
        // lib/auth.ts signIn treats an unverified password account as
        // unproven and clears the password + sessions before linking, so
        // pre-registering someone else's address buys an attacker nothing.
        // emailVerified is set by the verify link, a sign-in code, or an
        // OAuth link.
        signupMethod: "email",
      },
      select: { id: true },
    });
    userId = created.id;
    wasCreated = true;

    // Same bootstrap as Google OAuth signups. Trial clock + Life
    // Matrix + UserMemory + trial_started event.
    const { bootstrapNewUser } = await import("@/lib/bootstrap-user");
    // Client attribution first; fill gaps from the first-touch attribution
    // cookie. The funnels read UTMs from sessionStorage, which is empty in
    // some in-app/desktop sessions, so signups arrived with no UTMs and the
    // founder email said "direct / organic" for ad signups (2026-09-25:
    // Cindy, Blessen, Erika were all Meta ad clicks).
    const { getAttributionFromCookie } = await import("@/lib/attribution");
    const cookieAttr = getAttributionFromCookie(req.headers.get("cookie") ?? "") ?? {};
    const clientAttr = Object.fromEntries(
      Object.entries(body?.attribution ?? {}).filter(([, v]) => typeof v === "string" && v.length > 0)
    ) as Record<string, string>;
    const merged = { ...cookieAttr, ...clientAttr } as Record<string, string | number | undefined>;
    const attr = Object.keys(merged).length > 0 ? (merged as Record<string, string>) : undefined;
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

  // Always a brand-new, unverified account at this point — the welcome
  // email carries the verify link.
  {
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
      const { sendEmailOrThrow } = await import("@/lib/resend");
      await sendEmailOrThrow({
        from: process.env.EMAIL_FROM ?? "Ripple <hello@getacuity.io>",
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
    const reqHeaders = req.headers;
    const nameParts = (name ?? "").trim().split(/\s+/);

    // Awaited: fire-and-forget fetches can be cut off when the serverless
    // function freezes after responding, and a dropped CompleteRegistration
    // is a missing ad result in Meta. sendConversionEvent never throws.
    const { hasInternalCookie } = await import("@/lib/internal-traffic");
    await sendConversionEvent({
      eventName: "CompleteRegistration",
      eventId,
      userId,
      internal: hasInternalCookie(reqHeaders.get("cookie")),
      eventSourceUrl: `${req.nextUrl.origin}/auth/signup`,
      userData: {
        email,
        externalId: userId,
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
      requiresVerification: false, // never required (2026-09-28)
      wasCreated,
      capiEventId: eventId, // returned so browser pixel can use same event_id for dedup
    });
  }

  return NextResponse.json({
    ok: true,
    requiresVerification: false, // never required (2026-09-28)
    wasCreated,
  });
}
