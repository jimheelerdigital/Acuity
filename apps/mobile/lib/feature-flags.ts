/**
 * Mobile feature flags. Slice 13 (2026-05-26) introduces this file
 * with the onboarding-v2 cold-launch routing flag.
 *
 * Expo public env vars are baked into the JS bundle at build time
 * (Metro inlines `process.env.EXPO_PUBLIC_*` references). Flipping a
 * flag in prod means flipping the env var + cutting a new EAS build,
 * OR an `expo-updates` OTA push if the bundle gets re-published with
 * the new value.
 *
 * Default for every flag is OFF unless the env var is the literal
 * string "true". This is intentional — a missing or malformed env
 * var must never silently enable an experimental path.
 */

/**
 * Onboarding-v2 (pain-first) cold-launch routing. When true, the
 * AuthGate redirects unauthenticated cold-launches into
 * /onboarding-new/pain instead of /(auth)/sign-in. The
 * existing /(auth)/sign-in flow remains available as a destination
 * for users with deep-link entry or who navigate there directly.
 */
export function isNewOnboardingEnabled(): boolean {
  return process.env.EXPO_PUBLIC_NEW_ONBOARDING_ENABLED === "true";
}
