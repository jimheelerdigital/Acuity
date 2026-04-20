/**
 * GET /api/auth/verify-email?token=…
 *
 * Consumes a verification token from the signup flow, marks
 * User.emailVerified, and 302s to /auth/signin?verified=1 (or
 * /auth/error on failure).
 *
 * This is the public-facing link target in the verification email —
 * clicked from Safari/Chrome on any device. No session required;
 * the token itself is the auth. Tokens are single-use and deleted
 * on success.
 *
 * Also accepts POST with JSON body { token } for the mobile app to
 * call directly (rare; normally mobile users get bootstrapped via
 * signup → verify → sign-in with password, no need for the GET path).
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VERIFY_PREFIX = "verify:";

async function consumeToken(token: string): Promise<
  | { ok: true; email: string }
  | { ok: false; reason: "InvalidToken" | "ExpiredToken" | "UserNotFound" }
> {
  if (!token) return { ok: false, reason: "InvalidToken" };

  const { prisma } = await import("@/lib/prisma");

  const record = await prisma.verificationToken.findUnique({
    where: { token },
  });
  if (!record || !record.identifier.startsWith(VERIFY_PREFIX)) {
    return { ok: false, reason: "InvalidToken" };
  }
  if (record.expires < new Date()) {
    // Expire cleanup — remove so the row doesn't linger.
    await prisma.verificationToken
      .delete({ where: { token } })
      .catch(() => {});
    return { ok: false, reason: "ExpiredToken" };
  }

  const email = record.identifier.slice(VERIFY_PREFIX.length);
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true },
  });
  if (!user) return { ok: false, reason: "UserNotFound" };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: user.emailVerified ?? new Date() },
    }),
    prisma.verificationToken.delete({ where: { token } }),
  ]);

  return { ok: true, email };
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const result = await consumeToken(token);

  if (result.ok) {
    const dest = new URL("/auth/signin", req.nextUrl.origin);
    dest.searchParams.set("verified", "1");
    return NextResponse.redirect(dest, 302);
  }

  const dest = new URL("/auth/error", req.nextUrl.origin);
  dest.searchParams.set("error", `Verify-${result.reason}`);
  return NextResponse.redirect(dest, 302);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const result = await consumeToken(token);

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
