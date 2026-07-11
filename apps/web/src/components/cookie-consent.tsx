"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Cookie / analytics consent banner. Required for GDPR + ePrivacy in
 * the EU and increasingly expected by privacy-regulated US users
 * (CCPA, CPRA, state privacy laws). Also a SOC 2 P2 (choice + consent)
 * gap closer.
 *
 * Storage model:
 *   - localStorage `acuity_consent` = JSON { version:1, acceptedAt,
 *     analytics:boolean, marketing:boolean } — source of truth for
 *     script gating on every page load.
 *   - User.cookieConsent mirror for logged-in users (stored via
 *     /api/user/consent) so the choice survives clearing localStorage
 *     and follows them to new devices.
 *
 * Script gating lives in `consent-gated-trackers.tsx`, which reads
 * localStorage on mount and decides what to load. This component only
 * writes the storage; the reading side handles the actual load/no-load.
 *
 * First-visit behavior: banner shows when localStorage has no entry.
 * Dismiss via Accept All, Reject All, or Customize → Save.
 *
 * Funnel awareness (v1.5, 2026-06-13): On /start, the banner is
 * suppressed until the funnel dispatches `acuity:funnel-consent-ready`
 * (at the Create Account step). This prevents the banner from covering
 * the Entry screen and competing with funnel content.
 */

export type ConsentRecord = {
  version: 1;
  acceptedAt: string;
  analytics: boolean;
  marketing: boolean;
};

const STORAGE_KEY = "acuity_consent";
const CURRENT_VERSION = 1;

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

function writeConsent(record: ConsentRecord): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // localStorage disabled — fine, banner just won't dismiss.
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

export function CookieConsentBanner() {
  const pathname = usePathname();
  const isFunnel = pathname.startsWith("/start");
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<"hidden" | "default" | "customize">(
    "hidden"
  );
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(true);

  useEffect(() => {
    setMounted(true);
    const local = readConsent();
    if (local) return; // localStorage wins → don't show

    // No localStorage record. For logged-in users, try the server-
    // side mirror (User.cookieConsent) before showing the banner —
    // closes the cross-device / cleared-cache gap that bit users
    // pre-2026-04-29.
    //
    // 204 = unauthenticated → fall through to the prompt.
    // 200 with consent = null → no record on the server either,
    //   show the prompt.
    // 200 with consent set → hydrate localStorage and skip the prompt.
    // network failure → show the prompt (fail-open is the right
    //   default for a banner).
    let cancelled = false;
    fetch("/api/user/consent", { credentials: "include" })
      .then((r) => (r.status === 200 ? r.json() : null))
      .then((data: { consent?: ConsentRecord } | null) => {
        if (cancelled) return;
        const remote = data?.consent ?? null;
        if (!remote) {
          setState("default");
          return;
        }
        if (
          typeof remote.version === "number" &&
          remote.version > CURRENT_VERSION
        ) {
          setState("default");
          return;
        }
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
        } catch {
          // localStorage disabled — fine, banner just won't dismiss.
        }
      })
      .catch(() => {
        if (cancelled) return;
        setState("default");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Deferral logic:
  // - Non-funnel pages: 5s delay so landing page content is visible first.
  // - Funnel (/start): wait for the `acuity:funnel-consent-ready` event
  //   (dispatched when the user reaches the Create Account step).
  const [deferred, setDeferred] = useState(false);
  useEffect(() => {
    if (state === "hidden") return;
    if (isFunnel) {
      const onReady = () => setDeferred(true);
      window.addEventListener("acuity:funnel-consent-ready", onReady);
      return () => window.removeEventListener("acuity:funnel-consent-ready", onReady);
    }
    const t = setTimeout(() => setDeferred(true), 5000);
    return () => clearTimeout(t);
  }, [state, isFunnel]);

  if (!mounted || state === "hidden" || !deferred) return null;

  const accept = (analyticsOn: boolean, marketingOn: boolean) => {
    writeConsent({
      version: CURRENT_VERSION,
      acceptedAt: new Date().toISOString(),
      analytics: analyticsOn,
      marketing: marketingOn,
    });
    setState("hidden");
  };

  // Funnel pages use the light-mode funnel styling (white bg, zinc text).
  // Non-funnel pages keep the existing dark-mode-aware styling.
  const containerClass = isFunnel
    ? "fixed inset-x-0 bottom-0 z-[1000] border-t border-zinc-200/60 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm"
    : "fixed inset-x-0 bottom-0 z-[1000] border-t border-zinc-200 bg-white/95 px-4 py-4 shadow-2xl backdrop-blur dark:border-white/10 dark:bg-acuity-bg/95";

  return (
    <div className={containerClass} role="dialog" aria-label="Cookie consent">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {state === "default" ? (
          <>
            <div className={`text-xs leading-relaxed ${isFunnel ? "text-zinc-500" : "text-zinc-700 dark:text-zinc-300"}`}>
              Ripple uses cookies for essential app function and analytics.{" "}
              <a href="/privacy" className="underline hover:no-underline">
                Privacy policy
              </a>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                onClick={() => setState("customize")}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${isFunnel ? "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:bg-acuity-card-bg dark:text-zinc-200 dark:hover:bg-white/5"}`}
              >
                Customize
              </button>
              <button
                onClick={() => accept(false, false)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${isFunnel ? "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:bg-acuity-card-bg dark:text-zinc-200 dark:hover:bg-white/5"}`}
              >
                Reject all
              </button>
              <button
                onClick={() => accept(true, true)}
                className="rounded-lg bg-acuity-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-acuity-primary-lo"
              >
                Accept all
              </button>
            </div>
          </>
        ) : (
          <div className="w-full">
            <p className={`text-sm font-semibold ${isFunnel ? "text-zinc-800" : "text-zinc-900 dark:text-zinc-50"}`}>
              Cookie preferences
            </p>
            <div className="mt-3 space-y-2 text-sm">
              <div className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${isFunnel ? "border-zinc-200" : "border-zinc-200 dark:border-white/10"}`}>
                <div>
                  <p className={`font-medium ${isFunnel ? "text-zinc-800" : "text-zinc-900 dark:text-zinc-50"}`}>
                    Strictly necessary
                  </p>
                  <p className={`text-xs ${isFunnel ? "text-zinc-400" : "text-zinc-500 dark:text-zinc-400"}`}>
                    Required for sign-in + recording. Can&rsquo;t be turned off.
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${isFunnel ? "bg-zinc-100 text-zinc-500" : "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300"}`}>
                  Always on
                </span>
              </div>
              <label className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${isFunnel ? "border-zinc-200" : "border-zinc-200 dark:border-white/10"}`}>
                <div>
                  <p className={`font-medium ${isFunnel ? "text-zinc-800" : "text-zinc-900 dark:text-zinc-50"}`}>
                    Analytics
                  </p>
                  <p className={`text-xs ${isFunnel ? "text-zinc-400" : "text-zinc-500 dark:text-zinc-400"}`}>
                    PostHog — helps us see which features users actually use.
                    Fully anonymized.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(e) => setAnalytics(e.target.checked)}
                  className="h-4 w-4"
                />
              </label>
              <div className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${isFunnel ? "border-zinc-200" : "border-zinc-200 dark:border-white/10"}`}>
                <div>
                  <p className={`font-medium ${isFunnel ? "text-zinc-800" : "text-zinc-900 dark:text-zinc-50"}`}>
                    Ad attribution
                  </p>
                  <p className={`text-xs ${isFunnel ? "text-zinc-400" : "text-zinc-500 dark:text-zinc-400"}`}>
                    Measures which ads bring interested users. Required for
                    keeping the service free during trial.
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${isFunnel ? "bg-zinc-100 text-zinc-500" : "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300"}`}>
                  Always on
                </span>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setState("default")}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${isFunnel ? "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:bg-acuity-card-bg dark:text-zinc-200 dark:hover:bg-white/5"}`}
              >
                Back
              </button>
              <button
                onClick={() => accept(analytics, marketing)}
                className="rounded-lg bg-acuity-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-acuity-primary-lo"
              >
                Save preferences
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
