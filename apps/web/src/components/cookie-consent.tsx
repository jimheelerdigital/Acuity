"use client";

import { useEffect, useState } from "react";

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
 * Script gating lives in `consent-gated-scripts.tsx`, which reads
 * localStorage on mount and decides what to load. This component only
 * writes the storage; the reading side handles the actual load/no-load.
 *
 * First-visit behavior: banner shows when localStorage has no entry.
 * Dismiss via Accept All, Reject All, or Customize → Save.
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
        // Version-tolerant: accept records ≤ CURRENT_VERSION. Only
        // re-prompt if the stored record is from a NEWER version
        // (which would mean the user has a more-recent build's
        // record on another device — re-prompting here would lose
        // info we don't understand).
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

  if (!mounted || state === "hidden") return null;

  const accept = (analyticsOn: boolean, marketingOn: boolean) => {
    writeConsent({
      version: CURRENT_VERSION,
      acceptedAt: new Date().toISOString(),
      analytics: analyticsOn,
      marketing: marketingOn,
    });
    setState("hidden");
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[1000] border-t border-zinc-200 bg-white/95 px-4 py-4 shadow-2xl backdrop-blur dark:border-white/10 dark:bg-[#0B0B12]/95"
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {state === "default" ? (
          <>
            <div className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              Acuity uses cookies + similar tech for essential app function,
              analytics (how the product is used), and attribution of paid
              marketing. You can choose which categories you&rsquo;re okay with.
              See our{" "}
              <a href="/privacy" className="underline hover:no-underline">
                privacy policy
              </a>
              .
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                onClick={() => setState("customize")}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-[#1E1E2E] dark:text-zinc-200 dark:hover:bg-white/5"
              >
                Customize
              </button>
              <button
                onClick={() => accept(false, false)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-[#1E1E2E] dark:text-zinc-200 dark:hover:bg-white/5"
              >
                Reject all
              </button>
              <button
                onClick={() => accept(true, true)}
                className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-700"
              >
                Accept all
              </button>
            </div>
          </>
        ) : (
          <div className="w-full">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Cookie preferences
            </p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2 dark:border-white/10">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    Strictly necessary
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Required for sign-in + recording. Can&rsquo;t be turned off.
                  </p>
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                  Always on
                </span>
              </div>
              <label className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2 dark:border-white/10">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    Analytics
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
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
              <label className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2 dark:border-white/10">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    Marketing
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Meta Pixel + Google Analytics attribution. Helps us see
                    which ads actually send interested users.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(e) => setMarketing(e.target.checked)}
                  className="h-4 w-4"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setState("default")}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-[#1E1E2E] dark:text-zinc-200 dark:hover:bg-white/5"
              >
                Back
              </button>
              <button
                onClick={() => accept(analytics, marketing)}
                className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-700"
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
