/**
 * POST /api/auth/magic-confirm
 *
 * The user's explicit confirm-click from /auth/confirm. Consumes the magic-link
 * token by handing off (303) to NextAuth's own email callback — so consumption
 * happens on THIS user-initiated POST, never on an email scanner's GET prefetch
 * of the link. Only ever redirects to the fixed NextAuth callback on
 * NEXTAUTH_URL, so it can't be turned into an open redirect.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const token = form ? String(form.get("token") ?? "") : "";
  const email = form ? String(form.get("email") ?? "") : "";
  const callbackUrl = form ? String(form.get("callbackUrl") ?? "/") : "/";

  const base = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;

  if (!token || !email) {
    return NextResponse.redirect(new URL("/auth/error?error=Verification", base), 303);
  }

  // Hand off to NextAuth's email callback (GET) — it verifies + consumes the
  // single-use token, establishes the session, and redirects to callbackUrl.
  const callback = new URL("/api/auth/callback/email", base);
  callback.searchParams.set("token", token);
  callback.searchParams.set("email", email);
  callback.searchParams.set("callbackUrl", callbackUrl);

  return NextResponse.redirect(callback.toString(), 303);
}
