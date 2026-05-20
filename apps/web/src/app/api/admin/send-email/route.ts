/**
 * POST /api/admin/send-email
 *
 * Send a plain-text email from the admin dashboard. Supports single
 * user or bulk (all users). Logs every send to AdminSentEmail for
 * the per-user email history.
 *
 * Body:
 *   { to: string, subject: string, body: string, targetUserId?: string }
 *   OR
 *   { bulk: true, subject: string, body: string }
 */

import { NextRequest, NextResponse } from "next/server";

import { ADMIN_ACTIONS, logAdminAction } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXCLUDED_EMAILS = [
  "keenan@heelerdigital.com",
  "jim@heelerdigital.com",
];

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json();
  const { subject, body: emailBody, bulk } = body ?? {};

  if (!subject || typeof subject !== "string" || !subject.trim()) {
    return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  }
  if (!emailBody || typeof emailBody !== "string" || !emailBody.trim()) {
    return NextResponse.json({ error: "Body is required" }, { status: 400 });
  }

  const { getResendClient } = await import("@/lib/resend");
  const resend = getResendClient();

  if (bulk) {
    // Send to all users, excluding founders
    const users = await prisma.user.findMany({
      where: { email: { notIn: EXCLUDED_EMAILS } },
      select: { id: true, email: true },
    });

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      try {
        await resend.emails.send({
          from: '"Keenan" <keenan@getacuity.io>',
          replyTo: "keenan@getacuity.io",
          to: user.email,
          subject: subject.trim(),
          text: emailBody.trim(),
        });

        await prisma.adminSentEmail.create({
          data: {
            adminUserId: guard.adminUserId,
            targetUserId: user.id,
            toEmail: user.email,
            subject: subject.trim(),
            body: emailBody.trim(),
          },
        }).catch(() => {});

        sent++;
      } catch (err) {
        console.error(`[admin-send-email] Failed to send to ${user.email}:`, err);
        failed++;
      }
    }

    await logAdminAction({
      adminUserId: guard.adminUserId,
      action: ADMIN_ACTIONS.USER_SEND_BULK_EMAIL,
      metadata: { subject: subject.trim(), totalUsers: users.length, sent, failed },
    });

    return NextResponse.json({ ok: true, sent, failed });
  }

  // Single user send
  const { to, targetUserId } = body;
  if (!to || typeof to !== "string") {
    return NextResponse.json({ error: "Recipient email is required" }, { status: 400 });
  }

  try {
    await resend.emails.send({
      from: '"Keenan" <keenan@getacuity.io>',
      replyTo: "keenan@getacuity.io",
      to: to.trim(),
      subject: subject.trim(),
      text: emailBody.trim(),
    });
  } catch (err) {
    console.error("[admin-send-email] Send failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Send failed" },
      { status: 500 }
    );
  }

  await prisma.adminSentEmail.create({
    data: {
      adminUserId: guard.adminUserId,
      targetUserId: targetUserId ?? null,
      toEmail: to.trim(),
      subject: subject.trim(),
      body: emailBody.trim(),
    },
  }).catch((err: unknown) => {
    console.warn("[admin-send-email] Log write failed (non-fatal):", err);
  });

  await logAdminAction({
    adminUserId: guard.adminUserId,
    action: ADMIN_ACTIONS.USER_SEND_EMAIL,
    targetUserId: targetUserId ?? null,
    metadata: { to: to.trim(), subject: subject.trim() },
  });

  return NextResponse.json({ ok: true });
}
