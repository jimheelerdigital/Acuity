/**
 * POST /api/onboarding/complete
 *
 * Marks the signed-in user's onboarding as finished. Called in two
 * scenarios:
 *
 *   1. Natural completion — the user reaches step 8 and taps "Record
 *      your first entry". `{ skipped: false }`.
 *   2. Skip-entire-flow — the user taps "Skip for now" in the top
 *      right and confirms the modal. `{ skipped: true, skippedAtStep }`
 *      so PostHog can attribute where the drop happened.
 *
 * Idempotent: if completedAt is already set, just returns ok: true
 * without overwriting. A user who genuinely wants to redo the flow
 * would need a separate admin-scoped reset.
 *
 * Companion to /api/onboarding/update — that endpoint takes partial
 * state during the flow; this one closes it out.
 */

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  skipped?: boolean;
  skippedAtStep?: number;
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = ((await req.json().catch(() => ({}))) ?? {}) as Body;
  const skipped = body.skipped === true;

  const { prisma } = await import("@/lib/prisma");

  const existing = await prisma.userOnboarding.findUnique({
    where: { userId: session.user.id },
    select: { completedAt: true, currentStep: true },
  });

  if (existing?.completedAt) {
    return NextResponse.json({ ok: true, alreadyCompleted: true });
  }

  const now = new Date();
  const finalStep = skipped
    ? Math.max(existing?.currentStep ?? 1, Math.round(body.skippedAtStep ?? 1))
    : 8;

  await prisma.userOnboarding.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      currentStep: finalStep,
      completedAt: now,
    },
    update: {
      currentStep: finalStep,
      completedAt: now,
    },
  });

  return NextResponse.json({ ok: true, skipped });
}
