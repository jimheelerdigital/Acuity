/**
 * Cold-start routing for v10.
 *
 * ── The problem this solves ──────────────────────────────────────────
 * AuthGate sends every signed-out cold launch to /(auth)/sign-in. v10 is
 * reachable only because `/onboarding-new/*` is exempted — which is the
 * Meta deep-link path. As marketing shifts to App Store downloads, new
 * users arrive by cold install and cold launch, so today they would never
 * see v10 at all.
 *
 * ── What must NOT break ──────────────────────────────────────────────
 * Two populations are signed out at launch and must still reach sign-in:
 *
 *   1. A returning user whose token hit the 30-day idle expiry.
 *   2. Anyone who signed out deliberately.
 *
 * Dropping either into a signup funnel is worse than the bug being fixed —
 * a paying subscriber who cannot find sign-in churns.
 *
 * (A third case is already safe: on iOS the keychain survives app deletion,
 * so a reinstalling subscriber usually still has a token and resolves as
 * signed in before this code runs. See lib/session-expiry.ts.)
 *
 * This module is PURE. All device facts are passed in, so every row of the
 * decision table below is testable without a simulator.
 */

export type ColdStartRoute =
  | "stay"
  | "home"
  | "signin"
  | "v10"
  | "legacy-onboarding";

export interface ColdStartFacts {
  /** EXPO_PUBLIC_ONBOARDING_V10. Off ⇒ behaviour is exactly as before. */
  v10Enabled: boolean;
  /** Resolved auth. Null = signed out. */
  signedIn: boolean;
  onboardingCompleted: boolean;
  subscriptionStatus: string | null;
  /**
   * This install chose "Later" on Screen 7 and holds an unclaimed debrief.
   * A guest is signed OUT but must not be bounced to sign-in.
   */
  isGuest: boolean;
  /**
   * We have already routed this install into v10 at least once. Set at
   * ROUTING time, not on interaction — otherwise someone who force-quits on
   * Screen 1 is treated as brand new forever, and someone who gets partway
   * through is treated as a returning user and sent to sign-in.
   */
  v10Offered: boolean;
  /** The user explicitly tapped "Sign in" from the funnel. Sticky. */
  v10Dismissed: boolean;
  /**
   * This device shows evidence of a prior account or prior app use.
   *
   * THE load-bearing guard: it is what keeps a returning signed-out user —
   * a subscriber whose token hit idle expiry, or who reinstalled — out of a
   * signup funnel. Composed from three independent signals in
   * use-cold-start-facts.ts, any one of which is sufficient:
   *
   *   1. A SecureStore session token (survives app deletion on iOS, so it
   *      is the strongest signal a real account exists on this device).
   *   2. Legacy onboarding/tour keys.
   *   3. Any other app-namespaced AsyncStorage key.
   */
  hasAppHistory: boolean;
  /** First path segment, e.g. "(auth)", "onboarding-new", "(tabs)". */
  segment: string;
}

/**
 * Where a launch should land. `"stay"` means leave the user where they are.
 *
 * Signed-in behaviour is deliberately unchanged from the pre-v10 AuthGate;
 * only the signed-out branch gains new outcomes.
 */
export function decideColdStartRoute(f: ColdStartFacts): ColdStartRoute {
  const inAuth = f.segment === "(auth)";
  const inAuthCallback = f.segment === "auth-callback";
  const inOnboarding = f.segment === "onboarding";
  const inOnboardingNew = f.segment === "onboarding-new";

  // ── Signed out ────────────────────────────────────────────────────
  if (!f.signedIn) {
    // Mid-flight auth. Redirecting out of the magic-link token exchange
    // loses the token and loops.
    if (inAuth || inAuthCallback) return "stay";

    // Deep link into the funnel. Pre-existing behaviour, unchanged.
    if (inOnboardingNew) return "stay";

    // Guest: signed out on purpose, holding an unclaimed debrief. Without
    // this, Screen 7's "Later" bounces straight back to sign-in and reads
    // to the user as a dead button.
    if (f.isGuest) return "stay";

    if (!f.v10Enabled) return "signin";

    // They asked for sign-in from the funnel. Honour it on every launch,
    // not just the one where they tapped it.
    if (f.v10Dismissed) return "signin";

    // Mid-funnel across a relaunch — resume rather than restart at sign-in.
    if (f.v10Offered) return "v10";

    // The load-bearing guard: app history means a returning user, so the
    // funnel is wrong even though they are signed out.
    if (f.hasAppHistory) return "signin";

    return "v10";
  }

  // ── Signed in ─────────────────────────────────────────────────────
  if (!f.onboardingCompleted && !inOnboarding && !inOnboardingNew && !inAuthCallback) {
    // Pro-bypass: a user who already paid (typically web/Stripe) is not
    // routed through mobile onboarding — Apple Guideline 3.1.3(b).
    if (f.subscriptionStatus === "PRO") return "home";

    // v10 arrivals must NOT be handed to the legacy post-signup flow. They
    // have already recorded, seen a reveal, made a paywall decision and
    // picked a reminder slot; sending them to /onboarding?step=N is a
    // second onboarding covering the same ground.
    if (f.v10Enabled && f.v10Offered) return "home";

    return "legacy-onboarding";
  }

  if (f.onboardingCompleted && (inAuth || inOnboarding)) return "home";

  return "stay";
}

/**
 * AsyncStorage keys written during boot by code we do not control, and so
 * useless as evidence of app history.
 *
 * `acuity_has_launched` and `acuity_last_active_ms` are both written by the
 * auth-context boot effect, which races this one. Counting them would make
 * a genuinely fresh install look like a returning user roughly whenever the
 * other effect won — a coin-flip bug that would be miserable to diagnose.
 */
export const BOOT_WRITTEN_KEYS = new Set([
  "acuity_has_launched",
  "acuity_last_active_ms",
]);

/**
 * Does this key prove the app has been used before?
 *
 * A genuinely fresh install has no app-namespaced storage at all. Anything
 * under acuity.* / acuity_* / ripple.* that is not written during boot is
 * evidence of a prior session: a completed tour, cached API payloads, a
 * haptics preference, a dismissed prompt.
 */
/**
 * Keys that prove a completed or in-progress LEGACY onboarding. Named
 * explicitly rather than left to the prefix rule so the intent survives a
 * future change to the prefix heuristic.
 */
export const LEGACY_ONBOARDING_KEYS = [
  "acuity.tour.completed",
  "acuity_onboarding_step",
  "acuity.onboarding.completed",
] as const;

export function isHistoryKey(key: string): boolean {
  if ((LEGACY_ONBOARDING_KEYS as readonly string[]).includes(key)) return true;
  if (BOOT_WRITTEN_KEYS.has(key)) return false;
  // Our own v10 markers describe the CURRENT funnel attempt, so they are
  // not evidence of pre-v10 history.
  if (key.startsWith("ripple.v10.")) return false;
  return (
    key.startsWith("acuity.") ||
    key.startsWith("acuity_") ||
    key.startsWith("ripple.")
  );
}

export function hasAppHistoryFromKeys(keys: readonly string[]): boolean {
  return keys.some(isHistoryKey);
}
