/**
 * Browser-safe half of the normal-vs-test funnel split. See lib/funnel-split.ts
 * for how visitors are placed. No server imports here: the funnels import this.
 */
export const FUNNEL_SPLIT_FLAG = "funnel_test_split";
export const FSPLIT_COOKIE = "acuity_fsplit";
export const FSPLIT_PARAM = "fsplit";
export type SplitArm = "normal" | "test";

export const SPLIT_TARGET = {
  "/start": "/start-test",
  "/start-bwk": "/start-test-bwk",
} as const;

export function parseArm(v: string | undefined | null): SplitArm | null {
  return v === "normal" || v === "test" ? v : null;
}

/** Inline script for the normal arm: remember the arm before first paint. */
export function normalArmScript(): string {
  return `(function(){try{document.cookie="${FSPLIT_COOKIE}=normal; path=/; max-age=2592000; SameSite=Lax";window.__fsplit="normal";}catch(e){}})();`;
}

/** Client helper for the test funnels: returns true once, on the redirected landing. */
export function consumeTestArrival(): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  if (url.searchParams.get(FSPLIT_PARAM) !== "test") return false;
  try {
    document.cookie = `${FSPLIT_COOKIE}=test; path=/; max-age=2592000; SameSite=Lax`;
  } catch {}
  url.searchParams.delete(FSPLIT_PARAM);
  window.history.replaceState(window.history.state, "", url.toString());
  return true;
}
