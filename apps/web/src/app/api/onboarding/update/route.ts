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

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";

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
  // Symmetric auth: cookie session on web, Bearer JWT on mobile —
  // mobile onboarding hits the same endpoint so both platforms
  // share one write path (and one validation rule set).
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceUserRateLimit("userWrite", userId);
  if (limited) return limited;

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

  if (typeof raw.moodBaselineNumeric === "number") {
    const n = Math.round(raw.moodBaselineNumeric);
    if (Number.isFinite(n) && n >= 1 && n <= 10) {
      onboardingUpdates.moodBaselineNumeric = n;
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
  if (typeof raw.primaryReasonsCustom === "string") {
    const trimmed = raw.primaryReasonsCustom.trim().slice(0, 200);
    demographicsUpdates.primaryReasonsCustom = trimmed.length > 0 ? trimmed : null;
  } else if (raw.primaryReasonsCustom === null) {
    demographicsUpdates.primaryReasonsCustom = null;
  }
  if (typeof raw.lifeStage === "string" && VALID_LIFE_STAGES.includes(raw.lifeStage)) {
    demographicsUpdates.lifeStage = raw.lifeStage;
  } else if (raw.lifeStage === null) {
    demographicsUpdates.lifeStage = null;
  }
  if (Array.isArray(raw.lifeStages)) {
    demographicsUpdates.lifeStages = raw.lifeStages
      .filter((x): x is string => typeof x === "string" && VALID_LIFE_STAGES.includes(x))
      .slice(0, VALID_LIFE_STAGES.length);
  }
  if (typeof raw.lifeStageCustom === "string") {
    const trimmed = raw.lifeStageCustom.trim().slice(0, 200);
    demographicsUpdates.lifeStageCustom = trimmed.length > 0 ? trimmed : null;
  } else if (raw.lifeStageCustom === null) {
    demographicsUpdates.lifeStageCustom = null;
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

  // Step 8 — target cadence (goal-setting only; doesn't gate features).
  const VALID_CADENCES = ["daily", "most_days", "few_times_week"];
  if (typeof raw.targetCadence === "string" && VALID_CADENCES.includes(raw.targetCadence)) {
    userUpdates.targetCadence = raw.targetCadence;
  }

  const { prisma } = await import("@/lib/prisma");

  const existing = await prisma.userOnboarding.findUnique({
    where: { userId: userId },
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
      where: { userId: userId },
      create: {
        userId: userId,
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
          where: { userId: userId },
          create: {
            userId: userId,
            ...(demographicsUpdates as Record<string, string | string[] | null>),
          },
          update: demographicsUpdates,
        })
      : Promise.resolve(),
    Object.keys(userUpdates).length > 0
      ? safeUpdateUser(userId, userUpdates)
      : Promise.resolve(),
  ]);

  // Slice C dual-write (2026-05-09): if the onboarding write touched
  // notificationTime/Days/Enabled, mirror the values into the user's
  // primary UserReminder row so the multi-reminder model stays in
  // sync. Onboarding step 9 still writes single-time; user can add
  // more reminders later via the settings screen. Best-effort —
  // legacy fields ARE the source of truth at onboarding time, so a
  // dual-write failure logs but doesn't fail onboarding.
  const touchedReminderFields =
    "notificationTime" in userUpdates ||
    "notificationDays" in userUpdates ||
    "notificationsEnabled" in userUpdates;
  if (touchedReminderFields) {
    try {
      const userAfter = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          notificationTime: true,
          notificationDays: true,
          notificationsEnabled: true,
        },
      });
      if (userAfter) {
        const primary = await prisma.userReminder.findFirst({
          where: { userId },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        });
        if (primary) {
          await prisma.userReminder.update({
            where: { id: primary.id },
            data: {
              time: userAfter.notificationTime,
              daysActive: userAfter.notificationDays,
              enabled: userAfter.notificationsEnabled,
            },
          });
        } else if (
          userAfter.notificationsEnabled ||
          userAfter.notificationTime !== "21:00"
        ) {
          await prisma.userReminder.create({
            data: {
              userId,
              time: userAfter.notificationTime,
              daysActive: userAfter.notificationDays,
              enabled: userAfter.notificationsEnabled,
              sortOrder: 0,
            },
          });
        }
      }
    } catch (err) {
      console.warn(
        "[onboarding/update] dual-write to UserReminder failed:",
        err
      );
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * Update User with onboarding-time fields. If the underlying DB hasn't
 * yet had `prisma db push` run for a newly-added column (e.g.
 * `targetCadence` was added 2026-04-27 and the prod DB hasn't been
 * migrated yet), Postgres throws "column does not exist". We catch
 * that one specific error, drop `targetCadence`, and retry — the
 * rest of the user record updates without losing the user's other
 * onboarding answers. Once the column lands the catch-and-retry is a
 * no-op (the first attempt succeeds).
 */
async function safeUpdateUser(
  userId: string,
  data: Record<string, unknown>
): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  try {
    await prisma.user.update({ where: { id: userId }, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      "targetCadence" in data &&
      /targetCadence|target_cadence|column.*does not exist/i.test(msg)
    ) {
      const { targetCadence: _drop, ...withoutCadence } = data as {
        targetCadence?: unknown;
        [k: string]: unknown;
      };
      void _drop;
      if (Object.keys(withoutCadence).length === 0) return;
      await prisma.user.update({
        where: { id: userId },
        data: withoutCadence,
      });
      return;
    }
    throw err;
  }
}
