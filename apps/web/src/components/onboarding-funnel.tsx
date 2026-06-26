"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import {
  ANNUAL_PRICE_CENTS,
  MONTHLY_PRICE_CENTS,
  PRICING,
  formatDollars,
} from "@/lib/pricing";
import { trackOnboardingEvent, captureUtmParams, type UtmParams } from "@/lib/track-onboarding";
import { PRIORITY_COLOR } from "@acuity/shared";
import { MoodDot, AppleLogo, GoogleLogo } from "@/components/debrief-shared";
import { fireFbq, waitForFbq, TrackCompleteRegistration } from "@/components/meta-pixel-events";
import {
  type Branch,
  type Question,
  ENTRY_QUESTION,
  BRANCH_QUESTIONS,
  SHARED_QUESTIONS,
  buildMirrorLines,
  buildGap1Content,
  getTimeMathContent,
  GAP2_FEELINGS,
  getGap2Header,
  buildGap3Lines,
  type Gap3Line,
  GAP3_DISMISS_COPY,
  PROCESSING_STAGES,
  SNAPSHOT_PREVIEWS,
  SNAPSHOT_BOTTOM,
  getTimelineWeeks,
  PAYWALL_HOOKS,
  PRICING_COPY,
  getPaywallHeadline,
  PAYWALL_FAQ,
  getCreateAccountHeadline,
  getSavingsCostRecap,
  SAVINGS_TIMELINE,
  PAYWALL_TESTIMONIALS_V2,
  getPaywallLossRecap,
  getPaywallTestimonial,
  getPatternLabels,
} from "@/lib/funnel-config";

// ─── Types ──────────────────────────────────────────────────────────────────

type Step =
  | "entry"
  | "branch-q2" | "branch-q3" | "branch-q4"
  | "shared-q5" | "shared-q6" | "shared-q7" | "shared-q8" | "shared-q9"
  | "timemath"
  | "pain"
  | "gap2" | "gap3"
  | "mechanism"
  | "value"
  | "commit"
  | "processing"
  | "pattern-result"
  | "timeline"
  | "create-account"
  | "savings"
  | "download";

const STEP_ORDER: Step[] = [
  "entry", "branch-q2", "branch-q3", "branch-q4",
  "shared-q5", "shared-q6", "timemath", "shared-q7", "shared-q8", "shared-q9",
  "pain", "gap2", "gap3", "mechanism", "value", "commit", "processing", "pattern-result", "timeline",
  "savings", "create-account", "download",
];

const TOTAL_STEPS = STEP_ORDER.length;

// ─── Constants ──────────────────────────────────────────────────────────────

const APP_STORE_URL = "https://apps.apple.com/us/app/acuity-daily/id6762633410";

// Testimonials used on Download screen
const DOWNLOAD_TESTIMONIALS = [
  { quote: "I found out I mention quitting my job every Monday. That one pattern changed everything.", name: "Sarah M." },
  { quote: "My therapist asked what changed. I showed her my Acuity report.", name: "James K." },
  { quote: "Week 3, Acuity connected my mom to my work stress. A year of therapy never did.", name: "Priya R." },
];

// ── Reusable social proof (reuses the EXISTING 4.9/127+ rating + real testimonials) ──
// Rating value, star markup, and "127+ users" copy mirror the Download screen exactly
// and must not change (brand rule). Testimonial quotes are reused from the real
// PAYWALL_TESTIMONIALS_V2 set — no new or fabricated copy. Each element fires
// funnel_social_proof_viewed with its placement so we can measure step drop-off.

function SocialProofRating({ track, placement, className }: {
  track: (event: string, props?: Record<string, unknown>) => void;
  placement: string;
  className?: string;
}) {
  useEffect(() => { track("funnel_social_proof_viewed", { value: placement }); }, []);
  return (
    <p className={`text-[13px] font-semibold text-zinc-500 ${className ?? ""}`}>
      4.9 <span className="text-amber-400">&#9733;&#9733;&#9733;&#9733;&#9733;</span>{" "}
      <span className="font-medium text-zinc-400">from 127+ users</span>
    </p>
  );
}

function SocialProofQuote({ track, placement, testimonial, className, style }: {
  track: (event: string, props?: Record<string, unknown>) => void;
  placement: string;
  testimonial: { quote: string; name: string };
  className?: string;
  style?: React.CSSProperties;
}) {
  useEffect(() => { track("funnel_social_proof_viewed", { value: placement }); }, []);
  return (
    <div className={`rounded-xl border border-zinc-100 bg-white/60 px-4 py-3 text-center ${className ?? ""}`} style={style}>
      <p className="text-[13px] italic leading-relaxed text-zinc-600">&ldquo;{testimonial.quote}&rdquo;</p>
      <p className="mt-1.5 text-[11px] font-semibold text-zinc-400">&mdash; {testimonial.name}</p>
    </div>
  );
}

// ─── Session Tracking ───────────────────────────────────────────────────────

const SESSION_STORAGE_KEY = "acuity_funnel_session";
const SESSION_LOCALSTORAGE_KEY = "acuity_funnel_session_persist";
const FUNNEL_STATE_KEY = "acuity_funnel_state";

// ─── Funnel State Persistence ───────────────────────────────────────────────
// Saves step + branch + answers + selectedPlan to sessionStorage so the user
// can refresh or use browser back without losing their place.

const STEP_SET = new Set<string>(STEP_ORDER);

interface FunnelState {
  step: Step;
  branch: Branch | null;
  answers: Record<string, string | string[]>;
  selectedPlan: "monthly" | "yearly";
}

function saveFunnelState(state: FunnelState): void {
  try { sessionStorage.setItem(FUNNEL_STATE_KEY, JSON.stringify(state)); } catch {}
}

function loadFunnelState(): FunnelState | null {
  try {
    const raw = sessionStorage.getItem(FUNNEL_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && STEP_SET.has(parsed.step)) return parsed as FunnelState;
  } catch {}
  return null;
}

function buildStepUrl(step: Step): string {
  const url = new URL(window.location.href);
  if (step === "entry") {
    url.searchParams.delete("step");
  } else {
    url.searchParams.set("step", step);
  }
  // Strip Stripe/OAuth one-time params so they don't replay on refresh
  url.searchParams.delete("session_id");
  url.searchParams.delete("payment");
  return url.toString();
}

function getOrCreateSessionId(): string {
  if (typeof sessionStorage !== "undefined") {
    try {
      const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (existing) return existing;
    } catch {}
  }
  if (typeof localStorage !== "undefined") {
    try {
      const persisted = localStorage.getItem(SESSION_LOCALSTORAGE_KEY);
      if (persisted) {
        try { sessionStorage.setItem(SESSION_STORAGE_KEY, persisted); } catch {}
        return persisted;
      }
    } catch {}
  }
  const id = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `funnel_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  try { sessionStorage.setItem(SESSION_STORAGE_KEY, id); } catch {}
  try { localStorage.setItem(SESSION_LOCALSTORAGE_KEY, id); } catch {}
  return id;
}

function useFunnelTracker() {
  const sessionId = useRef(getOrCreateSessionId());
  const utmRef = useRef<UtmParams>({});
  useEffect(() => { utmRef.current = captureUtmParams(); }, []);
  return useCallback((event: string, props?: Record<string, unknown>) => {
    trackOnboardingEvent(event, { sessionToken: sessionId.current, utm: utmRef.current, flowVersion: "v5", ...props });
  }, []);
}

// ─── WebView Detection ──────────────────────────────────────────────────────

function detectBrowserEnv(): { isWebView: boolean; label: string; ua: string } {
  if (typeof navigator === "undefined") return { isWebView: false, label: "ssr", ua: "" };
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return { isWebView: true, label: "facebook", ua };
  if (/Instagram/i.test(ua)) return { isWebView: true, label: "instagram", ua };
  if (/LinkedInApp/i.test(ua)) return { isWebView: true, label: "linkedin", ua };
  if (/Twitter|TwitterAndroid/i.test(ua)) return { isWebView: true, label: "twitter", ua };
  return { isWebView: false, label: "browser", ua };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTrialEndDate(): string {
  const d = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function OnboardingFunnel() {
  const { data: session, status: authStatus } = useSession();
  // Restore persisted state from sessionStorage so refresh doesn't lose progress.
  // URL ?step= params (OAuth/Stripe returns) take priority over stored state.
  const saved = typeof window !== "undefined" ? loadFunnelState() : null;
  const [step, setStepRaw] = useState<Step>(saved?.step ?? "entry");
  const [branch, setBranch] = useState<Branch | null>(saved?.branch ?? null);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>(saved?.answers ?? {});
  // ?p= param for ad deep-link pre-highlighting (Change 6)
  const [adMatchBranch] = useState<Branch | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const p = new URLSearchParams(window.location.search).get("p");
    if (p && (["blur","patterns","rumination","graveyard","mask","drift"] as string[]).includes(p)) return p as Branch;
    return undefined;
  });
  const [apiError, setApiError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">(saved?.selectedPlan ?? "yearly");
  // Payment intent: set when user taps "Lock In My Savings" on the paywall.
  // After account creation, if true → route to Stripe checkout; if false → download.
  const [wantsPayment, setWantsPayment] = useState(false);
  const track = useFunnelTracker();

  // Wrap setStep to persist state + push browser history on every transition.
  // This makes both refresh AND browser-back work correctly.
  const isPopstateNav = useRef(false);
  const setStep = useCallback((next: Step) => {
    setStepRaw(next);
    if (typeof window === "undefined") return;
    // If this setStep was triggered by popstate (browser back), don't push again
    if (isPopstateNav.current) {
      isPopstateNav.current = false;
      return;
    }
    window.history.pushState({ funnelStep: next }, "", buildStepUrl(next));
  }, []);

  // Listen for browser back/forward button
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const targetStep = e.state?.funnelStep as Step | undefined;
      if (targetStep && STEP_SET.has(targetStep)) {
        isPopstateNav.current = true;
        setStepRaw(targetStep);
      } else {
        // Fallback: read step from URL
        const params = new URLSearchParams(window.location.search);
        const urlStep = params.get("step");
        if (urlStep && STEP_SET.has(urlStep)) {
          isPopstateNav.current = true;
          setStepRaw(urlStep as Step);
        } else {
          isPopstateNav.current = true;
          setStepRaw("entry");
        }
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Persist full state to sessionStorage whenever step/branch/answers/plan change
  useEffect(() => {
    saveFunnelState({ step, branch, answers, selectedPlan });
  }, [step, branch, answers, selectedPlan]);

  // Payment confirmation state — true when Stripe checkout completed successfully
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  // Handle return from Stripe Checkout, OAuth redirect, or restored session.
  // On mount, determine the correct step from URL params (priority) or sessionStorage
  // (already restored via useState initializer), then seed browser history.
  const paymentVerified = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stepParam = params.get("step");
    let resolvedStep: Step = step; // default: whatever was restored from sessionStorage

    if (stepParam === "download") {
      const sessionId = params.get("session_id");
      const paymentSuccess = params.get("payment") === "success";
      if (sessionId && paymentSuccess && !paymentVerified.current) {
        paymentVerified.current = true;
        fetch(`/api/onboarding/verify-payment?session_id=${encodeURIComponent(sessionId)}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.paid) {
              setPaymentConfirmed(true);
              setStep("download");
              track("funnel_savings_locked_in", { value: selectedPlan });
              fireFbq("Purchase", { value: selectedPlan === "yearly" ? 39.99 : 4.99, currency: "USD", content_name: "Acuity Pro Subscription" });
            } else {
              setStep("savings");
              setApiError("Payment incomplete. Try again or continue with your free trial.");
            }
          })
          .catch(() => {
            setStep("download");
          });
      } else if (!sessionId) {
        resolvedStep = "download";
        setStepRaw("download");
      }
    } else if (stepParam === "post-signup") {
      // OAuth returnees land here after Google/Apple signup redirect.
      // Account is now created — check if they intended to pay.
      track("funnel_account_created");
      fireFbq("StartTrial", { value: 4.99, currency: "USD", predicted_ltv: 39.99 });
      if (typeof window !== "undefined" && "gtag" in window) {
        (window as unknown as { gtag: (...args: unknown[]) => void }).gtag("event", "sign_up", { method: "oauth" });
      }
      let hadPaymentIntent = false;
      try { hadPaymentIntent = sessionStorage.getItem("acuity_payment_intent") === "1"; } catch {}
      if (hadPaymentIntent) {
        // They tapped "Lock In My Savings" → account created via OAuth → proceed to checkout
        resolvedStep = "create-account"; // briefly lands here while checkout triggers
        setStepRaw("create-account");
        // Trigger checkout after a tick so the component is mounted
        setTimeout(() => handleCheckout(), 100);
      } else {
        // They tapped "Continue without paying" → account created → download
        track("funnel_trial_continued");
        resolvedStep = "download";
        setStepRaw("download");
      }
    } else if (stepParam === "savings") {
      // Legacy URL or direct link — show the paywall
      resolvedStep = "savings";
      setStepRaw("savings");
    } else if (stepParam === "create-account") {
      resolvedStep = "create-account";
      setStepRaw("create-account");
    } else if (stepParam === "paywall") {
      resolvedStep = "savings";
      setStepRaw("savings");
    } else if (stepParam && STEP_SET.has(stepParam)) {
      resolvedStep = stepParam as Step;
      setStepRaw(stepParam as Step);
    }

    // Seed the initial history entry so popstate has something to land on
    window.history.replaceState({ funnelStep: resolvedStep }, "", buildStepUrl(resolvedStep));
  }, []);

  // If already logged in with active subscription, skip to download
  useEffect(() => {
    if (authStatus === "authenticated" && session?.user) {
      fetch("/api/user/me")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.user?.subscriptionStatus === "PRO") {
            setPaymentConfirmed(true);
            setStep("download");
          }
        })
        .catch(() => {});
    }
  }, [authStatus, session]);

  // Sync UTM attribution to User record after OAuth signup in the funnel.
  // OAuth users never visit /auth/signup/success (where SyncAttribution runs),
  // so we backfill from the funnel's sessionStorage UTMs + the attribution cookie.
  const attributionSynced = useRef(false);
  useEffect(() => {
    if (authStatus !== "authenticated" || attributionSynced.current) return;
    attributionSynced.current = true;

    // Top priority: UTMs carried back on the URL by the OAuth callbackUrl
    // (handleOAuthSignup). This is the only channel that survives in-app
    // webview storage partitioning and any www↔apex host switch, so it must
    // win over the two stores that the redirect can wipe.
    const urlUtm: Record<string, string> = {};
    try {
      const sp = new URLSearchParams(window.location.search);
      for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
        const v = sp.get(k);
        if (v) urlUtm[k] = v;
      }
    } catch {}

    // Fallback 1: funnel UTMs from sessionStorage (lost across webview/origin splits)
    let funnelUtm: Record<string, string> = {};
    try {
      const stored = sessionStorage.getItem("acuity_funnel_utm");
      if (stored) funnelUtm = JSON.parse(stored);
    } catch {}

    // Fallback 2: the first-touch attribution cookie (host-only)
    let cookieAttr: Record<string, string> = {};
    try {
      const { getClientAttribution } = require("@/lib/attribution");
      const attr = getClientAttribution();
      if (attr) cookieAttr = attr;
    } catch {}

    // Priority: URL (survives the redirect) → sessionStorage → cookie
    const utm_source = urlUtm.utm_source || funnelUtm.utmSource || cookieAttr.utm_source;
    const utm_medium = urlUtm.utm_medium || funnelUtm.utmMedium || cookieAttr.utm_medium;
    const utm_campaign = urlUtm.utm_campaign || funnelUtm.utmCampaign || cookieAttr.utm_campaign;
    const utm_content = urlUtm.utm_content || funnelUtm.utmContent || cookieAttr.utm_content;
    const utm_term = urlUtm.utm_term || funnelUtm.utmTerm || cookieAttr.utm_term;

    if (utm_source || utm_campaign) {
      fetch("/api/auth/set-attribution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          utm_source, utm_medium, utm_campaign, utm_content, utm_term,
          referrer: cookieAttr.referrer || document.referrer || undefined,
          landingPath: cookieAttr.landingPath || "/start",
        }),
      }).catch(() => {});
    }
  }, [authStatus]);

  // Track step views
  // All funnel_* events are accepted by the server via prefix rule
  // (FUNNEL_EVENT_RE in app/api/onboarding-events/route.ts).
  // No allowlist update needed when adding new funnel events.
  useEffect(() => {
    const eventMap: Record<string, string> = {
      entry: "funnel_entry_viewed",
      "branch-q2": "funnel_branch_q2_viewed",
      "branch-q3": "funnel_branch_q3_viewed",
      "branch-q4": "funnel_branch_q4_viewed",
      "shared-q5": "funnel_shared_q5_viewed",
      "shared-q6": "funnel_shared_q6_viewed",
      "shared-q7": "funnel_shared_q7_viewed",
      "shared-q8": "funnel_shared_q8_viewed",
      "shared-q9": "funnel_shared_q9_viewed",
      timemath: "funnel_timemath_viewed",
      pain: "funnel_pain_viewed",
      gap2: "funnel_gap2_viewed",
      gap3: "funnel_gap3_viewed",
      mechanism: "funnel_mechanism_viewed",
      value: "funnel_value_viewed",
      commit: "funnel_commit_viewed",
      processing: "funnel_processing_viewed",
      "pattern-result": "funnel_pattern_result_viewed",
      timeline: "funnel_timeline_viewed",
      "create-account": "funnel_create_account_viewed",
      savings: "funnel_savings_viewed",
      download: "funnel_download_viewed",
    };
    if (eventMap[step]) {
      track(eventMap[step], step === "entry" && adMatchBranch ? { value: `ad_match:${adMatchBranch}` } : undefined);
      // Lead fires on the timeline step — a mid-funnel signal showing the
      // user reached the value-reveal screens. Moved from create-account
      // (which inflated Lead count for users who merely saw the form).
      if (step === "timeline") fireFbq("Lead", { content_name: "Funnel Timeline Reached" });
      // Signal to the cookie consent banner that the user has progressed
      // far enough for consent to be shown without competing with content.
      if (step === "create-account") {
        window.dispatchEvent(new CustomEvent("acuity:funnel-consent-ready"));
      }
    }
  }, [step, track]);

  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  const goBack = () => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
  };

  const progressPct = ((STEP_ORDER.indexOf(step) + 1) / TOTAL_STEPS) * 100;

  // ── Quiz answer handler ──
  const handleAnswer = (questionId: string, value: string | string[], eventName: string) => {
    setAnswers((a) => ({ ...a, [questionId]: value }));
    track(eventName, { value: Array.isArray(value) ? value.join(", ") : value });
  };

  // ── Get current question for branch/shared steps ──
  const getCurrentQuestion = (): Question | null => {
    if (step === "entry") return ENTRY_QUESTION;
    if (step.startsWith("branch-") && branch) {
      const idx = parseInt(step.replace("branch-q", "")) - 2; // q2 → 0, q3 → 1, q4 → 2
      return BRANCH_QUESTIONS[branch][idx] ?? null;
    }
    if (step.startsWith("shared-")) {
      const idx = parseInt(step.replace("shared-q", "")) - 5; // q5 → 0, q6 → 1, etc.
      return SHARED_QUESTIONS[idx] ?? null;
    }
    return null;
  };

  // ── Checkout handler ──
  const handleCheckout = async () => {
    setCheckoutLoading(true);
    setApiError(null);
    try {
      const res = await fetch("/api/onboarding/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: selectedPlan }),
      });
      const data = await res.json();
      if (data.url) {
        track("funnel_checkout_started", { value: selectedPlan });
        fireFbq("InitiateCheckout", { content_name: "Start Free Trial", currency: "USD", value: selectedPlan === "yearly" ? 39.99 : 4.99 });
        window.location.href = data.url;
      } else {
        setApiError(data.error || `Checkout failed (${res.status})`);
        setCheckoutLoading(false);
      }
    } catch {
      setApiError("Something went wrong. Please try again.");
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-acuity-hero-grad">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes funnel-glow {
          0%, 100% { box-shadow: 0 4px 16px var(--acuity-glow-soft); }
          50% { box-shadow: 0 4px 28px var(--acuity-glow-primary), 0 0 8px var(--acuity-glow-soft); }
        }
        @keyframes funnel-slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes funnel-card-in {
          from { opacity: 0; transform: translateY(30px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes funnel-pulse-select {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
        @keyframes funnel-breathe {
          0%, 100% { transform: scale(0.98); }
          50% { transform: scale(1.02); }
        }
        @keyframes funnel-bounce-in {
          0% { opacity: 0; transform: translateY(16px) scale(0.9); }
          60% { transform: translateY(-4px) scale(1.02); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes funnel-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes funnel-line-draw {
          from { height: 0; }
          to { height: 100%; }
        }
        @keyframes funnel-highlight-sweep {
          from { background-size: 0% 100%; }
          to { background-size: 100% 100%; }
        }
        @keyframes funnel-settle {
          0% { opacity: 0; transform: translateY(12px) scale(1.03); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes funnel-scramble-resolve {
          0% { filter: blur(3px); transform: scale(1.04); opacity: 0.6; }
          100% { filter: blur(0); transform: scale(1); opacity: 1; }
        }
        @keyframes funnel-soft-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        @keyframes funnel-check-pop {
          0% { transform: scale(0); }
          60% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        @keyframes funnel-invite-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .gap-highlight {
          background-image: linear-gradient(to right, oklch(0.88 0.10 38 / 0.55), oklch(0.85 0.12 38 / 0.45));
          background-repeat: no-repeat;
          background-position: 0% 50%;
          background-size: 0% 100%;
          padding-inline: 3px;
          -webkit-box-decoration-break: clone;
          box-decoration-break: clone;
        }
        .gap-highlight.sweep { animation: funnel-highlight-sweep 350ms ease-out forwards; }
        .funnel-screen { animation: funnel-slide-up 0.4s ease-out both; }
        .funnel-card-stagger { animation: funnel-card-in 0.35s ease-out both; }
        .funnel-bounce { animation: funnel-bounce-in 0.4s ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .funnel-screen, .funnel-card-stagger, .funnel-bounce { animation: none !important; opacity: 1 !important; transform: none !important; }
          .gap-highlight { background-size: 100% 100% !important; animation: none !important; }
          * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
        }
      `}} />

      {/* Progress bar */}
      <div className="fixed top-[var(--install-banner-h)] inset-x-0 z-50 h-[2px] bg-zinc-200/50">
        <div className="h-full bg-acuity-primary transition-all duration-700 ease-out" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Back button — hidden on entry and download */}
      {step !== "entry" && step !== "download" && (
        <button onClick={goBack} className="fixed top-5 left-5 z-50 rounded-full bg-zinc-100/80 p-2 text-zinc-400 hover:text-zinc-700 transition" aria-label="Go back">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* ── Question Screens (Entry, Branch, Shared) ── */}
      {(step === "entry" || step.startsWith("branch-") || step.startsWith("shared-")) && (() => {
        const q = getCurrentQuestion();
        if (!q) return null;
        const isEntry = step === "entry";

        const nextStep = (): Step => {
          const idx = STEP_ORDER.indexOf(step);
          return STEP_ORDER[idx + 1] ?? "pain";
        };

        const eventBase = isEntry ? "funnel_entry" : step.startsWith("branch-") ? `funnel_${step.replace("-", "_")}` : `funnel_${step.replace("-", "_")}`;
        const answerKey = isEntry ? "entry" : step.replace("branch-", "branch_").replace("shared-", "shared_");

        if (q.multiSelect) {
          return (
            <MultiSelectScreen
              key={step}
              question={q.text}
              options={q.options.map((o) => o.label)}
              normalization={q.normalization}
              onSubmit={(vals) => {
                handleAnswer(answerKey, vals, `${eventBase}_selected`);
                setStep(nextStep());
              }}
            />
          );
        }

        return (
          <SingleSelectScreen
            key={step}
            question={isEntry ? undefined : q.text}
            questionLarge={isEntry ? q.text : undefined}
            options={q.options}
            normalization={q.normalization}
            highlightBranch={isEntry ? adMatchBranch : undefined}
            topSlot={isEntry ? <SocialProofRating track={track} placement="entry" /> : undefined}
            onSelect={(opt) => {
              if (isEntry && opt.branch) {
                setBranch(opt.branch);
                handleAnswer("entry", opt.label, "funnel_entry_selected");
                track("funnel_entry_selected", { value: opt.branch });
                if (adMatchBranch) {
                  track("funnel_ad_match", { value: opt.branch === adMatchBranch ? "matched" : "different" });
                }
              } else {
                handleAnswer(answerKey, opt.label, `${eventBase}_selected`);
              }
              setTimeout(() => setStep(nextStep()), 400);
            }}
          />
        );
      })()}

      {/* ── Time Math (after Q6 cost — duration drives the number, branch+cost drive the framing) ── */}
      {step === "timemath" && (
        <TimeMathScreen key="timemath" branch={branch} answers={answers} onContinue={() => setStep("shared-q7")} onSkip={() => setStep("shared-q7")} />
      )}

      {/* ── Pain (merged mirror + gap1 — sequential build) ── */}
      {step === "pain" && branch && (
        <PainScreen key="pain" branch={branch} answers={answers} onContinue={() => setStep("gap2")} />
      )}

      {/* ── Gap 2: How would it feel? (Screen 10b) ── */}
      {step === "gap2" && branch && (
        <Gap2Screen key="gap2" branch={branch} answers={answers} track={track}
          onContinue={(feelings) => {
            setAnswers((a) => ({ ...a, gap2_feelings: feelings }));
            track("funnel_gap2_selected", { value: feelings.join(", ") });
            setStep("gap3");
          }}
        />
      )}

      {/* ── Gap 3: Your future self (Screen 10c) ── */}
      {step === "gap3" && branch && (
        <Gap3Screen key="gap3" answers={answers} track={track} onContinue={() => setStep("mechanism")} />
      )}

      {/* ── Mechanism / Product Explainer (Screen 11) ── */}
      {step === "mechanism" && branch && (
        <MechanismScreen key="mechanism" branch={branch} answers={answers} onContinue={() => setStep("value")} track={track} />
      )}

      {/* ── What It Gives You (Screen 11b — value surfaces) ── */}
      {step === "value" && (
        <ValueScreen key="value" onContinue={() => setStep("commit")} />
      )}

      {/* ── Hold-to-Commit (Screen 12) ── */}
      {step === "commit" && (
        <CommitmentScreen key="commit" track={track} onComplete={() => setStep("processing")} />
      )}

      {/* ── Processing Theater (Screen 12) ── */}
      {step === "processing" && (
        <ProcessingTheater key="processing" onComplete={() => setStep("pattern-result")} />
      )}

      {/* ── Pattern Result (Screen 13 — deterministic label reveal) ── */}
      {step === "pattern-result" && branch && (
        <PatternResultScreen key="pattern-result" branch={branch} answers={answers} track={track} onContinue={() => setStep("timeline")} />
      )}

      {/* ── Personalized Timeline (Screen 14 — includes weekly-report previews) ── */}
      {step === "timeline" && branch && (
        <TimelineScreen key="timeline" branch={branch} answers={answers} onContinue={() => setStep("savings")} track={track} />
      )}

      {/* ── Paywall (shown BEFORE account creation — price-anchor) ── */}
      {step === "savings" && (
        <SavingsScreen
          key="savings"
          branch={branch}
          answers={answers}
          track={track}
          selectedPlan={selectedPlan}
          onPlanChange={setSelectedPlan}
          onCheckout={() => {
            // User wants to pay — store intent, proceed to account creation
            track("funnel_paywall_paid_selected", { value: selectedPlan });
            setWantsPayment(true);
            try { sessionStorage.setItem("acuity_payment_intent", "1"); } catch {}
            setStep("create-account");
          }}
          onSkip={() => {
            // User skips payment — proceed to account creation (free trial)
            track("funnel_paywall_skip_selected");
            setWantsPayment(false);
            try { sessionStorage.removeItem("acuity_payment_intent"); } catch {}
            setStep("create-account");
          }}
          loading={false}
          error={null}
        />
      )}

      {/* ── Create Account (after paywall — account must exist before any charge) ── */}
      {step === "create-account" && <TrackCompleteRegistration />}
      {step === "create-account" && (
        <CreateAccountScreen
          key="create-account"
          branch={branch}
          answers={answers}
          track={track}
          onAccountCreated={() => {
            track("funnel_account_created");
            fireFbq("StartTrial", { value: 4.99, currency: "USD", predicted_ltv: 39.99 });
            if (typeof window !== "undefined" && "gtag" in window) {
              (window as unknown as { gtag: (...args: unknown[]) => void }).gtag("event", "sign_up", { method: "email" });
            }
            if (wantsPayment) {
              // They chose "Lock In My Savings" → account now exists → proceed to Stripe
              handleCheckout();
            } else {
              // They chose "Continue without paying" → free trial → download
              track("funnel_trial_continued");
              setStep("download");
            }
          }}
        />
      )}

      {/* ── Download (Screen 18) ── */}
      {/* OAuth (Google/Apple) free-trial signups reach `download` straight from
          the post-signup branch WITHOUT passing through `create-account`, so the
          create-account tracker above never mounts for them — they'd otherwise
          fire StartTrial but never CompleteRegistration. Mount the tracker here
          for the unpaid case. It POSTs /api/capi/complete-registration first
          (server-side CAPI, webview-proof — ~90% of this traffic is in-app
          webview where the browser pixel is unreliable), then fires the browser
          pixel with the same event_id for dedup.
          Gated on !paymentConfirmed so OAuth-PAID users — who already fired
          CompleteRegistration on the create-account step before Stripe — do not
          double-fire when they return to download. Email free-trial is also
          unpaid but already set the `acuity_reg_pixel_fired` sessionStorage guard
          inline at signup, so the component early-returns for them. The CAPI
          route's 5-minute new-signup guard is the final backstop against
          returning/authenticated users landing on download. */}
      {step === "download" && !paymentConfirmed && <TrackCompleteRegistration />}
      {step === "download" && (
        <DownloadScreen key="download" track={track} paymentConfirmed={paymentConfirmed} selectedPlan={selectedPlan} />
      )}

      {/* Powered-by badge — shown on every funnel step. pointer-events-none so it never blocks a CTA. */}
      <div className="fixed bottom-3 inset-x-0 z-40 flex justify-center pointer-events-none">
        <span className="rounded-full border border-zinc-200/70 bg-white/70 px-3 py-1 text-[11px] font-medium text-zinc-800 shadow-sm backdrop-blur-sm">
          powered by{" "}
          <span className="font-bold bg-acuity-grad-primary bg-clip-text text-transparent">Acuity</span>
        </span>
      </div>
    </div>
  );
}

// ─── Single Select Question Screen ──────────────────────────────────────────

function SingleSelectScreen({ question, questionLarge, options, normalization, onSelect, highlightBranch, topSlot }: {
  question?: string;
  questionLarge?: string;
  options: { label: string; branch?: Branch }[];
  normalization?: string;
  onSelect: (opt: { label: string; branch?: Branch }) => void;
  highlightBranch?: Branch;
  topSlot?: React.ReactNode;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleTap = (opt: { label: string; branch?: Branch }) => {
    if (selected) return;
    setSelected(opt.label);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
    onSelect(opt);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-zinc-900">
      <div className="max-w-md w-full">
        {topSlot && (
          <div className="mb-7 flex justify-center funnel-screen">{topSlot}</div>
        )}
        {questionLarge ? (
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-10 funnel-screen">{questionLarge}</h1>
        ) : question ? (
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-center mb-8 funnel-screen">{question}</h2>
        ) : null}
        <div className="space-y-3" style={{ minHeight: `${options.length * 64}px` }}>
          {options.map((opt, i) => {
            const isHighlighted = !selected && highlightBranch && opt.branch === highlightBranch;
            return (
            <button key={opt.label} onClick={() => handleTap(opt)}
              className={`w-full text-left rounded-xl border px-5 py-4 text-[15px] transition-all duration-200 active:scale-[0.98] funnel-card-stagger ${
                selected === opt.label
                  ? "border-acuity-primary bg-acuity-primary/10 text-zinc-900 animate-[funnel-pulse-select_0.2s_ease-out]"
                  : selected
                    ? "border-zinc-200 bg-zinc-50 text-zinc-700 opacity-40"
                    : isHighlighted
                      ? "border-acuity-primary/40 bg-acuity-primary/5 text-zinc-900 hover:bg-acuity-primary/10"
                      : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
              }`}
              style={{ animationDelay: `${i * 100}ms` }}
              disabled={!!selected}
            >
              {selected === opt.label && <span className="mr-2 text-acuity-primary">&#10003;</span>}
              {opt.label}
            </button>
            );
          })}
        </div>
        {normalization && (
          <p className="mt-6 text-center text-xs italic text-zinc-400 funnel-screen" style={{ animationDelay: `${options.length * 100 + 200}ms` }}>
            {normalization}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Multi Select Question Screen ───────────────────────────────────────────

function MultiSelectScreen({ question, options, normalization, onSubmit }: {
  question: string;
  options: string[];
  normalization?: string;
  onSubmit: (vals: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (opt: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(opt)) next.delete(opt); else next.add(opt);
      return next;
    });
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-zinc-900">
      <div className="max-w-md w-full">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-center mb-8 funnel-screen">{question}</h2>
        <div className="space-y-3" style={{ minHeight: `${options.length * 64}px` }}>
          {options.map((opt, i) => (
            <button key={opt} onClick={() => toggle(opt)}
              className={`w-full text-left rounded-xl border px-5 py-4 text-[15px] transition-all duration-200 active:scale-[0.98] funnel-card-stagger ${
                selected.has(opt)
                  ? "border-acuity-primary bg-acuity-primary/10 text-zinc-900"
                  : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
              }`}
              style={{ animationDelay: `${i * 100}ms` }}
            >
              {selected.has(opt) ? (
                <span className="mr-2 text-acuity-primary">&#10003;</span>
              ) : (
                <span className="mr-2 text-zinc-300">&#9711;</span>
              )}
              {opt}
            </button>
          ))}
        </div>
        {normalization && (
          <p className="mt-4 text-center text-xs italic text-zinc-400">{normalization}</p>
        )}
        {selected.size > 0 && (
          <div className="mt-6 text-center funnel-bounce">
            <button onClick={() => onSubmit([...selected])}
              className="rounded-full bg-acuity-primary px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-acuity-primary-lo active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]">
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Time-Math Screen (after Q5 duration) ───────────────────────────────────

function TimeMathScreen({ branch, answers, onContinue, onSkip }: {
  branch: Branch | null;
  answers: Record<string, string | string[]>;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const dur = String(answers.shared_q5 ?? "");
  const content = getTimeMathContent(dur, branch, String(answers.shared_q6 ?? ""));
  const isThousands = content.count === null && content.show;
  // Phases: 0=hidden, 1=kicker, 2=hero-anim-start, 3=label, 4=closer, 5=CTA
  const [phase, setPhase] = useState(0);
  const [displayNum, setDisplayNum] = useState(0);
  const [scrambleDisplay, setScrambleDisplay] = useState("");
  const [scrambleResolved, setScrambleResolved] = useState(false);
  const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Skip for short durations — immediately advance, fire no event
  useEffect(() => {
    if (!content.show) { onSkip(); return; }
    if (prefersReduced) { setPhase(5); setDisplayNum(content.count ?? 0); setScrambleResolved(true); return; }
    const t: ReturnType<typeof setTimeout>[] = [];

    if (isThousands) {
      // Thousands timeline: kicker → scramble → label → closer → CTA
      t.push(setTimeout(() => setPhase(1), 0));        // kicker fades in (500ms CSS)
      t.push(setTimeout(() => setPhase(2), 800));       // scramble starts (+300ms after kicker settles)
      t.push(setTimeout(() => setPhase(3), 2250));      // "of evenings" (+200ms after resolve at ~2050)
      t.push(setTimeout(() => setPhase(4), 3050));      // closer
      t.push(setTimeout(() => setPhase(5), 3850));      // CTA
    } else {
      // Numeric timeline: kicker → count-up → label → closer → CTA
      t.push(setTimeout(() => setPhase(1), 0));        // kicker fades in (500ms CSS)
      t.push(setTimeout(() => setPhase(2), 800));       // count-up starts
      t.push(setTimeout(() => setPhase(3), 2200));      // "evenings" (+200ms after 1200ms count finishes)
      t.push(setTimeout(() => setPhase(4), 3000));      // closer
      t.push(setTimeout(() => setPhase(5), 3800));      // CTA
    }

    return () => t.forEach(clearTimeout);
  }, [content.show, prefersReduced, onSkip, isThousands]);

  // Odometer count-up animation — numeric variant only.
  // useRef guard prevents re-fire on subsequent phase changes and
  // React 18 StrictMode double-invoke in development.
  const countUpStarted = useRef(false);
  useEffect(() => {
    if (phase < 2 || content.count === null || prefersReduced) return;
    if (countUpStarted.current) return;
    countUpStarted.current = true;
    const target = content.count;
    const duration = 1200;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const pct = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - pct, 3); // ease-out cubic
      setDisplayNum(Math.round(eased * target));
      if (pct < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [phase, content.count, prefersReduced]);

  // Digit scramble animation — thousands variant only.
  // Rapid random 4-digit numbers (~50ms/frame) for ~900ms, decelerating
  // in the final ~300ms, then resolves to the word "Thousands".
  const scrambleStarted = useRef(false);
  useEffect(() => {
    if (phase < 2 || content.count !== null || prefersReduced) return;
    if (scrambleStarted.current) return;
    scrambleStarted.current = true;

    const SCRAMBLE_DURATION = 900;
    const DECEL_START = 600;
    const startTime = performance.now();
    let lastFrameTime = 0;

    const tick = (now: number) => {
      const elapsed = now - startTime;

      if (elapsed >= SCRAMBLE_DURATION) {
        setScrambleDisplay("");
        setScrambleResolved(true);
        return;
      }

      // Frame interval: 50ms base, easing to ~200ms in final 300ms
      let interval = 50;
      if (elapsed > DECEL_START) {
        const decelPct = (elapsed - DECEL_START) / (SCRAMBLE_DURATION - DECEL_START);
        interval = 50 + decelPct * 150;
      }

      if (now - lastFrameTime >= interval) {
        // Always 4-digit for stable width with tabular-nums
        const n = 1000 + Math.floor(Math.random() * 9000);
        setScrambleDisplay(n.toLocaleString());
        lastFrameTime = now;
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [phase, content.count, prefersReduced]);

  // Tap-to-skip — jump to resolved final state
  const skip = () => {
    setPhase(5);
    if (content.count !== null) setDisplayNum(content.count);
    countUpStarted.current = true;
    scrambleStarted.current = true;
    setScrambleResolved(true);
  };

  if (!content.show) return null;

  const beat = (n: number) => phase >= n ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[12px]";

  // Ring fill percentage — animates alongside the count-up
  const ringPct = content.count !== null && content.count > 0
    ? Math.min(1, displayNum / content.count)
    : (scrambleResolved ? 1 : 0);
  const ringCircumference = 2 * Math.PI * 72; // r=72 for the SVG ring
  const ringOffset = ringCircumference * (1 - ringPct);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-zinc-900"
      onClick={phase < 5 ? skip : undefined}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes tm-ring-pulse { 0%, 100% { opacity: 0.15; transform: scale(1); } 50% { opacity: 0.3; transform: scale(1.04); } }
      `}} />
      <div className="max-w-md w-full text-center">
        {/* Kicker */}
        <div className={`mb-8 transition-all duration-500 ease-out ${beat(1)}`}>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400 mb-1">Your answers show</p>
          <p className="text-[15px] text-zinc-600">This has been running for {content.herDuration}.</p>
        </div>

        {/* Hero — number inside a ring */}
        <div className={`mb-8 transition-all duration-500 ease-out ${beat(2)}`}>
          {content.atLeast && (
            <p className={`text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-400 mb-1 transition-opacity duration-300 ${phase >= 3 ? "opacity-100" : "opacity-0"}`}>At least</p>
          )}
          <div className="relative inline-flex items-center justify-center w-[180px] h-[180px] sm:w-[200px] sm:h-[200px]">
            {/* Background ring */}
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r="72" fill="none" stroke="currentColor" strokeWidth="3" className="text-zinc-100" />
              {/* Fill ring — draws as count-up progresses */}
              <circle cx="80" cy="80" r="72" fill="none" stroke="currentColor" strokeWidth="3"
                className="text-acuity-primary transition-all duration-200"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                strokeLinecap="round" />
            </svg>
            {/* Pulse ring — appears when count lands */}
            {phase >= 3 && !prefersReduced && (
              <div className="absolute inset-0 rounded-full border-2 border-acuity-primary"
                style={{ animation: "tm-ring-pulse 2s ease-in-out 2" }} />
            )}
            {/* Number */}
            <div className="relative z-10">
              {content.count !== null ? (
                <span className="text-[56px] sm:text-[72px] font-extrabold text-zinc-900 tabular-nums leading-none">
                  {phase >= 2 ? displayNum.toLocaleString() : "0"}
                </span>
              ) : (
                !scrambleResolved ? (
                  <span className="text-[56px] sm:text-[72px] font-extrabold text-zinc-900 tabular-nums leading-none inline-block min-w-[4ch]">
                    {scrambleDisplay || "\u00A0"}
                  </span>
                ) : (
                  <span className="text-[36px] sm:text-[48px] font-extrabold text-zinc-900 leading-none inline-block"
                    style={{ animation: prefersReduced ? "none" : "funnel-scramble-resolve 350ms ease-out both" }}>
                    Thousands
                  </span>
                )
              )}
            </div>
          </div>

          {/* Label — staggered after hero resolves */}
          <div className={`mt-3 transition-all duration-300 ease-out ${beat(3)}`}>
            <span className="text-lg text-zinc-500 font-medium">{content.label}</span>
            {content.costLine && (
              <p className="text-[14px] text-zinc-500 mt-2 max-w-xs mx-auto leading-snug">{content.costLine}</p>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className={`mx-auto w-12 h-px bg-zinc-200 mb-8 transition-all duration-500 ${phase >= 4 ? "opacity-100" : "opacity-0"}`} />

        {/* Closer */}
        <div className={`mb-12 transition-all duration-[600ms] ${phase >= 4 ? "opacity-100" : "opacity-0"}`}
          style={phase >= 4 ? { animation: "funnel-settle 600ms ease-out both" } : undefined}>
          <p className="text-[17px] font-bold text-zinc-900 leading-snug">{content.headline}</p>
          <p className="text-[15px] text-zinc-500 mt-2">{content.closer}</p>
        </div>

        {/* CTA */}
        <div className={`transition-all duration-500 ${beat(5)}`}>
          <button onClick={(e) => { e.stopPropagation(); onContinue(); }}
            className="rounded-full bg-acuity-primary px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-acuity-primary-lo active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pain Screen (merged mirror + gap1 — 4-block sequential build) ──────────

function PainScreen({ branch, answers, onContinue }: {
  branch: Branch; answers: Record<string, string | string[]>; onContinue: () => void;
}) {
  const mirrorLines = buildMirrorLines(branch, answers);
  const gapContent = buildGap1Content(branch, answers);
  const [phase, setPhase] = useState(0);
  const [highlightPhase, setHighlightPhase] = useState(0);
  const maxPhase = 5;
  const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (prefersReduced) { setPhase(maxPhase); setHighlightPhase(gapContent.costWords.length); return; }
    const t: ReturnType<typeof setTimeout>[] = [];
    // Block 1 (recognition): 600ms
    t.push(setTimeout(() => setPhase(1), 600));
    // Block 2 (named want): 2200ms
    t.push(setTimeout(() => setPhase(2), 2200));
    // Block 3 (cost + highlight): 3800ms
    t.push(setTimeout(() => setPhase(3), 3800));
    // Highlight sweep on cost word
    gapContent.costWords.forEach((_, i) => {
      t.push(setTimeout(() => setHighlightPhase(i + 1), 3800 + 500 + i * 250));
    });
    // Block 4 (stakes + closer): 5400ms
    t.push(setTimeout(() => setPhase(4), 5400));
    // CTA: 6400ms
    t.push(setTimeout(() => setPhase(maxPhase), 6400));
    return () => t.forEach(clearTimeout);
  }, [prefersReduced, gapContent.costWords.length]);

  const skip = () => { setPhase(maxPhase); setHighlightPhase(gapContent.costWords.length); };
  const beat = (n: number) => phase >= n ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[12px]";

  // Render cost line with highlighted word
  const renderCostLine = () => {
    if (gapContent.costWords.length === 0) return gapContent.line1;
    const parts: (string | { word: string; idx: number })[] = [];
    let remaining = gapContent.line1;
    gapContent.costWords.forEach((word, i) => {
      const idx = remaining.indexOf(word);
      if (idx >= 0) {
        if (idx > 0) parts.push(remaining.slice(0, idx));
        parts.push({ word, idx: i });
        remaining = remaining.slice(idx + word.length);
      }
    });
    if (remaining) parts.push(remaining);
    return parts.map((p, i) =>
      typeof p === "string" ? <span key={i}>{p}</span> : (
        <span key={i} className={`gap-highlight ${highlightPhase > p.idx ? "sweep" : ""}`}
          style={highlightPhase > p.idx ? { animationDelay: `${p.idx * 250}ms` } : undefined}>
          {p.word}
        </span>
      )
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-zinc-900"
      onClick={phase < maxPhase ? skip : undefined}>
      <div className="max-w-md w-full">

        {/* Block 1: Recognition (from mirror beat 1) */}
        <div className={`mb-8 border-l-2 border-acuity-primary/40 pl-5 transition-all duration-[600ms] ease-out ${beat(1)}`}>
          <p className="text-[15px] text-zinc-700 leading-relaxed">{mirrorLines[0]}</p>
        </div>

        {/* Block 2: Named want (from mirror beat 2) */}
        <div className={`mb-10 border-l-2 border-acuity-primary/40 pl-5 transition-all duration-[600ms] ease-out ${beat(2)}`}>
          <p className="text-[15px] text-zinc-700 leading-relaxed">{mirrorLines[1]}</p>
        </div>

        {/* Block 3: The cost (from gap1 — with highlighted area word) */}
        <div className={`mb-8 transition-all duration-[600ms] ease-out ${beat(3)}`}>
          <p className="text-xl sm:text-2xl font-bold text-zinc-900 leading-[1.5] text-center">{renderCostLine()}</p>
          <div className={`mt-4 transition-all duration-500 ${phase >= 3 ? "opacity-70" : "opacity-0"}`} style={{ transitionDelay: "400ms" }}>
            <p className="text-[14px] text-zinc-500 leading-relaxed text-center">{gapContent.line2}</p>
          </div>
        </div>

        {/* Block 4: Stakes + closer */}
        <div className={`mb-10 ${phase >= 4 ? "" : "opacity-0"}`}
          style={phase >= 4 ? { animation: "funnel-settle 600ms ease-out both" } : undefined}>
          <p className="text-[17px] font-bold text-zinc-900 text-center mb-4">{gapContent.line3}</p>
          <p className="text-lg font-bold text-zinc-900 text-center">You don&rsquo;t have to keep living like this.</p>
        </div>

        {/* CTA */}
        <div className={`text-center transition-all duration-500 ${beat(maxPhase)}`}>
          <button onClick={(e) => { e.stopPropagation(); onContinue(); }}
            className="rounded-full bg-acuity-primary px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-acuity-primary-lo active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]">
            Keep going
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Gap 2: "How would it feel?" (interactive multi-select) ─────────────────

function Gap2Screen({ branch, answers, track, onContinue }: {
  branch: Branch; answers: Record<string, string | string[]>;
  track: (event: string, props?: Record<string, unknown>) => void;
  onContinue: (feelings: string[]) => void;
}) {
  const header = getGap2Header(branch, answers);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pulseCta, setPulseCta] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      // Pulse the CTA on first selection
      if (prev.size === 0 && next.size === 1) {
        setPulseCta(true);
        setTimeout(() => setPulseCta(false), 400);
      }
      return next;
    });
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-zinc-900">
      <div className="max-w-md w-full">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-center mb-8 leading-snug funnel-screen">{header}</h2>
        {/* Full-width option cards matching quiz style */}
        <div className="space-y-3 mb-4">
          {GAP2_FEELINGS.map((f, i) => {
            const isSelected = selected.has(f.id);
            return (
              <button key={f.id} onClick={() => toggle(f.id)}
                className={`w-full text-left rounded-xl border px-5 py-4 text-[15px] transition-all duration-200 active:scale-[0.98] funnel-card-stagger ${
                  isSelected
                    ? "border-acuity-primary bg-acuity-primary/10 text-zinc-900"
                    : "border-zinc-200 bg-white/70 text-zinc-700 hover:bg-zinc-100/80"
                }`}
                style={{ animationDelay: `${i * 80}ms` }}>
                <span className="flex items-center justify-between">
                  <span>{f.label}</span>
                  {isSelected && (
                    <span className="ml-2 text-acuity-primary flex-shrink-0"
                      style={{ animation: "funnel-check-pop 250ms ease-out both" }}>
                      &#10003;
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-zinc-400 text-center mb-5">
          {selected.size > 0 ? `${selected.size} selected` : "Select all that resonate."}
        </p>
        <div className="text-center">
          <button onClick={() => onContinue([...selected])} disabled={selected.size === 0}
            className={`rounded-full bg-acuity-primary px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-acuity-primary-lo active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed animate-[funnel-glow_2s_ease-in-out_infinite] ${pulseCta ? "animate-[funnel-soft-pulse_400ms_ease-out]" : ""}`}>
            That&rsquo;s what I want
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Gap 3: "Your future self" (time-lapse, not an essay) ──────────────────

function Gap3Screen({ answers, track, onContinue }: {
  answers: Record<string, string | string[]>;
  track: (event: string, props?: Record<string, unknown>) => void;
  onContinue: () => void;
}) {
  const feelings = Array.isArray(answers.gap2_feelings) ? answers.gap2_feelings : [];
  const lines = buildGap3Lines(feelings);
  const [phase, setPhase] = useState(0);
  const [showDismiss, setShowDismiss] = useState(false);
  const [dismissPhase, setDismissPhase] = useState(0);
  const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Total phases: 0=nothing, 1=kicker, 2..N+1=scene beats, N+2=ask, N+3=yes CTA, N+4=no button
  const askPhase = lines.length + 2;
  const yesPhase = lines.length + 3;
  const noPhase = lines.length + 4;

  useEffect(() => {
    if (prefersReduced) { setPhase(noPhase); return; }
    const t: ReturnType<typeof setTimeout>[] = [];
    // Kicker: 0ms
    t.push(setTimeout(() => setPhase(1), 0));
    // Scene beats: 700ms for kicker to land, then 1600ms per beat
    for (let i = 0; i < lines.length; i++) {
      t.push(setTimeout(() => setPhase(i + 2), 700 + i * 1600));
    }
    // Ask: 500ms pause after last beat
    t.push(setTimeout(() => setPhase(askPhase), 700 + lines.length * 1600 + 500));
    // Yes CTA: immediately after ask settles
    t.push(setTimeout(() => setPhase(yesPhase), 700 + lines.length * 1600 + 1100));
    // No button: 400ms after yes
    t.push(setTimeout(() => setPhase(noPhase), 700 + lines.length * 1600 + 1500));
    return () => t.forEach(clearTimeout);
  }, [lines.length, prefersReduced, askPhase, yesPhase, noPhase]);

  const skip = () => setPhase(noPhase);

  // Render a line with the bold key phrase in semibold
  const renderLine = (line: Gap3Line) => {
    const idx = line.text.indexOf(line.bold);
    if (idx < 0) return line.text;
    return (
      <>
        {line.text.slice(0, idx)}
        <span className="font-semibold text-zinc-900">{line.bold}</span>
        {line.text.slice(idx + line.bold.length)}
      </>
    );
  };

  const handleYes = () => {
    track("funnel_gap3_answered", { value: "yes" });
    onContinue();
  };
  const handleNo = () => {
    track("funnel_gap3_answered", { value: "no" });
    setShowDismiss(true);
    setTimeout(() => setDismissPhase(1), 100);
  };

  if (showDismiss) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-zinc-900">
        <div className="max-w-md w-full text-center">
          <div className={`transition-all duration-500 ease-out ${dismissPhase >= 1 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[12px]"}`}>
            <p className="text-[15px] text-zinc-600 leading-relaxed mb-8">{GAP3_DISMISS_COPY}</p>
            <button onClick={onContinue}
              className="rounded-full bg-acuity-primary px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-acuity-primary-lo active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]">
              Okay, show me how it works
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Determine if ask is showing — dim all scene beats
  const askVisible = phase >= askPhase;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-zinc-900"
      onClick={phase < noPhase ? skip : undefined}>
      <div className="max-w-md w-full">
        {/* Kicker — film title card */}
        <p className={`text-[11px] uppercase tracking-[0.2em] text-zinc-400 text-center mb-8 transition-all duration-[700ms] ease-out ${phase >= 1 ? "opacity-100" : "opacity-0"}`}>
          Three weeks from now
        </p>

        {/* Scene beats — dim-cascade, each as a distinct visual block */}
        {lines.map((line, i) => {
          const beatPhase = i + 2;
          // Current beat is bright, past beats dim to 45%, all dim to 35% when ask shows
          let opacity: number;
          if (phase < beatPhase) opacity = 0;
          else if (askVisible) opacity = 0.35;
          else if (phase === beatPhase) opacity = 1;
          else opacity = 0.45; // past beat

          return (
            <div key={i}
              className={`mb-5 rounded-xl border border-zinc-100 bg-white/60 px-5 py-4 transition-all duration-[800ms] ease-out ${phase >= beatPhase ? "translate-y-0" : "translate-y-[12px]"}`}
              style={{ opacity }}>
              <p className="text-[15px] text-zinc-700 leading-relaxed">{renderLine(line)}</p>
            </div>
          );
        })}

        {/* The ask — with heavier settle animation */}
        <div className={`mt-6 text-center transition-all duration-500 ${askVisible ? "opacity-100" : "opacity-0"}`}
          style={askVisible ? { animation: "funnel-settle 600ms ease-out both" } : undefined}>
          <p className="text-lg font-bold text-zinc-900 mb-6">Are you ready to make a lasting change?</p>
        </div>

        {/* Yes CTA with soft pulse */}
        <div className={`text-center transition-all duration-500 ${phase >= yesPhase ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[12px]"}`}
          style={phase === yesPhase ? { animation: "funnel-soft-pulse 400ms ease-out" } : undefined}>
          <button onClick={(e) => { e.stopPropagation(); handleYes(); }}
            className="rounded-full bg-acuity-primary px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-acuity-primary-lo active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]">
            Yes &mdash; how does it work?
          </button>
        </div>

        {/* No button — 400ms after yes */}
        <div className={`text-center mt-3 transition-all duration-500 ${phase >= noPhase ? "opacity-100" : "opacity-0"}`}>
          <button onClick={(e) => { e.stopPropagation(); handleNo(); }}
            className="text-sm text-zinc-400 hover:text-zinc-600 transition py-2">
            No, maybe next year
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mechanism Screen (Product Explainer — branch-personalized) ─────────────

const MECHANISM_WAVE_HEIGHTS = [12,20,28,16,32,24,30,14,22,34,18,26,20,30,14,24,18,28];

interface MechBranchContent {
  cards: (q2: string) => { text: string; icon: string }[];
  step3Sub: string;
  insight: string;
}

const MECH_CONTENT: Record<Branch, MechBranchContent> = {
  blur: {
    cards: () => [
      { text: "Block 30 minutes for the thing you keep postponing", icon: "\u25A1" },
      { text: "Notice what actually mattered \u2014 Day 1", icon: "\u25B2" },
      { text: "Foggy \u2192 Aware", icon: "\u25CF" },
      { text: "You described 3 days as \u2018fine\u2019 but couldn\u2019t name a single highlight", icon: "\u25C6" },
    ],
    step3Sub: "",
    insight: "Your \u2018fine\u2019 days had zero unstructured time. Your best day had 2 hours of nothing planned.",
  },
  patterns: {
    cards: (q2) => {
      const who = q2.includes("partner") ? "your partner" : q2.includes("work") ? "your colleague" : q2.includes("family") ? "your family" : "them";
      const cycle = q2.replace(/^The same /i, "").replace(/ with.*/, "").toLowerCase();
      return [
        { text: `Talk to ${who} about what happened Tuesday`, icon: "\u25A1" },
        { text: `Break the ${cycle || "cycle"} cycle \u2014 Day 1`, icon: "\u25B2" },
        { text: "Frustrated \u2192 Aware", icon: "\u25CF" },
        { text: "The tension started 2 days before the argument \u2014 every time", icon: "\u25C6" },
      ];
    },
    step3Sub: "",
    insight: "The argument happened Tuesday. The tension started Sunday. Same pattern, 3 weeks in a row.",
  },
  rumination: {
    cards: () => [
      { text: "Write down the 3 thoughts that keep looping", icon: "\u25A1" },
      { text: "Process what\u2019s on my mind \u2014 Day 1", icon: "\u25B2" },
      { text: "Racing \u2192 Settled", icon: "\u25CF" },
      { text: "Your spiral starts with something that happened 8 hours earlier", icon: "\u25C6" },
    ],
    step3Sub: "",
    insight: "You were calmest on the day you processed out loud before the evening.",
  },
  graveyard: {
    cards: (q2) => {
      const tool = q2 || "what hasn\u2019t worked";
      return [
        { text: `Give this 7 days before deciding \u2014 instead of ${tool.charAt(0).toLowerCase() + tool.slice(1)}`, icon: "\u25A1" },
        { text: "Show up for 60 seconds \u2014 Day 1", icon: "\u25B2" },
        { text: "Skeptical \u2192 Curious", icon: "\u25CF" },
        { text: "You\u2019ve quit every tool on Day 4. There\u2019s a reason for that.", icon: "\u25C6" },
      ];
    },
    step3Sub: "",
    insight: "Day 4 is when you almost quit. Every tool. Every time. Now you know when to push through.",
  },
  mask: {
    cards: () => [
      { text: "Tell one person how you actually feel", icon: "\u25A1" },
      { text: "Check in with how I actually feel \u2014 Day 1", icon: "\u25B2" },
      { text: "Performing \u2192 Honest", icon: "\u25CF" },
      { text: "You said \u2018I\u2019m fine\u2019 on your lowest days. Every time.", icon: "\u25C6" },
    ],
    step3Sub: "",
    insight: "Your energy for everyone else averaged 8/10. For yourself: 3/10. Every single day.",
  },
  drift: {
    cards: () => [
      { text: "Name one thing you used to care about", icon: "\u25A1" },
      { text: "Reconnect with what matters \u2014 Day 1", icon: "\u25B2" },
      { text: "Numb \u2192 Present", icon: "\u25CF" },
      { text: "You talked about who you used to be twice. Who you want to become \u2014 zero times.", icon: "\u25C6" },
    ],
    step3Sub: "",
    insight: "Your highest energy was Sunday morning. By Monday evening, gone. The reset happens every week.",
  },
};

function MechanismScreen({ branch, answers, onContinue, track }: {
  branch: Branch; answers: Record<string, string | string[]>; onContinue: () => void;
  track: (event: string, props?: Record<string, unknown>) => void;
}) {
  const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const content = MECH_CONTENT[branch];
  const q2 = typeof answers.branch_q2 === "string" ? answers.branch_q2 : "";
  const cards = content.cards(q2);

  const mechanismStyles = `
    @keyframes mech-wave {
      0%, 100% { transform: scaleY(0.3); }
      50% { transform: scaleY(1); }
    }
    @keyframes mech-dot-fill {
      from { transform: scale(0); }
      to { transform: scale(1); }
    }
    @keyframes mech-line-grow {
      from { transform: scaleX(0); }
      to { transform: scaleX(1); }
    }
  `;

  const fadeUp = (delay: number) => prefersReducedMotion
    ? {} : { animation: `funnel-slide-up 600ms cubic-bezier(0.215,0.61,0.355,1) ${delay}ms both` };
  const fadeUpShort = (delay: number) => prefersReducedMotion
    ? {} : { animation: `funnel-slide-up 400ms cubic-bezier(0.215,0.61,0.355,1) ${delay}ms both` };

  return (
    <div className="min-h-[100dvh] overflow-y-auto px-6 py-10 bg-white text-zinc-900">
      <style dangerouslySetInnerHTML={{ __html: mechanismStyles }} />

      {/* Headline */}
      <h2 className="mb-9 text-center text-[26px] font-bold leading-[33px] tracking-tight text-zinc-900" style={fadeUp(0)}>
        One minute. Every day.<br />That&rsquo;s all it takes.
      </h2>

      {/* ── STEP 1: TALK ── */}
      <div className="mb-8" style={fadeUp(800)}>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-acuity-primary">Step 1</p>
        <p className="mb-1.5 text-xl font-bold text-zinc-900">Talk for 60 seconds.</p>
        <p className="mb-4 text-sm leading-5 text-zinc-500">About whatever&rsquo;s on your mind &mdash; and get it out of your head, where it&rsquo;s been costing you sleep and patience.</p>
        <div className="flex items-end gap-[4px]" style={{ height: 40 }}>
          {MECHANISM_WAVE_HEIGHTS.map((h, i) => (
            <div key={i} className="w-[3px] origin-bottom rounded-full bg-acuity-primary-hi"
              style={{ height: h, animation: prefersReducedMotion ? "none" : `mech-wave ${600 + (i % 5) * 80}ms ease-in-out ${i * 40}ms infinite alternate` }} />
          ))}
        </div>
      </div>

      {/* ── STEP 2: WE EXTRACT (branch-personalized) ── */}
      <div className="mb-8" style={fadeUp(2200)}>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-acuity-primary">Step 2</p>
        <p className="mb-1.5 text-xl font-bold text-zinc-900">Acuity pulls out what matters.</p>
        <p className="mb-4 text-sm leading-5 text-zinc-500">Tasks, goals, moods, patterns &mdash; so nothing you said falls through the cracks, and nothing sits on your shoulders alone.</p>
        <div className="space-y-2">
          {cards.map((c, i) => (
            <div key={i} className="flex items-center rounded-xl border-l-[3px] border-acuity-primary bg-white px-3.5 py-3 shadow-sm"
              style={fadeUpShort(2200 + 600 + i * 200)}>
              <span className="mr-2.5 text-[13px] font-semibold text-acuity-primary">{c.icon}</span>
              <span className="text-[13px] font-medium leading-[18px] text-zinc-900">{c.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── STEP 3: YOUR PICTURE (branch-personalized) ── */}
      <div className="mb-8" style={fadeUp(3800)}>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-acuity-primary">Step 3</p>
        <p className="mb-1.5 text-xl font-bold text-zinc-900">See the patterns running your weeks.</p>
        <p className="mb-5 text-sm leading-5 text-zinc-500">Within a few debriefs, Acuity starts showing you the patterns you can&rsquo;t see from inside them. Seeing them is how they finally change.</p>
        <div className="mb-4 flex items-center justify-between px-2">
          {["M","T","W","T","F","S","S"].map((d, i) => {
            const filled = i < 5;
            const dotDelay = 3800 + 600 + i * 100;
            return (
              <div key={i} className="flex flex-col items-center">
                <div className="relative flex items-center">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] ${filled ? "border-acuity-primary-hi" : "border-zinc-200"}`}>
                    {filled && (
                      <div className="h-[18px] w-[18px] rounded-full bg-acuity-primary"
                        style={prefersReducedMotion ? {} : { animation: `mech-dot-fill 300ms cubic-bezier(0.215,0.61,0.355,1) ${dotDelay}ms both` }} />
                    )}
                  </div>
                  {filled && i < 4 && (
                    <div className="h-0.5 w-2 origin-left bg-acuity-primary-hi"
                      style={prefersReducedMotion ? {} : { animation: `mech-line-grow 200ms cubic-bezier(0.215,0.61,0.355,1) ${dotDelay + 200}ms both` }} />
                  )}
                </div>
                <span className={`mt-1 text-[9px] font-semibold ${filled ? "text-zinc-500" : "text-zinc-400"}`}>{d}</span>
              </div>
            );
          })}
        </div>
        <div className="rounded-xl border-l-[3px] border-acuity-primary bg-acuity-primary-soft px-3.5 py-3"
          style={fadeUpShort(3800 + 600 + 500 + 500)}>
          <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.06em] text-acuity-primary">Weekly insight</p>
          <p className="text-[13px] font-medium leading-[18px] text-zinc-900">{content.insight}</p>
        </div>
      </div>

      {/* ── Closing line ── */}
      <p className="mb-6 text-center text-base font-bold italic text-zinc-900" style={fadeUp(5000)}>
        You already think about your life every day. Acuity just makes sure it counts.
      </p>

      {/* ── Social proof — reused real testimonial validating the weekly-report mechanism ── */}
      <div className="mx-auto mb-6 max-w-md" style={fadeUp(5400)}>
        <SocialProofQuote track={track} placement="mechanism" testimonial={PAYWALL_TESTIMONIALS_V2[0]} />
      </div>

      {/* ── Continue button — always visible from mount, never gated behind animations ── */}
      <div className="text-center">
        <button onClick={onContinue}
          className="rounded-full bg-acuity-primary px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-acuity-primary-lo active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]">
          Continue
        </button>
      </div>
    </div>
  );
}

// ─── What It Gives You (Screen 11b — value surfaces) ────────────────────────

const VALUE_FEATURES = [
  {
    icon: "\u2611",
    title: "Active task tracking",
    description: "Tasks pulled from your words, tracked until done. Your life stops falling through the cracks.",
  },
  {
    icon: "\u25CE",
    title: "Life Matrix",
    description: "Six life domains scored by your own words. See where you\u2019re thriving and where you\u2019re slipping \u2014 every week.",
  },
  {
    icon: "\u2B06",
    title: "Habit tracking and goal achievement",
    description: "Goals you mention get tracked without you managing them. Streaks and milestones reinforce the habit.",
  },
  {
    icon: "\u25A8",
    title: "Weekly report",
    description: "A written narrative of your week \u2014 the throughline you\u2019d never assemble yourself. Delivered every Sunday.",
  },
  {
    icon: "\u25C6",
    title: "Signals",
    description: "Next-step guidance that monitors the patterns running underneath \u2014 the ones you can\u2019t see from inside them.",
  },
];

function ValueScreen({ onContinue }: { onContinue: () => void }) {
  const [vis, setVis] = useState(0);
  const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (prefersReduced) { setVis(VALUE_FEATURES.length + 1); return; }
    const t: ReturnType<typeof setTimeout>[] = [];
    VALUE_FEATURES.forEach((_, i) => {
      t.push(setTimeout(() => setVis(i + 1), 400 + i * 350));
    });
    // CTA after all features
    t.push(setTimeout(() => setVis(VALUE_FEATURES.length + 1), 400 + VALUE_FEATURES.length * 350 + 300));
    return () => t.forEach(clearTimeout);
  }, [prefersReduced]);

  return (
    <div className="min-h-[100dvh] overflow-y-auto px-6 py-10 bg-white text-zinc-900">
      <h2 className="mb-2 text-center text-[26px] font-bold leading-[33px] tracking-tight text-zinc-900 funnel-screen">
        What it gives you.
      </h2>
      <p className="mb-8 text-center text-sm text-zinc-500">Every debrief builds a clearer picture of your life.</p>

      <div className="max-w-md mx-auto space-y-4 mb-10">
        {VALUE_FEATURES.map((f, i) => (
          <div key={i}
            className={`rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-sm transition-all duration-500 ${vis > i ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            <div className="flex items-start gap-3">
              <span className="text-lg text-acuity-primary mt-0.5 flex-shrink-0">{f.icon}</span>
              <div>
                <p className="text-[14px] font-bold text-zinc-900 leading-tight">{f.title}</p>
                <p className="text-[13px] text-zinc-500 leading-snug mt-1">{f.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className={`text-center transition-all duration-500 ${vis > VALUE_FEATURES.length ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
        <button onClick={onContinue}
          className="rounded-full bg-acuity-primary px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-acuity-primary-lo active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]">
          Continue
        </button>
      </div>
    </div>
  );
}

// ─── Hold-to-Commit Screen (Screen 12) ──────────────────────────────────────

function CommitmentScreen({ track, onComplete }: { track: (event: string) => void; onComplete: () => void }) {
  const [holding, setHolding] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [abandonCount, setAbandonCount] = useState(0);
  const ringRef = useRef<SVGCircleElement>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const holdingRef = useRef(false);
  const completedRef = useRef(false);

  const CIRCUMFERENCE = 2 * Math.PI * 54;
  const DURATION = 3000;

  const animateRing = () => {
    if (!holdingRef.current || completedRef.current) return;
    const elapsed = Date.now() - startTimeRef.current;
    const pct = Math.min(1, elapsed / DURATION);
    if (ringRef.current) {
      ringRef.current.style.strokeDashoffset = `${CIRCUMFERENCE * (1 - pct)}`;
    }
    if (pct >= 1) {
      completedRef.current = true;
      holdingRef.current = false;
      setHolding(false);
      setCompleted(true);
      track("funnel_commit_completed");
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([30, 50, 30]);
      import("canvas-confetti").then((mod) => {
        const confetti = mod.default;
        confetti({ particleCount: 100, spread: 80, origin: { y: 0.5 }, colors: ["#7C5CFC", "#A78BFA", "#C4B5FD", "#F59E0B", "#22C55E"] });
        setTimeout(() => confetti({ particleCount: 50, spread: 100, origin: { y: 0.4, x: 0.3 } }), 200);
        setTimeout(() => confetti({ particleCount: 50, spread: 100, origin: { y: 0.4, x: 0.7 } }), 350);
      });
      setTimeout(onComplete, 800);
      return;
    }
    rafRef.current = requestAnimationFrame(animateRing);
  };

  const startHold = () => {
    if (completedRef.current) return;
    holdingRef.current = true;
    setHolding(true);
    startTimeRef.current = Date.now();
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([10, 50, 10, 50, 10]);
    rafRef.current = requestAnimationFrame(animateRing);
  };

  const endHold = () => {
    if (!holdingRef.current || completedRef.current) return;
    holdingRef.current = false;
    setHolding(false);
    cancelAnimationFrame(rafRef.current);
    if (ringRef.current) {
      ringRef.current.style.transition = "stroke-dashoffset 0.3s ease-out";
      ringRef.current.style.strokeDashoffset = `${CIRCUMFERENCE}`;
      setTimeout(() => { if (ringRef.current) ringRef.current.style.transition = ""; }, 300);
    }
    setAbandonCount((c) => { const n = c + 1; if (n >= 3) track("funnel_commit_abandoned"); return n; });
  };

  useEffect(() => { return () => cancelAnimationFrame(rafRef.current); }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-zinc-900 select-none">
      <div className="max-w-md text-center">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-12">Hold to commit to 60 seconds a day</h2>
        <div className="relative inline-flex items-center justify-center">
          <svg className="h-40 w-40" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="#d4d4d8" strokeWidth="4" />
            <circle ref={ringRef} cx="60" cy="60" r="54" fill="none" stroke="var(--acuity-primary)" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE}
              transform="rotate(-90 60 60)" />
          </svg>
          <button
            onPointerDown={startHold} onPointerUp={endHold} onPointerLeave={endHold} onPointerCancel={endHold}
            onTouchStart={(e) => { e.preventDefault(); startHold(); }} onTouchEnd={endHold}
            onContextMenu={(e) => e.preventDefault()}
            className={`absolute inset-4 rounded-full bg-acuity-primary/10 border-2 border-zinc-300 flex items-center justify-center transition active:bg-acuity-primary/15 ${!holding && !completed ? "animate-[funnel-breathe_2s_ease-in-out_infinite]" : ""}`}
            aria-label="Hold to commit" style={{ touchAction: "none", WebkitTouchCallout: "none", userSelect: "none" }}>
            <span className="text-3xl">{completed ? "\u2713" : ""}</span>
          </button>
        </div>
        <p className="mt-8 text-xs text-zinc-400">{holding ? "Keep holding\u2026" : "Press and hold the circle"}</p>
      </div>
    </div>
  );
}

// ─── Processing Theater (Screen 12) ─────────────────────────────────────────

function ProcessingTheater({ onComplete }: { onComplete: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const [showSocial, setShowSocial] = useState(false);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const s = (Date.now() - startRef.current) / 1000;
      setElapsed(s);
      if (s >= 10) { clearInterval(interval); onComplete(); }
    }, 100);
    const socialTimer = setTimeout(() => setShowSocial(true), 4000);
    return () => { clearInterval(interval); clearTimeout(socialTimer); };
  }, [onComplete]);

  const stage = PROCESSING_STAGES.find((s) => elapsed < s.endSec) ?? PROCESSING_STAGES[PROCESSING_STAGES.length - 1];
  const pct = Math.min(100, (elapsed / 10) * 100);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-zinc-900">
      <div className="max-w-md w-full text-center funnel-screen">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-8">Building your insight profile&hellip;</h2>
        <div className="mx-auto w-64 mb-6">
          <div className="h-2 w-full rounded-full bg-zinc-200 overflow-hidden">
            <div className="h-full bg-acuity-primary rounded-full transition-all duration-300 ease-out" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <p className="text-sm text-zinc-500 h-6 transition-opacity duration-300">{stage.text}</p>
        <div className={`mt-10 transition-all duration-500 ${showSocial ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
          <p className="text-xs text-zinc-400 italic">Join thousands who discovered patterns they couldn&rsquo;t see.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Pattern Result (Screen 13 — deterministic label reveal) ─────────────────

function PatternResultScreen({ branch, answers, track, onContinue }: {
  branch: Branch; answers: Record<string, string | string[]>;
  track: (event: string, props?: Record<string, unknown>) => void;
  onContinue: () => void;
}) {
  const labels = getPatternLabels(branch, answers);
  const [vis, setVis] = useState(0);
  const firedRef = useRef(false);

  useEffect(() => {
    // Fire analytics event once
    if (!firedRef.current) {
      firedRef.current = true;
      track("funnel_pattern_assigned", {
        primary: labels.primary,
        secondary: labels.secondary,
        area: labels.area,
        area_fallback: labels.areaFallback,
        branch,
        duration: String(answers.shared_q5 ?? ""),
        stuck_deep_override: labels.stuckDeepOverride,
        collision_suppressed: labels.collisionSuppressed,
      });
    }
  }, [labels, branch, answers, track]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= 6; i++) timers.push(setTimeout(() => setVis(i), 400 + i * 600));
    return () => timers.forEach(clearTimeout);
  }, []);

  const show = (at: number) => vis >= at ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4";

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 text-zinc-900">
      <div className="max-w-md w-full">

        {/* ── Hero: Primary Pattern in its own box (the centerpiece) ── */}
        <div className={`mb-6 rounded-2xl border-2 border-acuity-primary/30 bg-acuity-primary/5 px-6 py-7 text-center transition-all duration-[800ms] ${show(1)}`}>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-acuity-primary mb-3">Your pattern</p>
          <h2 className="text-[32px] sm:text-[40px] font-extrabold tracking-tight text-zinc-900 leading-[1.1]">{labels.primary}</h2>
        </div>

        {/* ── Description: loop line + reframe, directly under the pattern ── */}
        <div className={`mb-6 rounded-xl bg-zinc-50 border border-zinc-200 px-5 py-4 transition-all duration-[800ms] ${show(2)}`}>
          <p className="text-[15px] font-semibold italic text-zinc-700 leading-relaxed">&ldquo;{labels.loopLine}&rdquo;</p>
        </div>
        <div className={`mb-8 transition-all duration-[800ms] ${show(3)}`}>
          <p className="text-[15px] text-zinc-700 leading-relaxed">{labels.bodyCopy}</p>
        </div>

        {/* ── Secondary + Area — prominent cards side by side ── */}
        <div className={`grid ${labels.secondaryVisible && labels.secondary ? "grid-cols-2" : "grid-cols-1"} gap-3 mb-8 transition-all duration-[800ms] ${show(4)}`}>
          {labels.secondaryVisible && labels.secondary && (
            <div className="rounded-xl border-2 border-zinc-200 bg-zinc-50/80 p-4 text-center">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-400 mb-1.5">Secondary signal</p>
              <p className="text-lg font-bold text-zinc-800">{labels.secondary}</p>
            </div>
          )}
          <div className="rounded-xl border-2 border-acuity-primary/30 bg-acuity-primary/5 p-4 text-center">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-400 mb-1.5">Most affected area</p>
            <p className="text-lg font-bold text-acuity-primary">{labels.area}</p>
          </div>
        </div>

        {/* ── How Acuity Helps — actionable, breaking-free focused ── */}
        <div className={`mb-10 transition-all duration-[800ms] ${show(5)}`}>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400 mb-4">How Acuity helps</p>
          <div className="space-y-3">
            {[
              { label: "Surface the triggers you can\u2019t see from inside the pattern", icon: "\u25C6" },
              { label: "Track the tasks and goals that keep slipping through", icon: "\u2611" },
              { label: "Show you which life areas are draining and which are growing", icon: "\u25CE" },
              { label: "Catch subconscious patterns before they run another week", icon: "\u25C8" },
              { label: "Give you a weekly mirror \u2014 so you stop guessing and start seeing", icon: "\u25A8" },
            ].map((item, i) => (
              <div key={i} className={`flex items-start gap-3 transition-all duration-500 ${vis >= 5 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
                style={{ transitionDelay: `${i * 120}ms` }}>
                <span className="text-acuity-primary text-sm mt-0.5 flex-shrink-0">{item.icon}</span>
                <p className="text-[14px] text-zinc-700 leading-snug">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className={`text-center transition-all duration-500 ${show(6)}`}>
          <button onClick={onContinue}
            className="rounded-full bg-acuity-primary px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-acuity-primary-lo active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]">
            See what Acuity finds &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Personalized Timeline (Screen 14 — includes weekly-report previews) ────

function TimelineScreen({ branch, answers, onContinue, track }: { branch: Branch; answers: Record<string, string | string[]>; onContinue: () => void; track: (event: string, props?: Record<string, unknown>) => void }) {
  const weeks = getTimelineWeeks(branch, answers);
  const previews = SNAPSHOT_PREVIEWS[branch];
  const bottomLine = SNAPSHOT_BOTTOM[branch];
  const [visibleNodes, setVisibleNodes] = useState(0);
  const [showPreviews, setShowPreviews] = useState(false);
  const [showBottom, setShowBottom] = useState(false);
  const [showBtn, setShowBtn] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    weeks.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleNodes(i + 1), 600 + i * 900));
    });
    const timelineEnd = 600 + weeks.length * 900;
    // Weekly-report previews appear after timeline completes
    timers.push(setTimeout(() => setShowPreviews(true), timelineEnd + 400));
    // Bottom line after previews settle
    timers.push(setTimeout(() => setShowBottom(true), timelineEnd + 400 + previews.length * 400 + 400));
    // CTA after bottom line
    timers.push(setTimeout(() => setShowBtn(true), timelineEnd + 400 + previews.length * 400 + 1000));
    return () => timers.forEach(clearTimeout);
  }, [weeks.length, previews.length]);

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-16 text-zinc-900">
      <div className="max-w-md w-full">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-center mb-10 funnel-screen">
          This is what changes.
        </h2>

        {/* Week-by-week timeline */}
        <div className="relative mb-10">
          <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-zinc-200 overflow-hidden">
            <div className="w-full bg-acuity-primary transition-all duration-700" style={{ height: `${(visibleNodes / weeks.length) * 100}%` }} />
          </div>
          <div className="space-y-6">
            {weeks.map((w, i) => (
              <div key={i} className={`relative pl-10 transition-all duration-500 ${i < visibleNodes ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
                <div className={`absolute left-1 top-1 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                  i < visibleNodes ? "border-acuity-primary bg-acuity-primary/10 scale-100" : "border-zinc-200 bg-white scale-75"
                }`}>
                  {i === 0 && visibleNodes > 0 ? (
                    <svg className="h-3 w-3 text-acuity-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-acuity-primary" />
                  )}
                </div>
                <p className="text-sm text-zinc-700"><span className="font-bold">{w.week}:</span> {w.text}</p>
                {w.badge && <span className="text-[11px] text-acuity-primary font-medium">{w.badge}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Weekly-report previews — migrated from snapshot, the critical proof beat */}
        <div className={`mb-8 transition-all duration-[800ms] ${showPreviews ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400 mb-4">What one week actually looks like</p>
          <div className="space-y-3">
            {previews.map((p, i) => (
              <div key={i} className={`rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-3 transition-all duration-500 ${showPreviews ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
                style={{ borderLeft: "3px solid var(--acuity-primary)", transitionDelay: showPreviews ? `${i * 400}ms` : "0ms" }}>
                <p className="text-xs text-zinc-600 leading-relaxed font-mono">{p}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom line — branch-specific closer */}
        <div className={`mb-8 text-center transition-all duration-[800ms] ${showBottom ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <p className="text-base font-semibold text-zinc-900 leading-relaxed">{bottomLine}</p>
        </div>

        {/* Social proof — the 4.9 / 127+ reviews rating (mirrors the Download screen) */}
        {showBottom && (
          <div className="mb-8 text-center funnel-screen">
            <SocialProofRating track={track} placement="timeline" />
          </div>
        )}

        <div className={`text-center transition-all duration-300 ${showBtn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <button onClick={onContinue}
            className="rounded-full bg-acuity-primary px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-acuity-primary-lo active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Account Screen (Screen 16 — v3 account-first flow) ────────────

function CreateAccountScreen({ branch, answers, track, onAccountCreated }: {
  branch: Branch | null;
  answers: Record<string, string | string[]>;
  track: (event: string, props?: Record<string, unknown>) => void;
  onAccountCreated: () => void;
}) {
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signupLoading, setSignupLoading] = useState<"email" | "google" | "apple" | null>(null);
  const [signupError, setSignupError] = useState<string | null>(null);

  const headline = branch ? getCreateAccountHeadline(branch) : "Your patterns are already forming. Create your free account to see them.";

  // Track whether account was created but signIn failed (Fix 2)
  const [accountCreatedButSigninFailed, setAccountCreatedButSigninFailed] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError(null);
    setAccountCreatedButSigninFailed(false);

    // Client-side validation — fire funnel_signup_failed for each so admin sees it.
    // Name is intentionally OPTIONAL (most users come via Google/Apple where we
    // already have the profile name; requiring it here was needless friction and
    // produced the "validation:name_empty" drop-off). Null/empty name is handled
    // safely downstream (greetings + emails fall back to "there"/"friend").
    if (!signupEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupEmail.trim())) {
      setSignupError("Please enter a valid email address.");
      track("funnel_signup_failed", { value: "validation:invalid_email", method: "email" });
      return;
    }
    if (signupPassword.length < 8) {
      setSignupError("Password must be at least 8 characters.");
      track("funnel_signup_failed", { value: "validation:password_short", method: "email" });
      return;
    }

    track("funnel_signup_started", { value: "email" });
    setSignupLoading("email");
    try {
      let funnelUtm: Record<string, string> = {};
      try { const s = sessionStorage.getItem("acuity_funnel_utm"); if (s) funnelUtm = JSON.parse(s); } catch {}
      const attribution = {
        ...(funnelUtm.utmSource ? { utm_source: funnelUtm.utmSource } : {}),
        ...(funnelUtm.utmMedium ? { utm_medium: funnelUtm.utmMedium } : {}),
        ...(funnelUtm.utmCampaign ? { utm_campaign: funnelUtm.utmCampaign } : {}),
        ...(funnelUtm.utmContent ? { utm_content: funnelUtm.utmContent } : {}),
        ...(funnelUtm.fbclid ? { fbclid: funnelUtm.fbclid } : {}),
        landingPath: "/start",
      };
      const res = await fetch("/api/auth/signup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: signupEmail.trim(), password: signupPassword, name: signupName.trim(), attribution }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const errorCode = body.error || "unknown";
        if (errorCode === "AlreadyRegistered") {
          setSignupError("Looks like you already have an account.");
        } else if (errorCode === "RateLimited") {
          setSignupError("Too many attempts. Please wait a few minutes and try again.");
        } else if (errorCode === "WeakPassword") {
          setSignupError(body.message || "Your password doesn\u2019t meet our requirements. Please try a stronger one.");
        } else if (errorCode === "InvalidEmail") {
          setSignupError("That email address doesn\u2019t look right. Please check and try again.");
        } else {
          setSignupError("Something went wrong. Please try again.");
        }
        track("funnel_signup_failed", { value: `server:${errorCode}`, method: "email" });
        setSignupLoading(null);
        return;
      }
      const signupData = await res.json().catch(() => ({}));
      // Fire browser pixel — wait for fbq to load (consent-gated, may not be available yet)
      waitForFbq().then((ready) => {
        if (ready) {
          fireFbq("CompleteRegistration", { content_name: "Free Trial Signup", currency: "USD", value: 0 }, signupData.capiEventId);
          fireFbq("StartTrial", { value: 4.99, currency: "USD", predicted_ltv: 39.99 });
        }
      });
      // Guard so TrackCompleteRegistration on the savings step doesn't double-fire
      try { sessionStorage.setItem("acuity_reg_pixel_fired", "1"); } catch {}

      const result = await signIn("credentials", { email: signupEmail.trim(), password: signupPassword, redirect: false });
      if (result?.ok) {
        onAccountCreated();
      } else {
        // Fix 2: Account was created but credential signin failed. Fire the
        // account_created event (account exists), show recoverable message,
        // and fire a failure event for observability.
        onAccountCreated();
        track("funnel_signup_failed", { value: "signin_after_creation_failed", method: "email" });
        setAccountCreatedButSigninFailed(true);
        setSignupError("Your account was created! Tap below to sign in.");
        // Log server-side for observability
        fetch("/api/auth/log-signup-issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "credentials_signin_failed_after_creation", email: signupEmail.trim() }),
        }).catch(() => {});
      }
    } catch {
      setSignupError("Connection issue \u2014 your info is saved. Please try again.");
      track("funnel_signup_failed", { value: "network_error", method: "email" });
    } finally {
      setSignupLoading(null);
    }
  };

  const handleOAuthSignup = async (provider: "google" | "apple") => {
    track("funnel_signup_started", { value: provider });
    setSignupLoading(provider);

    // Carry attribution through the OAuth round-trip on the callbackUrl.
    // In-app webviews (IG/FB) and any www↔apex host switch wipe both
    // sessionStorage and the host-only attribution cookie across the redirect,
    // so the URL is the only channel that reliably survives. Read the captured
    // UTMs + fbclid here (sessionStorage first, cookie as fallback) and append
    // only the params that exist. The post-signup effect reads them back off
    // window.location.search as its top-priority source. fbclid rides along so
    // the returned context can re-attach it to funnel events for CAPI match.
    const params = new URLSearchParams({ step: "post-signup" });

    let funnelUtm: Record<string, string> = {};
    try {
      const stored = sessionStorage.getItem("acuity_funnel_utm");
      if (stored) funnelUtm = JSON.parse(stored);
    } catch {}

    let cookieAttr: Record<string, string> = {};
    try {
      const { getClientAttribution } = require("@/lib/attribution");
      const attr = getClientAttribution();
      if (attr) cookieAttr = attr;
    } catch {}

    const carry: Record<string, string | undefined> = {
      utm_source: funnelUtm.utmSource || cookieAttr.utm_source,
      utm_medium: funnelUtm.utmMedium || cookieAttr.utm_medium,
      utm_campaign: funnelUtm.utmCampaign || cookieAttr.utm_campaign,
      utm_content: funnelUtm.utmContent || cookieAttr.utm_content,
      utm_term: funnelUtm.utmTerm || cookieAttr.utm_term,
      fbclid: funnelUtm.fbclid, // the attribution cookie never stores fbclid
    };
    for (const [k, v] of Object.entries(carry)) {
      if (v) params.set(k, v); // URLSearchParams encodes; skip empties
    }

    await signIn(provider, { callbackUrl: `/start?${params.toString()}` });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-zinc-900">
      <div className="max-w-md w-full funnel-screen">
        <section className="text-center mb-8">
          {/* App Store rating badge */}
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 py-1.5 pl-2.5 pr-3.5 shadow-sm">
            <span className="inline-flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <svg key={i} className="h-3 w-3 text-acuity-primary" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </span>
            <span className="text-[12px] font-semibold text-zinc-500">5.0 on the App Store</span>
          </div>
          <h2 className="text-[22px] sm:text-[28px] font-bold tracking-tight leading-snug">{headline}</h2>
          <p className="text-sm text-zinc-500 mt-3">Free. No credit card required. Takes 10 seconds.</p>
        </section>

        {/* Social proof — auto-rotating testimonials */}
        <SignupTestimonialStrip />

        <div className="space-y-3 mb-6">
          <button
            onClick={() => handleOAuthSignup("apple")}
            disabled={signupLoading !== null}
            className="w-full flex items-center justify-center gap-3 rounded-full bg-zinc-900 px-4 py-3.5 text-[15px] font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
          >
            {signupLoading === "apple" ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
            ) : (
              <AppleLogo />
            )}
            Continue with Apple
          </button>

          <button
            onClick={() => handleOAuthSignup("google")}
            disabled={signupLoading !== null}
            className="w-full flex items-center justify-center gap-3 rounded-full bg-white border border-zinc-200 px-4 py-3.5 text-[15px] font-semibold text-zinc-700 transition hover:bg-zinc-50 hover:border-zinc-300 active:scale-[0.98] disabled:opacity-50"
          >
            {signupLoading === "google" ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
            ) : (
              <GoogleLogo />
            )}
            Continue with Google
          </button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-zinc-200" />
          <span className="text-xs text-zinc-400">or</span>
          <div className="flex-1 h-px bg-zinc-200" />
        </div>

        <form onSubmit={handleSignup} className="space-y-3">
          <input type="text" value={signupName} onChange={(e) => setSignupName(e.target.value)} placeholder="Full name (optional)" autoComplete="name"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3.5 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-acuity-primary focus:ring-2 focus:ring-acuity-primary/20" />
          <input type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} placeholder="Email address" autoComplete="email"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3.5 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-acuity-primary focus:ring-2 focus:ring-acuity-primary/20" />
          <div className="relative">
            <input type={showPassword ? "text" : "password"} value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} placeholder="Password (8+ characters)" autoComplete="new-password"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3.5 pr-16 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-acuity-primary focus:ring-2 focus:ring-acuity-primary/20" />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-600 font-medium">
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          {signupError && (
            <div className={`text-xs px-1 rounded-lg ${accountCreatedButSigninFailed ? "bg-green-50 border border-green-200 p-3 text-green-700" : "text-red-500"}`}>
              <p>{signupError}</p>
              {signupError.includes("already have an account") && (
                <button type="button" onClick={() => signIn(undefined, { callbackUrl: "/start?step=post-signup" })}
                  className="mt-1.5 inline-block text-acuity-primary font-semibold underline">
                  Sign in to your existing account
                </button>
              )}
              {accountCreatedButSigninFailed && (
                <button type="button" onClick={() => signIn(undefined, { callbackUrl: "/start?step=post-signup" })}
                  className="mt-1.5 inline-block text-acuity-primary font-semibold underline">
                  Tap here to sign in
                </button>
              )}
            </div>
          )}

          <button type="submit" disabled={signupLoading !== null}
            className="w-full rounded-full bg-acuity-primary py-3.5 text-[15px] font-semibold text-white transition hover:bg-acuity-primary-lo active:scale-[0.98] disabled:opacity-50 shadow-acuity-glow-soft animate-[funnel-glow_2s_ease-in-out_infinite]">
            {signupLoading === "email" ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Creating your account...
              </span>
            ) : "Create My Free Account"}
          </button>
        </form>

        <p className="text-xs text-zinc-400 text-center mt-6">
          Already have an account?{" "}
          <button onClick={() => signIn(undefined, { callbackUrl: "/start?step=post-signup" })} className="text-acuity-primary font-semibold underline">Sign in</button>
        </p>
        <p className="text-[11px] text-zinc-400 text-center mt-3 flex items-center justify-center gap-1.5">
          <svg className="h-3 w-3 text-zinc-300" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
          Private by design. Your debriefs are yours alone.
        </p>
      </div>
    </div>
  );
}

// ── Signup Testimonial Strip (auto-rotating, doesn't push form below fold) ──

function SignupTestimonialStrip() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % PAYWALL_TESTIMONIALS_V2.length), 4000);
    return () => clearInterval(t);
  }, []);
  const t = PAYWALL_TESTIMONIALS_V2[idx];
  return (
    <div className="mb-5 rounded-xl bg-white/60 border border-zinc-100 px-4 py-3 text-center transition-all duration-300 funnel-card-stagger">
      <p className="text-[13px] text-zinc-600 italic leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
      <p className="text-[11px] text-zinc-400 font-semibold mt-1.5">&mdash; {t.name}</p>
    </div>
  );
}

// ─── Lock In Your Savings (Screen 17 — optional paywall) ──────────────────

// ─── Paywall Feature Comparison Data ─────────────────────────────────────────

interface PaywallFeature {
  name: string;
  description: string;
  duringTrial: boolean;
  afterTrial: boolean;
  /** Pattern-aware example shown on tap — personalized if branch available */
  example: (primary: string | null) => string;
}

const PAYWALL_FEATURES: PaywallFeature[] = [
  {
    name: "Voice debrief",
    description: "Talk instead of type. The entry point to everything.",
    duringTrial: true,
    afterTrial: true,
    example: () => "Record whenever something is on your mind. Acuity transcribes it and pulls out what matters.",
  },
  {
    name: "Task extraction",
    description: "Action items pulled from your words automatically.",
    duringTrial: true,
    afterTrial: true,
    example: () => "You said 'I need to call the school about Tuesday.' Acuity created the task before you finished the sentence.",
  },
  {
    name: "Streaks and milestones",
    description: "Progress tracking that reinforces the habit.",
    duringTrial: true,
    afterTrial: true,
    example: () => "7-day streak. 30 entries. Your consistency is part of why the patterns become visible.",
  },
  {
    name: "Weekly report",
    description: "A written narrative of your week \u2014 the throughline you\u2019d never assemble yourself.",
    duringTrial: true,
    afterTrial: false,
    example: (p) => ({
      "Mental Overload": "e.g. 'Three days blurred together this week \u2014 but Wednesday, the day you felt clear, was the one day you stepped outside at lunch.'",
      "Relational Looping": "e.g. 'The argument happened Tuesday. The tension started Sunday \u2014 you mentioned the same frustration three days before it surfaced.'",
      "Racing Mind": "e.g. 'The same three worries ran through every evening this week \u2014 and two of them never actually happened.'",
      "System Fatigue": "e.g. 'This is the longest you\u2019ve stuck with anything in months \u2014 12 entries, and the week you almost quit was the week you learned the most.'",
      "Invisible Load": "e.g. 'You gave 8/10 energy to everyone else and 3/10 to yourself \u2014 every single day this week.'",
      "Drifted Off-Course": "e.g. 'You mentioned who you used to be twice this week and who you want to become once \u2014 the gap is the whole story.'",
    }[p ?? ""] ?? "e.g. 'The same frustration showed up three days before it surfaced \u2014 a throughline you\u2019d never assemble yourself.'"),
  },
  {
    name: "Life Matrix",
    description: "Six life domains tracked over time so you see where you\u2019re thriving and where you\u2019re slipping.",
    duringTrial: true,
    afterTrial: false,
    example: () => "Health: 7.2 \u2192 Career: 4.1 \u2192 Relationships: 6.8. You can see which areas get your energy and which ones don\u2019t.",
  },
  {
    name: "Pattern detection",
    description: "Recurring themes surfaced across your entries.",
    duringTrial: true,
    afterTrial: false,
    example: (p) => ({
      "Mental Overload": "e.g. 'Your foggiest days all had zero unstructured time. Your clearest day had two hours of nothing planned.'",
      "Relational Looping": "e.g. 'You bring up the same tension every Monday and it surfaces as a fight by Thursday \u2014 there\u2019s a pattern worth examining.'",
      "Racing Mind": "e.g. 'Your calmest day was the only day you processed out loud before 6pm. The evening replay correlates with unprocessed afternoons.'",
      "System Fatigue": "e.g. 'You\u2019ve hit a wall around day 4 with every tool before this one. Knowing that, you can push through the dip instead of quitting.'",
      "Invisible Load": "e.g. 'You say \u2018I\u2019m fine\u2019 most often on the days your mood score is lowest \u2014 your words and your feelings are telling different stories.'",
      "Drifted Off-Course": "e.g. 'Your energy peaks Sunday morning and fades by Monday night \u2014 the reset you keep losing happens at the same point every week.'",
    }[p ?? ""] ?? "e.g. 'The same theme keeps surfacing across your weeks \u2014 there\u2019s a pattern worth examining.'"),
  },
  {
    name: "Signals",
    description: "Next-step guidance based on what you actually said.",
    duringTrial: true,
    afterTrial: false,
    example: (p) => ({
      "Mental Overload": "e.g. 'You described 4 days as \u2018fine\u2019 but named zero highlights \u2014 block 30 minutes for something that matters to you.'",
      "Relational Looping": "e.g. 'You\u2019ve mentioned the same tension with your partner 3 times this week and keep deferring the conversation \u2014 schedule it.'",
      "Racing Mind": "e.g. 'The same worry has looped for 3 nights running and never once came true \u2014 write down what you\u2019d need to see to let it go.'",
      "System Fatigue": "e.g. 'You\u2019re on day 9 \u2014 past where every other tool fizzled out. Don\u2019t change a thing; just keep showing up for 60 seconds.'",
      "Invisible Load": "e.g. 'You gave everyone else 8/10 energy and yourself 3/10 all week \u2014 name one thing this week that\u2019s just for you.'",
      "Drifted Off-Course": "e.g. 'You\u2019ve mentioned a goal you used to care about twice and done nothing with it \u2014 take one small step toward it this week.'",
    }[p ?? ""] ?? "e.g. 'You keep deferring the same thing week after week \u2014 block 30 minutes and finally close it out.'"),
  },
  {
    name: "Ask your past self",
    description: "Search your own history \u2014 ask what you were thinking, feeling, or avoiding at any point.",
    duringTrial: true,
    afterTrial: false,
    example: () => "e.g. 'What was I stressed about in March?' \u2014 Acuity pulls the answer from your own words, not a generic summary.",
  },
  {
    name: "Smart insights",
    description: "AI-generated observations about you that you\u2019d never notice on your own.",
    duringTrial: true,
    afterTrial: false,
    example: (p) => ({
      "Mental Overload": "e.g. 'Your mood is 2 points higher on days you mention your kids. You never mention them on your lowest days.'",
      "Relational Looping": "e.g. 'You use warmer words about your partner on weekends and sharper ones midweek \u2014 the same cycle, every seven days.'",
      "Racing Mind": "e.g. 'The nights you slept best were the ones you talked it out before dinner. The replay needs an empty evening to run.'",
      "System Fatigue": "e.g. 'Your motivation dips every fourth day like clockwork. It\u2019s not you losing interest \u2014 it\u2019s a rhythm, and now you can ride it out.'",
      "Invisible Load": "e.g. 'You use the word \u2018fine\u2019 most often on days your mood score is lowest. Your language and your feelings are telling different stories.'",
      "Drifted Off-Course": "e.g. 'You light up when you talk about one specific thing you\u2019ve stopped making time for. Your own words keep pointing back to it.'",
    }[p ?? ""] ?? "e.g. 'You use the word \u2018fine\u2019 most often on days your mood score is lowest. Your language and your feelings are telling different stories.'"),
  },
  {
    name: "Theme map",
    description: "Advanced view of your recurring life themes and subconscious patterns over time.",
    duringTrial: true,
    afterTrial: false,
    example: () => "Visualize how themes like \u2018work pressure,\u2019 \u2018family tension,\u2019 and \u2018self-worth\u2019 rise and fall across weeks \u2014 and how they connect to each other.",
  },
];

function SavingsScreen({ branch, answers, track, selectedPlan, onPlanChange, onCheckout, onSkip, loading, error }: {
  branch: Branch | null;
  answers: Record<string, string | string[]>;
  track: (event: string, props?: Record<string, unknown>) => void;
  selectedPlan: "monthly" | "yearly"; onPlanChange: (p: "monthly" | "yearly") => void;
  onCheckout: () => void; onSkip: () => void; loading: boolean; error: string | null;
}) {
  const annualMonthly = Math.round(ANNUAL_PRICE_CENTS / 12);
  const labels = branch ? getPatternLabels(branch, answers) : null;
  const paywallTestimonial = getPaywallTestimonial(branch);
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);
  // Price-slash animation phase: 0=showing regular price, 1=slash started, 2=founding rate landed, 3=badges visible
  const [slashPhase, setSlashPhase] = useState(0);
  const pricingRef = useRef<HTMLDivElement>(null);
  const slashTriggered = useRef(false);
  const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Trigger the slash animation only when the pricing section scrolls into view
  useEffect(() => {
    if (prefersReduced) { setSlashPhase(3); return; }
    const el = pricingRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !slashTriggered.current) {
        slashTriggered.current = true;
        const t: ReturnType<typeof setTimeout>[] = [];
        t.push(setTimeout(() => setSlashPhase(1), 400));    // strikethrough draws after 400ms in view
        t.push(setTimeout(() => setSlashPhase(2), 1200));   // founding rate lands at 1.2s
        t.push(setTimeout(() => setSlashPhase(3), 2000));   // badges appear at 2s
        // Cleanup not critical — one-shot
      }
    }, { threshold: 0.3 }); // trigger when 30% of the pricing section is visible
    observer.observe(el);
    return () => observer.disconnect();
  }, [prefersReduced]);

  const toggleFeature = (name: string) => {
    setExpandedFeature((prev) => prev === name ? null : name);
  };

  return (
    <div className="min-h-screen text-zinc-900 pb-32">
      <div className="max-w-lg mx-auto px-6 pt-10">

        {/* Section 1 — Positioning header */}
        <section className="text-center mb-6 funnel-screen">
          <h2 className="text-[22px] sm:text-[28px] font-bold tracking-tight leading-snug bg-gradient-to-r from-orange-400 to-orange-500 bg-clip-text text-transparent">Your personal clarity system is ready.</h2>
          <p className="text-sm text-zinc-500 mt-2">Stop losing track of what your own life is trying to tell you.</p>
        </section>

        {/* Section 2 — Loss-aversion recap */}
        <section className="mb-6 funnel-card-stagger" style={{ animationDelay: "80ms" }}>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-4 text-center">
            <p className="text-[15px] text-zinc-900 leading-relaxed font-semibold">{getPaywallLossRecap(branch)}</p>
          </div>
        </section>

        {/* Section 3 — Trial vs. After Trial comparison */}
        <section className="mb-6 rounded-xl bg-white border border-zinc-200 shadow-sm overflow-hidden funnel-card-stagger" style={{ animationDelay: "140ms" }}>
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_auto_auto] items-center px-4 py-3 border-b border-zinc-100 bg-zinc-50/50">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400">Feature</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-600 w-[72px] text-center">Pro</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-400 w-[72px] text-center">Free</span>
          </div>

          {/* Feature rows — tappable for examples */}
          {PAYWALL_FEATURES.map((f, i) => {
            const isExpanded = expandedFeature === f.name;
            return (
              <div key={f.name} className={`border-b border-zinc-100 last:border-b-0 ${i % 2 === 0 ? "" : "bg-zinc-50/30"}`}>
                <button
                  onClick={() => { toggleFeature(f.name); track("funnel_paywall_feature_tap", { value: f.name }); }}
                  className="w-full grid grid-cols-[1fr_auto_auto] items-center px-4 py-3 text-left transition-colors hover:bg-zinc-50/80 active:bg-zinc-100/60"
                >
                  <div className="pr-2">
                    <p className="text-[13px] font-semibold text-zinc-900 leading-tight">{f.name}</p>
                    <p className="text-[11px] text-zinc-500 leading-snug mt-0.5">{f.description}</p>
                  </div>
                  <div className="w-[72px] flex justify-center">
                    <span className="text-emerald-500 text-sm">&#10003;</span>
                  </div>
                  <div className="w-[72px] flex justify-center">
                    {f.afterTrial ? (
                      <span className="text-emerald-500 text-sm">&#10003;</span>
                    ) : (
                      <span className="text-[11px] font-bold bg-gradient-to-r from-orange-400 to-orange-500 bg-clip-text text-transparent">Locked</span>
                    )}
                  </div>
                </button>
                {/* Expandable example */}
                {isExpanded && (
                  <div className="px-4 pb-3 pt-0">
                    <div className="rounded-lg bg-acuity-primary/5 border border-acuity-primary/10 px-3 py-2.5">
                      <p className="text-[11px] text-zinc-600 leading-relaxed">{f.example(labels?.primary ?? null)}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Summary line */}
          <div className="px-4 py-3 bg-zinc-50/50">
            <p className="text-[13px] text-zinc-700 text-center font-semibold">
              After your trial, recording, task extraction, and streaks stay free forever. Pro keeps the insight layer &mdash; the weekly report, Life Matrix, and patterns that show you what it all means.
            </p>
          </div>
        </section>

        {/* Section 4 — Cost comparison */}
        <section className="mb-6 rounded-xl border border-zinc-200 bg-white px-5 py-4 text-center funnel-card-stagger" style={{ animationDelay: "200ms" }}>
          <p className="text-[15px] font-semibold text-zinc-900 leading-relaxed">
            <span className="text-zinc-500 font-semibold">Therapy: $150/session.</span>{" "}
            <span className="text-zinc-500 font-semibold">A coach: $200/month.</span>
          </p>
          <p className="text-[17px] font-bold mt-1 bg-gradient-to-r from-orange-400 to-orange-500 bg-clip-text text-transparent">Acuity: less than a coffee a month.</p>
        </section>

        {/* Section 5 — Pricing cards with price-slash animation */}
        <section ref={pricingRef} className="mb-6 rounded-xl bg-white border border-zinc-200 px-5 py-5 shadow-sm funnel-card-stagger" style={{ animationDelay: "260ms" }}>
          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes pw-strike { from { width: 0; } to { width: 100%; } }
            @keyframes pw-shrink-text { from { font-size: 1.5rem; } to { font-size: 0.875rem; } }
            @keyframes pw-shrink { from { font-size: inherit; opacity: 1; } to { font-size: 0.875rem; opacity: 0.7; } }
            @keyframes pw-land { from { opacity: 0; transform: scale(0.7) translateY(-8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
            @keyframes pw-badge { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
            @keyframes pw-save { from { opacity: 0; } to { opacity: 1; } }
          `}} />
          <div className="grid grid-cols-2 gap-3 mb-4">
            {/* Monthly card */}
            <button onClick={() => onPlanChange("monthly")}
              className={`rounded-xl p-4 text-center transition-all duration-300 relative ${selectedPlan === "monthly" ? "border-2 border-acuity-primary bg-gradient-to-b from-acuity-primary/10 to-acuity-primary/5 shadow-acuity-glow-soft scale-[1.02]" : "border border-zinc-200 bg-white scale-100"}`}>
              <p className="text-xs text-zinc-500 mb-1">Monthly</p>
              {/* Regular price — starts as hero, shrinks to anchor on slash */}
              <p className={`font-semibold relative inline-block transition-all duration-500 ${slashPhase >= 1 ? "text-sm text-red-400" : "text-2xl text-zinc-900 font-extrabold"}`}>
                <span>$19.99</span><span className={`font-normal ${slashPhase >= 1 ? "text-xs" : "text-sm text-zinc-400"}`}>/mo</span>
                {/* Strikethrough line — draws left-to-right */}
                {slashPhase >= 1 && (
                  <span className="absolute left-0 top-1/2 h-[2px] bg-red-400"
                    style={{ animation: prefersReduced ? "none" : "pw-strike 600ms ease-out forwards", width: prefersReduced ? "100%" : undefined }} />
                )}
              </p>
              {/* Founding rate — lands after slash */}
              <p className={`text-2xl font-extrabold text-zinc-900 ${slashPhase >= 2 ? "" : "opacity-0 scale-75"}`}
                style={slashPhase >= 2 && !prefersReduced ? { animation: "pw-land 600ms cubic-bezier(0.34,1.56,0.64,1) forwards" } : slashPhase >= 2 ? {} : { height: 0, overflow: "hidden" }}>
                {formatDollars(MONTHLY_PRICE_CENTS)}<span className="text-sm font-normal text-zinc-400">/mo</span>
              </p>
              {/* Badge — appears after rate lands */}
              <span className={`inline-block mt-2 rounded-full bg-acuity-primary text-white px-3 py-1 text-[10px] font-bold tracking-wide shadow-sm ${slashPhase >= 3 ? "" : "opacity-0"}`}
                style={slashPhase >= 3 && !prefersReduced ? { animation: "pw-badge 300ms ease-out forwards" } : undefined}>
                FOUNDING RATE
              </span>
              {/* Savings delta — subtle fade after badge */}
              <p className={`text-[10px] text-emerald-600 font-medium mt-1 transition-opacity duration-500 ${slashPhase >= 3 ? "opacity-100" : "opacity-0"}`}>
                You save $15/mo
              </p>
            </button>
            {/* Annual card — staggered 150ms behind monthly */}
            <button onClick={() => onPlanChange("yearly")}
              className={`rounded-xl p-4 text-center transition-all duration-300 relative ${selectedPlan === "yearly" ? "border-2 border-acuity-primary bg-gradient-to-b from-acuity-primary/10 to-acuity-primary/5 shadow-acuity-glow-soft scale-[1.02]" : "border border-zinc-200 bg-white scale-100"}`}>
              <p className="text-xs text-zinc-500 mb-1">Annual</p>
              {/* Regular price — starts as hero, shrinks to anchor on slash */}
              <p className={`font-semibold relative inline-block transition-all duration-500 ${slashPhase >= 1 ? "text-sm text-red-400" : "text-2xl text-zinc-900 font-extrabold"}`}
                style={{ transitionDelay: slashPhase >= 1 ? "150ms" : "0ms" }}>
                <span>$199</span><span className={`font-normal ${slashPhase >= 1 ? "text-xs" : "text-sm text-zinc-400"}`}>/yr</span>
                {slashPhase >= 1 && (
                  <span className="absolute left-0 top-1/2 h-[2px] bg-red-400"
                    style={{ animation: prefersReduced ? "none" : "pw-strike 600ms ease-out 200ms forwards", width: prefersReduced ? "100%" : undefined }} />
                )}
              </p>
              {/* Founding rate — lands after slash */}
              <p className={`text-2xl font-extrabold text-zinc-900 ${slashPhase >= 2 ? "" : "opacity-0 scale-75"}`}
                style={slashPhase >= 2 && !prefersReduced ? { animation: "pw-land 600ms cubic-bezier(0.34,1.56,0.64,1) 200ms forwards" } : slashPhase >= 2 ? {} : { height: 0, overflow: "hidden" }}>
                {formatDollars(ANNUAL_PRICE_CENTS)}<span className="text-sm font-normal text-zinc-400">/yr</span>
              </p>
              {/* Badge — appears after rate lands */}
              <span className={`inline-block mt-1 rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-[10px] font-bold ${slashPhase >= 3 ? "" : "opacity-0"}`}
                style={slashPhase >= 3 && !prefersReduced ? { animation: "pw-badge 300ms ease-out 150ms forwards" } : undefined}>
                SAVE {PRICING.annual.savingsVsMonthly}
              </span>
              {/* Savings delta */}
              <p className={`text-[10px] text-emerald-600 font-medium mt-1 transition-opacity duration-500 ${slashPhase >= 3 ? "opacity-100" : "opacity-0"}`}
                style={{ transitionDelay: slashPhase >= 3 ? "150ms" : "0ms" }}>
                {formatDollars(annualMonthly)}/mo &mdash; save $159/yr
              </p>
            </button>
          </div>

          {/* Founding rate urgency (honest — no fake countdown or spots) */}
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-center">
            <p className="text-xs text-emerald-800 font-semibold">Founding rate &mdash; locked in for life if you start today.</p>
            <p className="text-[10px] text-emerald-600 mt-0.5">This price rises as we grow.</p>
          </div>

          {/* Micro-testimonial */}
          <p className="text-[12px] text-zinc-500 text-center italic mt-3">&ldquo;{paywallTestimonial.quote.slice(0, 80)}&hellip;&rdquo; &mdash; {paywallTestimonial.name}</p>
        </section>
      </div>

      {/* Sticky CTA + skip + crisis line */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-zinc-100 px-6 py-3 safe-area-pb">
        <div className="max-w-lg mx-auto">
          {error && <p className="text-xs text-red-500 text-center mb-1">{error}</p>}
          <button onClick={onCheckout} disabled={loading}
            className="w-full rounded-full bg-acuity-primary py-3.5 text-[15px] font-semibold text-white transition hover:bg-acuity-primary-lo active:scale-[0.98] disabled:opacity-50 shadow-acuity-glow-soft animate-[funnel-glow_2s_ease-in-out_infinite]">
            {loading ? "Loading\u2026" : "Start My 7 Days"}
          </button>
          <p className="text-[10px] text-zinc-400 text-center mt-2">7-day free trial included with all plans. Cancel anytime. You won&rsquo;t be charged today.</p>
          <div className="text-center mt-2">
            <button onClick={onSkip} className="text-xs text-zinc-400 hover:text-zinc-600 underline underline-offset-2 transition">
              Continue without paying
            </button>
          </div>
          <p className="text-[9px] text-zinc-300 text-center mt-2">If you&rsquo;re in crisis, call or text 988 (Suicide &amp; Crisis Lifeline).</p>
        </div>
      </div>
    </div>
  );
}

// ─── Download Screen (Screen 18) ────────────────────────────────────────────

function DownloadScreen({ track, paymentConfirmed, selectedPlan }: {
  track: (event: string, props?: Record<string, unknown>) => void;
  paymentConfirmed: boolean;
  selectedPlan: "monthly" | "yearly";
}) {
  const { status: authStatus } = useSession();
  const [testimonialIdx, setTestimonialIdx] = useState(0);
  const celebratedRef = useRef(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const browserEnv = typeof window !== "undefined" ? detectBrowserEnv() : { isWebView: false, label: "ssr", ua: "" };

  // Diagnostic context string for download-step events (PII-safe: UA only, no email/name)
  const diagContext = typeof window !== "undefined" ? [
    `webview:${browserEnv.isWebView}`,
    `label:${browserEnv.label}`,
    `os:${/iPhone|iPad|iPod/i.test(browserEnv.ua) ? "ios" : /Android/i.test(browserEnv.ua) ? "android" : "other"}`,
    `standalone:${typeof navigator !== "undefined" && ("standalone" in navigator ? (navigator as Record<string, unknown>).standalone : false)}`,
    `windowOpen:${typeof window.open === "function"}`,
  ].join("|") : "ssr";

  useEffect(() => {
    track("funnel_download_screen_viewed", { value: diagContext });
    if (browserEnv.isWebView) {
      track("funnel_inapp_browser_detected", { value: browserEnv.label });
      // Auto-copy App Store link to clipboard for webview users
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(APP_STORE_URL)
          .then(() => { setCopied(true); track("funnel_autocopy_success", { value: diagContext }); })
          .catch((err) => {
            setCopyFailed(true);
            track("funnel_autocopy_failed", { value: `${err instanceof Error ? err.message : String(err)}|${diagContext}` });
          });
      } else {
        setCopyFailed(true);
        track("funnel_autocopy_failed", { value: `no_clipboard_api|${diagContext}` });
      }
    }
  }, [track, browserEnv.isWebView, browserEnv.label, diagContext]);

  useEffect(() => {
    if (paymentConfirmed && !celebratedRef.current) {
      celebratedRef.current = true;
      import("canvas-confetti").then((mod) => {
        const confetti = mod.default;
        confetti({ particleCount: 120, spread: 90, origin: { y: 0.4 }, colors: ["#7C5CFC", "#A78BFA", "#C4B5FD", "#F59E0B", "#22C55E"] });
        setTimeout(() => confetti({ particleCount: 60, spread: 120, origin: { y: 0.35, x: 0.3 } }), 250);
        setTimeout(() => confetti({ particleCount: 60, spread: 120, origin: { y: 0.35, x: 0.7 } }), 400);
      });
    }
  }, [paymentConfirmed]);

  useEffect(() => {
    const interval = setInterval(() => setTestimonialIdx((i) => (i + 1) % DOWNLOAD_TESTIMONIALS.length), 4000);
    return () => clearInterval(interval);
  }, []);

  const planPrice = selectedPlan === "yearly" ? formatDollars(ANNUAL_PRICE_CENTS) + "/yr" : formatDollars(MONTHLY_PRICE_CENTS) + "/mo";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-zinc-900">
      <div className="max-w-sm w-full text-center funnel-screen">
        {paymentConfirmed ? (
          <>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">You&rsquo;re locked in at {planPrice}. Welcome to Acuity.</h2>
            <p className="text-sm text-zinc-500 mb-10">Record your first debrief &mdash; in the app or right here on the web.</p>
          </>
        ) : (
          <>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">Your free trial is active.</h2>
            <p className="text-sm text-zinc-500 mb-2">You have 7 days to explore everything Acuity offers.</p>
            <p className="text-sm text-zinc-500 mb-10">Record your first debrief &mdash; in the app or right here on the web.</p>
          </>
        )}

        {browserEnv.isWebView ? (
          <>
            {/* ── Webview path: native anchor + prominent breakout instructions ── */}
            <a
              href={APP_STORE_URL}
              onClick={() => track("funnel_download_tap", { value: diagContext })}
              className="relative block w-full rounded-full px-8 py-3.5 text-[15px] font-semibold text-white text-center transition hover:brightness-110 active:scale-[0.98] overflow-hidden funnel-bounce"
              style={{ background: "var(--acuity-grad-primary)", boxShadow: "var(--acuity-glow-primary)" }}>
              <span className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)", backgroundSize: "200% 100%", animation: "funnel-shimmer 2s ease-in-out infinite" }} />
              <span className="relative">Download on the App Store</span>
            </a>

            {/* ── Prominent breakout instruction — this is the reliable path ── */}
            <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-4 text-left">
              <p className="text-[13px] font-semibold text-zinc-800 mb-2">
                If the button above didn&rsquo;t open the App Store:
              </p>
              <ol className="text-[13px] text-zinc-600 space-y-1.5 list-decimal list-inside">
                <li>Tap the <span className="inline-flex items-center font-semibold text-zinc-800">&nbsp;&#8943;&nbsp;</span> or <span className="inline-flex items-center font-semibold text-zinc-800">&nbsp;&#8226;&#8226;&#8226;&nbsp;</span> menu {browserEnv.label === "instagram" ? "at the bottom-right" : "in the top-right corner"}</li>
                <li>Choose <span className="font-semibold text-zinc-800">&ldquo;Open in {/Android/i.test(browserEnv.ua) ? "Chrome" : "Safari"}&rdquo;</span></li>
                <li>The App Store will open automatically</li>
              </ol>
              <div className="mt-3 pt-3 border-t border-zinc-200">
                {copied ? (
                  <p className="text-[12px] text-green-600 font-medium">&#10003; Link copied to clipboard &mdash; paste in {/Android/i.test(browserEnv.ua) ? "Chrome" : "Safari"} if needed</p>
                ) : copyFailed ? (
                  <div>
                    <p className="text-[12px] text-zinc-500 mb-1">Long-press to copy this link:</p>
                    <p className="text-[12px] text-acuity-primary font-mono break-all select-all">{APP_STORE_URL}</p>
                  </div>
                ) : (
                  <p className="text-[12px] text-zinc-400">Copying link&hellip;</p>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* ── Regular browser path: unchanged ── */}
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("funnel_download_tap", { value: diagContext })}
              className="relative block w-full rounded-full px-8 py-3.5 text-[15px] font-semibold text-white text-center transition hover:brightness-110 active:scale-[0.98] overflow-hidden funnel-bounce"
              style={{ background: "var(--acuity-grad-primary)", boxShadow: "var(--acuity-glow-primary)" }}>
              <span className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)", backgroundSize: "200% 100%", animation: "funnel-shimmer 2s ease-in-out infinite" }} />
              <span className="relative">Download on the App Store</span>
            </a>
          </>
        )}

        <button disabled
          className="w-full mt-3 rounded-full border border-zinc-200 bg-zinc-100 px-8 py-3.5 text-[15px] font-semibold text-zinc-400 cursor-not-allowed">
          Google Play — Coming soon!
        </button>

        <button
          onClick={async () => {
            track("funnel_continue_web_app_clicked", { value: diagContext });

            // Mark web onboarding complete so /home doesn't bounce them into
            // the 10-step web onboarding flow. This user just finished the
            // entire /start funnel — they don't need onboarding again.
            // Fire-and-forget: if it fails, still route them (they'll just
            // hit onboarding, which is better than being stuck).
            try {
              await fetch("/api/onboarding/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ skipped: true, skippedAtStep: 0 }),
              });
            } catch {}

            // Route to /home. The user's session was established during
            // account creation (signIn("credentials") or OAuth callback).
            // authStatus may still be "loading" if useSession hasn't
            // resolved yet, so treat anything other than explicit
            // "unauthenticated" as having a session — the middleware will
            // handle the edge case of a truly missing token.
            if (authStatus === "unauthenticated") {
              window.location.href = "/auth/signin?callbackUrl=/home";
            } else {
              window.location.href = "/home";
            }
          }}
          className="w-full mt-3 rounded-full border-2 border-acuity-primary px-8 py-3.5 text-[15px] font-semibold text-acuity-primary text-center transition hover:bg-acuity-primary/5 active:scale-[0.98]"
        >
          Continue in the Web App
          <span className="block text-[11px] font-normal text-zinc-400 mt-0.5">Record your first debrief right now &mdash; no download needed.</span>
        </button>

        {/* QR code — desktop only */}
        <div className="mt-8 hidden sm:block">
          <p className="text-xs text-zinc-400 mb-3">Or scan with your phone</p>
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(APP_STORE_URL)}&bgcolor=ffffff&color=181614`}
            alt="QR code" width={140} height={140} className="mx-auto rounded-lg" />
        </div>

        {!paymentConfirmed && (
          <p className="mt-8 text-xs text-zinc-400">
            You can lock in founding member pricing anytime in the app before your trial ends.
          </p>
        )}

        <div className="mt-8">
          <p className="text-sm font-semibold text-zinc-500 mb-1">
            4.9 <span className="text-amber-400">&#9733;&#9733;&#9733;&#9733;&#9733;</span> from 127+ users
          </p>
          <div className="mt-3 min-h-[60px] relative">
            {DOWNLOAD_TESTIMONIALS.map((t, i) => (
              <div key={i} className={`transition-opacity duration-500 ${i === testimonialIdx ? "opacity-100" : "opacity-0 absolute inset-0"}`}>
                <p className="text-xs italic text-zinc-400">&ldquo;{t.quote}&rdquo; &mdash; {t.name}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
