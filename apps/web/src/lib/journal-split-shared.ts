/**
 * Browser-safe half of the /start-journal test (2026-10-31, per Keenan).
 * See lib/journal-split.ts for how visitors are placed.
 */
export const JOURNAL_SPLIT_FLAG = "funnel_journal_split";
export const JSPLIT_COOKIE = "acuity_jsplit";
export const JSPLIT_PARAM = "jsplit";
export type JournalArm = "journal" | "control";

export function parseJournalArm(v: string | undefined | null): JournalArm | null {
  return v === "journal" || v === "control" ? v : null;
}

/** Inline script for the journal arm: remember the arm before first paint. */
export function journalArmScript(): string {
  return `(function(){try{document.cookie="${JSPLIT_COOKIE}=journal; path=/; max-age=2592000; SameSite=Lax";window.__jsplit="journal";}catch(e){}})();`;
}

/**
 * On /start-test: true once, when she arrived through the journal split as
 * the control arm. Saves the cookie and strips the param from the URL.
 */
export function consumeJournalControlArrival(): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  if (url.searchParams.get(JSPLIT_PARAM) !== "control") return false;
  try {
    document.cookie = `${JSPLIT_COOKIE}=control; path=/; max-age=2592000; SameSite=Lax`;
  } catch {}
  url.searchParams.delete(JSPLIT_PARAM);
  window.history.replaceState(window.history.state, "", url.toString());
  return true;
}

/** On /start-journal: true once per browser session when the split placed her here. */
export function consumeJournalArmLog(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { __jsplit?: string };
  if (w.__jsplit !== "journal") return false;
  try {
    if (sessionStorage.getItem("rp_jsplit_logged")) return false;
    sessionStorage.setItem("rp_jsplit_logged", "1");
  } catch {}
  return true;
}
