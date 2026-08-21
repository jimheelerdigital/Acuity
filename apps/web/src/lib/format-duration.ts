/**
 * Duration formatting for the recorder UI.
 *
 * Plain .ts ON PURPOSE. It lived in components/debrief-shared.tsx first and
 * could not be asserted from a test there — the test runner won't parse JSX,
 * so importing anything out of a .tsx file fails at transform time. An
 * untested formatter is how "299s remaining" shipped in the first place.
 */

/**
 * Countdown label for a recording in progress, e.g. "4:48".
 *
 * Deliberately NOT zero-padded on the minutes: a countdown reads as a
 * duration ("4:48 left"), not a clock ("04:48"). Raw seconds were tolerable
 * at the old 120s cap; at 300s "299s remaining" is unreadable.
 */
export function formatRemaining(secondsLeft: number): string {
  const safe = Math.max(0, Math.floor(secondsLeft));
  const m = Math.floor(safe / 60);
  const s = (safe % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
