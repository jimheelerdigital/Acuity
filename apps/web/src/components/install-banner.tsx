"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { APP_VERSION_CONFIG } from "@/lib/app-version-config";
import { captureUtmParams } from "@/lib/track-onboarding";
import { trackClient } from "@/lib/analytics-client";

/**
 * Cross-platform install banner — routes mobile-web visitors to the native
 * app instead of the lower-converting web funnel. Mobile-web activates
 * ~19% vs ~71% on native iOS (earlier funnel analysis), so for mobile this
 * IS the funnel: a deliberate upgrade, not a leak. v2 (2026-06-18).
 *
 * Replaces the old MobileAppBanner (iOS-only, untracked) AND the native
 * Apple Smart App Banner (Safari-only, untrackable). One mount in the root
 * layout; all gating lives here.
 *
 * Gating:
 *   - All public marketing surfaces (home, /blog, /for ad landers,
 *     /voice-journaling, /try, /shared, /support, legal) + conversion pages
 *     (/start, /onboarding, /auth/signup, /upgrade). Excluded: /admin, /api,
 *     authenticated app pages, and /auth/* except /auth/signup.
 *   - Platform: iOS → App Store; Android → Play Store. Desktop → nothing.
 *   - Android is gated behind NEXT_PUBLIC_PLAY_STORE_LIVE (our Play
 *     submission is pending Google approval). While false, the Android
 *     banner is hidden and fires `install_banner_render_skipped` so we can
 *     size the demand we're missing during the review window. Flip the env
 *     var + redeploy to activate Android — no code change.
 *   - Dismiss persists 7 days (cookie); re-shows after expiry.
 *
 * Analytics (PostHog via analytics-client): shown / clicked / dismissed /
 * render_skipped, each with platform + store + pathname + utm/fbclid, so we
 * can measure the activation lift this banner exists to drive.
 */

const COOKIE_NAME = "acuity_install_banner_dismissed_at";
const COOKIE_DAYS = 7;

const PLAY_STORE_LIVE = process.env.NEXT_PUBLIC_PLAY_STORE_LIVE === "true";

// Exclusion-based: the banner mounts on ALL public marketing surfaces
// (home, /blog, /for ad landers, /voice-journaling, /try, /shared, /support,
// legal) + conversion pages (/start, /onboarding, /auth/signup, /upgrade),
// and stays off authenticated/private routes. Exclusion-based (not a
// whitelist) so new marketing/SEO pages are covered automatically — the
// Apple native banner this replaced was sitewide, so a whitelist would leak
// install conversion from organic traffic.
const EXCLUDED_PREFIXES = [
  "/admin",
  "/api",
  "/dashboard",
  "/home", // authenticated home (redirects to signin)
  "/account",
  "/entries",
  "/goals",
  "/tasks",
  "/insights",
  "/life-matrix",
  "/achievements",
  "/actions",
  "/delete-account",
];

function isEligibleRoute(pathname: string): boolean {
  // /auth/* is private EXCEPT the signup conversion page (+ its success step).
  if (pathname === "/auth" || pathname.startsWith("/auth/")) {
    return pathname === "/auth/signup" || pathname.startsWith("/auth/signup/");
  }
  return !EXCLUDED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

type Platform = "ios" | "android";

const STORE: Record<Platform, { url: string; cta: string; store: string }> = {
  ios: {
    url: APP_VERSION_CONFIG.ios.appStoreUrl,
    cta: "Get on App Store",
    store: "app_store",
  },
  android: {
    url: APP_VERSION_CONFIG.android.appStoreUrl,
    cta: "Get on Google Play",
    store: "play_store",
  },
};

function detectPlatform(ua: string): Platform | null {
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  // iPadOS reports as "MacIntel" / Macintosh + maxTouchPoints > 1.
  if (
    typeof navigator !== "undefined" &&
    /Macintosh/.test(ua) &&
    (navigator.maxTouchPoints ?? 0) > 1
  ) {
    return "ios";
  }
  if (/Android/i.test(ua)) return "android";
  return null;
}

function readDismissCookie(): boolean {
  if (typeof document === "undefined") return false;
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return false;
  const ts = Number(match.slice(COOKIE_NAME.length + 1));
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < COOKIE_DAYS * 24 * 60 * 60 * 1000;
}

function writeDismissCookie(): void {
  if (typeof document === "undefined") return;
  const maxAge = COOKIE_DAYS * 24 * 60 * 60;
  document.cookie = `${COOKIE_NAME}=${Date.now()}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/** utm/fbclid attribution + a derived paid-traffic flag, from sessionStorage. */
function attributionProps(): Record<string, unknown> {
  const utm = captureUtmParams();
  return {
    utm_source: utm.utmSource ?? null,
    utm_campaign: utm.utmCampaign ?? null,
    fbclid: utm.fbclid ?? null,
    is_paid_traffic: Boolean(utm.fbclid || utm.utmSource),
  };
}

export function InstallBanner() {
  const pathname = usePathname();
  // Start hidden — decided client-side in the effect to avoid an SSR /
  // hydration flash on desktop and non-eligible routes.
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    if (typeof navigator === "undefined") return;
    if (!isEligibleRoute(pathname)) return;

    const p = detectPlatform(navigator.userAgent);
    if (!p) return; // desktop
    if (readDismissCookie()) return;

    const base = {
      platform: p,
      store: STORE[p].store,
      pathname,
      ...attributionProps(),
    };

    // Android stays dark until Google approves the pending submission.
    // Fire a skip event so we can quantify the missed Android demand.
    if (p === "android" && !PLAY_STORE_LIVE) {
      trackClient("install_banner_render_skipped", {
        ...base,
        reason: "play_not_live",
      });
      return;
    }

    setPlatform(p);
    setVisible(true);
    trackClient("install_banner_shown", base);
  }, [pathname]);

  if (!visible || !platform) return null;

  const cfg = STORE[platform];

  const handleClick = () => {
    trackClient("install_banner_clicked", {
      platform,
      store: cfg.store,
      pathname,
      ...attributionProps(),
    });
    // Navigation is handled by the anchor's href.
  };

  const handleDismiss = () => {
    trackClient("install_banner_dismissed", {
      platform,
      store: cfg.store,
      pathname,
      ...attributionProps(),
    });
    writeDismissCookie();
    setVisible(false);
  };

  return (
    <div
      role="banner"
      className="sticky top-0 z-50 flex w-full items-center justify-between gap-3 px-4 py-3 text-sm text-white shadow-md"
      style={{ backgroundColor: "#E89653" }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
          <span className="text-base font-bold leading-none">A</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">
            Acuity is better in the app
          </p>
          <p className="truncate text-xs leading-tight opacity-90">
            Voice journal — faster, native, designed for your phone.
          </p>
        </div>
      </div>

      <a
        href={cfg.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-semibold text-[#9C3F1F] transition active:scale-95"
        style={{ minHeight: 36 }}
      >
        {cfg.cta}
      </a>

      <button
        type="button"
        aria-label="Dismiss app banner"
        onClick={handleDismiss}
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
