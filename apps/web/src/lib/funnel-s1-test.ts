/**
 * Screen-1 split test for /start and /start-bwk (2026-09-25, per Keenan:
 * "let's start the funnel with a yes or no question").
 *
 *   list  — the original 5-option "What's been on your mind lately?"
 *   yesno — "Does this sound like you?" + the most-picked answer as a quote,
 *           [Yes, that's me] / [Not quite]; "Not quite" reveals the other four.
 *
 * Assignment is a 50/50 coin flip per browser, stored in a 30-day cookie so a
 * reload or a return visit sees the same variant (no double counting). It
 * runs in a tiny inline script at the top of the server-rendered Screen 1,
 * BEFORE first paint, and sets <html data-s1v="…">; CSS shows only that
 * variant, so there is no flicker even before JS loads in FB/IG webviews.
 * The hydrated funnel reads the same attribute/cookie.
 *
 * Measured per funnel: every session logs funnel_s1_variant (value = variant);
 * the admin metrics compare Answered Q1 (funnel_entry_selected) per variant.
 * The most-picked answers (2026-09-24/25 data): /start "My head's too full
 * and I keep forgetting things" (10 of 20), /start-bwk "I know what I should
 * be doing. I'm just not doing it." (4 of 8).
 */
import type { Branch } from "@/lib/funnel-config";

export type S1Variant = "yesno" | "list";
export const S1_COOKIE = "acuity_s1v";

export const S1_YESNO: Record<string, { statement: string; branch: Branch }> = {
  v8: { statement: "My head’s too full and I keep forgetting things.", branch: "overload" },
  "v8-bwk": { statement: "I know what I should be doing. I’m just not doing it.", branch: "stuck" },
};

/** Inline, render-blocking assignment script (runs before first paint). */
export const S1_ASSIGN_SCRIPT = `(function(){var v="list";try{var m=document.cookie.match(/(?:^|; )${S1_COOKIE}=(yesno|list)/);v=m?m[1]:(Math.random()<0.5?"yesno":"list");if(!m)document.cookie="${S1_COOKIE}="+v+"; path=/; max-age=2592000; SameSite=Lax";}catch(e){}document.documentElement.setAttribute("data-s1v",v);})();`;

/** Client read: the attribute the inline script set, else the cookie, else list. */
export function readS1Variant(): S1Variant {
  if (typeof document === "undefined") return "list";
  const attr = document.documentElement.getAttribute("data-s1v");
  if (attr === "yesno" || attr === "list") return attr;
  const m = document.cookie.match(new RegExp(`(?:^|; )${S1_COOKIE}=(yesno|list)`));
  if (m) return m[1] as S1Variant;
  const v: S1Variant = Math.random() < 0.5 ? "yesno" : "list";
  try {
    document.cookie = `${S1_COOKIE}=${v}; path=/; max-age=2592000; SameSite=Lax`;
  } catch {}
  document.documentElement.setAttribute("data-s1v", v);
  return v;
}
