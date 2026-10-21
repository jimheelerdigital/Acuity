/**
 * POST /api/admin/emails/review-ask
 *
 * One-off personal note from Keenan asking Ripple's most engaged app users
 * for an honest store rating (2026-10-21, per Keenan: "send a targeted email
 * to our best users asking them to leave a review"). Runs in prod so the
 * unsubscribe token is signed with prod's NEXTAUTH_SECRET.
 *
 * Segment: app installed (pushTokenPlatform ios/android), totalRecordings ≥
 * minDebriefs, a recording in the last `days`, not opted out of digests or
 * onboarding email, not admin/team/test. Every engaged user in the segment is
 * asked (no sentiment filtering) and nothing is offered for a review, per
 * App Store / Play rules.
 *
 * Body: { mode: "preview" | "test" | "send", testEmail?: string,
 *         minDebriefs?: number (default 3), days?: number (default 30) }
 * - preview: segment size + masked recipients, sends nothing
 * - test: sends the iOS and Android versions to testEmail only
 * - send: sends to the segment; each user at most once ever
 *   (OnboardingEvent "email_review_ask_sent")
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { signUnsubscribeToken } from "@/lib/email-tokens";
import { sendEmailOrThrow } from "@/lib/resend";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FROM = '"Keenan from Ripple" <keenan@goripple.io>';
// goripple.io has no MX; replies must land somewhere real.
const REPLY_TO = "keenan@heelerdigital.com";
const SENT_EVENT = "email_review_ask_sent";
const STORE = {
  ios: { url: "https://apps.apple.com/app/id6762633410?action=write-review", label: "Rate Ripple on the App Store", store: "the App Store" },
  android: { url: "https://play.google.com/store/apps/details?id=com.heelerdigital.acuity&showAllReviews=true", label: "Rate Ripple on Google Play", store: "Google Play" },
} as const;

type Platform = keyof typeof STORE;

function firstName(name: string | null): string {
  const n = (name ?? "").trim().split(/\s+/)[0];
  return n && /^[\p{L}'-]{2,}$/u.test(n) ? n[0].toUpperCase() + n.slice(1) : "";
}

function render(p: { name: string; platform: Platform; unsubUrl: string }) {
  const s = STORE[p.platform];
  const hi = p.name ? `Hi ${p.name},` : "Hi,";
  const subject = "A quick favor from Keenan at Ripple";
  const text = `${hi}

I'm Keenan, one of the two people building Ripple. You use it more than almost anyone, so I wanted to ask you directly.

Would you leave a rating on ${s.store}? Ratings are the biggest thing that helps other people find Ripple, and honest beats nice. If something bugs you, say so there, or just reply to this email and tell me. I read every reply.

${s.label}: ${s.url}

Thank you for being here.

Keenan
Cofounder, Ripple

Don't want emails like this? ${p.unsubUrl}`;

  const html = `<!doctype html><html><body style="margin:0;background:#FBF8F4;">
<div style="max-width:560px;margin:0 auto;padding:36px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1B1815;font-size:16px;line-height:1.6;">
<p style="margin:0 0 16px;">${hi}</p>
<p style="margin:0 0 16px;">I'm Keenan, one of the two people building Ripple. You use it more than almost anyone, so I wanted to ask you directly.</p>
<p style="margin:0 0 24px;">Would you leave a rating on ${s.store}? Ratings are the biggest thing that helps other people find Ripple, and honest beats nice. If something bugs you, say so there, or just reply to this email and tell me. I read every reply.</p>
<p style="margin:0 0 28px;"><a href="${s.url}" style="display:inline-block;background:#B9472A;color:#FFFFFF;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:999px;">${s.label}</a></p>
<p style="margin:0 0 4px;">Thank you for being here.</p>
<p style="margin:0;">Keenan<br><span style="color:#57514B;">Cofounder, Ripple</span></p>
<p style="margin:36px 0 0;font-size:12px;color:#6B645D;">You're getting this because you use the Ripple app. <a href="${p.unsubUrl}" style="color:#6B645D;">Unsubscribe</a></p>
</div></body></html>`;
  return { subject, text, html };
}

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }

  const body = (await req.json().catch(() => ({}))) as {
    mode?: string;
    testEmail?: string;
    minDebriefs?: number;
    days?: number;
  };
  const mode = body.mode ?? "preview";
  const minDebriefs = typeof body.minDebriefs === "number" ? body.minDebriefs : 3;
  const days = typeof body.days === "number" ? body.days : 30;

  if (mode === "test") {
    if (!body.testEmail) return NextResponse.json({ error: "testEmail required" }, { status: 400 });
    const sent = [];
    for (const platform of ["ios", "android"] as const) {
      const msg = render({ name: "Keenan", platform, unsubUrl: "https://goripple.io/api/emails/unsubscribe?token=TEST" });
      const r = await sendEmailOrThrow({ from: FROM, replyTo: REPLY_TO, to: body.testEmail, subject: `[TEST ${platform}] ${msg.subject}`, text: msg.text, html: msg.html });
      sent.push({ platform, id: r?.id });
    }
    return NextResponse.json({ ok: true, mode, sent });
  }

  const { prisma } = await import("@/lib/prisma");
  const since = new Date(Date.now() - days * 864e5);
  const users = await prisma.user.findMany({
    where: {
      isAdmin: false,
      weeklyEmailEnabled: true,
      onboardingUnsubscribed: false,
      pushTokenPlatform: { in: ["ios", "android"] },
      totalRecordings: { gte: minDebriefs },
      lastRecordingAt: { gte: since },
      NOT: [
        { email: { contains: "heelerdigital" } },
        { email: { contains: "example.com" } },
        { email: { contains: "+test" } },
        { email: { contains: "keenan" } },
      ],
    },
    select: { id: true, email: true, name: true, pushTokenPlatform: true, totalRecordings: true },
    orderBy: { totalRecordings: "desc" },
  });
  const already = new Set(
    (
      await prisma.onboardingEvent.findMany({
        where: { event: SENT_EVENT, userId: { in: users.map((u) => u.id) } },
        select: { userId: true },
      })
    ).map((e) => e.userId)
  );
  const recipients = users.filter((u) => !already.has(u.id));

  if (mode === "preview") {
    return NextResponse.json({
      ok: true,
      mode,
      minDebriefs,
      days,
      count: recipients.length,
      alreadySent: already.size,
      recipients: recipients.map((u) => ({
        email: u.email.replace(/^(.).*(@.*)$/, "$1***$2"),
        firstName: firstName(u.name) || "(none)",
        platform: u.pushTokenPlatform,
        debriefs: u.totalRecordings,
      })),
    });
  }

  if (mode !== "send") return NextResponse.json({ error: "mode must be preview, test or send" }, { status: 400 });

  const results: { email: string; ok: boolean; error?: string }[] = [];
  for (const u of recipients) {
    try {
      const unsubUrl = `https://goripple.io/api/emails/unsubscribe?token=${signUnsubscribeToken(u.id, "onboarding")}`;
      const msg = render({ name: firstName(u.name), platform: u.pushTokenPlatform as Platform, unsubUrl });
      await sendEmailOrThrow({
        from: FROM,
        replyTo: REPLY_TO,
        to: u.email,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        headers: { "List-Unsubscribe": `<${unsubUrl}>` },
      });
      await prisma.onboardingEvent.create({ data: { userId: u.id, event: SENT_EVENT, value: u.pushTokenPlatform } });
      results.push({ email: u.email.replace(/^(.).*(@.*)$/, "$1***$2"), ok: true });
    } catch (err) {
      results.push({ email: u.email.replace(/^(.).*(@.*)$/, "$1***$2"), ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    await new Promise((r) => setTimeout(r, 600)); // stay under Resend's rate limit
  }
  return NextResponse.json({ ok: true, mode, sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) });
}
