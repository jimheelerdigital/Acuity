/**
 * Hourly cron that advances every active-trial user through the
 * onboarding email sequence. Replaces the old /api/cron/waitlist-drip
 * behavior (retired 2026-04-24 — that route is now a no-op).
 *
 * The orchestrator is intentionally stateless — all branching is
 * re-derived from User + TrialEmailLog on each tick. That means:
 *   - Skipped hours (Inngest outage) self-correct; the user catches
 *     up at whatever emailKey they're due for.
 *   - A resend from the admin UI only flips one log row; the
 *     orchestrator won't re-dispatch past emails.
 *
 * Track assignment (re-computed every tick):
 *   - firstRecordingAt == null AND hoursSinceSignup >= 48 → REACTIVATION
 *   - totalRecordings >= 5 AND hoursSinceSignup >= 96 → POWER_USER
 *   - else → STANDARD
 *
 * welcome_day0 is NOT handled here — it's sent inline from
 * bootstrapNewUser so the user gets it within seconds of signup.
 *
 * Emails that live on the TRIAL_ENDING_DAY13 trigger key off
 * User.trialEndsAt - 24h rather than hoursSinceSignup, because the
 * trial length varies (14 / 30 / 3 days depending on Founding Member
 * status + DeletedUser retention). Everything else keys off signup.
 *
 * 2026-04-29: Refactored per-user processing into batched step.run()
 * calls so the function doesn't timeout with growing user counts.
 * Each batch of 20 users gets its own step.run() with its own 300s
 * Vercel timeout budget.
 */

import { inngest } from "@/inngest/client";
import type { TrialEmailKey } from "@/emails/trial/registry";
import { safeLog } from "@/lib/safe-log";
import { hoursSince, sendTrialEmail } from "@/lib/trial-emails";

export type Track = "STANDARD" | "REACTIVATION" | "POWER_USER";

export interface CandidateUser {
  id: string;
  createdAt: Date;
  trialEndsAt: Date | null;
  firstRecordingAt: Date | null;
  totalRecordings: number;
  onboardingTrack: string;
  onboardingUnsubscribed: boolean;
  sentKeys: Set<TrialEmailKey>;
  firstWeeklyReportAt: Date | null;
}

function classifyTrack(
  u: Pick<
    CandidateUser,
    "firstRecordingAt" | "totalRecordings" | "createdAt"
  >,
  hoursSinceSignup: number
): Track {
  if (u.firstRecordingAt == null && hoursSinceSignup >= 48) {
    return "REACTIVATION";
  }
  if (u.totalRecordings >= 5 && hoursSinceSignup >= 96) {
    return "POWER_USER";
  }
  return "STANDARD";
}

export function nextEmailForUser(
  user: CandidateUser,
  track: Track,
  now: Date
): TrialEmailKey | null {
  const h = hoursSince(user.createdAt, now);
  const has = (k: TrialEmailKey) => user.sentKeys.has(k);

  if (track === "REACTIVATION") {
    if (!has("reactivation_friction") && h >= 48) return "reactivation_friction";
    if (!has("reactivation_social") && h >= 24 * 4) return "reactivation_social";
    if (!has("reactivation_final") && h >= 24 * 7) return "reactivation_final";
    return null;
  }

  if (!has("trial_ending_day13") && user.trialEndsAt) {
    // Strictly future-only — once trialEndsAt is in the past, day14
    // owns the slot ("your trial just ended"), not day13 ("your
    // trial ends tomorrow"). Pre-v1.1 this branch had a 6h past-end
    // cushion to absorb orchestrator misses; that cushion now causes
    // day13 to drown out day14 for trials that ended 0-6h ago. The
    // miss-absorption is no longer needed: a user who didn't get
    // day13 still gets day14 for the same intent (acknowledge the
    // transition), with copy that's actually accurate post-end.
    const msUntilEnd = user.trialEndsAt.getTime() - now.getTime();
    const within24hPreEnd =
      msUntilEnd > 0 && msUntilEnd <= 24 * 60 * 60 * 1000;
    if (within24hPreEnd) return "trial_ending_day13";
  }

  // v1.1 slice 3 — day-14 trial-ended transactional email. Fires once
  // trialEndsAt is in the past (within the last 24h). Mutually exclusive
  // with trial_ending_day13: that branch requires trialEndsAt > now-6h
  // (still effectively-active), this one requires trialEndsAt < now AND
  // > now-24h (just expired). Idempotent via TrialEmailLog (sentKeys).
  if (!has("trial_ended_day14") && user.trialEndsAt) {
    const msSinceEnd = now.getTime() - user.trialEndsAt.getTime();
    const justExpiredWithin24h =
      msSinceEnd > 0 && msSinceEnd <= 24 * 60 * 60 * 1000;
    if (justExpiredWithin24h) return "trial_ended_day14";
  }

  if (!has("value_recap") && h >= 24 * 12) return "value_recap";

  if (track === "POWER_USER") {
    if (!has("power_deepen")) return "power_deepen";
    if (!has("power_referral_tease") && h >= 24 * 8) return "power_referral_tease";
    return null;
  }

  // STANDARD lane
  if (
    !has("first_debrief_replay") &&
    user.firstRecordingAt &&
    hoursSince(user.firstRecordingAt, now) >= 24
  ) {
    return "first_debrief_replay";
  }
  if (!has("objection_60sec") && h >= 48) return "objection_60sec";
  if (!has("pattern_tease") && h >= 72) return "pattern_tease";
  if (!has("user_story") && h >= 24 * 5) return "user_story";
  if (
    !has("weekly_report_checkin") &&
    user.firstWeeklyReportAt &&
    hoursSince(user.firstWeeklyReportAt, now) >= 24
  ) {
    return "weekly_report_checkin";
  }
  if (!has("life_matrix_reveal") && h >= 24 * 10) return "life_matrix_reveal";

  return null;
}

const BATCH_SIZE = 20;

export const trialEmailOrchestratorFn = inngest.createFunction(
  {
    id: "trial-email-orchestrator",
    name: "Trial onboarding email orchestrator",
    triggers: [{ cron: "0 * * * *" }],
    retries: 2,
  },
  async ({ step, logger }) => {
    const now = new Date();

    // ── Step 1: Fetch all trial users ─────────────────────────────
    // Includes the v1.1 day-14 cohort: users whose trialEndsAt fell
    // within the last 24h but whose subscriptionStatus is still
    // "TRIAL" (the Stripe webhook only flips status on subscription
    // events, not on trial expiry — until they upgrade or get reaped
    // by a future cron, the row's status stays "TRIAL"). The
    // trial_ended_day14 branch in nextEmailForUser fires for them.
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const rawUsers = await step.run("fetch-candidates", async () => {
      const { prisma } = await import("@/lib/prisma");
      return prisma.user.findMany({
        where: {
          subscriptionStatus: "TRIAL",
          onboardingUnsubscribed: false,
          OR: [
            { trialEndsAt: null },
            { trialEndsAt: { gt: now } },
            // Day-14 cohort: trial just expired in the past 24h.
            { trialEndsAt: { gt: dayAgo, lt: now } },
          ],
        },
        select: {
          id: true,
          email: true,
          createdAt: true,
          trialEndsAt: true,
          firstRecordingAt: true,
          totalRecordings: true,
          onboardingTrack: true,
          onboardingUnsubscribed: true,
        },
      });
    });

    const users = rawUsers.map((u) => ({
      ...u,
      createdAt: new Date(u.createdAt),
      trialEndsAt: u.trialEndsAt ? new Date(u.trialEndsAt) : null,
      firstRecordingAt: u.firstRecordingAt
        ? new Date(u.firstRecordingAt)
        : null,
    }));

    safeLog.info("trial-email-orchestrator.tick", {
      candidateCount: users.length,
      ts: now.toISOString(),
    });

    if (users.length === 0) {
      return { ts: now.toISOString(), candidates: 0, sent: 0, skipped: 0 };
    }

    // ── Step 2+: Process users in batches ─────────────────────────
    // Each batch gets its own step.run() so it has a fresh timeout
    // budget. With BATCH_SIZE=20 and ~1s per user, each batch takes
    // ~20s — well within the 300s Vercel limit.
    let totalSent = 0;
    let totalSkipped = 0;
    let totalTrackChanges = 0;

    const batchCount = Math.ceil(users.length / BATCH_SIZE);

    for (let b = 0; b < batchCount; b++) {
      const batch = users.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
      const batchResult = await step.run(
        `process-batch-${b}`,
        async () => {
          const { prisma } = await import("@/lib/prisma");
          let sent = 0;
          let skipped = 0;
          let trackChanges = 0;

          for (const u of batch) {
            try {
              const hSinceSignup = hoursSince(u.createdAt, now);
              const computedTrack = classifyTrack(u, hSinceSignup);

              if (
                u.onboardingTrack === "STANDARD" &&
                computedTrack !== "STANDARD"
              ) {
                await prisma.user.update({
                  where: { id: u.id },
                  data: { onboardingTrack: computedTrack },
                });
                trackChanges++;
              }

              const effectiveTrack =
                u.onboardingTrack === "STANDARD"
                  ? computedTrack
                  : (u.onboardingTrack as Track);

              const [logs, firstReport] = await Promise.all([
                prisma.trialEmailLog.findMany({
                  where: { userId: u.id },
                  select: { emailKey: true },
                }),
                prisma.weeklyReport.findFirst({
                  where: { userId: u.id, status: "COMPLETE" },
                  orderBy: { createdAt: "asc" },
                  select: { createdAt: true },
                }),
              ]);

              const sentKeys = new Set<TrialEmailKey>(
                logs.map((l) => l.emailKey as TrialEmailKey)
              );

              const candidate: CandidateUser = {
                id: u.id,
                createdAt: u.createdAt,
                trialEndsAt: u.trialEndsAt,
                firstRecordingAt: u.firstRecordingAt,
                totalRecordings: u.totalRecordings,
                onboardingTrack: u.onboardingTrack,
                onboardingUnsubscribed: u.onboardingUnsubscribed,
                sentKeys,
                firstWeeklyReportAt: firstReport?.createdAt ?? null,
              };

              const nextKey = nextEmailForUser(candidate, effectiveTrack, now);
              if (!nextKey) {
                skipped++;
                continue;
              }

              const result = await sendTrialEmail(u.id, nextKey);
              if (result.sent) {
                sent++;
              } else {
                skipped++;
              }
            } catch (err) {
              console.error(
                "[trial-email-orchestrator] per-user failure (non-fatal)",
                { userId: u.id, error: err instanceof Error ? err.message : err }
              );
            }
          }

          return { sent, skipped, trackChanges };
        }
      );

      totalSent += batchResult.sent;
      totalSkipped += batchResult.skipped;
      totalTrackChanges += batchResult.trackChanges;
    }

    return {
      ts: now.toISOString(),
      candidates: users.length,
      trackChanges: totalTrackChanges,
      sent: totalSent,
      skipped: totalSkipped,
    };
  }
);
