/**
 * Single source of truth for paywall gating. The exact rule is in
 * IMPLEMENTATION_PLAN_PAYWALL.md §3 — encoded here once, called
 * everywhere a route or UI element needs to decide whether the user
 * can do or see something.
 *
 * Pure function, no I/O — pass the relevant fields off the User
 * row and (optionally) a fixed `now` for testability. Production
 * callers pass `new Date()`; tests pass deterministic dates.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface UserEntitlementInput {
  subscriptionStatus: string;
  trialEndsAt: Date | null;
}

export interface Entitlement {
  /**
   * Can record a new entry (gates POST /api/record). After v1.1 this
   * is true on FREE/post-trial-free as well — recording is the FREE
   * journaling loop. Only the extraction layer (canExtractEntries) is
   * PRO-gated.
   */
  canRecord: boolean;
  /**
   * Can run new entries through the Claude extraction step (themes,
   * tasks, goals, lifeAreaMentions, embeddings). PRO/TRIAL/PAST_DUE
   * only. FREE recordings transcribe + get a one-sentence summary,
   * then short-circuit the pipeline. v1.1 free-tier redesign — see
   * docs/v1-1/free-tier-phase2-plan.md.
   */
  canExtractEntries: boolean;
  /** Can generate a new weekly report (gates POST /api/weekly). */
  canGenerateNewWeeklyReport: boolean;
  /** Can generate a new Day 14 / Quarterly / Annual life audit. */
  canGenerateNewLifeAudit: boolean;
  /** Can generate a new monthly memoir. */
  canGenerateMonthlyMemoir: boolean;
  /** Can refresh the Life Map (gates POST /api/lifemap/refresh). */
  canRefreshLifeMap: boolean;
  /**
   * Always true. Soft-transition decision: post-trial users keep
   * permanent access to everything they already created.
   */
  canViewHistory: true;

  /** True when the user is in the active trial window. */
  isTrialing: boolean;
  /**
   * Whole days remaining in the trial. Floors fractional days
   * (1.5 days remaining → 1). Null when status is not TRIAL OR
   * when trialEndsAt has not been set yet.
   */
  trialDaysRemaining: number | null;
  /**
   * True for the "soft-locked" state: trial expired without
   * subscribing, or subscribed-then-canceled.
   */
  isPostTrialFree: boolean;
  /** True when the user has an active paid subscription. */
  isActive: boolean;
  /** True during Stripe's payment-failure grace window. */
  isPastDue: boolean;
}

/**
 * Compute the entitlement set for a user.
 *
 * @param user The relevant fields off the User row. Must not be null.
 * @param now  Optional fixed time (defaults to `new Date()`).
 *             Pass a fixed Date in tests to make assertions
 *             deterministic.
 */
export function entitlementsFor(
  user: UserEntitlementInput,
  now: Date = new Date()
): Entitlement {
  if (user == null) {
    // Programming error — never call this with null. Throwing here
    // surfaces the bug at the caller rather than silently locking
    // the user out.
    throw new Error("entitlementsFor: user is null");
  }

  const status = user.subscriptionStatus;
  const trialEndsAt = user.trialEndsAt;
  const nowMs = now.getTime();

  // ── PRO: active paid subscriber. Includes Stripe's own trial
  //    period if the checkout had `trial_period_days` (we don't
  //    use that — see plan §1.5 — but the rule still holds).
  if (status === "PRO") {
    return entitlementSet({ isActive: true });
  }

  // ── PAST_DUE: card declined and Stripe is retrying. Don't punish
  //    the user — they keep full access during the retry window.
  //    The UI surfaces an "Update payment method" banner separately.
  if (status === "PAST_DUE") {
    return entitlementSet({ isPastDue: true });
  }

  // ── Active TRIAL: full access + countdown.
  //    Brand-new accounts may have trialEndsAt === null briefly
  //    (between createUser and the trialEndsAt-setting hook in
  //    plan §1.6); treat that as trialing without a countdown
  //    rather than locking the new user out. Once the column is
  //    populated, the countdown turns on.
  const isActiveTrial =
    status === "TRIAL" && (trialEndsAt === null || trialEndsAt.getTime() > nowMs);
  if (isActiveTrial) {
    const daysRemaining =
      trialEndsAt === null
        ? null
        : Math.max(0, Math.floor((trialEndsAt.getTime() - nowMs) / DAY_MS));
    return entitlementSet({
      isTrialing: true,
      trialDaysRemaining: daysRemaining,
    });
  }

  // ── Everything else falls through to post-trial-free:
  //    - status === "FREE" (canceled subscriber, or trial-ended-no-sub
  //      that the system later set to FREE)
  //    - status === "TRIAL" with trialEndsAt in the past or === now
  //      (treat now-as-expired — no boundary slop)
  //    - status === "CANCELED" (not a value our webhook writes today,
  //      but we accept it as an alias for FREE for forward-compat)
  //    - any unknown status string (fail-closed — don't grant access
  //      to a state we don't understand)
  return entitlementSet({ isPostTrialFree: true });
}

/**
 * Build a complete Entitlement, defaulting all booleans + flags
 * to their post-trial-free values, then layering in the overrides.
 * Keeps the rule above readable — each branch sets only the flag(s)
 * that distinguish it.
 */
function entitlementSet(
  overrides: Partial<Omit<Entitlement, "canViewHistory">>
): Entitlement {
  // The "active" partition (PRO, TRIAL, PAST_DUE) gets full generate
  // permissions. The "post-trial-free" partition is split into two
  // sub-tiers as of v1.1: canRecord stays true (the FREE journaling
  // loop), but every other can* flag including canExtractEntries
  // requires PRO. See docs/v1-1/free-tier-phase2-plan.md slice 1.
  const isActiveSide =
    overrides.isPostTrialFree !== true && (
      overrides.isActive === true ||
      overrides.isTrialing === true ||
      overrides.isPastDue === true
    );
  const isPostTrialFreeSide = overrides.isPostTrialFree === true;

  return {
    // canRecord is true on active-side AND on post-trial-free side.
    // Recording is the FREE primary action; only extraction is PRO.
    canRecord: isActiveSide || isPostTrialFreeSide,
    canExtractEntries: isActiveSide,
    canGenerateNewWeeklyReport: isActiveSide,
    canGenerateNewLifeAudit: isActiveSide,
    canGenerateMonthlyMemoir: isActiveSide,
    canRefreshLifeMap: isActiveSide,
    canViewHistory: true,

    isTrialing: false,
    trialDaysRemaining: null,
    isPostTrialFree: false,
    isActive: false,
    isPastDue: false,

    ...overrides,
  };
}
