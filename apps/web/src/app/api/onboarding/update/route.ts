/**
 * POST /api/onboarding/update
 *
 * Writes partial onboarding state for the signed-in user. Called from
 * step components as the user fills them in — so if they close the tab
 * mid-flow we don't lose their answers.
 *
 * Body shape: { step: 1-8, data: { ...stepFields } }
 *
 * Only fields that match the schema's UserOnboarding columns are
 * written. Any other key in `data` is ignored (defence against a
 * client that posts junk). Validation + coercion per-field below.
 *
 * Also bumps UserOnboarding.currentStep to `step` if it's higher than
 * the stored value (never rewinds — a user who back-navigates stays
 * at their high-water mark for the dashboard redirect).
 */

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_MOODS = ["GREAT", "GOOD", "NEUTRAL", "LOW", "ROUGH"] as const;
const VALID_AREAS = [
  "CAREER",
  "HEALTH",
  "RELATIONSHIPS",
  "FINANCES",
  "PERSONAL",
  "OTHER",
] as const;

type Body = {
  step?: number;
  data?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body.step !== "number") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const step = Math.round(body.step);
  if (step < 1 || step > 8) {
    return NextResponse.json({ error: "step out of range" }, { status: 400 });
  }

  const raw = body.data ?? {};
  const updates: Record<string, unknown> = {};

  // moodBaseline — must be one of the 5 canonical Mood values.
  if (typeof raw.moodBaseline === "string") {
    if ((VALID_MOODS as readonly string[]).includes(raw.moodBaseline)) {
      updates.moodBaseline = raw.moodBaseline;
    }
  }

  // lifeAreaPriorities — { [area]: rank } where each area is one of
  // VALID_AREAS and rank is 1-3 (top-3 ranking). Unknown keys dropped.
  if (raw.lifeAreaPriorities && typeof raw.lifeAreaPriorities === "object") {
    const cleaned: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw.lifeAreaPriorities)) {
      if (!(VALID_AREAS as readonly string[]).includes(k)) continue;
      const rank = typeof v === "number" ? Math.round(v) : NaN;
      if (Number.isFinite(rank) && rank >= 1 && rank <= 6) {
        cleaned[k] = rank;
      }
    }
    updates.lifeAreaPriorities = cleaned;
  }

  // microphoneGranted — explicit boolean only; undefined leaves the
  // previous value untouched.
  if (typeof raw.microphoneGranted === "boolean") {
    updates.microphoneGranted = raw.microphoneGranted;
  }

  // referralSource — free-text, capped length. Kept so that if a
  // future step surfaces a referral field (currently removed from the
  // 8-step flow) the column still persists cleanly. Unknown-today is
  // fine; a later step can write it without a migration.
  if (typeof raw.referralSource === "string") {
    updates.referralSource = raw.referralSource.slice(0, 120);
  }

  // expectedUsageFrequency — same treatment as referralSource.
  if (typeof raw.expectedUsageFrequency === "string") {
    updates.expectedUsageFrequency = raw.expectedUsageFrequency.slice(0, 24);
  }

  const { prisma } = await import("@/lib/prisma");

  const existing = await prisma.userOnboarding.findUnique({
    where: { userId: session.user.id },
    select: { currentStep: true, completedAt: true },
  });

  // Refuse to mutate a completed row — prevents a stale tab from
  // clobbering state after the user finished in another session.
  if (existing?.completedAt) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const nextStep = Math.max(step, existing?.currentStep ?? 1);

  await prisma.userOnboarding.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      currentStep: nextStep,
      ...updates,
    },
    update: {
      currentStep: nextStep,
      ...updates,
    },
  });

  return NextResponse.json({ ok: true });
}
