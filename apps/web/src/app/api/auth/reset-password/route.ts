/**
 * POST /api/auth/reset-password
 *
 * Second half of the forgot-password flow. The email's reset link
 * lands the user at /auth/reset-password?token=…; that page POSTs
 * here with { token, password } to finalize the change.
 *
 *   200 { ok: true }
 *   400 { error: "InvalidToken" | "ExpiredToken" | "WeakPassword" }
 *   429 { error: "RateLimited" }
 *
 * On success we clear resetToken + resetTokenExpires so the link is
 * single-use and any ongoing sessions stay intact (a password
 * rotation doesn't imply a compromise). If later we decide to
 * invalidate sessions on reset, this is the spot to do it (bump a
 * session epoch column, re-check in the JWT callback).
 */

import { NextRequest, NextResponse } from "next/server";

import { hashPassword, validatePassword } from "@/lib/passwords";
import {
  checkRateLimit,
  identifierFromRequest,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    token?: unknown;
    password?: unknown;
  } | null;

  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!token) {
    return NextResponse.json({ error: "InvalidToken" }, { status: 400 });
  }

  const pw = validatePassword(password);
  if (!pw.ok) {
    return NextResponse.json(
      { error: "WeakPassword", message: pw.message },
      { status: 400 }
    );
  }

  // IP-scoped limit — the token itself is the primary rate-limit
  // mechanism (single-use + 1h expiry), so this is a belt-and-braces
  // block against distributed guessing.
  const rl = await checkRateLimit(
    limiters.auth,
    identifierFromRequest(req, "reset-password")
  );
  if (!rl.success) return rateLimitedResponse(rl);

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { resetToken: token },
    select: { id: true, resetTokenExpires: true, emailVerified: true },
  });
  if (!user) {
    return NextResponse.json({ error: "InvalidToken" }, { status: 400 });
  }
  if (!user.resetTokenExpires || user.resetTokenExpires < new Date()) {
    // Expired — clean up and reject.
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: null, resetTokenExpires: null },
    });
    return NextResponse.json({ error: "ExpiredToken" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      resetToken: null,
      resetTokenExpires: null,
      // A password reset also acts as an implicit email verification —
      // the user demonstrably controls the inbox that received the
      // reset link. Saves a dead-end where a user signed up, didn't
      // verify, and then "reset" their password expecting to log in.
      emailVerified: user.emailVerified ?? new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
