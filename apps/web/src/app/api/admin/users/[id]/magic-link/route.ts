/**
 * POST /api/admin/users/[id]/magic-link
 *
 * Admin-initiated password-reset email. Always sends if the user has
 * a passwordHash — OAuth-only accounts get a 400 pointing that out
 * (they can just re-auth with Google).
 *
 * Mirrors /api/auth/forgot-password's token + email mechanic, with
 * the difference that admin invocation never leaks account existence
 * (we already know the target exists — that's why admin clicked it).
 */

import { NextRequest, NextResponse } from "next/server";

import { passwordResetEmail } from "@/emails/password-reset";
import { ADMIN_ACTIONS, logAdminAction } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-guard";
import { randomToken } from "@/lib/auth-tokens";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RESET_TTL_MS = 60 * 60 * 1000;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!user.passwordHash) {
    return NextResponse.json(
      {
        error:
          "User has no password set (OAuth-only). Ask them to use their provider sign-in.",
      },
      { status: 400 }
    );
  }

  const token = randomToken();
  const expires = new Date(Date.now() + RESET_TTL_MS);

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken: token, resetTokenExpires: expires },
  });

  const origin = req.nextUrl.origin;
  const resetUrl = `${origin}/auth/reset-password?token=${encodeURIComponent(token)}`;
  const { subject, html } = passwordResetEmail(resetUrl);
  const { getResendClient } = await import("@/lib/resend");
  await getResendClient().emails.send({
    from: process.env.EMAIL_FROM ?? "Acuity <hello@getacuity.io>",
    to: user.email,
    subject,
    html,
  });

  await logAdminAction({
    adminUserId: guard.adminUserId,
    action: ADMIN_ACTIONS.USER_SEND_MAGIC_LINK,
    targetUserId: user.id,
    metadata: { sentAt: new Date(), expiresAt: expires },
  });

  return NextResponse.json({ ok: true });
}
