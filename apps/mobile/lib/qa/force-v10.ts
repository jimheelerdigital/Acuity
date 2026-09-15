/**
 * ⚠️ QA-ONLY OVERRIDE — NOT A PRODUCT FEATURE. ⚠️
 *
 * Forces a cold launch down the v10 onboarding path on a device that would
 * otherwise resolve as a returning user. Exists because the v10 funnel is
 * only reachable from a device with NO app history, which makes it
 * untestable on the phone of anyone who has ever used the app.
 *
 * ── What it does when on ─────────────────────────────────────────────
 * Three consumers read this flag, each in its own clearly-marked block:
 *
 *   lib/onboarding-v10/use-cold-start-facts.ts
 *     Reports the device facts a brand-new install would have
 *     (hasAppHistory / v10Offered / v10Dismissed / isGuest all false), so
 *     `decideColdStartRoute` returns "v10".
 *
 *   contexts/auth-context.tsx
 *     IGNORES the stored session for this launch — signedIn and
 *     onboardingCompleted both fall out false, and the anonymous flow
 *     runs. The token is never deleted, so a normal build signs straight
 *     back in.
 *
 *   contexts/theme-context.tsx
 *     Skips hydrating the saved theme preference, so the net-new light
 *     default renders instead of whatever this device has stored.
 *
 * The pure `decideColdStartRoute` and its tests are deliberately NOT
 * touched. It keeps receiving honest inputs; only the facts handed to it
 * are overridden, so the routing logic under test is the routing logic
 * that ships.
 *
 * ── Why this is safe to have in the tree ─────────────────────────────
 * `EXPO_PUBLIC_*` vars are inlined by Metro at BUILD time, so a binary
 * built from any profile that does not set this cannot turn it on at
 * runtime — there is no remote toggle and no way to flip it on a shipped
 * app. It is set ONLY on the `v10-qa` EAS profile; `production`,
 * `pricing`, `v10-pricing`, `v10-sim` and every other profile leave it
 * unset, which is asserted in
 * apps/web/src/lib/evidence/rc-observer-build.test.ts.
 *
 * ── Why the check is strict ──────────────────────────────────────────
 * Only the exact string "true" enables it. This deliberately does NOT use
 * the lenient 1/true/on/yes parser that `EXPO_PUBLIC_NEW_PRICING` uses:
 * that flag changes a price, this one bypasses the signed-in check, so it
 * should be as hard as possible to switch on by accident. Absent, empty,
 * "1", "TRUE" and every typo are OFF.
 */

/**
 * Static member access is mandatory. Metro only inlines
 * `process.env.EXPO_PUBLIC_*` for static property reads — a dynamic
 * `process.env[key]` lookup is not inlined and evaluates to undefined in a
 * release bundle. Here that would fail CLOSED (the override silently never
 * engages), which is the safe direction but would make the QA build look
 * broken for no visible reason.
 */
export function isQaForceV10(): boolean {
  return process.env.EXPO_PUBLIC_QA_FORCE_V10 === "true";
}

let warned = false;

/**
 * Log once, loudly, when the override is active. A QA build should be
 * obviously identifiable in a log tail — if this line ever shows up in a
 * production diagnostic, a QA binary escaped.
 */
export function warnIfQaForceV10Active(): void {
  if (!isQaForceV10() || warned) return;
  warned = true;
  // eslint-disable-next-line no-console
  console.warn(
    "[QA] EXPO_PUBLIC_QA_FORCE_V10 is ON — stored session and theme " +
      "preference are being IGNORED (not deleted) and cold start is forced " +
      "into the v10 funnel. This must never be a production build."
  );
}
