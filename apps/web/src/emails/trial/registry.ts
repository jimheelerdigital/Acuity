/**
 * Central registry for the trial onboarding email sequence.
 *
 * Maps every emailKey → its template (subject + html). The
 * orchestrator (inngest/functions/trial-email-orchestrator.ts) reads
 * from this registry, so adding a new email is two touches:
 * drop a template file under /emails/trial, add an entry here, and
 * add the emailKey to the track schedule.
 */

import type { TrialEmailKey, TrialEmailTemplate } from "./types";

import { firstDebriefReplay } from "./first-debrief-replay";
import { lifeMatrixReveal } from "./life-matrix-reveal";
import { objection60sec } from "./objection-60sec";
import { patternTease } from "./pattern-tease";
import { powerDeepen } from "./power-deepen";
import { powerReferralTease } from "./power-referral-tease";
import { reactivationFinal } from "./reactivation-final";
import { reactivationFriction } from "./reactivation-friction";
import { reactivationSocial } from "./reactivation-social";
import { trialEndedDay14 } from "./trial-ended-day14";
import { trialEndingDay13 } from "./trial-ending-day13";
import { userStory } from "./user-story";
import { valueRecap } from "./value-recap";
import { weeklyReportCheckin } from "./weekly-report-checkin";
import { recoveryCheckoutAbandoned } from "./recovery-checkout-abandoned";
import { recoveryDay6Nudge } from "./recovery-day6-nudge";
import { recoveryPaidNoApp } from "./recovery-paid-no-app";
import { recoveryRecordedOnce } from "./recovery-recorded-once";
import { recoverySignupNoCheckout } from "./recovery-signup-no-checkout";
import { recoveryDownloadReminder } from "./recovery-download-reminder";
import { firstInsight } from "./first-insight";
import { welcomeDay0 } from "./welcome-day0";

export const TRIAL_EMAIL_TEMPLATES: Record<TrialEmailKey, TrialEmailTemplate> =
  {
    welcome_day0: welcomeDay0,
    first_debrief_replay: firstDebriefReplay,
    objection_60sec: objection60sec,
    pattern_tease: patternTease,
    user_story: userStory,
    weekly_report_checkin: weeklyReportCheckin,
    life_matrix_reveal: lifeMatrixReveal,
    value_recap: valueRecap,
    trial_ending_day13: trialEndingDay13,
    trial_ended_day14: trialEndedDay14,
    reactivation_friction: reactivationFriction,
    reactivation_social: reactivationSocial,
    reactivation_final: reactivationFinal,
    power_deepen: powerDeepen,
    power_referral_tease: powerReferralTease,
    recovery_checkout_abandoned: recoveryCheckoutAbandoned,
    recovery_signup_no_checkout: recoverySignupNoCheckout,
    recovery_paid_no_app: recoveryPaidNoApp,
    recovery_recorded_once: recoveryRecordedOnce,
    recovery_day6_nudge: recoveryDay6Nudge,
    recovery_download_reminder: recoveryDownloadReminder,
    first_insight: firstInsight,
  };

export type { TrialEmailKey, TrialEmailTemplate } from "./types";
export type { TrialVars } from "./types";
