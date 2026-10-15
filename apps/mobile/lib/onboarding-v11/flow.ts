import { router, type Href } from "expo-router";

import { trackV10 } from "@/lib/onboarding-v10/analytics";

/**
 * Onboarding v11 route order — Keenan's Miro "BRAND NEW USER (ORGANIC/UGC)"
 * list, with the account kept FIRST (Jimmy, 2026-10-15: "Account first (as
 * now)") and one funnel for everyone (no per-ad versions).
 *
 *   start → account → name* → hook → age → carrying → sound → notlazy →
 *   year → ready → consent → record → processing (check-in + first habit
 *   while it analyzes) → reveal → paywall → Home + app tour
 *
 *   * name only when the sign-in didn't give us one (Apple sometimes does).
 *
 * Every screen moves with push() so the round back button (router.back)
 * returns to the previous question with its answer still selected.
 */
export const V11_ORDER = [
  "name",
  "hook",
  "age",
  "carrying",
  "sound",
  "notlazy",
  "year",
  "ready",
  "consent",
] as const;

export type V11Screen = (typeof V11_ORDER)[number];

export function hrefFor(screen: V11Screen): Href {
  return `/onboarding-new/${screen}` as Href;
}

export function goNext(from: V11Screen): void {
  const i = V11_ORDER.indexOf(from);
  const to = V11_ORDER[i + 1];
  if (to) router.push(hrefFor(to));
  else router.push("/onboarding-new/record" as Href);
}

/** Where the questions start once she's signed in. */
export function firstQuestionHref(hasName: boolean): Href {
  return hrefFor(hasName ? "hook" : "name");
}

export function goBack(): void {
  if (router.canGoBack()) router.back();
}

export function trackV11(screen: string, event: "viewed" | "answered", value?: string): void {
  trackV10(event === "viewed" ? "v10_q_viewed" : "v10_q_answered", { screen, flow: "v11", ...(value !== undefined ? { value } : {}) });
}
