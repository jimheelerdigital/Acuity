/**
 * Consent defaults, split out of components/cookie-consent.tsx so they can be
 * unit-tested without JSX. See that file's header for the policy.
 */

export type ConsentRecord = {
  version: 1;
  acceptedAt: string;
  analytics: boolean;
  marketing: boolean;
};

export const STORAGE_KEY = "acuity_consent";
export const CURRENT_VERSION = 1;

/** The visitor's explicit choice, or null if they never made one. */
export function readConsent(): ConsentRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentRecord;
    if (parsed?.version !== CURRENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Atlantic zones that belong to EU/EEA countries or the UK's neighbours.
const EUROPEAN_ATLANTIC_ZONES = new Set([
  "Atlantic/Canary",
  "Atlantic/Madeira",
  "Atlantic/Azores",
  "Atlantic/Faroe",
  "Atlantic/Reykjavik",
]);

function inEurope(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    return tz.startsWith("Europe/") || EUROPEAN_ATLANTIC_ZONES.has(tz);
  } catch {
    // Can't tell where they are → treat as Europe (no tracking).
    return true;
  }
}

function sendsGpc(): boolean {
  try {
    return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  } catch {
    return false;
  }
}

/**
 * What trackers should actually do right now: the explicit choice if there
 * is one, otherwise the region/GPC default described in the header.
 */
export function effectiveConsent(): { analytics: boolean; marketing: boolean } {
  if (typeof window === "undefined") return { analytics: false, marketing: false };
  const stored = readConsent();
  if (stored) return { analytics: stored.analytics, marketing: stored.marketing };
  const on = !inEurope() && !sendsGpc();
  return { analytics: on, marketing: on };
}
