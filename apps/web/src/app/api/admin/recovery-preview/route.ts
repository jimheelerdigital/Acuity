/**
 * GET /api/admin/recovery-preview
 *
 * Dry-run preview: counts how many users currently qualify for each
 * recovery/activation email and estimates drain time at the configured
 * rate. No emails are sent.
 *
 * Admin-only (session check). Returns JSON with per-email counts,
 * total qualifying, and estimated drain days.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { requireAdmin } = await import("@/lib/admin-guard");
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { prisma } = await import("@/lib/prisma");
  const { getRecoveryConfig } = await import("@/lib/recovery-config");

  const config = getRecoveryConfig();
  const now = new Date();
  const counts: Record<string, number> = {};

  // Helper: count users who haven't already received this email
  async function countUnsent(
    emailKey: string,
    userIds: string[]
  ): Promise<number> {
    if (userIds.length === 0) return 0;
    const alreadySent = await prisma.trialEmailLog.findMany({
      where: { emailKey, userId: { in: userIds } },
      select: { userId: true },
    });
    const sentSet = new Set(alreadySent.map((r) => r.userId));
    return userIds.filter((id) => !sentSet.has(id)).length;
  }

  // ── Stall ladder (forward-only with upper bounds) ──
  const STALL_UPPER = 7 * 24 * 60 * 60 * 1000;
  const stall1 = await prisma.user.findMany({
    where: {
      totalRecordings: 1,
      lastRecordingAt: {
        gte: new Date(now.getTime() - STALL_UPPER),
        lte: new Date(now.getTime() - 48 * 60 * 60 * 1000),
      },
    },
    select: { id: true },
  });
  counts.stall_1rec = await countUnsent("stall_1rec", stall1.map((u) => u.id));

  const stall2 = await prisma.user.findMany({
    where: {
      totalRecordings: 2,
      lastRecordingAt: {
        gte: new Date(now.getTime() - STALL_UPPER),
        lte: new Date(now.getTime() - 48 * 60 * 60 * 1000),
      },
    },
    select: { id: true },
  });
  counts.stall_2rec = await countUnsent("stall_2rec", stall2.map((u) => u.id));

  const stall3 = await prisma.user.findMany({
    where: {
      totalRecordings: { gte: 3 },
      lastRecordingAt: {
        gte: new Date(now.getTime() - STALL_UPPER),
        lte: new Date(now.getTime() - 72 * 60 * 60 * 1000),
      },
    },
    select: { id: true },
  });
  counts.stall_3plus = await countUnsent("stall_3plus", stall3.map((u) => u.id));

  // ── Winback ladder ──
  const winbackBase = {
    totalRecordings: { gte: 1 },
    subscriptionStatus: { notIn: ["PRO"] as string[] },
  };

  const wb7 = await prisma.user.findMany({
    where: {
      ...winbackBase,
      lastRecordingAt: {
        gte: new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000),
        lte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      },
    },
    select: { id: true },
  });
  counts.winback_7d = await countUnsent("winback_7d", wb7.map((u) => u.id));

  const wb14 = await prisma.user.findMany({
    where: {
      ...winbackBase,
      lastRecordingAt: {
        gte: new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000),
        lte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
      },
    },
    select: { id: true },
  });
  counts.winback_14d = await countUnsent("winback_14d", wb14.map((u) => u.id));

  const wb30 = await prisma.user.findMany({
    where: {
      ...winbackBase,
      lastRecordingAt: {
        gte: new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000),
        lte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      },
    },
    select: { id: true },
  });
  counts.winback_30d = await countUnsent("winback_30d", wb30.map((u) => u.id));

  const wb90 = await prisma.user.findMany({
    where: {
      ...winbackBase,
      lastRecordingAt: {
        gte: new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000),
        lte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
      },
    },
    select: { id: true },
  });
  counts.winback_90d = await countUnsent("winback_90d", wb90.map((u) => u.id));

  // ── Keep momentum + first insight ──
  const km = await prisma.user.findMany({
    where: {
      totalRecordings: { gte: 2, lt: 5 },
      firstRecordingAt: {
        lte: new Date(now.getTime() - 48 * 60 * 60 * 1000),
      },
    },
    select: { id: true },
  });
  counts.keep_momentum = await countUnsent("keep_momentum", km.map((u) => u.id));

  const fi = await prisma.user.findMany({
    where: {
      totalRecordings: { gte: 5 },
      subscriptionStatus: { in: ["TRIAL", "ACTIVE", "PRO"] },
    },
    select: { id: true },
  });
  counts.first_insight = await countUnsent("first_insight", fi.map((u) => u.id));

  // ── Milestones (highest-only logic) ──
  const MILESTONES = [
    { threshold: 10, key: "milestone_10" },
    { threshold: 25, key: "milestone_25" },
    { threshold: 50, key: "milestone_50" },
    { threshold: 100, key: "milestone_100" },
    { threshold: 365, key: "milestone_365" }, // gitleaks:allow
  ] as const;

  for (const { threshold, key } of MILESTONES) {
    // Count users AT this exact milestone tier (between this threshold
    // and the next one). For the highest tier (365), no upper bound.
    const nextIdx = MILESTONES.findIndex((m) => m.threshold === threshold) + 1;
    const nextThreshold = nextIdx < MILESTONES.length
      ? MILESTONES[nextIdx].threshold
      : undefined;

    const candidates = await prisma.user.findMany({
      where: {
        totalRecordings: nextThreshold
          ? { gte: threshold, lt: nextThreshold }
          : { gte: threshold },
      },
      select: { id: true },
    });
    counts[key] = await countUnsent(key, candidates.map((u) => u.id));
  }

  // ── Summary ──
  const totalQualifying = Object.values(counts).reduce((a, b) => a + b, 0);
  const estimatedDrainDays = Math.ceil(totalQualifying / config.maxSendsPerDay);

  return NextResponse.json({
    counts,
    totalQualifying,
    estimatedDrainDays,
    config: {
      maxSendsPerTick: config.maxSendsPerTick,
      maxSendsPerDay: config.maxSendsPerDay,
      enablementDate: config.enablementDate.toISOString(),
      dryRun: config.dryRun,
    },
    generatedAt: now.toISOString(),
  });
}
