"use client";

import { useEffect, useState } from "react";

/**
 * Sticky top banner that surfaces on conversion pages when an iOS
 * user lands via mobile Safari/Chrome. v1.4 (2026-06-03).
 *
 * Behavior:
 *   - UA-detect iPhone / iPad → show banner (Android intentionally
 *     skipped; the app is iOS-only per the live-app constraint).
 *   - Dismiss persists in `acuity_mobile_banner_dismissed_at` cookie
 *     for 7 days. Re-shows after the cookie expires.
 *   - Hidden during initial hydration (mounted=false) so SSR and
 *     non-iOS users never see a flash.
 *
 * Mounted only on the conversion-critical routes (/start, /for/*,
 * /auth/signup, /upgrade). Not site-wide — post-signup users
 * shouldn't keep seeing it after they've already downloaded.
 */

const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";
const COOKIE_NAME = "acuity_mobile_banner_dismissed_at";
const COOKIE_DAYS = 7;

function isIosDevice(ua: string): boolean {
  // iPad Pro running iPadOS reports as "MacIntel" + maxTouchPoints > 1.
  // The simple iPhone|iPad regex covers iPhones + older iPads; the
  // maxTouchPoints fallback handles modern iPadOS.
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  if (
    typeof navigator !== "undefined" &&
    /Macintosh/.test(ua) &&
    (navigator.maxTouchPoints ?? 0) > 1
  ) {
    return true;
  }
  return false;
}

function readDismissCookie(): boolean {
  if (typeof document === "undefined") return false;
  const cookies = document.cookie.split(";").map((c) => c.trim());
  const match = cookies.find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return false;
  const ts = Number(match.slice(COOKIE_NAME.length + 1));
  if (!Number.isFinite(ts)) return false;
  const ageMs = Date.now() - ts;
  return ageMs < COOKIE_DAYS * 24 * 60 * 60 * 1000;
}

function writeDismissCookie() {
  if (typeof document === "undefined") return;
  const maxAge = COOKIE_DAYS * 24 * 60 * 60;
  document.cookie = `${COOKIE_NAME}=${Date.now()}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export function MobileAppBanner() {
  // Start hidden — only show after the client hydrates AND we've
  // confirmed iOS UA + no fresh dismiss cookie. Prevents a hydration
  // flash on desktop / Android.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!isIosDevice(navigator.userAgent)) return;
    if (readDismissCookie()) return;
    setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="banner"
      className="sticky top-0 z-50 flex w-full items-center justify-between gap-3 bg-[#E89653] px-4 py-3 text-sm text-white shadow-md"
      style={{
        // Match the coral primary used in mobile (CelebrationModal,
        // tour tooltip, security CTA). RGB hex kept inline since the
        // banner is brand-anchored regardless of theme switching.
        backgroundColor: "#E89653",
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
          {/* iOS-style "A" glyph — kept simple to avoid pulling icon
              dependencies. The container is a 32px circle so the
              tap-target reach is OK. */}
          <span className="text-base font-bold leading-none">A</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">
            Get the better experience
          </p>
          <p className="truncate text-xs leading-tight opacity-90">
            Download Acuity for iPhone &mdash; built for voice.
          </p>
        </div>
      </div>

      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-semibold text-[#9C3F1F] transition active:scale-95"
        style={{ minHeight: 36 }}
      >
        Get app
      </a>

      <button
        type="button"
        aria-label="Dismiss app banner"
        onClick={() => {
          writeDismissCookie();
          setVisible(false);
        }}
        className="shrink-0 rounded-full p-2 transition hover:bg-white/10"
        style={{ minWidth: 36, minHeight: 36 }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
