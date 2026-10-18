import type { TrialEmailKey } from "@/emails/trial/types";

/**
 * Which failed-payment follow-up is due, by hours since the first decline
 * (User.stripeFirstFailureAt). Pure; the recovery orchestrator calls it.
 *
 *   +2d: 44h–116h   payment_failed_2d
 *   +5d: 116h–240h  payment_failed_5d
 *
 * Wide, non-overlapping windows so a user is never a candidate for both
 * in one tick, and a run that was budget-capped still catches them on a
 * later tick. Dedupe is TrialEmailLog (userId, key), as always. Beyond
 * 10 days Stripe's retry schedule is over and nothing more goes out.
 */
export const FOLLOWUP_2D_FROM_HOURS = 44;
export const FOLLOWUP_5D_FROM_HOURS = 116;
export const FOLLOWUP_MAX_HOURS = 240;

export function followUpKeyFor(hoursSinceFirstFailure: number): TrialEmailKey | null {
  const h = hoursSinceFirstFailure;
  if (!Number.isFinite(h) || h < FOLLOWUP_2D_FROM_HOURS) return null;
  if (h < FOLLOWUP_5D_FROM_HOURS) return "payment_failed_2d";
  if (h < FOLLOWUP_MAX_HOURS) return "payment_failed_5d";
  return null;
}
