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
import { rescueSignupOnly } from "./rescue-signup-only";
import { rescueViewedNoTap } from "./rescue-viewed-no-tap";
import { rescueTappedAppStore } from "./rescue-tapped-app-store";
import { rescueWebviewBlocked } from "./rescue-webview-blocked";
import { neverRecorded24h } from "./never-recorded-24h";
import { neverRecorded48h } from "./never-recorded-48h";
import { neverRecorded3day } from "./never-recorded-3day";
import { neverRecordedLastday } from "./never-recorded-lastday";
import { firstInsight } from "./first-insight";
import { keepMomentum } from "./keep-momentum";
import { trialEnding } from "./trial-ending";
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
    keep_momentum: keepMomentum,
    trial_ending: trialEnding,
    rescue_signup_only: rescueSignupOnly,
    rescue_viewed_no_tap: rescueViewedNoTap,
    rescue_tapped_app_store: rescueTappedAppStore,
    rescue_webview_blocked: rescueWebviewBlocked,
    never_recorded_24h: neverRecorded24h,
    never_recorded_48h: neverRecorded48h,
    never_recorded_3day: neverRecorded3day,
    never_recorded_lastday: neverRecordedLastday,
  };

export type { TrialEmailKey, TrialEmailTemplate } from "./types";
export type { TrialVars } from "./types";
