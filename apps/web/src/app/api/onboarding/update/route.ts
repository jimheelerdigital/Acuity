/**
 * POST /api/onboarding/update
 *
 * Writes partial onboarding state for the signed-in user. Called from
 * step components as the user fills them in — so if they close the tab
 * mid-flow we don't lose their answers.
 *
 * Body shape: { step: 1-10, data: { ...stepFields } }
 *
 * Fields are routed across three tables:
 *   - moodBaseline / lifeAreaPriorities / referralSource /
 *     expectedUsageFrequency / microphoneGranted → UserOnboarding
 *   - ageRange / gender / country / primaryReasons / lifeStage
 *     → UserDemographics (upsert)
 *   - notificationTime / notificationDays / notificationsEnabled
 *     → User (update)
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
const VALID_AGE_RANGES = ["18-24", "25-34", "35-44", "45-54", "55+"];
const VALID_GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"];
const VALID_REASONS = [
  "Career",
  "Relationships",
  "Mental health",
  "Productivity",
  "Curiosity",
  "Other",
];
const VALID_LIFE_STAGES = [
  "Student",
  "Early career",
  "Established career",
  "Parent",
  "Retired",
  "In transition",
  "Prefer not to say",
];

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
  if (step < 1 || step > 10) {
    return NextResponse.json({ error: "step out of range" }, { status: 400 });
  }

  const raw = body.data ?? {};

  // ─── UserOnboarding fields ─────────────────────────────────────────────
  const onboardingUpdates: Record<string, unknown> = {};

  if (typeof raw.moodBaseline === "string") {
    if ((VALID_MOODS as readonly string[]).includes(raw.moodBaseline)) {
      onboardingUpdates.moodBaseline = raw.moodBaseline;
    }
  }

  if (raw.lifeAreaPriorities && typeof raw.lifeAreaPriorities === "object") {
    const cleaned: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw.lifeAreaPriorities)) {
      if (!(VALID_AREAS as readonly string[]).includes(k)) continue;
      const rank = typeof v === "number" ? Math.round(v) : NaN;
      if (Number.isFinite(rank) && rank >= 1 && rank <= 6) {
        cleaned[k] = rank;
      }
    }
    onboardingUpdates.lifeAreaPriorities = cleaned;
  }

  if (typeof raw.microphoneGranted === "boolean") {
    onboardingUpdates.microphoneGranted = raw.microphoneGranted;
  }
  if (typeof raw.referralSource === "string") {
    onboardingUpdates.referralSource = raw.referralSource.slice(0, 120);
  }
  if (typeof raw.expectedUsageFrequency === "string") {
    onboardingUpdates.expectedUsageFrequency = raw.expectedUsageFrequency.slice(0, 24);
  }

  // ─── Demographics fields (step 3) ──────────────────────────────────────
  const demographicsUpdates: Record<string, unknown> = {};
  if (typeof raw.ageRange === "string" && VALID_AGE_RANGES.includes(raw.ageRange)) {
    demographicsUpdates.ageRange = raw.ageRange;
  } else if (raw.ageRange === null) {
    demographicsUpdates.ageRange = null;
  }
  if (typeof raw.gender === "string" && VALID_GENDERS.includes(raw.gender)) {
    demographicsUpdates.gender = raw.gender;
  } else if (raw.gender === null) {
    demographicsUpdates.gender = null;
  }
  if (typeof raw.country === "string" && raw.country.length <= 4) {
    demographicsUpdates.country = raw.country.toUpperCase();
  }
  if (Array.isArray(raw.primaryReasons)) {
    demographicsUpdates.primaryReasons = raw.primaryReasons
      .filter((x): x is string => typeof x === "string" && VALID_REASONS.includes(x))
      .slice(0, VALID_REASONS.length);
  }
  if (typeof raw.lifeStage === "string" && VALID_LIFE_STAGES.includes(raw.lifeStage)) {
    demographicsUpdates.lifeStage = raw.lifeStage;
  } else if (raw.lifeStage === null) {
    demographicsUpdates.lifeStage = null;
  }

  // ─── Notification fields (step 9) ──────────────────────────────────────
  const userUpdates: Record<string, unknown> = {};
  if (typeof raw.notificationTime === "string" && /^\d{2}:\d{2}$/.test(raw.notificationTime)) {
    userUpdates.notificationTime = raw.notificationTime;
  }
  if (Array.isArray(raw.notificationDays)) {
    const days = raw.notificationDays
      .map((d) => (typeof d === "number" ? Math.round(d) : NaN))
      .filter((d) => Number.isFinite(d) && d >= 0 && d <= 6) as number[];
    userUpdates.notificationDays = Array.from(new Set(days)).sort();
  }
  if (typeof raw.notificationsEnabled === "boolean") {
    userUpdates.notificationsEnabled = raw.notificationsEnabled;
  }

  const { prisma } = await import("@/lib/prisma");

  const existing = await prisma.userOnboarding.findUnique({
    where: { userId: session.user.id },
    select: { currentStep: true, completedAt: true },
  });

  if (existing?.completedAt) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const nextStep = Math.max(step, existing?.currentStep ?? 1);

  // Run the writes in parallel — different tables, no ordering
  // dependency; any single failure short-circuits via await Promise.all.
  await Promise.all([
    prisma.userOnboarding.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        currentStep: nextStep,
        ...onboardingUpdates,
      },
      update: {
        currentStep: nextStep,
        ...onboardingUpdates,
      },
    }),
    Object.keys(demographicsUpdates).length > 0
      ? prisma.userDemographics.upsert({
          where: { userId: session.user.id },
          create: {
            userId: session.user.id,
            ...(demographicsUpdates as Record<string, string | string[] | null>),
          },
          update: demographicsUpdates,
        })
      : Promise.resolve(),
    Object.keys(userUpdates).length > 0
      ? prisma.user.update({
          where: { id: session.user.id },
          data: userUpdates,
        })
      : Promise.resolve(),
  ]);

  return NextResponse.json({ ok: true });
}
