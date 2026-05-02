/**
 * POST /api/backfill/dismiss — user tapped "No thanks" on the
 * "Process my history" banner. Suppresses future banner renders.
 *
 * Sticky across status changes per docs/v1-1/free-tier-phase2-plan.md
 * §A.6: a user who downgrades to FREE then re-upgrades doesn't see
 * the banner again. They go to /account if they want it.
 *
 * No body. Idempotent — re-calling sets the timestamp again, which
 * is fine.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  await prisma.user.update({
    where: { id: userId },
    data: { backfillPromptDismissedAt: new Date() },
  });

  safeLog.info("backfill.dismissed", { userId });

  return NextResponse.json({ ok: true });
}
