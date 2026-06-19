"use client";

import { useEffect, useRef } from "react";

import { APP_VERSION_CONFIG } from "@/lib/app-version-config";
import { trackClient } from "@/lib/analytics-client";

/**
 * Inline install CTA — a marketing-page content section (NOT the sticky
 * banner) that gives scrolling readers a second/third chance to install
 * after they've absorbed the value props. Renders both official store
 * badges (Play gated behind NEXT_PUBLIC_PLAY_STORE_LIVE), on desktop + mobile
 * since it's page content, not a device-targeted bar.
 *
 * Visual language per _design/DESIGN_SYSTEM.md: mono eyebrow, display
 * headline (tight negative tracking), brand tokens, no glow. Badges are the
 * focal point.
 *
 * Analytics: install_banner_inline_shown fires once when the block scrolls
 * into view (IntersectionObserver); install_banner_inline_clicked on a badge
 * tap. Both carry `location` (hero | mid_page | footer) for placement context.
 */

const PLAY_STORE_LIVE = process.env.NEXT_PUBLIC_PLAY_STORE_LIVE === "true";

type InlineLocation = "hero" | "mid_page" | "footer";

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
