import { safeLog } from "@/lib/safe-log";
import {
  DAY2_DEFAULT_LOCAL_TIME,
  isDay2Cohort,
  isWithinLocalHour,
} from "@/lib/v10-day2-push";

/**
 * Day-2 come-back nudge — push when we can, email when we can't
 * (audit 2026-10-17, R-3; requested by Keenan).
 *
 * ── Why the email path exists ────────────────────────────────────────
 * The day-2 push (lib/v10-day2-push.ts) only reaches users with a
 * pushToken, and most new users never reach the Reminders step that
 * registers one. D1 retention for the week ending 2026-10-17 was 1 of 61.
 * So the same 2–3 day age band gets ONE nudge, by whichever channel we
 * have: push if a device is registered, otherwise a single email.
 *
 * ── One nudge, one channel ───────────────────────────────────────────
 * A user is either a push user or an email user for this nudge, never
 * both. The push keeps its own idempotency column (User.v10Day2PushSentAt,
 * claim-first); the email dedupes on TrialEmailLog (userId, "day2_nudge")
 * like every other lifecycle email, and never stamps the push column.
 *
 * ── Email-only rules (from the audit prompt) ─────────────────────────
 *   - skip anyone who already came back: an Entry created more than 24h
 *     after signup means the nudge has nothing to ask for
 *   - respect unsubscribes + isEmailEnabled("day2_nudge") (sendTrialEmail)
 *   - internal/admin mailboxes are left out
 *   - 24h per-user throttle, same rule as the recovery orchestrator: if
 *     ANY lifecycle email went out in the last 24h (never_recorded_48h,
 *     app_first_record_2, first_debrief_followup all live in this window)
 *     we do not stack a second one on top. The local-hour window is one
 *     hour wide, so a throttled user simply misses the day-2 email; they
 *     were emailed yesterday anyway.
 *
 * ── Flag ─────────────────────────────────────────────────────────────
 * The hourly cron that drives this is gated by ENABLE_V10_DAY2_PUSH
 * (fail-closed). That flag now switches on BOTH channels, so Keenan's
 * "turn it on on a Monday" rule for email changes covers the email too.
 *
 * The runner takes its I/O as dependencies so the cohort logic is unit
 * tested without Inngest or a database.
 */

export const DAY2_NUDGE_EMAIL_KEY = "day2_nudge" as const;
export const DAY2_NUDGE_EVENT = "day2_nudge_sent" as const;

/** Hours after signup past which a recording counts as "came back". */
export const CAME_BACK_AFTER_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;

export interface Day2Candidate {
  id: string;
  email: string | null;
  createdAt: Date;
  timezone: string;
  notificationTime: string | null;
  pushToken: string | null;
}

export interface Day2NudgeDeps {
  now: Date;
  /** Users in the 2–3 day band with the push column still unclaimed. */
  loadCandidates: () => Promise<Day2Candidate[]>;
  /** lib/v10-day2-push sendDay2Push — true only when a push left. */
  sendPush: (userId: string) => Promise<boolean>;
  /** Has this user recorded at or after `since`? */
  hasEntrySince: (userId: string, since: Date) => Promise<boolean>;
  /** Any TrialEmailLog row for this user at or after `since`? */
  hasEmailSince: (userId: string, since: Date) => Promise<boolean>;
  /** lib/trial-emails sendTrialEmail(userId, "day2_nudge") — the result
   *  carries the dedupe / unsubscribe / disabled reason. */
  sendEmail: (
    userId: string
  ) => Promise<{ sent: boolean; reason?: string }>;
  /** lib/internal-traffic isInternalEmail. */
  isInternalEmail: (email: string | null) => boolean;
  /** OnboardingEvent day2_nudge_sent, value "push" | "email". */
  logSent: (userId: string, channel: "push" | "email") => Promise<void>;
}

export interface Day2NudgeStats {
  candidates: number;
  push: number;
  email: number;
  skippedHour: number;
  skippedCameBack: number;
  skippedThrottled: number;
  skippedInternal: number;
  emailNotSent: Record<string, number>;
}

/** Is this user due right now (2–3 days old, inside their local hour)? */
export function isDueNow(
  u: Pick<Day2Candidate, "createdAt" | "timezone" | "notificationTime">,
  now: Date
): "due" | "outside_band" | "outside_hour" {
  if (!isDay2Cohort(u.createdAt, now)) return "outside_band";
  const localTime = u.notificationTime || DAY2_DEFAULT_LOCAL_TIME;
  if (!isWithinLocalHour(now, u.timezone, localTime)) return "outside_hour";
  return "due";
}

/** The instant after which a recording means "she came back". */
export function cameBackCutoff(createdAt: Date): Date {
  return new Date(createdAt.getTime() + CAME_BACK_AFTER_HOURS * HOUR_MS);
}

export async function runDay2Nudge(deps: Day2NudgeDeps): Promise<Day2NudgeStats> {
  const { now } = deps;
  const stats: Day2NudgeStats = {
    candidates: 0,
    push: 0,
    email: 0,
    skippedHour: 0,
    skippedCameBack: 0,
    skippedThrottled: 0,
    skippedInternal: 0,
    emailNotSent: {},
  };

  const candidates = await deps.loadCandidates();
  stats.candidates = candidates.length;

  for (const u of candidates) {
    // step.run() serializes Dates to ISO strings; re-hydrate before math.
    const createdAt = new Date(u.createdAt);
    const due = isDueNow({ ...u, createdAt }, now);
    if (due === "outside_band") continue;
    if (due === "outside_hour") {
      stats.skippedHour += 1;
      continue;
    }

    if (u.pushToken) {
      // Push path: unchanged v10 behaviour (claim-first, one ever).
      const ok = await deps.sendPush(u.id);
      if (ok) {
        stats.push += 1;
        await deps.logSent(u.id, "push");
      }
      continue;
    }

    // Email path.
    if (deps.isInternalEmail(u.email)) {
      stats.skippedInternal += 1;
      continue;
    }
    if (await deps.hasEntrySince(u.id, cameBackCutoff(createdAt))) {
      stats.skippedCameBack += 1;
      continue;
    }
    if (await deps.hasEmailSince(u.id, new Date(now.getTime() - 24 * HOUR_MS))) {
      stats.skippedThrottled += 1;
      continue;
    }
    const res = await deps.sendEmail(u.id);
    if (res.sent) {
      stats.email += 1;
      await deps.logSent(u.id, "email");
    } else {
      const k = res.reason ?? "unknown";
      stats.emailNotSent[k] = (stats.emailNotSent[k] ?? 0) + 1;
    }
  }

  safeLog.info("day2-nudge.run", { ...stats });
  return stats;
}
