import { router, type Href } from "expo-router";

import { trackV10 } from "@/lib/onboarding-v10/analytics";

/**
 * Onboarding v11 route order — Keenan's Miro "BRAND NEW USER (ORGANIC/UGC)"
 * list, one funnel for everyone. Account AFTER the results (Jimmy,
 * 2026-10-15, on Keenan's feedback: collect their info first, then create
 * the account), and a required trial on the paywall.
 *
 *   start → hook → age → carrying → sound → notlazy → name → year → ready →
 *   consent → record → processing (check-in + first habit while it
 *   analyzes) → reveal → account (save your results) → paywall (trial
 *   required) → Home + app tour
 *
 * Choices made before the account exists are kept on the device and
 * applied right after sign-up (lib/onboarding-v11/apply.ts).
 *
 * Every screen moves with push() so the round back button (router.back)
 * returns to the previous question with its answer still selected.
 */
export const V11_ORDER = [
  "hook",
  "age",
  "carrying",
  "sound",
  "notlazy",
  "name",
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

/** Where the questions start. */
export function firstQuestionHref(): Href {
  return hrefFor("hook");
}

export function goBack(): void {
  if (router.canGoBack()) router.back();
}

export function trackV11(screen: string, event: "viewed" | "answered", value?: string): void {
  trackV10(event === "viewed" ? "v10_q_viewed" : "v10_q_answered", { screen, flow: "v11", ...(value !== undefined ? { value } : {}) });
}
