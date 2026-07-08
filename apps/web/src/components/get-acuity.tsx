"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";

import { trackClient } from "@/lib/analytics-client";
import { captureUtmParams } from "@/lib/track-onboarding";

/**
 * The standalone "Get Acuity" surface rendered at /install for desktop, bots,
 * and Android-pre-launch (mobile UAs are redirected to the store by the route).
 * A shareable destination (email signatures, social bios, support replies) —
 * clean, no app navigation.
 *
 * Desktop: the QR is the action (scan → /install → store). Store badges are
 * non-clickable labels (a desktop store link is a dead-end — the QR converts).
 * Per _design/DESIGN_SYSTEM.md: app-icon product anchor, display headline,
 * mono eyebrow, brand tokens, no glow. Fires install_page_visit on mount.
 */

const PLAY_STORE_LIVE = process.env.NEXT_PUBLIC_PLAY_STORE_LIVE === "true";

const InstallQR = dynamic(
  () => import("@/components/install-qr").then((m) => m.InstallQR),
  { ssr: false }
);

export function GetAcuity({ src }: { src: string }) {
  useEffect(() => {
    const utm = captureUtmParams();
    trackClient("install_page_visit", {
      src,
      referrer:
        typeof document !== "undefined" ? document.referrer || null : null,
      utm_source: utm.utmSource ?? null,
      utm_campaign: utm.utmCampaign ?? null,
      fbclid: utm.fbclid ?? null,
    });
  }, [src]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-acuity-bg px-6 py-16 text-acuity-text">
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-7 text-center">
        {/* Product anchor — app icon + wordmark. */}
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/apple-touch-icon.png"
            alt=""
            className="h-14 w-14 rounded-[16px]"
            style={{ boxShadow: "var(--acuity-shadow-soft)" }}
          />
          <span className="font-display text-[22px] font-extrabold tracking-[-0.4px]">
            Acuity
          </span>
        </div>

        <div className="flex flex-col gap-3">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-primary">
            Voice journal for clarity
          </p>
          <h1 className="font-display text-[32px] font-bold leading-[1.08] tracking-[-0.8px] sm:text-[40px]">
            Talk it out. See it clearly.
          </h1>
          <p className="text-[15px] leading-relaxed text-acuity-text-sec">
            Acuity turns your daily debrief into tasks, moods, patterns, and a
            weekly report — no typing, no prompts.
          </p>
        </div>

        {/* Desktop: QR is the action. */}
        <div className="hidden flex-col items-center gap-3 sm:flex">
          <InstallQR src={`install_page_${src}`} size={208} location="install_page" />
          <p className="text-[14px] font-semibold text-acuity-text">
            Scan to install on your iPhone
          </p>
        </div>

        {/* Large App Store badge — non-clickable label. */}
        <div
          className="flex flex-wrap items-center justify-center gap-3"
          aria-hidden="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/badges/apple-app-store.svg"
            alt=""
            style={{ width: 192, height: "auto", display: "block" }}
          />
          {PLAY_STORE_LIVE && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src="/badges/google-play.svg"
              alt=""
              style={{ width: 192, height: "auto", display: "block" }}
            />
          )}
        </div>

        <p className="text-[13px] text-acuity-text-quiet">
          Free for 7 days · no card required · cancel anytime
        </p>
      </div>
    </main>
  );
}
