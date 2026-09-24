"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import {
  CURRENT_VERSION,
  STORAGE_KEY,
  effectiveConsent,
  readConsent,
  type ConsentRecord,
} from "@/lib/cookie-consent-defaults";

/**
 * Cookie / analytics consent — no banner on first visit (2026-09-24).
 *
 * Why: the banner hid the funnel's "Create my free account" button, and on
 * /start it only appeared at the account step, so the Meta Pixel (marketing
 * consent) almost never loaded for ad traffic. Keenan's call: remove it.
 *
 * Default when the visitor hasn't made an explicit choice (effectiveConsent):
 *   - Europe/UK (by browser time zone)  → analytics off, marketing off.
 *     Opt-in is required there and there's no banner to ask.
 *   - Global Privacy Control signal      → analytics off, marketing off.
 *     Honoring GPC is required in California.
 *   - Everyone else (US etc.)            → analytics on, marketing on.
 * An explicit choice (localStorage `acuity_consent`, mirrored to
 * User.cookieConsent for logged-in users) always wins over the default.
 *
 * Changing the choice: the preferences panel below renders only when opened
 * via the `acuity:open-consent` window event, fired by the "Cookie settings"
 * footer link (CookieSettingsLink) and Account → Manage cookie preferences.
 *
 * Script gating lives in `consent-gated-trackers.tsx` and
 * `posthog-provider.tsx`, which read effectiveConsent() on mount and on
 * every `acuity:consent-changed` event.
 */

export { effectiveConsent, readConsent } from "@/lib/cookie-consent-defaults";
export type { ConsentRecord } from "@/lib/cookie-consent-defaults";

const OPEN_EVENT = "acuity:open-consent";

/** Opens the cookie preferences panel from anywhere (footer, account page). */
export function openConsentPreferences(): void {
  try {
    window.dispatchEvent(new CustomEvent(OPEN_EVENT));
  } catch {
    // ignore
  }
}

/** Small "Cookie settings" link for public site footers. */
export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button type="button" onClick={openConsentPreferences} className={className}>
      Cookie settings
    </button>
  );
}

function writeConsent(record: ConsentRecord): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // localStorage disabled — the choice still applies for this page view.
  }
  // Fire-and-forget server write so the choice persists cross-device.
  // Non-auth users 401 silently; that's expected.
  fetch("/api/user/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  }).catch(() => {});
  // Notify any listeners that gated scripts should reload now.
  try {
    window.dispatchEvent(new CustomEvent("acuity:consent-changed"));
  } catch {
    // ignore
  }
}

/**
 * The preferences panel. Mounted once in the root layout; renders nothing
 * until something fires `acuity:open-consent`.
 */
export function CookieConsentBanner() {
  const pathname = usePathname();
  const isFunnel = pathname?.startsWith("/start") ?? false;
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(true);

  // Logged-in users: if this browser has no stored choice but the account
  // does (User.cookieConsent), hydrate localStorage so the account's choice
  // applies here too. 204 = signed out; errors fall through to the default.
  useEffect(() => {
    if (readConsent()) return;
    let cancelled = false;
    fetch("/api/user/consent", { credentials: "include" })
      .then((r) => (r.status === 200 ? r.json() : null))
      .then((data: { consent?: ConsentRecord } | null) => {
        const remote = data?.consent ?? null;
        if (cancelled || !remote || remote.version !== CURRENT_VERSION) return;
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
          window.dispatchEvent(new CustomEvent("acuity:consent-changed"));
        } catch {
          // ignore
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onOpen = () => {
      const current = effectiveConsent();
      setAnalytics(current.analytics);
      setMarketing(current.marketing);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  if (!open) return null;

  const save = () => {
    // Scripts that already loaded can't be unloaded in place, so turning
    // something off reloads the page to drop them.
    const before = effectiveConsent();
    const turnedOff = (before.analytics && !analytics) || (before.marketing && !marketing);
    writeConsent({
      version: CURRENT_VERSION,
      acceptedAt: new Date().toISOString(),
      analytics,
      marketing,
    });
    setOpen(false);
    if (turnedOff) window.location.reload();
  };

  // Funnel pages use the light-mode funnel styling (white bg, zinc text).
  // Non-funnel pages keep the existing dark-mode-aware styling.
  const containerClass = isFunnel
    ? "fixed inset-x-0 bottom-0 z-[1000] border-t border-zinc-200/60 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm"
    : "fixed inset-x-0 bottom-0 z-[1000] border-t border-zinc-200 bg-white/95 px-4 py-4 shadow-2xl backdrop-blur dark:border-white/10 dark:bg-acuity-bg/95";
  const rowClass = `flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${isFunnel ? "border-zinc-200" : "border-zinc-200 dark:border-white/10"}`;
  const titleClass = `font-medium ${isFunnel ? "text-zinc-800" : "text-zinc-900 dark:text-zinc-50"}`;
  const descClass = `text-xs ${isFunnel ? "text-zinc-400" : "text-zinc-500 dark:text-zinc-400"}`;

  return (
    <div className={containerClass} role="dialog" aria-label="Cookie preferences">
      <div className="mx-auto max-w-5xl">
        <p className={`text-sm font-semibold ${isFunnel ? "text-zinc-800" : "text-zinc-900 dark:text-zinc-50"}`}>
          Cookie preferences
        </p>
        <div className="mt-3 space-y-2 text-sm">
          <div className={rowClass}>
            <div>
              <p className={titleClass}>Strictly necessary</p>
              <p className={descClass}>Required for sign-in + recording. Can&rsquo;t be turned off.</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs ${isFunnel ? "bg-zinc-100 text-zinc-500" : "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300"}`}>
              Always on
            </span>
          </div>
          <label className={rowClass}>
            <div>
              <p className={titleClass}>Analytics</p>
              <p className={descClass}>Google Analytics, PostHog and session recording. Shows us which pages and features people use.</p>
            </div>
            <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} className="h-4 w-4" />
          </label>
          <label className={rowClass}>
            <div>
              <p className={titleClass}>Ad measurement</p>
              <p className={descClass}>Meta Pixel. Tells Meta which ads led to a visit or signup.</p>
            </div>
            <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="h-4 w-4" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            onClick={() => setOpen(false)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${isFunnel ? "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:bg-acuity-card-bg dark:text-zinc-200 dark:hover:bg-white/5"}`}
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="rounded-lg bg-acuity-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-acuity-primary-lo"
          >
            Save preferences
          </button>
        </div>
      </div>
    </div>
  );
}
