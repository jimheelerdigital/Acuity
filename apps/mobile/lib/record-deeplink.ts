/**
 * Deep-link entry into the recorder.
 *
 * ── What this unlocks ────────────────────────────────────────────────
 * `acuity://record?autostart=1` opens the recorder and begins recording,
 * so a debrief is one action from anywhere in iOS. A Shortcuts "Open URL"
 * action pointed at this URL immediately gives the user the Action Button,
 * Back Tap, and any Shortcuts automation — with no native target, no new
 * entitlement, and no extension.
 *
 * ── What it does NOT do ──────────────────────────────────────────────
 * It does not record without launching the app. iOS does not grant
 * microphone access to widgets, Control Center controls, or an App Intent
 * running out of process; anything that needs the mic must bring the app
 * forward. What this saves is taps, not the launch. (An Apple Watch app is
 * the only surface that can genuinely capture independently — see the
 * capture-everywhere scope report.)
 *
 * Pure and dependency-free so the parsing rule is testable without the RN
 * module graph.
 */

/**
 * Should opening /record begin recording immediately?
 *
 * Exact `"1"` only. Deliberately strict rather than truthy:
 *
 *   - `?autostart=0` must mean NO. A truthy check treats the string "0"
 *     as true, which is the opposite of what anyone writing it intends.
 *   - A bare `?autostart` (empty value) is ambiguous, so it does not arm
 *     the microphone. Ambiguity should never resolve toward recording.
 *
 * expo-router gives a string[] when a param repeats in the URL; only a
 * single unambiguous value counts.
 */
export function shouldAutostartRecording(
  param: string | string[] | undefined
): boolean {
  if (typeof param === "string") return param === "1";
  return false;
}

/** The canonical URL to put in a Shortcuts "Open URL" action. */
export const RECORD_AUTOSTART_URL = "acuity://record?autostart=1";
