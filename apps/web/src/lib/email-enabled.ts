/**
 * Lifecycle / marketing email kill-switch (2026-06-24).
 *
 * Single reversible source of truth for which automated emails are
 * allowed to send. Each send site (sendTrialEmail, sendCountdownEmail,
 * the monthly-digest cron) calls `isEmailEnabled(key)` and early-returns
 * BEFORE dispatching to Resend when the key is disabled.
 *
 * Why this exists: we are pausing the full lifecycle/marketing sequence
 * while we rebuild the templates (branding + copy refresh). We are NOT
 * deleting templates or unregistering Inngest functions — flip a value
 * back to `true` here to re-enable a single email, no other code change.
 *
 * Scope: this map ONLY governs lifecycle/marketing emails that flow
 * through the registry (sendTrialEmail), the countdown cron
 * (sendCountdownEmail), and the monthly digest. It does NOT touch
 * transactional/auth/payment paths (magic link, password reset,
 * welcome+verify, payment-failed, data-export-ready, founder
 * notifications, weekly digest) — those never call this helper and keep
 * sending normally.
 *
 * To re-enable everything: set every value below to `true` (or delete
 * the guards). To re-enable one email: flip its single line.
 */

/**
 * Keyed by the email's identifier as used at its send site:
 *  - TrialEmailKey values (registry emails via sendTrialEmail)
 *  - CountdownEmailKey values (countdown cron via sendCountdownEmail)
 *  - "monthly_digest" (monthly-digest Inngest cron)
 *
 * `true`  = still sends (one of the 12 KEEP emails)
 * `false` = paused — send site early-returns before Resend
 */
export const EMAIL_ENABLED: Record<string, boolean> = {
  // ── KEEP ON — registry emails (sendTrialEmail) ──────────────────
  recovery_paid_no_app: true, // #29 paid, no app install
  recovery_recorded_once: true, // #30 recorded once then stalled
  recovery_download_reminder: false, // #32 REPLACED by 4 stage-specific rescue emails below
  first_insight: true, // activation: fires once at ~5 recordings w/ real insight
  keep_momentum: true, // encouragement: fires once at 2 recordings, 48h after first
  trial_ending: true, // trial-ending: fires ~2d before trialEndsAt, recorded users only, no card on file
  rescue_signup_only: true, // download rescue #1: signed up, never reached download screen
  rescue_viewed_no_tap: true, // download rescue #2: viewed download, didn't tap
  rescue_tapped_app_store: true, // download rescue #3: tapped App Store, never opened app
  rescue_webview_blocked: true, // download rescue #4: stuck in IG/FB webview

  // ── PAUSED — duplicate-welcome cleanup (2026-06-24) ─────────────
  // The two OLD user-facing welcomes stay off: new signups used to get
  // welcome_day0 AND the founder "URGENT: Acuity; Next Steps" email
  // back-to-back. They are replaced by the single welcome_founder below.
  // Reversible — flip back to true to restore the old behaviour.
  welcome_day0: false, // #1 welcome_day0 (sendTrialEmail, inline in bootstrap)
  founder_welcome: false, // #3 founder "URGENT" welcome (inline send in bootstrapNewUser)

  // ── KEEP ON — the single rebuilt welcome (2026-06-24) ───────────
  // welcome_founder: one personal note from Keenan, sent once on signup
  // (inline in bootstrapNewUser). Replaces the two killed welcomes above.
  welcome_founder: true,

  // ── PAUSED — registry onboarding / retention emails ─────────────
  first_debrief_replay: false,
  objection_60sec: false,
  pattern_tease: false,
  user_story: false,
  weekly_report_checkin: false,
  life_matrix_reveal: false,
  value_recap: false,
  trial_ending_day13: false,
  trial_ended_day14: false,
  reactivation_friction: false,
  reactivation_social: false,
  reactivation_final: false,
  power_deepen: false,
  power_referral_tease: false,

  // ── PAUSED — registry recovery emails (not kept) ────────────────
  recovery_checkout_abandoned: false,
  recovery_signup_no_checkout: false,
  recovery_day6_nudge: false,

  // ── PAUSED — countdown cron (sendCountdownEmail), all 4 off ──────
  trial_midtrial: false,
  trial_urgency: false,
  trial_ended_t0: false,
  trial_reengagement_t3: false,

  // ── PAUSED — monthly digest cron ────────────────────────────────
  monthly_digest: false,
};

/**
 * True when the given email key is allowed to send. Unknown keys
 * default to DISABLED — fail closed so a newly-added email does not
 * silently start mailing the whole list before someone opts it in here.
 */
export function isEmailEnabled(key: string): boolean {
  return EMAIL_ENABLED[key] === true;
}
