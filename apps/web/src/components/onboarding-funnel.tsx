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
  getTallyHeader,
  getTallyKicker,
  getTimeMathContent,
  GAP2_FEELINGS,
  getGap2Header,
  buildGap3Lines,
  type Gap3Line,
  GAP3_DISMISS_COPY,
  PROCESSING_STAGES,
  getSnapshotInsight,
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
} from "@/lib/funnel-config";

// ─── Types ──────────────────────────────────────────────────────────────────

type Step =
  | "entry"
  | "branch-q2" | "branch-q3" | "branch-q4"
  | "shared-q5" | "shared-q6" | "shared-q7" | "shared-q8" | "shared-q9"
  | "tally"
  | "timemath"
  | "mirror"
  | "gap1" | "gap2" | "gap3"
  | "mechanism"
  | "commit"
  | "processing"
  | "snapshot"
  | "timeline"
  | "create-account"
  | "savings"
  | "download";

const STEP_ORDER: Step[] = [
  "entry", "branch-q2", "branch-q3", "branch-q4",
  "shared-q5", "timemath", "shared-q6", "shared-q7", "shared-q8", "shared-q9",
  "tally", "mirror", "gap1", "gap2", "gap3", "mechanism", "commit", "processing", "snapshot", "timeline",
  "create-account", "savings", "download",
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
    trackOnboardingEvent(event, { sessionToken: sessionId.current, utm: utmRef.current, flowVersion: "v4", ...props });
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
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">(saved?.selectedPlan ?? "monthly");
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
    } else if (stepParam === "savings") {
      // OAuth returnees land here after Google/Apple signup redirect.
      track("funnel_account_created");
      resolvedStep = "savings";
      setStepRaw("savings");
    } else if (stepParam === "create-account") {
      resolvedStep = "create-account";
      setStepRaw("create-account");
    } else if (stepParam === "paywall") {
      resolvedStep = "create-account";
      setStepRaw("create-account");
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

    // Read funnel UTMs from sessionStorage
    let funnelUtm: Record<string, string> = {};
    try {
      const stored = sessionStorage.getItem("acuity_funnel_utm");
      if (stored) funnelUtm = JSON.parse(stored);
    } catch {}

    // Also try the attribution cookie
    let cookieAttr: Record<string, string> = {};
    try {
      const { getClientAttribution } = require("@/lib/attribution");
      const attr = getClientAttribution();
      if (attr) cookieAttr = attr;
    } catch {}

    // Merge: funnel UTMs take priority (they're from the ad click URL), cookie is fallback
    const utm_source = funnelUtm.utmSource || cookieAttr.utm_source;
    const utm_medium = funnelUtm.utmMedium || cookieAttr.utm_medium;
    const utm_campaign = funnelUtm.utmCampaign || cookieAttr.utm_campaign;
    const utm_content = funnelUtm.utmContent || cookieAttr.utm_content;
    const utm_term = funnelUtm.utmTerm || cookieAttr.utm_term;

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
      tally: "funnel_tally_viewed",
      timemath: "funnel_timemath_viewed",
      mirror: "funnel_mirror_viewed",
      gap1: "funnel_gap1_viewed",
      gap2: "funnel_gap2_viewed",
      gap3: "funnel_gap3_viewed",
      mechanism: "funnel_mechanism_viewed",
      commit: "funnel_commit_viewed",
      processing: "funnel_processing_viewed",
      snapshot: "funnel_snapshot_viewed",
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
          from { background-size: 0% 30%; }
          to { background-size: 100% 30%; }
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
          background-position: left bottom;
          background-size: 0% 30%;
          padding-bottom: 1px;
        }
        .gap-highlight.sweep { animation: funnel-highlight-sweep 350ms ease-out forwards; }
        .funnel-screen { animation: funnel-slide-up 0.4s ease-out both; }
        .funnel-card-stagger { animation: funnel-card-in 0.35s ease-out both; }
        .funnel-bounce { animation: funnel-bounce-in 0.4s ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .funnel-screen, .funnel-card-stagger, .funnel-bounce { animation: none !important; opacity: 1 !important; transform: none !important; }
          .gap-highlight { background-size: 100% 30% !important; animation: none !important; }
          * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
        }
      `}} />

      {/* Progress bar */}
      <div className="fixed top-0 inset-x-0 z-50 h-[2px] bg-zinc-200/50">
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
          return STEP_ORDER[idx + 1] ?? "mirror";
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

      {/* ── Time Math (after Q5 duration — skipped for short durations) ── */}
      {step === "timemath" && (
        <TimeMathScreen key="timemath" answers={answers} onContinue={() => setStep("shared-q6")} onSkip={() => setStep("shared-q6")} />
      )}

      {/* ── Tally Counter (after Q9, before Mirror) ── */}
      {step === "tally" && (
        <TallyScreen key="tally" answers={answers} track={track}
          onContinue={(count) => {
            setAnswers((a) => ({ ...a, tally_count: count }));
            track("funnel_tally_set", { value: count });
            setStep("mirror");
          }}
        />
      )}

      {/* ── Mirror (Screen 10) ── */}
      {step === "mirror" && branch && (
        <MirrorScreen
          key="mirror"
          branch={branch}
          answers={answers}
          onContinue={() => setStep("gap1")}
        />
      )}

      {/* ── Gap 1: What it's costing you (Screen 10a) ── */}
      {step === "gap1" && branch && (
        <Gap1Screen key="gap1" branch={branch} answers={answers} onContinue={() => setStep("gap2")} />
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
        <MechanismScreen key="mechanism" branch={branch} answers={answers} onContinue={() => setStep("commit")} />
      )}

      {/* ── Hold-to-Commit (Screen 12) ── */}
      {step === "commit" && (
        <CommitmentScreen key="commit" track={track} onComplete={() => setStep("processing")} />
      )}

      {/* ── Processing Theater (Screen 12) ── */}
      {step === "processing" && (
        <ProcessingTheater key="processing" onComplete={() => setStep("snapshot")} />
      )}

      {/* ── Personalized Snapshot (Screen 13) ── */}
      {step === "snapshot" && branch && (
        <SnapshotScreen key="snapshot" branch={branch} answers={answers} onContinue={() => setStep("timeline")} />
      )}

      {/* ── Personalized Timeline (Screen 14) ── */}
      {step === "timeline" && branch && (
        <TimelineScreen key="timeline" branch={branch} answers={answers} onContinue={() => setStep("create-account")} />
      )}

      {/* ── Create Account (Screen 16 — v3 account-first flow) ── */}
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
            setStep("savings");
          }}
        />
      )}

      {/* ── Lock In Your Savings (Screen 17 — optional paywall) ── */}
      {/* TrackCompleteRegistration handles OAuth returnees who land here
          after Google/Apple redirect. For email/password the sessionStorage
          guard prevents double-fire. Component self-guards via CAPI 5-min check. */}
      {step === "savings" && <TrackCompleteRegistration />}
      {step === "savings" && (
        <SavingsScreen
          key="savings"
          branch={branch}
          answers={answers}
          track={track}
          selectedPlan={selectedPlan}
          onPlanChange={setSelectedPlan}
          onCheckout={handleCheckout}
          onSkip={() => {
            track("funnel_trial_continued");
            setStep("download");
          }}
          loading={checkoutLoading}
          error={apiError}
        />
      )}

      {/* ── Download (Screen 18) ── */}
      {step === "download" && (
        <DownloadScreen key="download" track={track} paymentConfirmed={paymentConfirmed} selectedPlan={selectedPlan} />
      )}
    </div>
  );
}

// ─── Single Select Question Screen ──────────────────────────────────────────

function SingleSelectScreen({ question, questionLarge, options, normalization, onSelect, highlightBranch }: {
  question?: string;
  questionLarge?: string;
  options: { label: string; branch?: Branch }[];
  normalization?: string;
  onSelect: (opt: { label: string; branch?: Branch }) => void;
  highlightBranch?: Branch;
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

// ─── Tally Counter Screen (after Q9, before Mirror) ─────────────────────────

function TallyScreen({ answers, track, onContinue }: {
  answers: Record<string, string | string[]>;
  track: (event: string, props?: Record<string, unknown>) => void;
  onContinue: (count: string) => void;
}) {
  const q9 = String(answers.shared_q9 ?? "");
  const header = getTallyHeader(q9);
  const [count, setCount] = useState(0);
  const [popKey, setPopKey] = useState(0);
  const [showPrompt, setShowPrompt] = useState(false);
  const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const hasTapped = count > 0;

  const increment = () => {
    if (count >= 20) return; // cap at 20
    setCount((c) => c + 1);
    setPopKey((k) => k + 1);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
  };

  // Show "Keep going" prompt after 2 taps
  useEffect(() => {
    if (count >= 2 && !showPrompt) setShowPrompt(true);
  }, [count, showPrompt]);

  const handleLostCount = () => onContinue("lost_count");
  const handleContinue = () => onContinue(count > 20 ? "20+" : String(count));

  const display = count > 20 ? "20+" : String(count);

  // Invitation pulse: 3 cycles × 1.5s = 4.5s, then stops. Only before first tap.
  const pulseStyle = !prefersReduced && !hasTapped
    ? { animation: "funnel-invite-pulse 1.5s ease-in-out 3" }
    : undefined;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-zinc-900">
      <div className="max-w-md w-full text-center funnel-screen">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight leading-snug mb-3">{header}</h2>

        {/* Instruction line — fades in with the question */}
        <p className="text-sm text-zinc-400 mb-10 funnel-screen">Tap once for each time it happened.</p>

        {/* The big tappable counter — circular container */}
        <button
          onClick={increment}
          className="relative mx-auto mb-4 flex items-center justify-center w-[140px] h-[140px] sm:w-[160px] sm:h-[160px] rounded-full border-2 border-zinc-200 bg-zinc-50/80 select-none active:scale-95 transition-transform"
          style={pulseStyle}
          aria-label="Tap to count"
        >
          <span key={popKey} className="text-[72px] sm:text-[96px] font-extrabold text-acuity-primary tabular-nums leading-none"
            style={!prefersReduced && popKey > 0 ? { animation: "funnel-check-pop 150ms ease-out" } : undefined}>
            {display}
          </span>
        </button>

        {/* Prompt after 2+ taps */}
        <p className={`text-xs text-zinc-400 mb-12 transition-all duration-500 ${showPrompt ? "opacity-100" : "opacity-0"}`}>
          Keep going. Count them all.
        </p>

        {/* Lost count link — generous vertical separation */}
        <button onClick={handleLostCount} className="text-sm text-zinc-400 hover:text-zinc-600 underline transition mb-10 block mx-auto py-2">
          Honestly, I&rsquo;ve lost count
        </button>

        {/* CTA — visible after first tap or lost-count */}
        <div className={`transition-all duration-500 ${hasTapped ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[12px]"}`}>
          <button onClick={handleContinue}
            className="rounded-full bg-acuity-primary px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-acuity-primary-lo active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Time-Math Screen (after Q5 duration) ───────────────────────────────────

function TimeMathScreen({ answers, onContinue, onSkip }: {
  answers: Record<string, string | string[]>;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const dur = String(answers.shared_q5 ?? "");
  const content = getTimeMathContent(dur);
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-zinc-900"
      onClick={phase < 5 ? skip : undefined}>
      <div className="max-w-md w-full text-center">
        {/* Kicker */}
        <div className={`mb-10 transition-all duration-500 ease-out ${beat(1)}`}>
          <p className="text-[15px] text-zinc-600">You said this has been running for {content.herDuration}.</p>
        </div>

        {/* Hero */}
        <div className="mb-10">
          {content.count !== null ? (
            /* Numeric variant — ease-out count-up */
            <div className={`transition-all duration-500 ease-out ${beat(2)}`}>
              <span className="text-[64px] sm:text-[80px] font-extrabold text-zinc-900 tabular-nums leading-none">
                {phase >= 2 ? displayNum.toLocaleString() : "0"}
              </span>
            </div>
          ) : (
            /* Thousands variant — rapid scramble then word resolve */
            <div className={`transition-all duration-500 ease-out ${beat(2)}`}>
              {!scrambleResolved ? (
                <span className="text-[64px] sm:text-[80px] font-extrabold text-zinc-900 tabular-nums leading-none inline-block min-w-[4ch]">
                  {scrambleDisplay || "\u00A0"}
                </span>
              ) : (
                <span className="text-[48px] sm:text-[64px] font-extrabold text-zinc-900 leading-none inline-block"
                  style={{ animation: prefersReduced ? "none" : "funnel-scramble-resolve 350ms ease-out both" }}>
                  Thousands
                </span>
              )}
            </div>
          )}

          {/* Label — staggered after hero resolves */}
          <div className={`mt-2 transition-all duration-300 ease-out ${beat(3)}`}>
            <span className="text-xl text-zinc-500 font-medium">{content.label}</span>
          </div>
        </div>

        {/* Closer */}
        <div className={`mb-12 transition-all duration-[600ms] ${phase >= 4 ? "opacity-100" : "opacity-0"}`}
          style={phase >= 4 ? { animation: "funnel-settle 600ms ease-out both" } : undefined}>
          <p className="text-[17px] font-bold text-zinc-900">Evenings you don&rsquo;t get back. The next ones are still up for grabs.</p>
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

// ─── Mirror Screen (v4: 3-beat, ≤70 words) ──────────────────────────────────

function MirrorScreen({ branch, answers, onContinue }: {
  branch: Branch; answers: Record<string, string | string[]>; onContinue: () => void;
}) {
  const lines = buildMirrorLines(branch, answers);
  const [phase, setPhase] = useState(0);
  const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (prefersReduced) { setPhase(4); return; }
    const t: ReturnType<typeof setTimeout>[] = [];
    // Header at 0ms (via funnel-slide-up class)
    // Beat 1 at +800ms
    t.push(setTimeout(() => setPhase(1), 800));
    // Beat 2 at +2400ms
    t.push(setTimeout(() => setPhase(2), 2400));
    // Beat 3 (settle) at +4000ms
    t.push(setTimeout(() => setPhase(3), 4000));
    // CTA at +4800ms
    t.push(setTimeout(() => setPhase(4), 4800));
    return () => t.forEach(clearTimeout);
  }, [prefersReduced]);

  const skip = () => setPhase(4);
  const beat = (n: number) => phase >= n ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[12px]";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-zinc-900"
      onClick={phase < 4 ? skip : undefined}>
      <div className="max-w-md w-full">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-10 funnel-screen">
          We heard you.
        </h2>

        {/* Beat 1: sharpest pain reflection */}
        <div className={`mb-8 border-l-2 border-acuity-primary/40 pl-5 transition-all duration-500 ease-out ${beat(1)}`}>
          <p className="text-[15px] text-zinc-700 leading-relaxed">{lines[0]}</p>
        </div>

        {/* Beat 2: Q9 echo + closer */}
        <div className={`mb-10 border-l-2 border-acuity-primary/40 pl-5 transition-all duration-500 ease-out ${beat(2)}`}>
          <p className="text-[15px] text-zinc-700 leading-relaxed">{lines[1]}</p>
        </div>

        {/* Beat 3 (settle): the closer */}
        <div className={`mb-10 text-center transition-all duration-[600ms] ${phase >= 3 ? "opacity-100" : "opacity-0"}`}
          style={phase >= 3 ? { animation: "funnel-settle 600ms ease-out both" } : undefined}>
          <p className="text-lg font-bold text-zinc-900">You don&rsquo;t have to keep living like this.</p>
        </div>

        {/* CTA */}
        <div className={`text-center transition-all duration-500 ${beat(4)}`}>
          <button onClick={(e) => { e.stopPropagation(); onContinue(); }}
            className="rounded-full bg-acuity-primary px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-acuity-primary-lo active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Gap 1: "The weight stacking up" (loss, personalized) ──────────────────

function Gap1Screen({ branch, answers, onContinue }: {
  branch: Branch; answers: Record<string, string | string[]>; onContinue: () => void;
}) {
  const content = buildGap1Content(branch, answers);
  const tallyValue = String(answers.tally_count ?? "");
  const kicker = getTallyKicker(tallyValue);
  const hasKicker = kicker.length > 0;
  // Phases: 1=kicker (if present), 2=hero, 3=undertone, 4=settle, 5=CTA
  const maxPhase = 5;
  const [phase, setPhase] = useState(0);
  const [highlightPhase, setHighlightPhase] = useState(0);
  const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (prefersReduced) { setPhase(maxPhase); setHighlightPhase(content.costWords.length); return; }
    const t: ReturnType<typeof setTimeout>[] = [];
    let offset = 0;
    // Beat 1: kicker (if present)
    if (hasKicker) {
      t.push(setTimeout(() => setPhase(1), 0));
      offset = 1200;
    }
    // Beat 2: hero line
    t.push(setTimeout(() => setPhase(2), offset));
    // Highlight sweep on cost words, 400ms after hero lands
    content.costWords.forEach((_, i) => {
      t.push(setTimeout(() => setHighlightPhase(i + 1), offset + 500 + 400 + i * 250));
    });
    // Beat 3: undertone at +1600ms from hero
    t.push(setTimeout(() => setPhase(3), offset + 1600));
    // Beat 4: settle closer at +2800ms
    t.push(setTimeout(() => setPhase(4), offset + 2800));
    // Beat 5: CTA at +3600ms
    t.push(setTimeout(() => setPhase(maxPhase), offset + 3600));
    return () => t.forEach(clearTimeout);
  }, [prefersReduced, content.costWords.length, hasKicker]);

  // Tap-to-skip: any tap on the container completes all beats
  const skip = () => { setPhase(maxPhase); setHighlightPhase(content.costWords.length); };

  // Render hero line with highlighted cost words
  const renderHero = () => {
    if (content.costWords.length === 0) return content.line1;
    const parts: (string | { word: string; idx: number })[] = [];
    let remaining = content.line1;
    content.costWords.forEach((word, i) => {
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

  const beat = (n: number) => phase >= n ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[12px]";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-zinc-900"
      onClick={phase < maxPhase ? skip : undefined}>
      <div className="max-w-md w-full flex flex-col items-center justify-center" style={{ minHeight: "70vh" }}>
        {/* KICKER: condensed tally count — uppercase, letter-spaced, small */}
        {hasKicker && (
          <div className={`mb-10 transition-all duration-500 ease-out ${beat(1)}`}>
            <p className="text-[11px] sm:text-xs font-semibold tracking-[0.2em] text-zinc-400 text-center">
              {kicker}
            </p>
          </div>
        )}
        {/* HERO: the main cost statement — largest text, centered */}
        <div className={`mb-12 transition-all duration-500 ease-out ${beat(2)}`}>
          <p className="text-xl sm:text-2xl font-bold text-zinc-900 leading-[1.5] text-center">{renderHero()}</p>
        </div>
        {/* UNDERTONE: compounding cost — smaller, reduced opacity */}
        <div className={`mb-12 transition-all duration-500 ease-out ${beat(3)}`} style={{ opacity: phase >= 3 ? 0.7 : 0 }}>
          <p className="text-[15px] text-zinc-500 leading-relaxed text-center">{content.line2}</p>
        </div>
        {/* SETTLE CLOSER: weighted final line */}
        <div className={`mb-14 ${phase >= 4 ? "" : "opacity-0"}`}
          style={phase >= 4 ? { animation: "funnel-settle 600ms ease-out both" } : undefined}>
          <p className="text-[17px] font-bold text-zinc-900 text-center">{content.line3}</p>
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

        {/* Scene beats — dim-cascade */}
        {lines.map((line, i) => {
          const beatPhase = i + 2;
          const isCurrentBeat = phase === beatPhase || (phase === beatPhase && !askVisible);
          const isBright = phase >= beatPhase && !askVisible && phase <= beatPhase;
          // Current beat is bright, past beats dim to 45%, all dim to 35% when ask shows
          let opacity: number;
          if (phase < beatPhase) opacity = 0;
          else if (askVisible) opacity = 0.35;
          else if (phase === beatPhase) opacity = 1;
          else opacity = 0.45; // past beat

          return (
            <div key={i}
              className={`mb-6 transition-all duration-[800ms] ease-out ${phase >= beatPhase ? "translate-y-0" : "translate-y-[12px]"}`}
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

function MechanismScreen({ branch, answers, onContinue }: {
  branch: Branch; answers: Record<string, string | string[]>; onContinue: () => void;
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

// ─── Personalized Snapshot (Screen 13) ───────────────────────────────────────

function SnapshotScreen({ branch, answers, onContinue }: {
  branch: Branch; answers: Record<string, string | string[]>; onContinue: () => void;
}) {
  const insight = getSnapshotInsight(branch, answers);
  const previews = SNAPSHOT_PREVIEWS[branch];
  const bottomLine = SNAPSHOT_BOTTOM[branch];
  const [vis, setVis] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= 6; i++) timers.push(setTimeout(() => setVis(i), 600 + i * 800));
    return () => timers.forEach(clearTimeout);
  }, []);

  const show = (at: number) => vis >= at ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4";

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-16 text-zinc-900">
      <div className="max-w-md w-full">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-center mb-10 funnel-screen">
          In 60 seconds, you said more than you realize.
        </h2>

        {/* Section 1 — The Pattern You Can't See */}
        <div className={`mb-10 rounded-2xl border-2 border-acuity-primary/30 bg-white p-6 transition-all duration-[800ms] ${show(1)}`}
          style={{ boxShadow: vis >= 1 ? "var(--acuity-glow-soft)" : "none" }}>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-acuity-primary mb-3">The pattern you can&rsquo;t see</p>
          <p className="text-[15px] text-zinc-700 leading-relaxed">{insight}</p>
        </div>

        {/* Section 2 — What One Week Reveals */}
        <div className={`mb-10 transition-all duration-[800ms] ${show(2)}`}>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400 mb-4">What one week reveals</p>
          <div className="space-y-3">
            {previews.map((p, i) => (
              <div key={i} className={`rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-3 transition-all duration-500 ${vis >= 3 + i ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
                style={{ borderLeft: "3px solid var(--acuity-primary)" }}>
                <p className="text-xs text-zinc-600 leading-relaxed font-mono">{p}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Section 3 — Bottom Line */}
        <div className={`mb-8 text-center transition-all duration-[800ms] ${show(5)}`}>
          <p className="text-base font-semibold text-zinc-900 leading-relaxed">{bottomLine}</p>
        </div>

        <div className={`text-center transition-all duration-500 ${show(6)}`}>
          <button onClick={onContinue}
            className="rounded-full bg-acuity-primary px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-acuity-primary-lo active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Personalized Timeline (Screen 14) ──────────────────────────────────────

function TimelineScreen({ branch, answers, onContinue }: { branch: Branch; answers: Record<string, string | string[]>; onContinue: () => void }) {
  const weeks = getTimelineWeeks(branch, answers);
  const [visibleNodes, setVisibleNodes] = useState(0);
  const [showBtn, setShowBtn] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    weeks.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleNodes(i + 1), 600 + i * 900));
    });
    timers.push(setTimeout(() => setShowBtn(true), 600 + weeks.length * 900 + 600));
    return () => timers.forEach(clearTimeout);
  }, [weeks.length]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-zinc-900">
      <div className="max-w-md w-full">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-center mb-10 funnel-screen">
          This is what changes.
        </h2>
        <div className="relative">
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
        <div className={`mt-10 text-center transition-all duration-300 ${showBtn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
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

    // Client-side validation — fire funnel_signup_failed for each so admin sees it
    if (!signupName.trim()) {
      setSignupError("Please enter your name.");
      track("funnel_signup_failed", { value: "validation:name_empty", method: "email" });
      return;
    }
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
    await signIn(provider, { callbackUrl: "/start?step=savings" });
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
          <input type="text" value={signupName} onChange={(e) => setSignupName(e.target.value)} placeholder="Full name" autoComplete="name"
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
                <button type="button" onClick={() => signIn(undefined, { callbackUrl: "/start?step=savings" })}
                  className="mt-1.5 inline-block text-acuity-primary font-semibold underline">
                  Sign in to your existing account
                </button>
              )}
              {accountCreatedButSigninFailed && (
                <button type="button" onClick={() => signIn(undefined, { callbackUrl: "/start?step=savings" })}
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
          <button onClick={() => signIn(undefined, { callbackUrl: "/start?step=savings" })} className="text-acuity-primary font-semibold underline">Sign in</button>
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

function SavingsScreen({ branch, answers, track, selectedPlan, onPlanChange, onCheckout, onSkip, loading, error }: {
  branch: Branch | null;
  answers: Record<string, string | string[]>;
  track: (event: string, props?: Record<string, unknown>) => void;
  selectedPlan: "monthly" | "yearly"; onPlanChange: (p: "monthly" | "yearly") => void;
  onCheckout: () => void; onSkip: () => void; loading: boolean; error: string | null;
}) {
  const annualMonthly = Math.round(ANNUAL_PRICE_CENTS / 12);
  const costRecap = branch ? getSavingsCostRecap(branch) : null;

  return (
    <div className="min-h-screen text-zinc-900 pb-32">
      <div className="max-w-lg mx-auto px-6 pt-10">

        {/* Section 1 — Confirmation header */}
        <section className="text-center mb-6 funnel-screen">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-4 py-1.5 mb-4">
            <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            <span className="text-sm font-medium text-emerald-700">Account created</span>
          </div>
          <h2 className="text-[22px] sm:text-[28px] font-bold tracking-tight leading-snug">You&rsquo;re in. Now lock in a rate that won&rsquo;t last.</h2>
          <p className="text-sm text-zinc-500 mt-2">As a founding member, you get Acuity at a price we&rsquo;ll never offer again.</p>
        </section>

        {/* Section 2 — Loss-aversion recap (v4) */}
        <section className="mb-6 funnel-card-stagger" style={{ animationDelay: "80ms" }}>
          <p className="text-sm text-zinc-700 text-center leading-relaxed font-medium">{getPaywallLossRecap(branch)}</p>
        </section>

        {/* Section 3 — The next few weeks timeline */}
        <section className="mb-6 funnel-card-stagger" style={{ animationDelay: "140ms" }}>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-400 mb-3 text-center">The next few weeks</p>
          <div className="space-y-3">
            {SAVINGS_TIMELINE.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-2 h-2 rounded-full bg-acuity-primary mt-1" />
                  {i < SAVINGS_TIMELINE.length - 1 && <div className="w-px h-6 bg-zinc-200" />}
                </div>
                <div>
                  <p className="text-xs font-bold text-zinc-700">{item.week}</p>
                  <p className="text-xs text-zinc-500">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm font-semibold text-zinc-800 text-center mt-4">Less in your head. More in your hands.</p>
        </section>

        {/* Section 4 — Cost comparison */}
        <section className="mb-6 text-center funnel-card-stagger" style={{ animationDelay: "200ms" }}>
          <p className="text-sm text-zinc-600 font-semibold">
            <span className="text-zinc-400">Therapy: $150/session.</span>{" "}
            <span className="text-zinc-400">A coach: $200/month.</span>{" "}
            <span className="text-zinc-900">Acuity: less than a coffee a week.</span>
          </p>
        </section>

        {/* Section 5 — Pricing cards */}
        <section className="mb-6 rounded-xl bg-white border border-zinc-200 px-5 py-5 shadow-sm funnel-card-stagger" style={{ animationDelay: "260ms" }}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button onClick={() => onPlanChange("monthly")}
              className={`rounded-xl p-4 text-center transition relative ${selectedPlan === "monthly" ? "border-2 border-acuity-primary bg-gradient-to-b from-acuity-primary/10 to-acuity-primary/5 shadow-acuity-glow-soft" : "border border-zinc-200 bg-white"}`}>
              <p className="text-xs text-zinc-500 mb-1">Monthly</p>
              <p className="text-sm text-red-400 line-through font-semibold">$19.99<span className="text-xs font-normal">/mo</span></p>
              <p className="text-2xl font-extrabold text-zinc-900">{formatDollars(MONTHLY_PRICE_CENTS)}<span className="text-sm font-normal text-zinc-400">/mo</span></p>
              <span className="inline-block mt-2 rounded-full bg-acuity-primary text-white px-3 py-1 text-[10px] font-bold tracking-wide shadow-sm">FOUNDING RATE</span>
              <p className="text-[10px] text-zinc-400 mt-1">Billed monthly</p>
            </button>
            <button onClick={() => onPlanChange("yearly")}
              className={`rounded-xl p-4 text-center transition relative ${selectedPlan === "yearly" ? "border-2 border-acuity-primary bg-gradient-to-b from-acuity-primary/10 to-acuity-primary/5 shadow-acuity-glow-soft" : "border border-zinc-200 bg-white"}`}>
              <p className="text-xs text-zinc-500 mb-1">Annual</p>
              <p className="text-sm text-red-400 line-through font-semibold">$199<span className="text-xs font-normal">/yr</span></p>
              <p className="text-2xl font-extrabold text-zinc-900">{formatDollars(ANNUAL_PRICE_CENTS)}<span className="text-sm font-normal text-zinc-400">/yr</span></p>
              <span className="inline-block mt-1 rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-[10px] font-bold">SAVE {PRICING.annual.savingsVsMonthly}</span>
              <p className="text-[10px] text-zinc-400 mt-1">{formatDollars(annualMonthly)}/mo billed annually</p>
            </button>
          </div>

          {/* Founding rate urgency (honest — no fake countdown or spots) */}
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-center">
            <p className="text-xs text-emerald-800 font-semibold">Founding rate &mdash; locked in for life if you start today.</p>
            <p className="text-[10px] text-emerald-600 mt-0.5">This price rises as we grow.</p>
          </div>

          {/* Micro-testimonial */}
          <p className="text-[12px] text-zinc-500 text-center italic mt-3">&ldquo;{PAYWALL_TESTIMONIALS_V2[0].quote.slice(0, 80)}&hellip;&rdquo; &mdash; {PAYWALL_TESTIMONIALS_V2[0].name}</p>
        </section>
      </div>

      {/* Sticky CTA + skip */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-zinc-100 px-6 py-3 safe-area-pb">
        <div className="max-w-lg mx-auto">
          {error && <p className="text-xs text-red-500 text-center mb-1">{error}</p>}
          <button onClick={onCheckout} disabled={loading}
            className="w-full rounded-full bg-acuity-primary py-3.5 text-[15px] font-semibold text-white transition hover:bg-acuity-primary-lo active:scale-[0.98] disabled:opacity-50 shadow-acuity-glow-soft animate-[funnel-glow_2s_ease-in-out_infinite]">
            {loading ? "Loading\u2026" : "Lock In My Savings"}
          </button>
          <button onClick={onSkip} className="w-full py-3 text-sm text-zinc-500 hover:text-zinc-700 transition font-medium">
            Continue without paying &rarr;
          </button>
          <p className="text-[10px] text-zinc-400 text-center">14-day free trial included with all plans. Cancel anytime. You won&rsquo;t be charged today.</p>
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
  const browserEnv = typeof window !== "undefined" ? detectBrowserEnv() : { isWebView: false, label: "ssr", ua: "" };

  useEffect(() => {
    track("funnel_download_screen_viewed");
    if (browserEnv.isWebView) {
      track("funnel_inapp_browser_detected", { value: browserEnv.label });
    }
  }, [track, browserEnv.isWebView, browserEnv.label]);

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
            <p className="text-sm text-zinc-500 mb-2">You have 14 days to explore everything Acuity offers.</p>
            <p className="text-sm text-zinc-500 mb-10">Record your first debrief &mdash; in the app or right here on the web.</p>
          </>
        )}

        <button
          onClick={() => {
            track("funnel_app_store_clicked", { value: browserEnv.isWebView ? "webview" : "browser" });
            if (browserEnv.isWebView) {
              // In Facebook/Instagram WebView: try itms-apps:// first (opens App Store app directly),
              // then fall back to https:// with _blank, then window.location as last resort
              const itmsUrl = APP_STORE_URL.replace("https://", "itms-apps://");
              window.location.href = itmsUrl;
              setTimeout(() => { window.open(APP_STORE_URL, "_blank"); }, 1000);
            } else {
              window.open(APP_STORE_URL, "_blank");
            }
          }}
          className="relative w-full rounded-full px-8 py-3.5 text-[15px] font-semibold text-white transition hover:brightness-110 active:scale-[0.98] overflow-hidden funnel-bounce"
          style={{ background: "var(--acuity-grad-primary)", boxShadow: "var(--acuity-glow-primary)" }}>
          <span className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)", backgroundSize: "200% 100%", animation: "funnel-shimmer 2s ease-in-out infinite" }} />
          <span className="relative">Download on the App Store</span>
        </button>

        {browserEnv.isWebView && (
          <p className="mt-3 text-xs text-zinc-400 text-center">
            Didn&rsquo;t work?{" "}
            <button
              onClick={() => {
                navigator.clipboard.writeText(APP_STORE_URL).then(() => setCopied(true)).catch(() => {});
                track("funnel_copy_app_link_clicked");
              }}
              className="text-acuity-primary font-medium underline"
            >
              {copied ? "Link copied! Paste in Safari." : "Copy link and open in Safari"}
            </button>
          </p>
        )}

        <button disabled
          className="w-full mt-3 rounded-full border border-zinc-200 bg-zinc-100 px-8 py-3.5 text-[15px] font-semibold text-zinc-400 cursor-not-allowed">
          Google Play — Coming soon!
        </button>

        <button
          onClick={async () => {
            track("funnel_continue_web_app_clicked");

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
