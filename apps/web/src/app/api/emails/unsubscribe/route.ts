/**
 * GET /api/emails/unsubscribe?token=TOKEN
 *
 * Public endpoint (no auth) — the token is the auth. Verifies the
 * signed token, flips the correct User.*EmailEnabled flag, and renders
 * a simple confirmation page.
 *
 * Idempotent: re-hitting the same link just leaves the flag off.
 * POST for one-click unsubscribe compliance (some mail clients probe
 * the link with POST per RFC 8058). Both methods do the same thing.
 */

import { NextRequest, NextResponse } from "next/server";

import { verifyUnsubscribeToken } from "@/lib/email-tokens";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return htmlResponse(
      invalidPage("Missing unsubscribe token."),
      400
    );
  }

  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) {
    return htmlResponse(
      invalidPage(
        "This unsubscribe link is invalid or expired. Sign in and update your email preferences from /account."
      ),
      400
    );
  }

  const { prisma } = await import("@/lib/prisma");
  try {
    await prisma.user.update({
      where: { id: parsed.userId },
      data:
        parsed.kind === "weekly"
          ? { weeklyEmailEnabled: false }
          : parsed.kind === "monthly"
            ? { monthlyEmailEnabled: false }
            : { onboardingUnsubscribed: true },
    });
  } catch {
    return htmlResponse(
      invalidPage("Could not update your preferences. Please try again."),
      500
    );
  }

  return htmlResponse(
    confirmedPage(parsed.kind),
    200
  );
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}

function htmlResponse(html: string, status: number): Response {
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function pageShell(body: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe · Acuity</title>
<style>
body{margin:0;background:#0D0D0F;color:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px}
.card{max-width:480px;background:#18181B;border:1px solid #27272A;border-radius:16px;padding:40px;text-align:center}
h1{font-size:22px;margin:0 0 16px}
p{color:#A1A1AA;line-height:1.6;margin:0 0 20px;font-size:15px}
a{color:#A78BFA;text-decoration:none;font-weight:500}
.logo{width:48px;height:48px;background:linear-gradient(135deg,#7C3AED,#4F46E5);border-radius:12px;margin:0 auto 24px;display:flex;align-items:center;justify-content:center;font-size:22px}
</style>
</head>
<body><div class="card">${body}</div></body></html>`;
}

function confirmedPage(kind: "weekly" | "monthly" | "onboarding"): string {
  if (kind === "onboarding") {
    return pageShell(`
      <div class="logo">✦</div>
      <h1>You're off the onboarding list.</h1>
      <p>No more tips, debrief reminders, or trial check-ins from Keenan. Your weekly report and any transactional emails (password reset, payment receipts) will still reach you.</p>
      <p><a href="/account">Account settings</a></p>
    `);
  }
  const label = kind;
  return pageShell(`
    <div class="logo">✦</div>
    <h1>You're unsubscribed from the ${label} digest.</h1>
    <p>We won't send you any more ${label} summary emails. You can turn them back on anytime from <a href="/account">Account settings</a>.</p>
  `);
}

function invalidPage(message: string): string {
  return pageShell(`
    <div class="logo">✦</div>
    <h1>Something went wrong</h1>
    <p>${message}</p>
    <p><a href="/account">Go to Account settings</a></p>
  `);
}
