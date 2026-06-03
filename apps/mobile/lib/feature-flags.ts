/**
 * Mobile feature flags. v1.3 (2026-06-03):
 *
 * The previous `isNewOnboardingEnabled` flag was deleted as part of
 * the onboarding rewrite — cold-launch routing now goes to
 * /(auth)/sign-in unconditionally. The /onboarding-new/* pre-auth
 * funnel remains reachable via Meta-ad deep links but is no longer
 * the default cold-launch destination.
 *
 * Kept as a stub so the package boundary doesn't break — adding the
 * next flag in here is the right pattern. Expo public env vars are
 * baked into the JS bundle at build time (Metro inlines
 * `process.env.EXPO_PUBLIC_*` references). Flipping a flag in prod
 * means flipping the env var + cutting a new EAS build, OR an
 * `expo-updates` OTA push if the bundle gets re-published.
 *
 * Default for every flag is OFF unless the env var is the literal
 * string "true". This is intentional — a missing or malformed env
 * var must never silently enable an experimental path.
 */

export {};
