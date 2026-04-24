/**
 * GET /api/admin/trial-emails
 *
 * Admin-only. Returns the live state of the trial onboarding email
 * sequence:
 *   - activeByTrack: counts of users currently in each onboardingTrack
 *   - last7Days: per-day send counts
 *   - perEmailKey: sends + opens + clicks grouped by emailKey
 *
 * Response shape is consumed by /admin?tab=trial-emails (see
 * apps/web/src/app/admin/tabs/TrialEmailsTab.tsx).
 */

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Active trial users by track
  const trackRows = await prisma.user.groupBy({
    by: ["onboardingTrack"],
    where: {
      subscriptionStatus: "TRIAL",
      onboardingUnsubscribed: false,
      OR: [{ trialEndsAt: null }, { trialEndsAt: { gt: now } }],
    },
    _count: { _all: true },
  });
  const activeByTrack: Record<string, number> = {
    STANDARD: 0,
    REACTIVATION: 0,
    POWER_USER: 0,
  };
  for (const r of trackRows) {
    activeByTrack[r.onboardingTrack] = r._count._all;
  }

  // Last 7 days of sends, by UTC day
  const recent = await prisma.trialEmailLog.findMany({
    where: { sentAt: { gte: sevenDaysAgo } },
    select: { sentAt: true, emailKey: true, opened: true, clicked: true },
  });
  const last7Days: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const iso = d.toISOString().slice(0, 10);
    last7Days.push({ date: iso, count: 0 });
  }
  for (const log of recent) {
    const iso = log.sentAt.toISOString().slice(0, 10);
    const bucket = last7Days.find((b) => b.date === iso);
    if (bucket) bucket.count++;
  }

  // Per-emailKey aggregates over the full sequence lifetime
  const lifetime = await prisma.trialEmailLog.findMany({
    select: { emailKey: true, opened: true, clicked: true },
  });
  const perEmailKey: Record<
    string,
    { sent: number; opens: number; clicks: number }
  > = {};
  for (const log of lifetime) {
    const row =
      perEmailKey[log.emailKey] ??
      (perEmailKey[log.emailKey] = { sent: 0, opens: 0, clicks: 0 });
    row.sent++;
    if (log.opened) row.opens++;
    if (log.clicked) row.clicks++;
  }

  return NextResponse.json({
    activeByTrack,
    last7Days,
    perEmailKey,
    computedAt: Date.now(),
  });
}
