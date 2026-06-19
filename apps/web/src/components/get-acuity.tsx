"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";

import { APP_VERSION_CONFIG } from "@/lib/app-version-config";
import { trackClient } from "@/lib/analytics-client";
import { captureUtmParams } from "@/lib/track-onboarding";

/**
 * The standalone "Get Acuity" surface rendered at /install for desktop, bots,
 * and Android-pre-launch (mobile UAs are redirected to the store by the route).
 * Doubles as a shareable destination (email signatures, social bios, support
 * replies) — clean, no app navigation.
 *
 * Desktop: QR is primary (scan with your phone). Mobile (Android-pre-launch):
 * the store badges are the action. Fires install_page_visit on mount.
 */

const PLAY_STORE_LIVE = process.env.NEXT_PUBLIC_PLAY_STORE_LIVE === "true";

// Lazy — keeps qrcode.react out of the bundle until this surface renders.
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
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-[11px]"
            style={{ background: "var(--acuity-grad-mix)" }}
          >
            <span className="font-display text-[16px] font-extrabold leading-none text-white">
              A
            </span>
          </span>
          <span className="font-display text-[20px] font-extrabold tracking-[-0.4px]">
            Acuity
          </span>
        </div>

        <div className="flex flex-col gap-3">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-primary">
            Voice journal for clarity
          </p>
          <h1 className="font-display text-[30px] font-bold leading-[1.1] tracking-[-0.8px] sm:text-[36px]">
            Talk it out. See it clearly.
          </h1>
          <p className="text-[15px] leading-relaxed text-acuity-text-sec">
            Talk for a minute. Acuity turns it into tasks, moods, patterns, and
            a weekly report — no typing, no prompts.
          </p>
        </div>

        {/* Desktop: QR is the primary action. */}
        <div className="hidden flex-col items-center gap-3 sm:flex">
          <InstallQR src={`install_page_${src}`} size={176} location="install_page" />
          <p className="text-[13px] text-acuity-text-ter">
            Point your phone&rsquo;s camera here to install
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href={APP_VERSION_CONFIG.ios.appStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
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

        <p className="text-[12px] text-acuity-text-quiet">
          Free to start · $4.99/month · cancel anytime
        </p>
      </div>
    </main>
  );
}
