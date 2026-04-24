/**
 * Shared types for the trial onboarding email sequence.
 *
 * Every template exports { subject, html } functions that take the
 * same TrialVars bag. The orchestrator constructs the bag once per
 * user per tick and reuses it for whichever email is due.
 */

export interface TrialVars {
  firstName: string;
  appUrl: string;
  /** Pretty form ("April 24"). Orchestrator formats via Intl. */
  trialEndsAt: string;
  /** Raw Date — used by a few emails that need relative math. */
  trialEndsAtRaw: Date | null;
  totalRecordings: number;
  /** Null when user has no debriefs yet. */
  topTheme: string | null;
  /** Task extraction count on their first debrief; null if none. */
  firstDebriefTaskCount: number | null;
  /** First 100 signups have a number; null otherwise. */
  foundingMemberNumber: number | null;
  /** Tokenized unsubscribe URL — required in every email footer. */
  unsubscribeUrl: string;
}

export interface TrialEmailTemplate {
  subject: (v: TrialVars) => string;
  html: (v: TrialVars) => string;
}

export type TrialEmailKey =
  | "welcome_day0"
  | "first_debrief_replay"
  | "objection_60sec"
  | "pattern_tease"
  | "user_story"
  | "weekly_report_checkin"
  | "life_matrix_reveal"
  | "value_recap"
  | "trial_ending_day13"
  | "reactivation_friction"
  | "reactivation_social"
  | "reactivation_final"
  | "power_deepen"
  | "power_referral_tease";
