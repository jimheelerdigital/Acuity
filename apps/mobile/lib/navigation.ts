import { router, type Href } from "expo-router";

/**
 * Leave a screen that may have nothing underneath it (2026-10-22).
 *
 * Screens reached by a deep link open as the ONLY route in the stack:
 *   - the home-screen widget's task rows (acuity://task/<id>)
 *   - acuity://habits, Siri / Shortcuts links, notification launches
 * There, `router.back()` is a silent no-op, so Cancel / Save / Delete did
 * nothing and the user was stuck on the screen (Jimmy, build 186: "can't
 * hit cancel on a task").
 *
 * Use this instead of a bare `router.back()` on any screen that can be
 * opened directly: back when there is history, otherwise replace with the
 * screen's natural parent.
 */
export function goBackOr(fallback: Href): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
