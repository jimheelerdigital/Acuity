"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { APP_VERSION_CONFIG } from "@/lib/app-version-config";
import { captureUtmParams } from "@/lib/track-onboarding";
import { trackClient } from "@/lib/analytics-client";

/**
 * Cross-platform install banner — routes mobile-web visitors to the native
 * app instead of the lower-converting web funnel (~19% vs ~71% activation).
 *
 * Visual language (per _design/DESIGN_SYSTEM.md): the bar mirrors the site's
 * own glass marketing nav — `bg-acuity-bg/80 backdrop-blur` + a hairline
 * border + shadowSoft, brand tokens throughout, NO glow (§4.4 reserves glow
 * for ceremonial elements). The store badge is the visual focal point. Slides
 * down on first appearance (~220ms easeEnter) and up on dismiss; honors
 * prefers-reduced-motion.
 *
 * Positioning: `position: fixed` at the top (visible immediately, sticky on
 * scroll). Sets `--install-banner-h` so body padding pushes content down and
 * the page's own fixed top-navs offset below it.
 *
 * Gating: public marketing + conversion routes; iOS → App Store, Android →
 * Play (both apps are live); 7-day dismiss cookie. Analytics: shown / clicked
 * / dismissed.
 */

const COOKIE_NAME = "acuity_install_banner_dismissed_at";
const COOKIE_DAYS = 7;
const BANNER_HEIGHT = 60; // px — tight; the badge carries the weight, not the bar
const SLIDE_MS = 220;

const EXCLUDED_PREFIXES = [
  "/admin",
  "/api",
  "/dashboard",
  "/home",
  "/account",
  "/entries",
  "/goals",
  "/tasks",
  "/insights",
  "/life-matrix",
  "/achievements",
  "/actions",
  "/delete-account",
  // /start is the web onboarding funnel — it has its own download step at the
  // end, so a competing App Store banner up top would pull users out early.
  "/start",
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
  const [entered, setEntered] = useState(false); // slide-down on first paint
  const [leaving, setLeaving] = useState(false); // slide-up on dismiss
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setVisible(false);
    setEntered(false);
    setLeaving(false);
    setBannerHeightVar(0);

    if (typeof navigator === "undefined") return;
    if (!isEligibleRoute(pathname)) return;

    const p = detectPlatform(navigator.userAgent);
    if (!p) return;
    if (readDismissCookie()) return;

    const base = {
      platform: p,
      store: STORE[p].store,
      pathname,
      ...attributionProps(),
    };

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    setReduceMotion(reduce);
    setPlatform(p);
    setVisible(true);
    setBannerHeightVar(BANNER_HEIGHT);
    trackClient("install_banner_shown", base);

    // Slide down from -100% → 0 on the next frame (skip under reduced motion).
    if (reduce) {
      setEntered(true);
    } else {
      const r = requestAnimationFrame(() =>
        requestAnimationFrame(() => setEntered(true))
      );
      return () => {
        cancelAnimationFrame(r);
        setBannerHeightVar(0);
      };
    }

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

  const handleClick = () => trackClient("install_banner_clicked", eventProps);

  const handleDismiss = () => {
    trackClient("install_banner_dismissed", eventProps);
    writeDismissCookie();
    setLeaving(true);
    setBannerHeightVar(0);
    window.setTimeout(() => setVisible(false), reduceMotion ? 0 : SLIDE_MS);
  };

  const offscreen = leaving || !entered;

  return (
    <div
      role="banner"
      className="fixed inset-x-0 top-0 z-50 border-b border-acuity-line bg-acuity-bg/80 backdrop-blur-xl"
      style={{
        height: BANNER_HEIGHT,
        boxShadow: "var(--acuity-shadow-soft)",
        transform: offscreen ? "translateY(-100%)" : "translateY(0)",
        transition: reduceMotion
          ? "none"
          : `transform ${SLIDE_MS}ms cubic-bezier(0.16, 0.9, 0.3, 1)`,
      }}
    >
      <div className="mx-auto flex h-full max-w-3xl items-center gap-3 px-4">
        {/* Brand mark — gradMix square (DESIGN_SYSTEM §5.1 avatar language) */}
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
          style={{ background: "var(--acuity-grad-mix)" }}
        >
          <span className="font-display text-[16px] font-extrabold leading-none text-white">
            A
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[14px] font-bold leading-tight tracking-[-0.3px] text-acuity-text">
            Acuity is better in the app
          </p>
          <p className="truncate text-[12px] leading-tight text-acuity-text-sec">
            Voice journal — faster, native, designed for your phone.
          </p>
        </div>

        {/* Focal point — official store badge */}
        <a
          href={cfg.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClick}
          aria-label={cfg.alt}
          className="shrink-0 transition-transform duration-200 hover:scale-[1.02] active:scale-[0.97]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cfg.badge}
            alt={cfg.alt}
            style={{ height: 38, width: "auto", display: "block" }}
          />
        </a>

        <button
          type="button"
          aria-label="Dismiss"
          onClick={handleDismiss}
          className="shrink-0 rounded-full p-1.5 text-acuity-text-quiet transition hover:bg-acuity-line hover:text-acuity-text-sec"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={15}
            height={15}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
