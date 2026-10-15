/**
 * POST /api/auth/mobile-email-code/request  { email } → { ok: true }
 *
 * Emails a 6-digit sign-in code (app 1.9.1 passwordless sign-in). Always
 * answers { ok: true } for a valid address so it can't be used to discover
 * who has an account. The account is created only when the code is
 * verified (…/verify), so requesting a code never creates a user.
 */

import { NextRequest, NextResponse } from "next/server";

import { appReviewCodeFor, issueCode, normalizeEmail } from "@/lib/email-code";
import {
  checkRateLimit,
  identifierFromRequest,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = normalizeEmail(body?.email);
  if (!email) return NextResponse.json({ error: "InvalidEmail" }, { status: 400 });

  const byEmail = await checkRateLimit(limiters.authByEmail, `email-code:${email}`);
  if (!byEmail.success) return rateLimitedResponse(byEmail);
  const byIp = await checkRateLimit(limiters.auth, identifierFromRequest(req, "email-code-request"));
  if (!byIp.success) return rateLimitedResponse(byIp);

  // App Review accounts use the fixed code from server env; nothing to send.
  if (appReviewCodeFor(email)) return NextResponse.json({ ok: true });

  const code = await issueCode(email);
  try {
    const { signInCodeEmail } = await import("@/emails/sign-in-code");
    const { subject, html } = signInCodeEmail(code);
    const { sendEmailOrThrow } = await import("@/lib/resend");
    await sendEmailOrThrow({
      from: process.env.EMAIL_FROM ?? "Ripple <hello@getacuity.io>",
      to: email,
      subject,
      html,
    });
  } catch (err) {
    console.error("[mobile-email-code] send failed:", err);
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.captureException(err, { tags: { stage: "mobile-email-code-send" } });
    } catch {}
    return NextResponse.json({ error: "SendFailed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
