/**
 * Life Audit (trial "Day 7" audit, kind TRIAL_DAY_14): when to generate it.
 * 2026-10-27, Jimmy: wait for data instead of shipping thin audits.
 *
 * Before this, the audit was dispatched the night before trial end no matter
 * how few entries a user had. Under 7 entries the generator failed, and its
 * onFailure handler shipped a template "degraded" audit: 239 of 245 audits
 * ever produced were degraded.
 *
 * Rule now (pure, so the cron and tests agree):
 *  - Earliest: the user's trial is ending (trialEndsAt within the next 24h,
 *    the same moment the old cron fired), or has ended.
 *  - Generate once they have AUDIT_MIN_ENTRIES completed entries dated inside
 *    their first AUDIT_WINDOW_DAYS. Under that, DEFER: the daily cron looks
 *    again tomorrow.
 *  - Past the window (signup + 30 days, plus one cron day of grace) with too
 *    few entries: never generate. No degraded audit, ever.
 *  - Never twice: any QUEUED / GENERATING / COMPLETE audit blocks dispatch.
 *    A FAILED run is retried at most once more (MAX_FAILED_ATTEMPTS), so a
 *    persistently failing user can't burn flagship calls every day.
 *  - Only users who can generate one now (trial / active / grace), the same
 *    canGenerateNewLifeAudit gate the manual POST uses.
 */

import { MIN_ENTRIES_FOR_AUDIT } from "@/lib/prompts/life-audit";

export const AUDIT_MIN_ENTRIES = MIN_ENTRIES_FOR_AUDIT; // 7
export const AUDIT_WINDOW_DAYS = 30;
export const MAX_FAILED_ATTEMPTS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export type AuditStatus = "QUEUED" | "GENERATING" | "COMPLETE" | "FAILED" | string;

export type AuditDecision =
  | { action: "dispatch"; periodStart: Date; periodEnd: Date }
  | {
      action: "defer";
      reason: "not_enough_entries";
      have: number;
      need: number;
    }
  | {
      action: "skip";
      reason:
        | "already_has_audit"
        | "gave_up_after_failures"
        | "trial_not_ending_yet"
        | "no_trial"
        | "window_closed"
        | "not_entitled";
    };

/** End of the window entries are counted in: signup + 30 days. */
export function auditWindowEnd(createdAt: Date): Date {
  return new Date(createdAt.getTime() + AUDIT_WINDOW_DAYS * DAY_MS);
}

export function decideLifeAudit(input: {
  now: Date;
  createdAt: Date;
  trialEndsAt: Date | null;
  /** canGenerateNewLifeAudit for this user right now. */
  entitled: boolean;
  /** COMPLETE entries with entryDate in [createdAt, auditWindowEnd]. */
  completedEntriesInWindow: number;
  /** Statuses of the user's existing TRIAL_DAY_14 audits. */
  existingStatuses: AuditStatus[];
}): AuditDecision {
  const { now, createdAt, trialEndsAt } = input;

  if (input.existingStatuses.some((s) => s !== "FAILED")) {
    return { action: "skip", reason: "already_has_audit" };
  }
  const failed = input.existingStatuses.filter((s) => s === "FAILED").length;
  if (failed >= MAX_FAILED_ATTEMPTS) {
    return { action: "skip", reason: "gave_up_after_failures" };
  }
  // No real trial (null, or a zero-length one): this audit is a trial
  // feature and those users never got one before either.
  if (!trialEndsAt || trialEndsAt.getTime() - createdAt.getTime() < DAY_MS) {
    return { action: "skip", reason: "no_trial" };
  }
  if (trialEndsAt.getTime() > now.getTime() + DAY_MS) {
    return { action: "skip", reason: "trial_not_ending_yet" };
  }
  const windowEnd = auditWindowEnd(createdAt);
  // One cron day of grace so an entry made late on day 30 still counts.
  if (now.getTime() > windowEnd.getTime() + DAY_MS) {
    return { action: "skip", reason: "window_closed" };
  }
  if (!input.entitled) {
    return { action: "skip", reason: "not_entitled" };
  }
  if (input.completedEntriesInWindow < AUDIT_MIN_ENTRIES) {
    return {
      action: "defer",
      reason: "not_enough_entries",
      have: input.completedEntriesInWindow,
      need: AUDIT_MIN_ENTRIES,
    };
  }
  return {
    action: "dispatch",
    periodStart: createdAt,
    periodEnd: now.getTime() < windowEnd.getTime() ? now : windowEnd,
  };
}
