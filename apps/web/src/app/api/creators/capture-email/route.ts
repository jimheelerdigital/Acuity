/**
 * POST /api/creators/capture-email { email, code }
 *
 * Road 3 of creator attribution: the landing's store step stores the email
 * against the visitor's click and emails them the store links. If the
 * visitor has no click cookie (blocked / bot-filtered), a click row is
 * created now.
 *
 * The capture is UNVERIFIED here: this endpoint is unauthenticated, so the
 * address proves nothing (finding 5, 2026-10-28). The email's links go
 * through /c/get, and only when the inbox owner taps one does the capture
 * become verified — and only verified captures match at signup (30 days,
 * lib/creators/attribution). Capturing someone else's address therefore
 * earns nothing unless that person opens our email and downloads from it.
 */
import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  CLICK_COOKIE,
  CLICK_COOKIE_DAYS,
  CREATOR_EMAIL_FROM,
  CREATOR_EMAIL_REPLY_TO,
  SITE_URL,
  cookieDomainFor,
} from "@/lib/creators/config";
import { captureLinkUrl, signCaptureToken } from "@/lib/creators/email-capture";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { email?: unknown; code?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const { resolveCode } = await import("@/lib/creators/codes");
  const owner = await resolveCode(typeof body?.code === "string" ? body.code : null);
  const code = owner?.referralCode ?? null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !code) {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  // It sends an email, so cap it per IP (same budget as the waitlist form).
  const { checkRateLimit, identifierFromRequest, limiters, rateLimitedResponse } = await import("@/lib/rate-limit");
  const rl = await checkRateLimit(limiters.waitlist, identifierFromRequest(req, "creator-capture"));
  if (!rl.success) return rateLimitedResponse(rl);

  const { prisma } = await import("@/lib/prisma");
  const creator = owner!;

  const now = new Date();
  let clickId = req.cookies.get(CLICK_COOKIE)?.value ?? null;
  const existing = clickId
    ? await prisma.creatorReferralClick.findUnique({ where: { clickId }, select: { creatorId: true } })
    : null;
  if (existing && existing.creatorId === creator.id) {
    await prisma.creatorReferralClick.update({
      where: { clickId: clickId! },
      // A new address on this click starts unverified again.
      data: { capturedEmail: email, capturedEmailAt: now, capturedEmailVerifiedAt: null },
    });
  } else {
    clickId = randomUUID();
    await prisma.creatorReferralClick.create({
      data: {
        creatorId: creator.id,
        clickId,
        userAgent: req.headers.get("user-agent")?.slice(0, 400) ?? null,
        referrer: req.headers.get("referer")?.slice(0, 400) ?? null,
        capturedEmail: email,
        capturedEmailAt: now,
      },
    });
  }

  try {
    const { sendEmailOrThrow } = await import("@/lib/resend");
    const token = signCaptureToken({ clickId: clickId!, email });
    const ios = captureLinkUrl(SITE_URL, token, "ios");
    const play = captureLinkUrl(SITE_URL, token, "android");
    await sendEmailOrThrow({
      from: CREATOR_EMAIL_FROM,
      replyTo: CREATOR_EMAIL_REPLY_TO,
      to: email,
      subject: "Your Ripple download link",
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5;color:#1d1b22;max-width:480px">
<p>Here's the link you asked for.</p>
<p><a href="${ios}">Ripple on the App Store (iPhone)</a><br/><a href="${play}">Ripple on Google Play (Android)</a></p>
<p>Use the same email when you create your account. If the app asks who sent you, your code is <strong>${code}</strong>.</p>
<p style="color:#77737f;font-size:13px">You're getting this because you asked for it on goripple.io. We won't email you again unless you sign up.</p>
</div>`,
    });
  } catch (err) {
    safeLog.warn("creators.capture-email.send-failed", { err: err instanceof Error ? err.message : String(err) });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(CLICK_COOKIE, clickId!, {
    maxAge: CLICK_COOKIE_DAYS * 24 * 60 * 60,
    path: "/",
    domain: cookieDomainFor(req.headers.get("host")),
    sameSite: "lax",
    secure: true,
    httpOnly: true,
  });
  return res;
}
