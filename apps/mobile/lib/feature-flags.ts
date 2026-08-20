/**
 * Mobile feature flags. v1.3 (2026-06-03):
 *
 * The previous `isNewOnboardingEnabled` flag was deleted as part of
 * the onboarding rewrite — cold-launch routing now goes to
 * /(auth)/sign-in unconditionally. The /onboarding-new/* pre-auth
 * funnel remains reachable via Meta-ad deep links but is no longer
 * the default cold-launch destination.
 *
 * Expo public env vars are baked into the JS bundle at build time
 * (Metro inlines `process.env.EXPO_PUBLIC_*` references). Flipping a flag
 * in prod means flipping the env var + cutting a new EAS build, OR an
 * `expo-updates` OTA push if the bundle gets re-published.
 *
 * Default for every flag is OFF unless the env var is the literal
 * string "true". This is intentional — a missing or malformed env
 * var must never silently enable an experimental path.
 */

/**
 * Onboarding v10 (2026-08-19). Replaces the screens BEHIND the existing
 * /onboarding-new/* routes rather than adding new ones, so the Meta-ad deep
 * links already running in Keenan's campaigns keep landing on a working
 * flow. Route names are deliberately unchanged.
 *
 * OFF (default) → the existing onboarding-v2 flow renders, untouched.
 * ON            → v10 screens render at the same routes.
 *
 * ⚠️ STATIC member access is required. Metro only inlines
 * `process.env.EXPO_PUBLIC_*` for static property reads; a dynamic
 * `process.env[key]` lookup is NOT inlined and evaluates to undefined in a
 * release bundle — which reads as "flag off" and is silently unflippable.
 */
export function isOnboardingV10Enabled(): boolean {
  return process.env.EXPO_PUBLIC_ONBOARDING_V10 === "true";
}
