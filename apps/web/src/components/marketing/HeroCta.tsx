"use client";

/**
 * Hero call-to-action block (client) — split path for the homepage hero.
 *
 * One dominant coral quiz CTA on top ("Is this for me? Find out →" → /start),
 * then a three-equal store row (official Apple App Store badge, official Google
 * Play badge, and a badge-shaped "web app" button), a subtext line, and a quiet
 * "See how it works" text link.
 *
 * Each of the four actions fires a distinct funnel_hero_* onboarding event so
 * the hero split is measurable. funnel_* events auto-pass the allowlist in
 * /api/onboarding-events and land in the OnboardingEvent table (SQL-verifiable).
 *
 * UI + links + events only — no auth, payment, or funnel logic here. Store
 * badges use the official black assets unmodified per Apple/Google branding
 * rules; the web-app button mirrors the badge shape/height so the row reads as
 * three equals.
 */

import { trackOnboardingEvent } from "@/lib/track-onboarding";

const APP_STORE_URL = "https://apps.apple.com/us/app/acuity-daily/id6762633410";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.heelerdigital.acuity&utm_source=site&utm_medium=hero&utm_campaign=play_badge";
const WEB_APP_URL = "/home";

export function HeroCta() {
  return (
    <div className="max-w-[480px]">
      {/* Primary — the biggest thing in the block */}
      <a
        href="/start"
        onClick={() => trackOnboardingEvent("funnel_hero_quiz_clicked")}
        className="flex w-full items-center justify-center gap-2.5 rounded-acuity-pill border-[0.5px] border-white/25 bg-acuity-grad-primary px-[26px] py-[18px] font-sans text-[18px] font-bold tracking-[-0.2px] text-white shadow-acuity-glow-primary transition-transform hover:-translate-y-0.5"
      >
        Is this for me? Find out
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </a>

      {/* Store row — three equals; stacks vertically under 520px */}
      <div className="mt-5 flex flex-col gap-3 min-[520px]:flex-row min-[520px]:flex-wrap min-[520px]:items-center">
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackOnboardingEvent("funnel_hero_app_store_clicked")}
          className="inline-flex transition-transform hover:-translate-y-0.5"
          aria-label="Download on the App Store"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/badges/apple-app-store.svg" alt="Download on the App Store" width={120} height={40} className="h-10 w-auto" />
        </a>

        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackOnboardingEvent("funnel_hero_play_store_clicked")}
          className="inline-flex transition-transform hover:-translate-y-0.5"
          aria-label="Get it on Google Play"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/badges/google-play.svg" alt="Get it on Google Play" width={135} height={40} className="h-10 w-auto" />
        </a>

        {/* Badge-shaped web-app button — mirrors the black badges' shape/height */}
        <a
          href={WEB_APP_URL}
          onClick={() => trackOnboardingEvent("funnel_hero_web_app_clicked")}
          className="inline-flex h-10 items-center gap-2.5 rounded-[6.5px] border-[0.5px] border-[#A6A6A6] bg-black px-3.5 text-white transition-transform hover:-translate-y-0.5"
          aria-label="Use the web app"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
          </svg>
          <span className="flex flex-col leading-none">
            <span className="font-sans text-[7px] uppercase tracking-[0.9px]">No download</span>
            <span className="font-sans text-[15px] font-medium tracking-[0.2px]">Web App</span>
          </span>
        </a>
      </div>

      <div className="mt-[18px] font-sans text-[14px] text-acuity-text-ter">
        Free 7-day trial · Free version forever · iPhone &amp; Android
      </div>

      {/* Quieter "See how it works" — moved here from the primary button row */}
      <div className="mt-2.5">
        <a
          href="#how"
          className="font-sans text-[14px] font-medium text-acuity-text-sec underline decoration-acuity-line-strong underline-offset-4 transition-colors hover:text-acuity-text"
        >
          See how it works
        </a>
      </div>
    </div>
  );
}
