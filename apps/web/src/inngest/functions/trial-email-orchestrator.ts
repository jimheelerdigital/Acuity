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
 */

import { inngest } from "@/inngest/client";
import type { TrialEmailKey } from "@/emails/trial/registry";
import { safeLog } from "@/lib/safe-log";
import { hoursSince, sendTrialEmail } from "@/lib/trial-emails";

type Track = "STANDARD" | "REACTIVATION" | "POWER_USER";

interface CandidateUser {
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

/**
 * Given a user's state, return the single emailKey that's due to send
 * right now. Null = nothing due. Order matters: the orchestrator only
 * sends ONE email per user per tick so a backfilled user (long Inngest
 * outage) catches up one step at a time — natural cadence.
 *
 * Spec details:
 *   - objection_60sec is STANDARD-only; skip if POWER_USER.
 *   - reactivation_* entirely replaces STANDARD once the track flips.
 *   - power_deepen fires on flip regardless of whether any earlier
 *     STANDARD emails already went out; power_referral_tease fires at
 *     day 8 POWER_USER.
 *   - POWER_USER still receives value_recap (day 12) and
 *     trial_ending_day13; other STANDARD emails are suppressed on
 *     POWER_USER per spec.
 *   - weekly_report_checkin fires 24h after the user's FIRST
 *     WeeklyReport.createdAt, not off signup.
 *   - trial_ending_day13 fires when User.trialEndsAt - now() <= 24h.
 */
function nextEmailForUser(
  user: CandidateUser,
  track: Track,
  now: Date
): TrialEmailKey | null {
  const h = hoursSince(user.createdAt, now);
  const has = (k: TrialEmailKey) => user.sentKeys.has(k);

  // Reactivation replaces the STANDARD lane wholesale from 48h on.
  if (track === "REACTIVATION") {
    if (!has("reactivation_friction") && h >= 48) return "reactivation_friction";
    if (!has("reactivation_social") && h >= 24 * 4) return "reactivation_social";
    if (!has("reactivation_final") && h >= 24 * 7) return "reactivation_final";
    // Reactivation exits after the final email per spec — no further
    // emails for this user regardless of trial status.
    return null;
  }

  // trial_ending_day13 runs on both STANDARD and POWER_USER.
  if (!has("trial_ending_day13") && user.trialEndsAt) {
    const msUntilEnd = user.trialEndsAt.getTime() - now.getTime();
    const within24h = msUntilEnd <= 24 * 60 * 60 * 1000 && msUntilEnd > -6 * 60 * 60 * 1000;
    if (within24h) return "trial_ending_day13";
  }

  // value_recap runs on both STANDARD and POWER_USER (day 12).
  if (!has("value_recap") && h >= 24 * 12) return "value_recap";

  if (track === "POWER_USER") {
    if (!has("power_deepen")) return "power_deepen";
    if (!has("power_referral_tease") && h >= 24 * 8) return "power_referral_tease";
    // POWER_USER skips objection_60sec, pattern_tease, user_story,
    // first_debrief_replay, life_matrix_reveal, weekly_report_checkin
    // per spec ("Everything else is replaced").
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

export const trialEmailOrchestratorFn = inngest.createFunction(
  {
    id: "trial-email-orchestrator",
    name: "Trial onboarding email orchestrator",
    triggers: [{ cron: "0 * * * *" }],
    retries: 2,
  },
  async ({ step, logger }) => {
    const { prisma } = await import("@/lib/prisma");
    const now = new Date();

    // Fetch all users in an active trial. Exclude unsubscribed +
    // expired-trial users to keep the loop small. NOTE: step.run
    // serializes via JSON, so Date fields come back as ISO strings —
    // we rehydrate below before handing to date math.
    const rawUsers = await step.run("fetch-candidates", async () => {
      return prisma.user.findMany({
        where: {
          subscriptionStatus: "TRIAL",
          onboardingUnsubscribed: false,
          OR: [{ trialEndsAt: null }, { trialEndsAt: { gt: now } }],
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
      firstRecordingAt: u.firstRecordingAt ? new Date(u.firstRecordingAt) : null,
    }));

    safeLog.info("trial-email-orchestrator.tick", {
      candidateCount: users.length,
      ts: now.toISOString(),
    });

    let trackChanges = 0;
    let sent = 0;
    let skipped = 0;

    for (const u of users) {
      try {
        const hSinceSignup = hoursSince(u.createdAt, now);
        const computedTrack = classifyTrack(u, hSinceSignup);

        // Persist track change if it moved. Monotonic transitions
        // only: STANDARD → REACTIVATION or STANDARD → POWER_USER.
        // REACTIVATION and POWER_USER are terminal (a user who
        // eventually records shouldn't retroactively collect STANDARD
        // emails — they stay on their branch).
        if (u.onboardingTrack === "STANDARD" && computedTrack !== "STANDARD") {
          await prisma.user.update({
            where: { id: u.id },
            data: { onboardingTrack: computedTrack },
          });
          trackChanges++;
        }

        const effectiveTrack =
          u.onboardingTrack === "STANDARD" ? computedTrack : (u.onboardingTrack as Track);

        // Pull sent-key set + first-weekly-report timestamp in one go
        // per user. Could be N+1 but candidate counts are small
        // during beta (sub-1k active trials); revisit with a joined
        // fetch if scale warrants.
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
        logger.error(
          "[trial-email-orchestrator] per-user failure (non-fatal)",
          { err, userId: u.id }
        );
      }
    }

    return {
      ts: now.toISOString(),
      candidates: users.length,
      trackChanges,
      sent,
      skipped,
    };
  }
);
