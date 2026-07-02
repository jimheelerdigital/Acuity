"use client";

import { useEffect, useRef, useState } from "react";

// ─── Shared App Store CTA webview handling ──────────────────────────────────
// ONE implementation of the "hand off to the App Store from inside an IG/FB
// in-app webview" pattern, shared by every App Store CTA in the app:
//   • the funnel DownloadScreen (onboarding-funnel.tsx)
//   • the post-signup success CTAs (first-debrief-flow, try-session-claimer,
//     success-client)
//
// Why this exists: ~85% of traffic arrives inside Instagram / Facebook iOS
// webviews. In those webviews a plain `<a target="_blank">` often fails to
// hand off to the App Store app (it opens a nested in-app tab or no-ops), so
// taps silently never become downloads. The reliable path is:
//   1. drop `target="_blank"` in a webview so iOS can hand the URL off,
//   2. auto-copy the App Store URL to the clipboard, and
//   3. show a "Tap ⋯ → Open in Safari/Chrome" breakout instruction.
// Plus a `visibilitychange`/`focus` failed-open proxy so a tap that never
// leaves the page is measurable (we cannot observe anything post-handoff).

export const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";

export interface BrowserEnv {
  isWebView: boolean;
  label: string;
  ua: string;
}

export function detectBrowserEnv(): BrowserEnv {
  if (typeof navigator === "undefined") return { isWebView: false, label: "ssr", ua: "" };
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return { isWebView: true, label: "facebook", ua };
  if (/Instagram/i.test(ua)) return { isWebView: true, label: "instagram", ua };
  if (/LinkedInApp/i.test(ua)) return { isWebView: true, label: "linkedin", ua };
  if (/Twitter|TwitterAndroid/i.test(ua)) return { isWebView: true, label: "twitter", ua };
  return { isWebView: false, label: "browser", ua };
}

// Event names differ per surface (funnel_* vs onboarding_*), so the caller
// supplies them. Detection / clipboard / breakout / failed-open behaviour is
// identical everywhere.
export interface AppStoreCtaEvents {
  /** Fired once on mount when a webview is detected. */
  webviewDetected?: string;
  /** Fired when the App Store URL is auto-copied to the clipboard. */
  autocopySuccess?: string;
  /** Fired when the auto-copy fails (no clipboard API / permission denied). */
  autocopyFailed?: string;
  /** Fired when the CTA is tapped. */
  tap: string;
  /** Fired if the user returns to this tab after tapping (failed-open proxy). */
  returned: string;
}

export interface UseAppStoreCtaResult {
  browserEnv: BrowserEnv;
  isWebView: boolean;
  copied: boolean;
  copyFailed: boolean;
  diagContext: string;
  handleTap: () => void;
  /** Spread onto the CTA `<a>` — drops `target="_blank"` inside a webview. */
  anchorProps:
    | { href: string; onClick: () => void }
    | { href: string; target: "_blank"; rel: "noopener noreferrer"; onClick: () => void };
}

export function useAppStoreCta({
  track,
  events,
}: {
  track: (event: string, props?: Record<string, unknown>) => void;
  events: AppStoreCtaEvents;
}): UseAppStoreCtaResult {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  // A user who taps the CTA and then comes back to this tab (page never
  // unloaded) is the clearest "got stuck" signal we can see — we cannot
  // observe anything after a successful handoff to the App Store.
  const tappedRef = useRef(false);
  const tappedAtRef = useRef<number | null>(null);
  const returnedFiredRef = useRef(false);
  const browserEnv = typeof window !== "undefined"
    ? detectBrowserEnv()
    : { isWebView: false, label: "ssr", ua: "" };

  // Diagnostic context string (PII-safe: UA-derived only, no email/name).
  const diagContext = typeof window !== "undefined" ? [
    `webview:${browserEnv.isWebView}`,
    `label:${browserEnv.label}`,
    `os:${/iPhone|iPad|iPod/i.test(browserEnv.ua) ? "ios" : /Android/i.test(browserEnv.ua) ? "android" : "other"}`,
    `standalone:${typeof navigator !== "undefined" && ("standalone" in navigator ? (navigator as Record<string, unknown>).standalone : false)}`,
    `windowOpen:${typeof window.open === "function"}`,
  ].join("|") : "ssr";

  // On mount in a webview: flag it and auto-copy the App Store URL so the
  // "Open in Safari/Chrome" fallback has the link ready to paste.
  useEffect(() => {
    if (!browserEnv.isWebView) return;
    if (events.webviewDetected) track(events.webviewDetected, { value: browserEnv.label });
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(APP_STORE_URL)
        .then(() => {
          setCopied(true);
          if (events.autocopySuccess) track(events.autocopySuccess, { value: diagContext });
        })
        .catch((err) => {
          setCopyFailed(true);
          if (events.autocopyFailed) {
            track(events.autocopyFailed, { value: `${err instanceof Error ? err.message : String(err)}|${diagContext}` });
          }
        });
    } else {
      setCopyFailed(true);
      if (events.autocopyFailed) track(events.autocopyFailed, { value: `no_clipboard_api|${diagContext}` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserEnv.isWebView, browserEnv.label]);

  // Failed-open proxy: fire once if the user returns to this tab after tapping.
  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      if (!tappedRef.current || returnedFiredRef.current) return;
      returnedFiredRef.current = true;
      const awayMs = tappedAtRef.current ? Date.now() - tappedAtRef.current : 0;
      track(events.returned, { value: `awayMs:${awayMs}|${diagContext}` });
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTap = () => {
    tappedRef.current = true;
    tappedAtRef.current = Date.now();
    track(events.tap, { value: diagContext });
  };

  // Inside a webview, drop target="_blank" so iOS can hand off to the App
  // Store app. In a regular browser, keep the new-tab behaviour.
  const anchorProps = browserEnv.isWebView
    ? { href: APP_STORE_URL, onClick: handleTap }
    : { href: APP_STORE_URL, target: "_blank" as const, rel: "noopener noreferrer" as const, onClick: handleTap };

  return {
    browserEnv,
    isWebView: browserEnv.isWebView,
    copied,
    copyFailed,
    diagContext,
    handleTap,
    anchorProps,
  };
}

// Breakout instruction card shown below the CTA in a webview — the reliable
// path when `target`-less handoff still doesn't fire. Rendered as a light card
// so it reads as a callout on both light and dark backgrounds.
export function WebviewBreakout({
  browserEnv,
  copied,
  copyFailed,
}: {
  browserEnv: BrowserEnv;
  copied: boolean;
  copyFailed: boolean;
}) {
  const isAndroid = /Android/i.test(browserEnv.ua);
  const targetBrowser = isAndroid ? "Chrome" : "Safari";
  const menuPos = browserEnv.label === "instagram" ? "at the bottom-right" : "in the top-right corner";
  return (
    <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-4 text-left">
      <p className="text-[13px] font-semibold text-zinc-800 mb-2">
        If the button above didn&rsquo;t open the App Store:
      </p>
      <ol className="text-[13px] text-zinc-600 space-y-1.5 list-decimal list-inside">
        <li>Tap the <span className="inline-flex items-center font-semibold text-zinc-800">&nbsp;&#8943;&nbsp;</span> or <span className="inline-flex items-center font-semibold text-zinc-800">&nbsp;&#8226;&#8226;&#8226;&nbsp;</span> menu {menuPos}</li>
        <li>Choose <span className="font-semibold text-zinc-800">&ldquo;Open in {targetBrowser}&rdquo;</span></li>
        <li>The App Store will open automatically</li>
      </ol>
      <div className="mt-3 pt-3 border-t border-zinc-200">
        {copied ? (
          <p className="text-[12px] text-green-600 font-medium">&#10003; Link copied to clipboard &mdash; paste in {targetBrowser} if needed</p>
        ) : copyFailed ? (
          <div>
            <p className="text-[12px] text-zinc-500 mb-1">Long-press to copy this link:</p>
            <p className="text-[12px] text-acuity-primary font-mono break-all select-all">{APP_STORE_URL}</p>
          </div>
        ) : (
          <p className="text-[12px] text-zinc-400">Copying link&hellip;</p>
        )}
      </div>
    </div>
  );
}
