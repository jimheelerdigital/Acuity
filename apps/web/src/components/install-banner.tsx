"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { APP_VERSION_CONFIG } from "@/lib/app-version-config";
import { captureUtmParams } from "@/lib/track-onboarding";
import { trackClient } from "@/lib/analytics-client";

/**
 * Cross-platform install banner — routes mobile-web visitors to the native
 * app instead of the lower-converting web funnel (~19% vs ~71% activation).
 * v2 (2026-06-18). Replaces the old MobileAppBanner + Apple's native Smart
 * App Banner. One mount in the root layout; all gating lives here.
 *
 * Positioning: `position: fixed` pinned to the top of the viewport (visible
 * immediately on load, stays put during scroll). It does NOT consume flow,
 * so it sets a `--install-banner-h` CSS var that:
 *   - body { padding-top } consumes (pushes normal-flow content down), and
 *   - the page's own fixed top-navs consume via `top-[var(--install-banner-h)]`
 *     so they sit below the banner instead of being covered.
 * On dismiss the banner slides up (translateY) and the var returns to 0 so
 * content slides back in sync.
 *
 * Gating:
 *   - All public marketing surfaces + conversion pages; excluded: /admin,
 *     /api, authenticated app pages, /auth/* except /auth/signup.
 *   - iOS → App Store badge. Android → Play Store badge, but only when
 *     NEXT_PUBLIC_PLAY_STORE_LIVE === "true" (Play submission pending). While
 *     hidden it fires install_banner_render_skipped to size missed demand.
 *   - 7-day dismiss cookie.
 *
 * Analytics (PostHog): shown / clicked / dismissed / render_skipped, each
 * with platform + store + pathname + utm/fbclid attribution.
 */

const COOKIE_NAME = "acuity_install_banner_dismissed_at";
const COOKIE_DAYS = 7;
const BANNER_HEIGHT = 64; // px — ~60-72px target; tall enough to read, slim enough not to dominate
const SLIDE_MS = 280;

const PLAY_STORE_LIVE = process.env.NEXT_PUBLIC_PLAY_STORE_LIVE === "true";

// Private / authenticated surfaces — never mount here. Everything else is a
// public marketing surface or a conversion page and gets the banner on mobile.
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
  if (pathname === "/auth" || pathname.startsWith("/auth/")) {
    return pathname === "/auth/signup" || pathname.startsWith("/auth/signup/");
  }
  return !EXCLUDED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

type Platform = "ios" | "android";

const STORE: Record<
  Platform,
  { url: string; badge: string; alt: string; store: string }
> = {
  ios: {
    url: APP_VERSION_CONFIG.ios.appStoreUrl,
    badge: "/badges/apple-app-store.svg",
    alt: "Download on the App Store",
    store: "app_store",
  },
  android: {
    url: APP_VERSION_CONFIG.android.appStoreUrl,
    badge: "/badges/google-play.svg",
    alt: "Get it on Google Play",
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

function setBannerHeightVar(px: number): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--install-banner-h", `${px}px`);
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
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // Reset on every route change; decide client-side to avoid SSR flash.
    setVisible(false);
    setLeaving(false);
    setBannerHeightVar(0);

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

    // Android stays dark until Google approves the pending Play submission.
    if (p === "android" && !PLAY_STORE_LIVE) {
      trackClient("install_banner_render_skipped", {
        ...base,
        reason: "play_not_live",
      });
      return;
    }

    setPlatform(p);
    setVisible(true);
    setBannerHeightVar(BANNER_HEIGHT);
    trackClient("install_banner_shown", base);

    // Reset the layout offset if we unmount / navigate away.
    return () => setBannerHeightVar(0);
  }, [pathname]);

  if (!visible || !platform) return null;

  const cfg = STORE[platform];
  const eventProps = {
    platform,
    store: cfg.store,
    pathname,
    ...attributionProps(),
  };

  const handleClick = () => {
    trackClient("install_banner_clicked", eventProps);
    // Navigation handled by the anchor's href.
  };

  const handleDismiss = () => {
    trackClient("install_banner_dismissed", eventProps);
    writeDismissCookie();
    setLeaving(true); // slide up
    setBannerHeightVar(0); // content slides back up in sync
    window.setTimeout(() => setVisible(false), SLIDE_MS);
  };

  return (
    <div
      role="banner"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 px-4 shadow-md transition-transform ease-out"
      style={{
        height: BANNER_HEIGHT,
        backgroundColor: "#E89653",
        transitionDuration: `${SLIDE_MS}ms`,
        transform: leaving ? "translateY(-100%)" : "translateY(0)",
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 text-white">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
          <span className="text-base font-bold leading-none">A</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">
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
        aria-label={cfg.alt}
        className="shrink-0 transition active:scale-95"
      >
        {/* Official store badge (apps/web/public/badges). Plain <img> so no
            next/image SVG config is needed; brand assets are not recolored. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cfg.badge}
          alt={cfg.alt}
          style={{ height: 40, width: "auto", display: "block" }}
        />
      </a>

      <button
        type="button"
        aria-label="Dismiss app banner"
        onClick={handleDismiss}
        className="shrink-0 rounded-full p-2 text-white transition hover:bg-white/10"
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
