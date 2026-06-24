/**
 * GET  /api/notifications/opt-out?token=TOKEN
 * POST /api/notifications/opt-out?token=TOKEN
 *
 * Public endpoint (no auth) — the signed token is the auth. Lets a
 * smart-notification email carry a one-click "stop sending me THIS
 * category" link. Verifies the token, then removes the encoded category
 * from the user's UserNotificationPreferences.enabledCategories,
 * leaving every other enabled category (and the email channel as a
 * whole) untouched.
 *
 * Idempotent: re-hitting the same link is a no-op once the category is
 * already gone. POST is accepted for one-click compliance (RFC 8058
 * mail clients probe with POST).
 */

import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_ENABLED_CATEGORIES, isNotificationCategory } from "@acuity/shared";

import { verifyCategoryOptOutToken } from "@/lib/email-tokens";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return htmlResponse(invalidPage("Missing opt-out token."), 400);
  }

  const parsed = verifyCategoryOptOutToken(token);
  if (!parsed) {
    return htmlResponse(
      invalidPage(
        "This opt-out link is invalid or expired. Sign in and update your notification preferences from /account."
      ),
      400
    );
  }

  if (!isNotificationCategory(parsed.category)) {
    return htmlResponse(invalidPage("Unknown notification category."), 400);
  }

  const { prisma } = await import("@/lib/prisma");
  try {
    // Lazily create the prefs row with defaults if missing, then drop
    // this category. The two-step keeps the create path simple and the
    // remove a no-op when the category is already absent.
    const row = await prisma.userNotificationPreferences.upsert({
      where: { userId: parsed.userId },
      create: {
        userId: parsed.userId,
        enabledCategories: [...DEFAULT_ENABLED_CATEGORIES],
      },
      update: {},
      select: { enabledCategories: true },
    });

    if (row.enabledCategories.includes(parsed.category)) {
      await prisma.userNotificationPreferences.update({
        where: { userId: parsed.userId },
        data: {
          enabledCategories: row.enabledCategories.filter(
            (c) => c !== parsed.category
          ),
        },
      });
    }
  } catch {
    return htmlResponse(
      invalidPage("Could not update your preferences. Please try again."),
      500
    );
  }

  return htmlResponse(confirmedPage(), 200);
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
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Notification preferences · Acuity</title>
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

function confirmedPage(): string {
  return pageShell(`
    <div class="logo">✦</div>
    <h1>You're opted out of this notification.</h1>
    <p>We won't send you this kind of notification anymore. Your other notifications are unchanged. You can manage everything anytime from <a href="/account">Account settings</a>.</p>
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
