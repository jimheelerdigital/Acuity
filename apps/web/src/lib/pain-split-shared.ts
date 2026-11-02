/**
 * Browser-safe half of the pain-funnel split (2026-11-02, per Keenan: four
 * pain-first funnels, "let's split test them all"). See lib/pain-split.ts.
 */
export const PAIN_SPLIT_FLAG = "funnel_pain_split";
export const PSPLIT_COOKIE = "acuity_psplit";
export const PSPLIT_PARAM = "psplit";

/** Arm → funnel path. Order is the order shown in admin. */
export const PAIN_ARMS = {
  relief: "/start-relief",
  catch: "/start-catch",
  clarity: "/start-clarity",
  progress: "/start-progress",
  focus: "/start-focus",
} as const;
export type PainArm = keyof typeof PAIN_ARMS;

export function parsePainArm(v: string | undefined | null): PainArm | null {
  return v && v in PAIN_ARMS ? (v as PainArm) : null;
}

/**
 * On a pain funnel: the arm once, when she arrived through the split (the
 * entry page adds ?psplit=<arm>). Saves the cookie and strips the param.
 */
export function consumePainSplitArrival(): PainArm | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const arm = parsePainArm(url.searchParams.get(PSPLIT_PARAM));
  if (!arm) return null;
  try {
    document.cookie = `${PSPLIT_COOKIE}=${arm}; path=/; max-age=2592000; SameSite=Lax`;
  } catch {}
  url.searchParams.delete(PSPLIT_PARAM);
  window.history.replaceState(window.history.state, "", url.toString());
  return arm;
}
