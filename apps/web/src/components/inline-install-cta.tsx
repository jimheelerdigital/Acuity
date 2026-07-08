"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { APP_VERSION_CONFIG } from "@/lib/app-version-config";
import { trackClient } from "@/lib/analytics-client";

/**
 * Inline install CTA — a marketing-page content section. Platform-aware:
 *   - Mobile → tappable official store badges (Play gated by the flag).
 *   - Desktop → a real install AD: a promotional card (radius xl + shadowLift +
 *     subtle brand-accent wash, per _design/DESIGN_SYSTEM.md §4-5; no glow) with
 *     the app icon, a benefit headline, a value prop, a large App Store badge
 *     (non-clickable label — the QR is the action, a desktop store link is a
 *     dead-end), and the QR that bridges to the phone (scan → /install → store).
 *
 * Analytics: install_banner_inline_shown (section in view) + _clicked (mobile
 * badge tap); the desktop QR fires install_qr_shown from InstallQR.
 */

const PLAY_STORE_LIVE = process.env.NEXT_PUBLIC_PLAY_STORE_LIVE === "true";

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
  sub = "Talk it out and Acuity gives back your tasks, moods, patterns, and a weekly report.",
}: {
  location: InlineLocation;
  headline?: string;
  eyebrow?: string;
  sub?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const seen = useRef(false);
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
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [location]);

  const handleClick = (store: string) =>
    trackClient("install_banner_inline_clicked", { location, store });

  // ── Desktop: promotional install card ──────────────────────────────────
  if (desktop) {
    return (
      <section ref={ref} className="px-6 py-14 sm:py-20">
        <div
          className="relative mx-auto max-w-3xl overflow-hidden rounded-[28px] border border-acuity-line bg-acuity-card-bg p-8 sm:p-12"
          style={{ boxShadow: "var(--acuity-shadow-lift)" }}
        >
          {/* Subtle brand-accent wash (no glow — §4.4). */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-acuity-primary/[0.07] via-transparent to-acuity-secondary/[0.07]" />

          <div className="relative flex flex-col items-center gap-10 text-center md:flex-row md:items-center md:gap-12 md:text-left">
            <div className="flex flex-1 flex-col items-center gap-3 md:items-start">
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/apple-touch-icon.png"
                  alt=""
                  className="h-11 w-11 rounded-[12px]"
                  style={{ boxShadow: "var(--acuity-shadow-soft)" }}
                />
                <span className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-primary">
                  Download Acuity
                </span>
              </div>
              <h3 className="font-display text-[28px] font-bold leading-[1.06] tracking-[-0.8px] text-acuity-text sm:text-[34px]">
                Get Acuity on your iPhone
              </h3>
              <p className="max-w-sm text-[15px] leading-relaxed text-acuity-text-sec">
                Free for 7 days, no card required. Talk it out — get your tasks,
                mood, and patterns back, no typing.
              </p>
              {/* Large App Store badge — non-clickable label marketing the app. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/badges/apple-app-store.svg"
                alt=""
                aria-hidden="true"
                className="mt-2"
                style={{ width: 192, height: "auto", display: "block" }}
              />
              {PLAY_STORE_LIVE && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src="/badges/google-play.svg"
                  alt=""
                  aria-hidden="true"
                  className="mt-2"
                  style={{ width: 192, height: "auto", display: "block" }}
                />
              )}
            </div>

            <div className="flex shrink-0 flex-col items-center gap-2.5">
              <InstallQR
                src={`inline_${location}`}
                location={`inline_${location}`}
                size={172}
              />
              <p className="text-[13px] font-semibold text-acuity-text">
                Scan to install
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ── Mobile: tappable store badges ──────────────────────────────────────
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
      </div>
    </section>
  );
}
