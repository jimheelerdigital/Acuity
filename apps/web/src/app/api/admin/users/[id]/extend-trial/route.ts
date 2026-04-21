import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ADMIN_ACTIONS, logAdminAction } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  days: z.number().int().min(1).max(90),
  reason: z.string().min(3).max(500),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parse = Body.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json(
      { error: "Invalid body", detail: parse.error.flatten() },
      { status: 400 }
    );
  }
  const { days, reason } = parse.data;

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, trialEndsAt: true, subscriptionStatus: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Extend from the later of (now, existing trialEndsAt). A past-due
  // trial still gets a fresh window; an in-progress trial pushes out.
  const base = target.trialEndsAt && target.trialEndsAt > new Date()
    ? target.trialEndsAt
    : new Date();
  const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: target.id },
    data: {
      trialEndsAt: next,
      // Flip a FREE/PAST_DUE user back to TRIAL so the extension
      // actually grants access. PRO users keep their status.
      ...(target.subscriptionStatus === "PRO"
        ? {}
        : { subscriptionStatus: "TRIAL" }),
    },
  });

  await logAdminAction({
    adminUserId: guard.adminUserId,
    action: ADMIN_ACTIONS.USER_EXTEND_TRIAL,
    targetUserId: target.id,
    metadata: {
      days,
      reason,
      previousTrialEndsAt: target.trialEndsAt,
      newTrialEndsAt: next,
      previousStatus: target.subscriptionStatus,
    },
  });

  return NextResponse.json({ ok: true, trialEndsAt: next });
}
