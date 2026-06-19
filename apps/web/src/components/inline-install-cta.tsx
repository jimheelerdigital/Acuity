"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { APP_VERSION_CONFIG } from "@/lib/app-version-config";
import { trackClient } from "@/lib/analytics-client";

/**
 * Inline install CTA — a marketing-page content section giving scrolling
 * readers a chance to install. Platform-aware action:
 *   - Mobile → tappable official store badges (Play gated by the flag).
 *   - Desktop → a brand QR that bridges to the phone (scan → /install →
 *     store). Desktop visitors otherwise hit a dead-end badge (opens the App
 *     Store web page, can't install on a computer).
 *
 * Visual language per _design/DESIGN_SYSTEM.md: mono eyebrow, display
 * headline, brand tokens, no glow. Badge / QR is the focal point.
 *
 * Analytics: install_banner_inline_shown (section in view) + _clicked (badge
 * tap); the desktop QR fires install_qr_shown from InstallQR itself. All carry
 * `location` (hero | mid_page | footer).
 */

const PLAY_STORE_LIVE = process.env.NEXT_PUBLIC_PLAY_STORE_LIVE === "true";

// Lazy — qrcode.react never reaches the mobile bundle (QR is desktop-only).
const InstallQR = dynamic(
  () => import("@/components/install-qr").then((m) => m.InstallQR),
  { ssr: false }
);

type InlineLocation = "hero" | "mid_page" | "footer";

function isDesktopUA(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const mobile =
    /iPhone|iPad|iPod|Android/i.test(ua) ||
    (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
  return !mobile;
}

export function InlineInstallCTA({
  location,
  headline = "Ready to start journaling?",
  eyebrow = "Acuity for iPhone",
  sub = "Talk for a minute. Acuity turns it into tasks, moods, patterns, and a weekly report.",
}: {
  location: InlineLocation;
  headline?: string;
  eyebrow?: string;
  sub?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(false);
  // Default false (SSR + mobile show badges); desktop swaps to QR post-mount.
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    setDesktop(isDesktopUA());
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !seen.current) {
            seen.current = true;
            trackClient("install_banner_inline_shown", { location });
            obs.disconnect();
          }
        }
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [location]);

  const handleClick = (store: string) =>
    trackClient("install_banner_inline_clicked", { location, store });

  return (
    <section ref={ref} className="px-6 py-14 sm:py-20">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-5 text-center">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-primary">
          {eyebrow}
          {PLAY_STORE_LIVE ? " & Android" : ""}
        </p>
        <h3 className="font-display text-[26px] font-bold leading-[1.1] tracking-[-0.6px] text-acuity-text sm:text-[30px]">
          {headline}
        </h3>
        {sub && (
          <p className="max-w-md text-[15px] leading-relaxed text-acuity-text-sec">
            {sub}
          </p>
        )}

        {desktop ? (
          <div className="mt-1 flex flex-col items-center gap-4">
            <p className="text-[14px] font-semibold text-acuity-text">
              Scan to download the Acuity app
            </p>
            <InstallQR src={`inline_${location}`} location={`inline_${location}`} />
            {/* Non-clickable store badges — a visual label marketing that the
                QR installs the real native app. NOT a link: clicking a store
                badge on a desktop is a dead-end; the QR is the action. */}
            <div
              className="flex flex-wrap items-center justify-center gap-3"
              aria-hidden="true"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/badges/apple-app-store.svg"
                alt=""
                style={{ height: 34, width: "auto", display: "block" }}
              />
              {PLAY_STORE_LIVE && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src="/badges/google-play.svg"
                  alt=""
                  style={{ height: 34, width: "auto", display: "block" }}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
            <a
              href={APP_VERSION_CONFIG.ios.appStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleClick("app_store")}
              aria-label="Download on the App Store"
              className="transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/badges/apple-app-store.svg"
                alt="Download on the App Store"
                style={{ height: 48, width: "auto", display: "block" }}
              />
            </a>
            {PLAY_STORE_LIVE && (
              <a
                href={APP_VERSION_CONFIG.android.appStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleClick("play_store")}
                aria-label="Get it on Google Play"
                className="transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/badges/google-play.svg"
                  alt="Get it on Google Play"
                  style={{ height: 48, width: "auto", display: "block" }}
                />
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
