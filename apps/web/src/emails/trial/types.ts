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
  /** One-tap "open the app already signed in" link (lib/app-access.ts).
   *  Set only for emails that ask her to get into the app. */
  signInUrl?: string | null;
  /** Which funnel she came from (2026-10-01): "men" = BWK (/start-bwk,
   *  /start-test-bwk), "women" = everything else. Drives example lines. */
  lane?: "women" | "men";
  /** Signed /free-week claim link (lib/free-week.ts). Set only for the
   *  free_week_offer / free_week_followup emails. */
  freeWeekUrl?: string | null;
}

/**
 * One version of an email (2026-10-01, per Keenan: "writing multiple scripts
 * per app that we feed into jev that then decides which one to use"). Every
 * variant of an email has the same job and the same CTA; they differ in
 * angle. lib/email-jev.ts picks one per send and learns from the results.
 */
export interface EmailVariant {
  /** Stable id — never rename one that has sent, the results key on it. */
  id: string;
  /** One line Jev reads: the angle this version takes. */
  angle: string;
  subject: (v: TrialVars) => string;
  html: (v: TrialVars) => string;
}

export interface TrialEmailTemplate {
  subject: (v: TrialVars) => string;
  html: (v: TrialVars) => string;
  /** When present, sendTrialEmail sends one of these (picked by Jev) and
   *  subject/html above are only the admin-preview default. */
  variants?: EmailVariant[];
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
  | "trial_ended_day14"
  | "reactivation_friction"
  | "reactivation_social"
  | "reactivation_final"
  | "power_deepen"
  | "power_referral_tease"
  | "recovery_checkout_abandoned"
  | "recovery_signup_no_checkout"
  | "recovery_paid_no_app"
  | "recovery_recorded_once"
  | "recovery_day6_nudge"
  | "recovery_download_reminder"
  | "keep_momentum"
  | "trial_ending"
  | "rescue_signup_only"
  | "rescue_viewed_no_tap"
  | "rescue_tapped_app_store"
  | "rescue_webview_blocked"
  | "never_recorded_24h"
  | "never_recorded_48h"
  | "never_recorded_3day"
  | "never_recorded_lastday"
  | "stall_1rec"
  | "stall_2rec"
  | "stall_3plus"
  | "winback_7d"
  | "winback_14d"
  | "winback_30d"
  | "winback_90d"
  | "milestone_10"
  | "milestone_25"
  | "milestone_50"
  | "milestone_100"
  | "milestone_365"
  | "nr_winback_1"
  | "apple_duplicate_rescue"
  | "first_debrief_followup"
  | "card_trial_week_so_far"
  | "card_trial_try_once"
  | "trial_cancelled"
  | "nr_winback_2"
  | "nr_winback_3"
  | "app_access_rescue"
  | "app_first_record_1"
  | "app_first_record_2"
  | "free_week_offer"
  | "free_week_followup";
