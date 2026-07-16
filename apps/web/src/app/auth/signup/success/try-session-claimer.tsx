"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { trackOnboardingEvent } from "@/lib/track-onboarding";
import { useAppStoreCta, WebviewBreakout } from "@/components/app-store-cta";

/**
 * Client component that runs when a user arrives at /auth/signup/success
 * after completing a "Try it now" recording. It:
 *   1. Calls /api/try-recording/claim to convert the TrySession into a real Entry
 *   2. Shows the "You're in." celebration animation with confetti
 *   3. Transitions to the download CTA screen (skipping the recording step)
 *
 * This component is only rendered when `from_try=1` is in the URL params
 * AND the `acuity_try_session` cookie exists.
 */

const APP_STORE_URL = "https://apps.apple.com/us/app/acuity-daily/id6762633410";

export function TrySessionClaimer() {
  const [stage, setStage] = useState<"claiming" | "dark" | "text" | "confetti" | "cta">("claiming");
  const claimAttempted = useRef(false);

  useEffect(() => {
    if (claimAttempted.current) return;
    claimAttempted.current = true;

    // Fire-and-forget the claim request. Don't block the celebration on it.
    fetch("/api/try-recording/claim", { method: "POST" })
      .then((res) => {
        if (!res.ok) {
          // eslint-disable-next-line no-console
          console.warn("[try-claimer] Claim returned", res.status);
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[try-claimer] Claim failed:", err);
      });

    // Start the celebration immediately — don't wait for the claim
    setStage("dark");
  }, []);

  useEffect(() => {
    if (stage !== "dark") return;
    const t1 = setTimeout(() => setStage("text"), 500);
    const t2 = setTimeout(() => {
      setStage("confetti");
      const colors = ["#8E6FE6", "#A78BFA", "#C4B5FD", "#F59E0B", "#22C55E", "#60A5FA", "#F472B6"];
      const duration = 1500;
      const end = Date.now() + duration;
      (function frame() {
        confetti({ particleCount: 4, angle: 60, spread: 65, origin: { x: 0, y: 0.6 }, colors, zIndex: 9999 });
        confetti({ particleCount: 4, angle: 120, spread: 65, origin: { x: 1, y: 0.6 }, colors, zIndex: 9999 });
        if (Date.now() < end) requestAnimationFrame(frame);
      })();
      confetti({ particleCount: 80, spread: 100, origin: { x: 0.5, y: 0.45 }, colors, zIndex: 9999, startVelocity: 35 });
    }, 1500);
    const t3 = setTimeout(() => setStage("cta"), 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [stage]);

  if (stage === "claiming" || stage === "dark" || stage === "text" || stage === "confetti") {
    return (
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-1000 ${
          stage === "confetti" ? "bg-white" : "bg-acuity-bg"
        }`}
      >
        {stage === "claiming" ? (
          <div className="text-center">
            <div className="h-8 w-8 mx-auto animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
          </div>
        ) : (
          <h1
            className={`text-4xl font-bold tracking-tight sm:text-5xl transition-all duration-700 ${
              stage === "dark"
                ? "opacity-0 scale-95"
                : stage === "confetti"
                  ? "opacity-0 scale-110 text-zinc-900"
                  : "opacity-100 scale-100 text-white"
            }`}
          >
            You&rsquo;re in.
          </h1>
        )}
      </div>
    );
  }

  // CTA screen — same as the normal onboarding CTAScreen
  return <DownloadCTAScreen />;
}

// ─── Download CTA (mirrors CTAScreen from first-debrief-flow) ───────────────

import {
  TestimonialCarousel,
  STATIC_CAROUSEL_TESTIMONIALS,
} from "@/components/testimonial-carousel";

const CTA_VALUE_PROPS = [
  { icon: "\uD83D\uDCCB", text: "Tasks extracted automatically" },
  { icon: "\uD83D\uDCCA", text: "Weekly reports every Sunday" },
  { icon: "\uD83D\uDD0D", text: "Patterns detected over time" },
];

const CTA_TESTIMONIALS = STATIC_CAROUSEL_TESTIMONIALS.map((t) => ({
  quote: t.quote,
  name: t.name,
  role: t.role,
}));

function DownloadCTAScreen() {
  const [showSection, setShowSection] = useState(0);
  const [testimonialIdx, setTestimonialIdx] = useState(0);
  const [counter, setCounter] = useState(0);

  // Shared App Store CTA webview handling (see components/app-store-cta.tsx):
  // in IG/FB webviews, drop target="_blank", auto-copy the link, show breakout
  // instructions, and track taps + failed opens. The post-signup session cookie
  // lets the events API attribute these to the user server-side.
  const { browserEnv, copied, copyFailed, anchorProps } = useAppStoreCta({
    track: (event, props) => trackOnboardingEvent(event, props),
    events: {
      webviewDetected: "onboarding_inapp_browser_detected",
      autocopySuccess: "onboarding_autocopy_success",
      autocopyFailed: "onboarding_autocopy_failed",
      tap: "onboarding_app_store_clicked",
      returned: "onboarding_app_store_returned",
    },
  });

  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    const timers = [
      setTimeout(() => setShowSection(1), 200),
      setTimeout(() => setShowSection(2), 500),
      setTimeout(() => setShowSection(3), 800),
      setTimeout(() => setShowSection(4), 1100),
      setTimeout(() => setShowSection(5), 1400),
      setTimeout(() => setShowSection(6), 1700),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (showSection < 4) return;
    const target = 127;
    const duration = 1500;
    const startTime = Date.now();
    const frame = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCounter(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, [showSection]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTestimonialIdx((prev) => (prev + 1) % CTA_TESTIMONIALS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const vis = (at: number) => showSection >= at ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4";

  return (
    <div className="min-h-screen bg-white px-6">
      <div className="mx-auto max-w-md">
        <div className={`text-center pt-16 pb-10 sm:pt-24 transition-all duration-700 ${vis(1)}`}>
          <Image src="/ripple-mark-coral.png" alt="Ripple" width={67} height={40} className="mx-auto mb-6" />
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            Get Ripple on your phone so you can debrief&nbsp;anywhere.
          </h2>
          <p className="mt-3 text-sm text-zinc-500">
            Your recording has been saved. Pick up where you left off.
          </p>
        </div>

        <div className={`text-center mb-5 transition-all duration-700 ${vis(2)}`}>
          <a
            {...anchorProps}
            className="group relative inline-flex items-center gap-3 rounded-full px-8 py-4 text-base font-semibold text-white transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 active:scale-95 overflow-hidden"
            style={{ background: "var(--acuity-grad-primary)", boxShadow: "0 8px 32px rgba(142,111,230,0.3), 0 2px 8px rgba(125,98,202,0.15)" }}
          >
            <span className="absolute inset-[-2px] rounded-full pointer-events-none" style={{ background: "conic-gradient(from 0deg, transparent 0%, transparent 70%, rgba(255,255,255,0.5) 78%, transparent 86%, transparent 100%)", animation: "shine-ring 2.5s linear infinite" }} />
            <span className="absolute inset-[2px] rounded-full pointer-events-none" style={{ background: "var(--acuity-grad-primary)" }} />
            <span className="relative z-10 flex items-center gap-3">
              <AppleLogo />
              Download on the App Store
            </span>
          </a>
          {browserEnv.isWebView && (
            <div className="mx-auto mt-6 max-w-sm">
              <WebviewBreakout browserEnv={browserEnv} copied={copied} copyFailed={copyFailed} />
            </div>
          )}
        </div>

        <div className={`text-center mb-10 transition-all duration-700 ${vis(2)}`}>
          <a href="/home" className="group relative inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-zinc-600 transition-all duration-300 hover:scale-[1.02] hover:text-zinc-900 active:scale-95 overflow-hidden" style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.08)" }}>
            <span className="absolute inset-[-1px] rounded-full pointer-events-none" style={{ background: "conic-gradient(from 0deg, transparent 0%, transparent 75%, rgba(142,111,230,0.25) 82%, transparent 89%, transparent 100%)", animation: "shine-ring 3s linear infinite" }} />
            <span className="absolute inset-[1px] rounded-full bg-white pointer-events-none" />
            <span className="relative z-10">Continue in your browser &rarr;</span>
          </a>
        </div>

        <div className={`text-center mb-12 hidden sm:block transition-all duration-700 ${vis(2)}`}>
          <p className="text-xs text-zinc-400 mb-3">On desktop? Scan to download.</p>
          <div className="inline-block rounded-xl border border-zinc-200 p-3">
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(APP_STORE_URL)}&bgcolor=ffffff&color=181614`} alt="QR code to download Ripple" width={140} height={140} />
          </div>
        </div>

        <div className="mb-12 space-y-3">
          {CTA_VALUE_PROPS.map((v, i) => (
            <div key={v.text} className={`flex items-center gap-3 rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3 transition-all duration-500 ${vis(3)}`} style={{ transitionDelay: `${i * 100}ms` }}>
              <span className="text-xl">{v.icon}</span>
              <span className="text-sm font-medium text-zinc-700">{v.text}</span>
            </div>
          ))}
        </div>

        <div className={`text-center mb-8 transition-all duration-700 ${vis(4)}`}>
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <span className="text-2xl font-bold text-zinc-900">4.9</span>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="text-xl text-amber-400" style={{ animation: `star-twinkle 2s ease-in-out infinite`, animationDelay: `${i * 0.3}s` }}>&#9733;</span>
            ))}
          </div>
          <p className="text-sm text-zinc-500"><span className="font-semibold text-zinc-700 tabular-nums">{counter}+</span> users</p>
        </div>

        <div className={`mb-10 transition-all duration-700 ${vis(5)}`}>
          <div className="relative min-h-[120px]">
            {CTA_TESTIMONIALS.map((t, i) => (
              <div key={t.name} className={`absolute inset-0 rounded-2xl bg-zinc-50 border border-zinc-100 p-5 transition-all duration-500 ${i === testimonialIdx ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}>
                <div className="flex gap-0.5 mb-2">{[0, 1, 2, 3, 4].map((s) => <span key={s} className="text-xs text-amber-400">&#9733;</span>)}</div>
                <p className="text-sm text-zinc-700 leading-relaxed italic mb-3">&ldquo;{t.quote}&rdquo;</p>
                <p className="text-xs text-zinc-400"><span className="font-medium text-zinc-600">{t.name}</span>{t.role && <> &middot; {t.role}</>}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={`text-center pb-16 sm:pb-24 transition-all duration-700 ${vis(6)}`}>
          <p className="text-sm text-zinc-400">Your 7-day free trial has started. Keep the streak going.</p>
        </div>
      </div>
    </div>
  );
}

function AppleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
      <path d="M14.94 13.5c-.37.82-.55 1.19-.97 1.91-.59.99-1.42 2.24-2.45 2.25-.92.01-1.16-.6-2.41-.59-1.25.01-1.51.6-2.43.59-1.03-.01-1.81-1.13-2.4-2.12C2.92 13.39 2.8 10.77 3.68 9.39c.63-1 1.63-1.58 2.57-1.58.96 0 1.56.6 2.35.6.77 0 1.24-.6 2.35-.6.84 0 1.73.46 2.35 1.24-2.06 1.13-1.73 4.07.37 4.85-.29.7-.43.99-.73 1.6zM11.37 3c.47-.6.83-1.45.7-2.32-.77.05-1.67.54-2.2 1.17-.48.57-.88 1.43-.73 2.26.84.03 1.72-.47 2.23-1.11z" />
    </svg>
  );
}
