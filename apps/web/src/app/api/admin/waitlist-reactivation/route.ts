/**
 * GET  /api/admin/waitlist-reactivation — campaign stats
 * POST /api/admin/waitlist-reactivation — fire the campaign
 *
 * Admin-only. The POST fires once; subsequent POSTs return 409.
 */

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) return null;
  const { prisma } = await import("@/lib/prisma");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  return me?.isAdmin ? session.user.id : null;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { prisma } = await import("@/lib/prisma");

  // All waitlist records
  const allWaitlist = await prisma.waitlist.findMany({
    select: { id: true, email: true, unsubscribed: true },
  });

  // All User emails (for matching)
  const userEmails = new Set(
    (await prisma.user.findMany({ select: { email: true } })).map(
      (u: { email: string }) => u.email.toLowerCase()
    )
  );

  // Eligible = waitlist email NOT in User table AND not unsubscribed
  const eligible = allWaitlist.filter(
    (w) => !userEmails.has(w.email.toLowerCase()) && !w.unsubscribed
  );

  // Campaign sends
  const email1Logs = await prisma.trialEmailLog.findMany({
    where: { emailKey: "waitlist_reactivation_1", waitlistId: { not: null } },
    select: { waitlistId: true, sentAt: true },
  });
  const email2Logs = await prisma.trialEmailLog.findMany({
    where: { emailKey: "waitlist_reactivation_2", waitlistId: { not: null } },
    select: { waitlistId: true, sentAt: true },
  });

  // Conversions: waitlist emails that DID send email 1 AND now have a User
  const email1WaitlistIds = new Set(
    email1Logs.map((l: { waitlistId: string | null }) => l.waitlistId)
  );
  const sentWaitlistRows = allWaitlist.filter((w) =>
    email1WaitlistIds.has(w.id)
  );
  const conversions = sentWaitlistRows.filter((w) =>
    userEmails.has(w.email.toLowerCase())
  ).length;

  // Campaign fired date (earliest email 1 send)
  const campaignFiredAt =
    email1Logs.length > 0
      ? email1Logs.reduce(
          (earliest: Date, l: { sentAt: Date }) =>
            l.sentAt < earliest ? l.sentAt : earliest,
          email1Logs[0].sentAt
        )
      : null;

  // Pending email 2 = sent email 1, haven't sent email 2 yet, haven't converted
  const email2WaitlistIds = new Set(
    email2Logs.map((l: { waitlistId: string | null }) => l.waitlistId)
  );
  const pendingEmail2 = sentWaitlistRows.filter(
    (w) =>
      !email2WaitlistIds.has(w.id) &&
      !userEmails.has(w.email.toLowerCase())
  ).length;

  return NextResponse.json({
    totalWaitlist: allWaitlist.length,
    eligibleCount: eligible.length,
    email1Sent: email1Logs.length,
    email2Sent: email2Logs.length,
    pendingEmail2,
    conversions,
    campaignFiredAt: campaignFiredAt?.toISOString() ?? null,
  });
}

export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { prisma } = await import("@/lib/prisma");

  // Check if campaign was already fired (any email 1 log exists)
  const existing = await prisma.trialEmailLog.findFirst({
    where: { emailKey: "waitlist_reactivation_1", waitlistId: { not: null } },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Campaign already fired", firedAt: existing.sentAt.toISOString() },
      { status: 409 }
    );
  }

  // Fire the Inngest event
  const { inngest } = await import("@/inngest/client");
  await inngest.send({
    name: "waitlist/reactivation.requested",
    data: {},
  });

  return NextResponse.json({ ok: true, message: "Campaign triggered" });
}
