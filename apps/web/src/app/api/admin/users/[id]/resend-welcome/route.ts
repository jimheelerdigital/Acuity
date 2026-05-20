/**
 * POST /api/admin/users/[id]/resend-welcome
 *
 * Re-sends the founder welcome email (plain text from Keenan) to a user.
 * Used when the original welcome email failed silently during signup.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, email: true, name: true, isFoundingMember: true, foundingMemberNumber: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    const { founderWelcomeEmail } = await import("@/emails/founder-welcome");
    const { getResendClient } = await import("@/lib/resend");

    const firstName = (user.name ?? "").trim().split(/\s+/)[0] || null;
    const { subject, text } = founderWelcomeEmail({
      firstName,
      foundingMemberNumber: user.foundingMemberNumber,
    });

    await getResendClient().emails.send({
      from: '"Keenan" <keenan@getacuity.io>',
      replyTo: "keenan@getacuity.io",
      to: user.email,
      subject,
      text,
    });

    return NextResponse.json({ success: true, email: user.email });
  } catch (err) {
    console.error("[admin/resend-welcome] Failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Send failed" },
      { status: 500 }
    );
  }
}
