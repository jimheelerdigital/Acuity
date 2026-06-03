/**
 * POST /api/admin/backfill-flow-version
 *
 * One-time backfill: tags all existing OnboardingEvent rows with flowVersion.
 * Events before the v3 deploy (2026-06-02T23:41:14Z) → "v1"
 * Events after → "v2"
 * Only touches rows where flowVersion IS NULL.
 *
 * Requires admin auth. Safe to run multiple times (idempotent).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

const V3_EPOCH = new Date("2026-06-02T23:41:14Z");

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  // Tag old events as v1
  const v1Result = await prisma.onboardingEvent.updateMany({
    where: {
      flowVersion: null,
      createdAt: { lt: V3_EPOCH },
      event: { startsWith: "funnel_" },
    },
    data: { flowVersion: "v1" },
  });

  // Tag new events as v2
  const v2Result = await prisma.onboardingEvent.updateMany({
    where: {
      flowVersion: null,
      createdAt: { gte: V3_EPOCH },
      event: { startsWith: "funnel_" },
    },
    data: { flowVersion: "v2" },
  });

  return NextResponse.json({
    tagged: { v1: v1Result.count, v2: v2Result.count },
  });
}
