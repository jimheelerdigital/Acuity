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
import { detectBrowserEnv, useAppStoreCta, WebviewBreakout } from "@/components/app-store-cta";
import {
  type Branch,
  type Question,
  ENTRY_QUESTION,
  BRANCH_QUESTIONS,
  SHARED_QUESTIONS,
  BRANCH_Q6,
  assemblePainCopy,
  PAIN_EMPHASIS,
  RELIEF_FLIP,
  assembleCurrentFuture,
  TRANSFORMATION_ROWS,
  PROCESSING_STAGES,
  SNAPSHOT_BOTTOM,
  getTimelineWeeks,
  PAYWALL_HOOKS,
  getPaywallHeadline,
  getCreateAccountHeadline,
  PAYWALL_TESTIMONIALS_V2,
  getPaywallTestimonialPool,
  getPatternLabels,
} from "@/lib/funnel-config";

// ─── Types ──────────────────────────────────────────────────────────────────

type Step =
  | "entry"
  | "branch-q2" | "branch-q3" | "branch-q4"
  | "shared-q5"
  | "branch-q6"
  | "pain"
  | "relief-flip"
  | "current-future"
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
  "shared-q5", "branch-q6",
  "pain", "relief-flip", "current-future", "mechanism", "value", "commit",
  "processing", "pattern-result", "timeline",
  "create-account", "savings", "download",
];

const TOTAL_STEPS = STEP_ORDER.length;

// ─── Constants ──────────────────────────────────────────────────────────────

const APP_STORE_URL = "https://apps.apple.com/us/app/acuity-daily/id6762633410";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.heelerdigital.acuity";

// Testimonials used on Download screen
const DOWNLOAD_TESTIMONIALS = [
  { quote: "I found out I mention quitting my job every Monday. That one pattern changed everything.", name: "Sarah M." },
  { quote: "My therapist asked what changed. I showed her my Ripple report.", name: "James K." },
  { quote: "Week 3, Ripple connected my mom to my work stress. A year of therapy never did.", name: "Priya R." },
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
    trackOnboardingEvent(event, { sessionToken: sessionId.current, utm: utmRef.current, flowVersion: "v7", ...props });
  }, []);
}

// ─── WebView Detection ──────────────────────────────────────────────────────
// detectBrowserEnv / useAppStoreCta / WebviewBreakout are the shared App Store
// CTA webview helpers (see components/app-store-cta.tsx) — imported above so the
// funnel and the post-signup success CTAs share one implementation.

// PII-safe, pipe-delimited environment string for signup/OAuth diagnostics.
// Mirrors DownloadScreen's diagContext so create-account events can be sliced by
// the EXACT environment they happened in (webview? which app? which OS?). The
// raw user-agent is already stored server-side in OnboardingEvent.browser on
// every event, so we deliberately keep this string short — no UA duplication.
function getSignupEnvDiag(): string {
  const env = detectBrowserEnv();
  if (env.label === "ssr") return "ssr";
  const os = /iPhone|iPad|iPod/i.test(env.ua) ? "ios" : /Android/i.test(env.ua) ? "android" : "other";
  return `webview:${env.isWebView}|label:${env.label}|os:${os}`;
}

// Pending-OAuth marker: written to localStorage right before we hand off to the
// provider (signIn does a full-page navigation, so our JS dies until — and only
// IF — the user returns). On the NEXT funnel mount we reconcile the marker to
// see how the OAuth attempt ended:
//   • returned to /start?step=post-signup  → success  (funnel_oauth_returned_success)
//   • bounced back to create-account form  → failure  (funnel_oauth_returned_error /
//                                             funnel_oauth_never_returned if the gap is long)
// A user who closes the webview entirely and never comes back is, by definition,
// invisible client-side — that true silent death is only measurable in aggregate
// as (funnel_oauth_*_tapped count) − (funnel_oauth_returned_* count).
const OAUTH_PENDING_KEY = "acuity_oauth_pending";
// Gap (ms) above which a bounce-back to the signup form is treated as a long
// silent stall ("never returned" in spirit) rather than a quick error bounce.
const OAUTH_NEVER_RETURNED_MS = 60_000;

interface OAuthPending { provider: string; ts: number; env: string; }

function readOAuthPending(): OAuthPending | null {
  try {
    const raw = localStorage.getItem(OAUTH_PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as OAuthPending;
    return p && typeof p.ts === "number" ? p : null;
  } catch { return null; }
}

function clearOAuthPending(): void {
  try { localStorage.removeItem(OAUTH_PENDING_KEY); } catch {}
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
    if (p && (["overload","patterns","rumination","stuck","mask"] as string[]).includes(p)) return p as Branch;
    return undefined;
  });
  const [apiError, setApiError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  // Monthly is the locked default-selected plan. We intentionally do NOT restore
  // a persisted selectedPlan here — a stale "yearly" from an earlier build/session
  // would otherwise reappear as the default. Always lead with monthly on load;
  // the user can still switch, and the switch persists within the session.
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("monthly");
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
              fireFbq("Purchase", { value: selectedPlan === "yearly" ? 39.99 : 4.99, currency: "USD", content_name: "Ripple Pro Subscription" });
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
      // Account is now created — surface the OPTIONAL paywall next (account is
      // created BEFORE the pay decision, so there's no payment-intent to check).
      // Reconcile the pending-OAuth marker: this is the SUCCESS outcome.
      const pending = readOAuthPending();
      const envDiag = getSignupEnvDiag();
      if (pending) {
        const awayMs = Date.now() - pending.ts;
        track("funnel_oauth_returned_success", { value: `${pending.provider}|${pending.env}|awayMs:${awayMs}` });
        clearOAuthPending();
      }
      track("funnel_account_created", { value: `method:oauth|${envDiag}` });
      fireFbq("StartTrial", { value: 4.99, currency: "USD", predicted_ltv: 39.99 });
      if (typeof window !== "undefined" && "gtag" in window) {
        (window as unknown as { gtag: (...args: unknown[]) => void }).gtag("event", "sign_up", { method: "oauth" });
      }
      // Account exists → optional paywall. Pay or skip is decided there.
      resolvedStep = "savings";
      setStepRaw("savings");
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

  // Resume a signed-in user at their furthest funnel step (server truth).
  //
  // Return-path fix (2026-07-10): funnel progress used to live only in
  // sessionStorage, which is cleared when the tab/session ends. A user who
  // created an account + selected a plan and came back ~2h later got dumped at
  // the entry diagnostic. /api/onboarding/resume derives the furthest step from
  // the DB + OnboardingEvent history, so a signed-in user never sees the entry
  // screen again. We DON'T override an explicit ?step= return (Stripe success /
  // OAuth callback), and we only ever move the user FORWARD — never backward
  // past a step they'd already advanced to in this session.
  const resumeChecked = useRef(false);
  useEffect(() => {
    if (authStatus !== "authenticated" || !session?.user || resumeChecked.current) return;
    resumeChecked.current = true;

    // An explicit step param means this load is a deliberate return to a
    // specific screen (Stripe/OAuth); its own effect owns the step. Skip resume.
    const hasStepParam = new URLSearchParams(window.location.search).has("step");

    fetch("/api/onboarding/resume")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const serverStep = data?.step as Step | undefined;
        if (data?.subscriptionStatus === "PRO") {
          setPaymentConfirmed(true);
        }
        if (hasStepParam || !serverStep || !STEP_SET.has(serverStep)) return;
        // Only advance forward: never send a user back to an earlier step than
        // the one they're already viewing (e.g. don't pull "download" → "savings").
        setStepRaw((current) => {
          if (STEP_ORDER.indexOf(serverStep) <= STEP_ORDER.indexOf(current)) {
            return current;
          }
          window.history.replaceState({ funnelStep: serverStep }, "", buildStepUrl(serverStep));
          return serverStep;
        });
      })
      .catch(() => {});
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
      "branch-q6": "funnel_branch_q6_viewed",
      pain: "funnel_pain_viewed",
      "relief-flip": "funnel_relief_flip_viewed",
      "current-future": "funnel_current_future_viewed",
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
    if (step === "branch-q6" && branch) return BRANCH_Q6[branch];
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
        /* ── Shared quiz choice card — one warm, coral, branded system every
           choice screen (Q2-Q6 + Relief Flip) pulls from. ── */
        .funnel-choice {
          -webkit-tap-highlight-color: transparent;
          border: 1px solid oklch(0.86 0.055 38 / 0.6);
          background: oklch(0.995 0.012 60 / 0.85);
          box-shadow: 0 1px 2px oklch(0.55 0.05 38 / 0.06);
          transition: transform 200ms cubic-bezier(.32,.72,0,1), box-shadow 200ms ease, background 200ms ease, border-color 200ms ease, opacity 200ms ease;
        }
        @media (hover: hover) {
          .funnel-choice:not(.funnel-choice-selected):not(.funnel-choice-dim):hover {
            background: var(--acuity-primary-soft);
            border-color: oklch(0.80 0.11 38 / 0.5);
            transform: translateY(-2px);
            box-shadow: 0 8px 20px oklch(0.70 0.14 38 / 0.16);
          }
        }
        .funnel-choice:active { transform: translateY(0) scale(0.985); }
        .funnel-choice-selected {
          border-color: var(--acuity-primary);
          background: var(--acuity-primary-soft);
          box-shadow: 0 6px 22px oklch(0.70 0.15 38 / 0.28), inset 0 0 0 1px var(--acuity-primary);
        }
        .funnel-choice-dim { opacity: 0.4; }
        /* Ad-match hint on entry — coral-tinted but softer than a full selection. */
        .funnel-choice-hint {
          border-color: oklch(0.80 0.11 38 / 0.5);
          background: var(--acuity-primary-soft);
        }
        /* Coral left marker — a guided ring that fills on selection. */
        .funnel-marker {
          flex-shrink: 0;
          width: 9px; height: 9px;
          border-radius: 9999px;
          border: 1.5px solid oklch(0.80 0.10 38 / 0.55);
          background: transparent;
          transition: background 200ms ease, border-color 200ms ease, transform 200ms ease, box-shadow 200ms ease;
        }
        .funnel-marker[data-on="1"] {
          background: var(--acuity-primary);
          border-color: var(--acuity-primary);
          transform: scale(1.15);
          box-shadow: 0 0 0 3px var(--acuity-primary-soft);
        }
        /* Shared CTA emphasis — one class every primary funnel button pulls from. */
        .funnel-cta { animation: funnel-glow 2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .funnel-screen, .funnel-card-stagger, .funnel-bounce, .funnel-cta { animation: none !important; opacity: 1 !important; transform: none !important; }
          .gap-highlight { background-size: 100% 100% !important; animation: none !important; }
          * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
        }
      `}} />

      {/* Progress bar */}
      <div className="fixed top-[var(--install-banner-h)] inset-x-0 z-50 h-[3px] bg-acuity-primary/10">
        <div className="h-full bg-acuity-primary transition-all duration-700 ease-out"
          style={{ width: `${progressPct}%`, boxShadow: "0 0 8px var(--acuity-glow-primary)" }} />
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

      {/* ── Pain / Mirror (Screen 7 — answer-aware, assembled from Q2+Q3+Q6) ── */}
      {step === "pain" && branch && (
        <PainScreen key="pain" branch={branch} answers={answers} onContinue={() => setStep("relief-flip")} />
      )}

      {/* ── Relief Flip (Screen 8 — imagine the pain gone, how would you feel?) ── */}
      {step === "relief-flip" && branch && (
        <ReliefFlipScreen key="relief-flip" branch={branch} track={track}
          onSelect={(reliefId) => {
            setAnswers((a) => ({ ...a, relief_flip: reliefId }));
            track("funnel_relief_flip_selected", { value: reliefId });
            setStep("current-future");
          }}
        />
      )}

      {/* ── Current You vs Future You (Screen 9 — answer-aware two-state contrast) ── */}
      {step === "current-future" && branch && (
        <CurrentFutureScreen key="current-future" branch={branch} answers={answers} onContinue={() => setStep("mechanism")} />
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
        <TimelineScreen key="timeline" branch={branch} answers={answers} onContinue={() => setStep("create-account")} track={track} />
      )}

      {/* ── Create Account (Screen 15 — now BEFORE the paywall) ──
             Account is created + persisted here for EVERYONE (payers and
             skippers) before any pay decision or Stripe charge. ── */}
      {step === "create-account" && <TrackCompleteRegistration />}
      {step === "create-account" && (
        <CreateAccountScreen
          key="create-account"
          branch={branch}
          answers={answers}
          track={track}
          onAccountCreated={() => {
            track("funnel_account_created", { value: `method:email|${getSignupEnvDiag()}` });
            fireFbq("StartTrial", { value: 4.99, currency: "USD", predicted_ltv: 39.99 });
            if (typeof window !== "undefined" && "gtag" in window) {
              (window as unknown as { gtag: (...args: unknown[]) => void }).gtag("event", "sign_up", { method: "email" });
            }
            // Account now exists → surface the OPTIONAL paywall. The pay/skip
            // decision (and any Stripe charge) happens there, never before.
            setStep("savings");
          }}
        />
      )}

      {/* ── Optional Paywall (Screen 16 — shown AFTER the account exists) ──
             Pay → Stripe checkout → download. Skip → straight to download with
             a valid FREE account (no Pro granted). Mounts CompleteRegistration
             so OAuth signups (which return to this step, not create-account)
             still fire the reg pixel; it's idempotent + CAPI-guarded so email
             signups that already fired it are a no-op. ── */}
      {step === "savings" && !paymentConfirmed && <TrackCompleteRegistration />}
      {step === "savings" && (
        <SavingsScreen
          key="savings"
          branch={branch}
          answers={answers}
          track={track}
          selectedPlan={selectedPlan}
          onPlanChange={setSelectedPlan}
          onCheckout={() => {
            // "Lock in founders rate" — the account already exists, so go
            // straight to Stripe checkout (no account-creation detour).
            // paid_selected kept for legacy dashboards; lock_in_selected is the
            // v7 split event for the two-equal-buttons layout.
            track("funnel_paywall_paid_selected", { value: selectedPlan });
            track("funnel_paywall_lock_in_selected", { value: selectedPlan });
            handleCheckout();
          }}
          onSkip={() => {
            // "Continue to download" — keep the FREE account (no Pro), go to
            // the download page. skip_selected + trial_continued kept for
            // legacy dashboards; continue_selected is the v7 split event.
            track("funnel_paywall_skip_selected");
            track("funnel_paywall_continue_selected");
            track("funnel_trial_continued");
            setStep("download");
          }}
          loading={checkoutLoading}
          error={apiError}
        />
      )}

      {/* ── Download (Screen 18) ── */}
      {/* Backstop CompleteRegistration mount. The primary post-account surface is
          now the optional paywall (savings) step, which every signup — email and
          OAuth — passes through before download. This download mount stays as a
          belt-and-suspenders for any path that reaches download without having
          fired it yet. It POSTs /api/capi/complete-registration first
          (server-side CAPI, webview-proof — ~90% of this traffic is in-app
          webview where the browser pixel is unreliable), then fires the browser
          pixel with the same event_id for dedup.
          Gated on !paymentConfirmed so PAID users — who already fired
          CompleteRegistration on the paywall step before Stripe — do not
          double-fire when they return to download. The component also early-
          returns via the `acuity_reg_pixel_fired` sessionStorage guard, and the
          CAPI route's 5-minute new-signup guard is the final backstop against
          returning/authenticated users landing on download. */}
      {step === "download" && !paymentConfirmed && <TrackCompleteRegistration />}
      {step === "download" && (
        <DownloadScreen key="download" track={track} paymentConfirmed={paymentConfirmed} selectedPlan={selectedPlan} />
      )}
    </div>
  );
}

// Shared choice-card base — warm, coral, branded. Every quiz choice screen
// (single, multi, relief flip) composes from this one string + the stateful
// .funnel-choice-* / .funnel-marker classes defined in the global style block.
const CHOICE_BASE =
  "funnel-choice funnel-card-stagger w-full text-left rounded-2xl px-5 py-4 text-[15px] flex items-center gap-3 text-zinc-800";

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
            const isSelected = selected === opt.label;
            const isHighlighted = !selected && highlightBranch && opt.branch === highlightBranch;
            return (
            <button key={opt.label} onClick={() => handleTap(opt)}
              className={`${CHOICE_BASE} ${
                isSelected
                  ? "funnel-choice-selected animate-[funnel-pulse-select_0.2s_ease-out]"
                  : selected
                    ? "funnel-choice-dim"
                    : isHighlighted
                      ? "funnel-choice-hint"
                      : ""
              }`}
              style={{ animationDelay: `${i * 100}ms` }}
              disabled={!!selected}
            >
              <span className="funnel-marker" data-on={isSelected ? "1" : undefined} />
              <span className="flex-1">{opt.label}</span>
              {isSelected && (
                <span className="ml-1 flex-shrink-0 text-acuity-primary"
                  style={{ animation: "funnel-check-pop 250ms ease-out both" }}>&#10003;</span>
              )}
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
          {options.map((opt, i) => {
            const isOn = selected.has(opt);
            return (
            <button key={opt} onClick={() => toggle(opt)}
              className={`${CHOICE_BASE} ${isOn ? "funnel-choice-selected" : ""}`}
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <span className="funnel-marker" data-on={isOn ? "1" : undefined} />
              <span className="flex-1">{opt}</span>
              {isOn && (
                <span className="ml-1 flex-shrink-0 text-acuity-primary"
                  style={{ animation: "funnel-check-pop 250ms ease-out both" }}>&#10003;</span>
              )}
            </button>
            );
          })}
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

// Highlight the single longest emphasis phrase found in a beat with a coral,
// medium-weight span. Presentation only — one hit per line, never a whole
// sentence. Falls back to plain text when no phrase matches.
function emphasize(text: string, phrases: string[]): React.ReactNode {
  let best = "";
  for (const p of phrases) {
    if (p.length > best.length && text.includes(p)) best = p;
  }
  if (!best) return text;
  const idx = text.indexOf(best);
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-acuity-primary font-medium">{best}</span>
      {text.slice(idx + best.length)}
    </>
  );
}

// ─── Pain / Mirror Screen (answer-aware — assembled from Q2+Q3+Q6) ──────────

function PainScreen({ branch, answers, onContinue }: {
  branch: Branch; answers: Record<string, string | string[]>; onContinue: () => void;
}) {
  // Answer-aware: assemblePainCopy stitches the user's Q2/Q3/Q6 selections into
  // an ordered set of beats — [opener, Q2 echo, Q3 amplifier, Q6 cost, closer].
  // Length varies per branch/answers (empty fragments are dropped upstream), so
  // this renders whatever beats it's handed: first = recognition (border-left),
  // last = emphasized closer, middle = body lines.
  const beats = assemblePainCopy(branch, answers);
  const lastIndex = beats.length - 1;
  const ctaPhase = beats.length + 1; // beats reveal 1..length, then CTA
  const [phase, setPhase] = useState(0);
  const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (prefersReduced) { setPhase(ctaPhase); return; }
    const t: ReturnType<typeof setTimeout>[] = [];
    const first = 500;
    const step = 1100;
    for (let i = 1; i <= beats.length; i++) {
      t.push(setTimeout(() => setPhase(i), first + (i - 1) * step));
    }
    t.push(setTimeout(() => setPhase(ctaPhase), first + beats.length * step));
    return () => t.forEach(clearTimeout);
  }, [prefersReduced, beats.length, ctaPhase]);

  const skip = () => setPhase(ctaPhase);
  const shown = (n: number) => phase >= n ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[12px]";
  const emphasis = PAIN_EMPHASIS[branch];

  // One unified left-aligned column — an intimate reflection, revealed one line
  // at a time. Opener sets the scene, body lines carry the echo, and the closer
  // lands as a set-apart payoff beat. Clean background (page gradient only) so
  // the words are the sole focus.
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 py-16 text-zinc-900"
      onClick={phase < ctaPhase ? skip : undefined}>
      <div className="relative z-10 max-w-md w-full text-left">

        {beats.map((text, i) => {
          const revealed = shown(i + 1);
          const isOpener = i === 0;
          const isCloser = i === lastIndex;
          const cls = isCloser
            ? "mt-9 text-[17px] sm:text-lg font-medium text-zinc-900 leading-[1.65]"
            : isOpener
              ? "mb-6 text-[17px] sm:text-lg text-zinc-800 leading-[1.65]"
              : "mb-6 text-[15px] sm:text-base text-zinc-600 leading-[1.7]";
          return (
            <p key={i} className={`transition-all duration-[650ms] ease-out ${revealed} ${cls}`}>
              {emphasize(text, emphasis)}
            </p>
          );
        })}

        {/* CTA — available after the reveal, not rushed */}
        <div className={`mt-10 transition-all duration-500 ${shown(ctaPhase)}`}>
          <button onClick={(e) => { e.stopPropagation(); onContinue(); }}
            className="funnel-cta rounded-full bg-acuity-primary px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-acuity-primary-lo active:scale-[0.98]">
            Keep going
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Relief Flip (Screen 8 — imagine the pain gone, how would you feel?) ─────

function ReliefFlipScreen({ branch, track, onSelect }: {
  branch: Branch;
  track: (event: string, props?: Record<string, unknown>) => void;
  onSelect: (reliefId: string) => void;
}) {
  const config = RELIEF_FLIP[branch];
  const [chosen, setChosen] = useState<string | null>(null);

  const handle = (id: string) => {
    if (chosen) return;
    setChosen(id);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
    // Tap-to-advance: brief highlight, then continue.
    setTimeout(() => onSelect(id), 350);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-zinc-900">
      <div className="max-w-md w-full">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-center mb-8 leading-snug funnel-screen">{config.prompt}</h2>
        <div className="space-y-3">
          {config.options.map((o, i) => {
            const isChosen = chosen === o.id;
            return (
              <button key={o.id} onClick={() => handle(o.id)}
                className={`${CHOICE_BASE} ${isChosen ? "funnel-choice-selected" : ""}`}
                style={{ animationDelay: `${i * 80}ms` }}>
                <span className="funnel-marker" data-on={isChosen ? "1" : undefined} />
                <span className="flex-1">{o.label}</span>
                {isChosen && (
                  <span className="ml-1 flex-shrink-0 text-acuity-primary"
                    style={{ animation: "funnel-check-pop 250ms ease-out both" }}>
                    &#10003;
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Current You vs Future You (Screen 9 — answer-aware two-state contrast) ──

function CurrentFutureScreen({ branch, answers, onContinue }: {
  branch: Branch; answers: Record<string, string | string[]>; onContinue: () => void;
}) {
  const content = assembleCurrentFuture(branch, answers);
  // The branch framing pair (formerly the header subtext) now leads the rows as
  // its own paired left→arrow→right row, consistent with the transformation rows.
  const rows: [string, string][] = [[content.currentSub, content.futureSub], ...TRANSFORMATION_ROWS[branch]];
  const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Row-by-row reveal: activeRow is the highest row index shown (-1 = none);
  // within each row the left state, arrow sweep, and right pop are sequenced by
  // transition-delay. `done` gates the footer + CTA after all rows land.
  const [activeRow, setActiveRow] = useState(prefersReduced ? rows.length : -1);
  const [done, setDone] = useState(prefersReduced);

  useEffect(() => {
    if (prefersReduced) return;
    const t: ReturnType<typeof setTimeout>[] = [];
    // Reveal timing slowed 50% (2x) for a more deliberate, paced feel — was
    // first=300 / rowMs=760. The per-row CSS durations + transition-delays
    // below are doubled to match so the whole reveal plays at half speed.
    const first = 600;
    const rowMs = 1520;
    for (let i = 0; i < rows.length; i++) {
      t.push(setTimeout(() => setActiveRow(i), first + i * rowMs));
    }
    t.push(setTimeout(() => setDone(true), first + rows.length * rowMs));
    return () => t.forEach(clearTimeout);
  }, [prefersReduced, rows.length]);

  const skip = () => { setActiveRow(rows.length); setDone(true); };
  const revealed = (i: number) => activeRow >= i;

  // Shared 3-column template used by BOTH the background panel layer and the
  // foreground label/row layer, so the two grey/coral panels sit exactly under
  // the left/right text columns and the middle column stays a transparent gap
  // that the arrows bridge. No gap-x — the fixed middle column IS the gap.
  const grid = "grid grid-cols-[1fr_30px_1fr] sm:grid-cols-[1fr_46px_1fr]";

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-5 py-16 text-zinc-900"
      onClick={!done ? skip : undefined}>
      <div className="w-full max-w-md">

        {/* Header */}
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-center mb-7 leading-snug">{content.header}</h2>

        {/* Paneled transformation diagram — dead-grey "before" vs alive-coral
            "after". The contrast makes the shift visible before the words. */}
        <div className="relative">
          {/* Background panel layer — same grid so panels align under columns */}
          <div className={`absolute inset-0 ${grid}`} aria-hidden>
            <div className="rounded-2xl bg-zinc-100/90 ring-1 ring-zinc-200/70" />
            <div />
            <div className="rounded-2xl bg-acuity-primary/[0.06] ring-1 ring-acuity-primary/20 shadow-acuity-glow-soft" />
          </div>

          {/* Foreground — labels + rows, padded so text breathes inside panels */}
          <div className="relative z-10 py-4">
            {/* Panel headers — compact caption size, NO text underline (the
                underline wrapped badly across two lines). Instead a divider line
                under each header (border-b: grey left / coral right) cleanly
                splits the header off from its rows within each panel.
                leading-tight lets the longer right header wrap gracefully at
                ~380px without breaking the divider. */}
            <div className={`${grid} mb-4`}>
              {/* left: standalone centered header, divider under it */}
              <div className="px-3 pb-2 border-b border-zinc-300">
                <p className="text-center text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.12em] leading-tight text-zinc-400">{content.currentLabel}</p>
              </div>
              <span />
              {/* right: standalone centered header, coral divider */}
              <div className="px-3 pb-2 border-b border-acuity-primary/30">
                <p className="text-center text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.12em] leading-tight text-acuity-primary">{content.futureLabel}</p>
              </div>
            </div>

            {/* Transformation rows */}
            <div className="space-y-3.5">
              {rows.map(([before, after], i) => {
                const on = revealed(i);
                return (
                  <div key={i} className={`${grid} items-center`}>
                    {/* left — "you now" (black) */}
                    <p className={`text-center px-2.5 sm:px-3 text-[11px] sm:text-[12.5px] leading-snug text-zinc-900 break-words transition-all duration-1000 ease-out ${on ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[6px]"}`}>
                      {before}
                    </p>
                    {/* arrow — bridges the gap left → right */}
                    <span className="flex items-center justify-center" aria-hidden>
                      <svg width="24" height="12" viewBox="0 0 24 12" fill="none"
                        className="transition-all duration-[600ms] ease-out"
                        style={{ opacity: on ? 1 : 0, transform: on ? "translateX(0)" : "translateX(-6px)", transitionDelay: "340ms" }}>
                        <path d="M1 6 H20 M15 1 L21 6 L15 11" stroke="var(--acuity-primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    {/* right — "you, a few weeks in" pop (black) */}
                    <p className={`text-center px-2.5 sm:px-3 text-[11.5px] sm:text-[13px] font-semibold leading-snug text-zinc-900 break-words transition-all duration-1000 ease-out ${on ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-[6px] scale-95"}`}
                      style={{ transitionDelay: "720ms", transformOrigin: "center" }}>
                      {after}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className={`text-center text-[14px] text-zinc-600 leading-relaxed mt-7 transition-all duration-500 ${done ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[8px]"}`}>{content.footer}</p>

        {/* CTA */}
        <div className={`text-center mt-6 transition-all duration-500 ${done ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[12px]"}`}>
          <button onClick={(e) => { e.stopPropagation(); onContinue(); }}
            className="funnel-cta rounded-full bg-acuity-primary px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-acuity-primary-lo active:scale-[0.98]">
            Show me how
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
  overload: {
    cards: () => [
      { text: "Call the pharmacy about Mom\u2019s refill", icon: "\u25A1" },
      { text: "Get back to the goal you keep pushing \u2014 Day 1", icon: "\u25B2" },
      { text: "Overwhelmed \u2192 Lighter", icon: "\u25CF" },
      { text: "You mentioned 3 of these before and still haven\u2019t done them", icon: "\u25C6" },
    ],
    step3Sub: "",
    insight: "In one debrief you named 7 things to remember. Ripple caught them all \u2014 and flagged 3 you\u2019d said before and still hadn\u2019t done.",
  },
  patterns: {
    cards: () => [
      { text: "Note what set it off before it escalated", icon: "\u25A1" },
      { text: "Catch the buildup before the blowup \u2014 Day 1", icon: "\u25B2" },
      { text: "Reactive \u2192 Aware", icon: "\u25CF" },
      { text: "The tension started 2 days before the argument \u2014 every time", icon: "\u25C6" },
    ],
    step3Sub: "",
    insight: "The argument happened Tuesday. The tension started Sunday. Same pattern, 3 weeks in a row.",
  },
  rumination: {
    cards: () => [
      { text: "Reply to the message that\u2019s been nagging you", icon: "\u25A1" },
      { text: "Set the day down before it piles up \u2014 Day 1", icon: "\u25B2" },
      { text: "Racing \u2192 Settled", icon: "\u25CF" },
      { text: "Your spiral starts with something from 8 hours earlier", icon: "\u25C6" },
    ],
    step3Sub: "",
    insight: "You were calmest on the day you got it out before the evening piled up.",
  },
  stuck: {
    cards: () => [
      { text: "Move one thing forward on the goal you keep parking", icon: "\u25A1" },
      { text: "Protect an hour for your own life \u2014 Day 1", icon: "\u25B2" },
      { text: "Spinning \u2192 Moving", icon: "\u25CF" },
      { text: "Almost all your energy went to maintenance, none to your goals", icon: "\u25C6" },
    ],
    step3Sub: "",
    insight: "Your energy went almost entirely to keeping things running \u2014 and almost none to the goals you actually mentioned.",
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
        A few minutes. Every day.<br />That&rsquo;s all it takes.
      </h2>

      {/* ── STEP 1: TALK ── */}
      <div className="mb-8" style={fadeUp(800)}>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-acuity-primary">Step 1</p>
        <p className="mb-1.5 text-xl font-bold text-zinc-900">Just say what&rsquo;s on your mind.</p>
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
        <p className="mb-1.5 text-xl font-bold text-zinc-900">Ripple pulls out what matters.</p>
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
        <p className="mb-5 text-sm leading-5 text-zinc-500">Within a few debriefs, Ripple starts showing you the patterns you can&rsquo;t see from inside them. Seeing them is how they finally change.</p>
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
        You already think about your life every day. Ripple just makes sure it counts.
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
    icon: "\u25C8",
    title: "Deep life insights",
    description: "What\u2019s driving you, what\u2019s holding you back \u2014 true insight into the patterns you can\u2019t see from inside your own life.",
  },
  {
    icon: "\u2611",
    title: "Active task tracking",
    description: "Tasks pulled from your words, tracked until done. Your life stops falling through the cracks.",
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
          <p className="text-center text-[15px] font-semibold italic text-zinc-700 leading-relaxed">&ldquo;{labels.loopLine}&rdquo;</p>
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

        {/* ── How Ripple Helps — actionable, breaking-free focused ── */}
        <div className={`mb-10 transition-all duration-[800ms] ${show(5)}`}>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400 mb-4">How Ripple helps</p>
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
            See what Ripple finds &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Personalized Timeline (Screen 14 — week-by-week milestone reveal) ───────

function TimelineScreen({ branch, answers, onContinue, track }: { branch: Branch; answers: Record<string, string | string[]>; onContinue: () => void; track: (event: string, props?: Record<string, unknown>) => void }) {
  const weeks = getTimelineWeeks(branch, answers);
  const bottomLine = SNAPSHOT_BOTTOM[branch];
  const [visibleNodes, setVisibleNodes] = useState(0);
  const [showBottom, setShowBottom] = useState(false);
  const [showBtn, setShowBtn] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    weeks.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleNodes(i + 1), 600 + i * 900));
    });
    const timelineEnd = 600 + weeks.length * 900;
    // Bottom line after the week-timeline completes
    timers.push(setTimeout(() => setShowBottom(true), timelineEnd + 400));
    // CTA after bottom line
    timers.push(setTimeout(() => setShowBtn(true), timelineEnd + 1000));
    return () => timers.forEach(clearTimeout);
  }, [weeks.length]);

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

  // ── Instrumentation: make the create-account → account_created path visible ──
  // The entire point of this pass is to SEE where people die, by exact
  // environment. Every diagnostic event packs the pipe-delimited env string
  // (webview? which app? which OS?) into `value`; the shared tracker attaches
  // the sessionToken, and the ingest route stores the raw user-agent in
  // OnboardingEvent.browser on every event — so each event can be sliced by
  // method × environment × session without any schema change.
  useEffect(() => {
    const env = detectBrowserEnv();
    const envDiag = getSignupEnvDiag();
    track("funnel_signup_screen_viewed", { value: envDiag });
    if (env.isWebView) {
      const os = /iPhone|iPad|iPod/i.test(env.ua) ? "ios" : /Android/i.test(env.ua) ? "android" : "other";
      track("funnel_webview_detected", { value: `label:${env.label}|os:${os}` });
    }
    // Reconcile a pending OAuth attempt that bounced the user BACK to this form
    // without completing (provider rejected the webview, or they hit back). A
    // genuine SUCCESS return arrives at ?step=post-signup and is handled by the
    // parent — skip here so we don't double-count that as an error.
    const qs = new URLSearchParams(window.location.search);
    const isPostSignupReturn = qs.get("step") === "post-signup";
    const pending = readOAuthPending();
    if (pending && !isPostSignupReturn) {
      const awayMs = Date.now() - pending.ts;
      const evt = awayMs > OAUTH_NEVER_RETURNED_MS ? "funnel_oauth_never_returned" : "funnel_oauth_returned_error";
      // NextAuth appends ?error=<code> (and sometimes ?error_description=) to the
      // return URL when the provider hand-off fails. Capture whichever the
      // provider gave us so the reason is visible in admin instead of a bare
      // "returned_error". Kept short + pipe-delimited to match the existing value
      // grammar; sanitized to the safe funnel charset so it can't break parsing.
      const errCode = qs.get("error") || qs.get("error_description") || qs.get("error_reason");
      const errPart = errCode ? `|error:${errCode.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60)}` : "";
      track(evt, { value: `${pending.provider}|${pending.env}|awayMs:${awayMs}${errPart}` });
      clearOAuthPending();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError(null);
    setAccountCreatedButSigninFailed(false);

    // Env-tagged instrumentation (parallel to the existing funnel_signup_*
    // events, which stay untouched so admin's reason/method grouping keeps working).
    const envDiag = getSignupEnvDiag();
    track("funnel_email_signup_tapped", { value: envDiag });

    // Client-side validation — fire funnel_signup_failed for each so admin sees it.
    // Name is intentionally OPTIONAL (most users come via Google/Apple where we
    // already have the profile name; requiring it here was needless friction and
    // produced the "validation:name_empty" drop-off). Null/empty name is handled
    // safely downstream (greetings + emails fall back to "there"/"friend").
    if (!signupEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupEmail.trim())) {
      setSignupError("Please enter a valid email address.");
      track("funnel_signup_failed", { value: "validation:invalid_email", method: "email" });
      track("funnel_email_signup_failed", { value: `validation:invalid_email|${envDiag}` });
      return;
    }
    if (signupPassword.length < 8) {
      setSignupError("Password must be at least 8 characters.");
      track("funnel_signup_failed", { value: "validation:password_short", method: "email" });
      track("funnel_email_signup_failed", { value: `validation:password_short|${envDiag}` });
      return;
    }

    track("funnel_signup_started", { value: "email" });
    track("funnel_email_signup_submitted", { value: envDiag });
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
        track("funnel_email_signup_failed", { value: `server:${errorCode}|${envDiag}` });
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
        track("funnel_email_signup_success", { value: envDiag });
        onAccountCreated();
      } else {
        // Fix 2: Account was created but credential signin failed. Fire the
        // account_created event (account exists), show recoverable message,
        // and fire a failure event for observability.
        onAccountCreated();
        track("funnel_signup_failed", { value: "signin_after_creation_failed", method: "email" });
        track("funnel_email_signup_failed", { value: `signin_after_creation_failed|${envDiag}` });
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
      track("funnel_email_signup_failed", { value: `network_error|${envDiag}` });
    } finally {
      setSignupLoading(null);
    }
  };

  const handleOAuthSignup = async (provider: "google" | "apple") => {
    track("funnel_signup_started", { value: provider });
    // Env-tagged tap event — lets us see Apple-vs-Google attempts per environment.
    const envDiag = getSignupEnvDiag();
    track(provider === "apple" ? "funnel_oauth_apple_tapped" : "funnel_oauth_google_tapped", { value: envDiag });
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

    // Drop a pending-OAuth breadcrumb so the NEXT funnel mount can tell us how
    // this attempt ended (success return vs. bounced back to the form). Written
    // to localStorage because in-app webviews partition sessionStorage across the
    // provider redirect — localStorage is the store most likely to survive.
    try {
      localStorage.setItem(OAUTH_PENDING_KEY, JSON.stringify({ provider, ts: Date.now(), env: envDiag }));
    } catch {}
    // Confirm we actually reached the provider hand-off (if this fires but no
    // return event ever does, the death happened at the provider — the exact
    // silent-death we've been unable to see).
    track("funnel_oauth_redirect_started", { value: `${provider}|${envDiag}` });

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

// ─── Paywall Feature Data (trimmed Free-vs-Pro split) ────────────────────────

const FREE_FEATURES = [
  { name: "Voice debrief & task extraction", description: "Talk instead of type; your action items pulled out automatically." },
];

const PRO_FEATURES = [
  { name: "Deep Insights", description: "Observations about you that you\u2019d never notice on your own." },
  { name: "Pattern detection", description: "Recurring themes surfaced across your entries." },
  { name: "Signals", description: "Next-step guidance based on what you actually said." },
];

function SavingsScreen({ branch, answers, track, selectedPlan, onPlanChange, onCheckout, onSkip, loading, error }: {
  branch: Branch | null;
  answers: Record<string, string | string[]>;
  track: (event: string, props?: Record<string, unknown>) => void;
  selectedPlan: "monthly" | "yearly"; onPlanChange: (p: "monthly" | "yearly") => void;
  onCheckout: () => void; onSkip: () => void; loading: boolean; error: string | null;
}) {
  const annualMonthly = Math.round(ANNUAL_PRICE_CENTS / 12);
  // What Stripe actually charges after the 7-day trial for the selected plan —
  // drives the reassurance line under the lock-in button so it always matches
  // the checkout the user is about to enter.
  const afterTrialPrice = selectedPlan === "yearly"
    ? `${formatDollars(ANNUAL_PRICE_CENTS)}/yr`
    : `${formatDollars(MONTHLY_PRICE_CENTS)}/mo`;
  // Branch-matched social-proof pool for the "What our users say" popup.
  const testimonialPool = getPaywallTestimonialPool(branch);
  const [testimonialsOpen, setTestimonialsOpen] = useState(false);
  // Branch-personalized paywall copy. All fall back to shared defaults when
  // branch is null (ad-deep-link edge case where no entry answer was recorded).
  const paywallHeadline = branch ? getPaywallHeadline(branch, answers) : "Everything\u2019s ready when you are.";
  const paywallHook = branch ? PAYWALL_HOOKS[branch] : null;
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

  return (
    <div className="min-h-screen text-zinc-900 pb-32">
      {/* Scoped, restrained entrance/emphasis animations. Global reduced-motion
          rule (* { animation-duration: 0.01ms }) neutralizes all of these, and
          none gate interaction — the sticky CTA is always immediately tappable. */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pw-row-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pw-cta-shimmer { 0% { transform: translateX(-140%) skewX(-18deg); } 100% { transform: translateX(140%) skewX(-18deg); } }
        @keyframes pw-free-pulse { 0%, 100% { opacity: 0.85; } 50% { opacity: 1; } }
        @keyframes pw-select-glow { 0% { box-shadow: 0 0 0 0 rgba(233,116,81,0.0); } 35% { box-shadow: 0 0 0 4px rgba(233,116,81,0.28); } 100% { box-shadow: 0 0 0 0 rgba(233,116,81,0.0); } }
        .pw-row { animation: pw-row-in 0.4s ease-out both; }
        .pw-select-glow { animation: pw-select-glow 1.6s ease-out 0.5s 2; }
      `}} />
      <div className="max-w-lg mx-auto px-6 pt-10">

        {/* Section 1 — Warm, free-forward positioning header (branch-personalized) */}
        <section className="text-center mb-6 funnel-screen">
          {paywallHook && (
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-acuity-primary mb-2">{paywallHook}</p>
          )}
          <h2 className="text-[22px] sm:text-[28px] font-bold tracking-tight leading-snug bg-gradient-to-r from-orange-400 to-orange-500 bg-clip-text text-transparent">{paywallHeadline}</h2>
          <p className="text-sm text-zinc-500 mt-3">Try all of Ripple <span className="font-semibold text-zinc-700">free for 7 days</span>. Keep what you love.</p>
        </section>

        {/* Section 2 — Free vs Pro split (trimmed, no table) */}
        <section className="mb-6 rounded-xl bg-white border border-zinc-200 shadow-sm overflow-hidden funnel-card-stagger" style={{ animationDelay: "120ms" }}>
          {/* Free group */}
          <div className="px-5 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-emerald-600 mb-3">Free forever</p>
            {FREE_FEATURES.map((f, i) => (
              <div key={f.name} className="pw-row flex items-start gap-3 py-1.5" style={{ animationDelay: `${220 + i * 70}ms` }}>
                <span className="text-emerald-500 text-sm mt-0.5 leading-none">&#10003;</span>
                <div>
                  <p className="text-[14px] font-semibold text-zinc-900 leading-tight">{f.name}</p>
                  <p className="text-[12px] text-zinc-500 leading-snug mt-0.5">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
          {/* Pro group */}
          <div className="px-5 py-4 border-t border-zinc-100 bg-zinc-50/40">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] mb-3 bg-gradient-to-r from-orange-400 to-orange-500 bg-clip-text text-transparent">The insight layer &mdash; with Pro</p>
            {PRO_FEATURES.map((f, i) => (
              <div key={f.name} className="pw-row flex items-start gap-3 py-1.5" style={{ animationDelay: `${360 + i * 70}ms` }}>
                <span className="text-acuity-primary text-sm mt-0.5 leading-none">&#10003;</span>
                <div>
                  <p className="text-[14px] font-semibold text-zinc-900 leading-tight">{f.name}</p>
                  <p className="text-[12px] text-zinc-500 leading-snug mt-0.5">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3 — Cost comparison */}
        <section className="mb-6 rounded-xl border border-zinc-200 bg-white px-5 py-4 text-center funnel-card-stagger" style={{ animationDelay: "180ms" }}>
          <p className="text-[15px] font-semibold text-zinc-900 leading-relaxed">
            <span className="text-zinc-500 font-semibold">Therapy: $150/session.</span>{" "}
            <span className="text-zinc-500 font-semibold">A coach: $200/month.</span>
          </p>
          <p className="text-[17px] font-bold mt-1 bg-gradient-to-r from-orange-400 to-orange-500 bg-clip-text text-transparent">Ripple: less than a coffee a month.</p>
        </section>

        {/* Section 4 — Pricing cards with price-slash animation */}
        <section ref={pricingRef} className="mb-6 rounded-xl bg-white border border-zinc-200 px-5 py-5 shadow-sm funnel-card-stagger" style={{ animationDelay: "240ms" }}>
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
            <button onClick={() => { onPlanChange("monthly"); track("funnel_paywall_plan_selected", { value: "monthly" }); }}
              className={`rounded-xl p-4 text-center transition-all duration-300 relative ${selectedPlan === "monthly" ? "border-2 border-acuity-primary bg-gradient-to-b from-acuity-primary/10 to-acuity-primary/5 shadow-acuity-glow-soft scale-[1.02] pw-select-glow" : "border border-zinc-200 bg-white scale-100"}`}>
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
            <button onClick={() => { onPlanChange("yearly"); track("funnel_paywall_plan_selected", { value: "yearly" }); }}
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

          {/* Compact social proof — stars + tappable "What our users say" */}
          <div className="mt-4 flex flex-col items-center gap-2">
            <span className="text-acuity-primary text-[16px] tracking-[0.15em] leading-none" aria-hidden>&#9733;&#9733;&#9733;&#9733;&#9733;</span>
            <button
              type="button"
              onClick={() => { const next = !testimonialsOpen; setTestimonialsOpen(next); if (next) track("funnel_testimonials_opened", { value: branch ?? "unknown" }); }}
              aria-expanded={testimonialsOpen}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-4 py-1.5 text-[12px] font-semibold text-zinc-700 shadow-sm transition hover:border-acuity-primary hover:text-acuity-primary active:scale-[0.98]">
              What our users say
              {/* Chevron affordance — signals the pill expands, rotates when open */}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${testimonialsOpen ? "rotate-180" : ""}`} aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>

          {/* Charge-timing reassurance intentionally moved to sit directly under
              the "Lock in founders rate" button — the cardless "Continue"
              path needs no charge warning. */}
        </section>
      </div>

      {/* Sticky two-equal-choice footer + crisis line. Both buttons are the
          same size and weight — no primary/secondary hierarchy, no shame copy.
          Lock-in leads to Stripe (7-day trial); Continue is the cardless free
          path straight to download. */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-zinc-100 px-6 py-3 safe-area-pb">
        <div className="max-w-lg mx-auto">
          {error && <p className="text-xs text-red-500 text-center mb-1">{error}</p>}
          <div className="flex flex-col gap-2.5">
            {/* Choice A — Lock in founders rate (→ Stripe Checkout, trial_period_days:7) */}
            <button onClick={onCheckout} disabled={loading}
              className="w-full rounded-full bg-acuity-primary py-3.5 text-[15px] font-semibold text-white transition hover:bg-acuity-primary-lo active:scale-[0.98] disabled:opacity-50">
              {loading ? "Loading\u2026" : "Lock in founders rate"}
            </button>
            {/* Charge-timing reassurance — scoped to the lock-in path only, and
                matches the Stripe checkout the user is about to enter. */}
            <p className="text-[12px] text-center -mt-0.5 text-zinc-500">
              <span className="font-semibold text-zinc-700">$0 today.</span> {afterTrialPrice} after your free week. Cancel anytime.
            </p>
            {/* Choice B — Continue to download (cardless free path, no charge) */}
            <button onClick={onSkip} disabled={loading}
              className="w-full rounded-full bg-zinc-900 py-3.5 text-[15px] font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50">
              Continue to download
            </button>
            {/* Free-version reassurance — a real free tier exists post-trial
                (verified via entitlementsFor: canRecord + one-line summary +
                canViewHistory stay true on FREE). Claims only what's true —
                extraction/insights are Pro. */}
            <p className="text-[12px] text-center -mt-0.5 text-zinc-500">
              There&rsquo;s a free version too &mdash; <span className="font-semibold text-zinc-700">you never need to pay to keep using Ripple.</span> Record any time, get a quick summary, and revisit your history for free.
            </p>
          </div>
          <p className="text-[9px] text-zinc-300 text-center mt-2">If you&rsquo;re in crisis, call or text 988 (Suicide &amp; Crisis Lifeline).</p>
        </div>
      </div>

      {/* "What our users say" — dismissable, on-brand testimonial modal */}
      {testimonialsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-900/40 backdrop-blur-sm px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-label="What our users say"
          onClick={() => setTestimonialsOpen(false)}>
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-zinc-100 max-h-[85vh] overflow-y-auto"
            style={prefersReduced ? undefined : { animation: "pw-land 320ms cubic-bezier(0.34,1.56,0.64,1) both" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <span className="text-acuity-primary text-[14px] tracking-[0.15em] leading-none" aria-hidden>&#9733;&#9733;&#9733;&#9733;&#9733;</span>
                <p className="text-[14px] font-bold text-zinc-900">What our users say</p>
              </div>
              <button
                type="button"
                onClick={() => setTestimonialsOpen(false)}
                aria-label="Close"
                className="rounded-full h-7 w-7 flex items-center justify-center text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition">
                &#10005;
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {testimonialPool.map((t) => (
                <figure key={t.name} className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-4 py-3">
                  <span className="text-acuity-primary text-[12px] tracking-[0.15em] leading-none" aria-hidden>&#9733;&#9733;&#9733;&#9733;&#9733;</span>
                  <blockquote className="text-[13px] text-zinc-700 leading-relaxed mt-1.5">&ldquo;{t.quote}&rdquo;</blockquote>
                  <figcaption className="text-[12px] font-semibold text-zinc-500 mt-2">&mdash; {t.name}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>
      )}
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

  // Shared App Store CTA webview handling: detection, clipboard auto-copy,
  // target-less handoff, breakout instructions, tap + failed-open tracking.
  // This drives the iOS badge only — the App Store handoff is the flow that
  // needs the webview copy-link fallback.
  const { browserEnv, copied, copyFailed, diagContext, anchorProps } = useAppStoreCta({
    track,
    events: {
      webviewDetected: "funnel_inapp_browser_detected",
      autocopySuccess: "funnel_autocopy_success",
      autocopyFailed: "funnel_autocopy_failed",
      tap: "funnel_app_store_clicked",
      returned: "funnel_download_returned",
    },
  });

  // OS detection for the store CTA. Android → Play badge primary; iOS →
  // App Store badge (unchanged webview handoff); desktop/unknown → both.
  const isAndroid = /Android/i.test(browserEnv.ua);
  const isIOS = /iPhone|iPad|iPod/i.test(browserEnv.ua);

  // Google Play tap: mirror funnel_app_store_clicked's payload (the same
  // PII-safe webview/os/label diagContext string). Inside an Android FB/IG
  // webview a direct anchor to the Play URL opens the native Play Store app
  // and escapes the webview — so no target-less handoff / copy-link card is
  // needed here (that dance is only required for the iOS App Store).
  const handlePlayTap = () => track("funnel_play_store_clicked", { value: diagContext });
  const playAnchorProps = browserEnv.isWebView
    ? { href: PLAY_STORE_URL, onClick: handlePlayTap }
    : { href: PLAY_STORE_URL, target: "_blank" as const, rel: "noopener noreferrer" as const, onClick: handlePlayTap };

  const badgeClass = "inline-block transition hover:brightness-105 active:scale-[0.98]";

  useEffect(() => {
    track("funnel_download_screen_viewed", { value: diagContext });
  }, [track, diagContext]);

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
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">You&rsquo;re locked in at {planPrice}. Welcome to Ripple.</h2>
            <p className="text-sm text-zinc-500 mb-10">Record your first debrief &mdash; in the app or right here on the web.</p>
          </>
        ) : (
          <>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">Your free trial is active.</h2>
            <p className="text-sm text-zinc-500 mb-2">You have 7 days to explore everything Ripple offers.</p>
            <p className="text-sm text-zinc-500 mb-10">Record your first debrief &mdash; in the app or right here on the web.</p>
          </>
        )}

        {/* Official OS-detected store badges (per Apple / Google Play brand
            guidelines — not restyled). Android → Play badge (direct Play URL,
            escapes FB/IG webviews natively, no copy-link card). iOS → App Store
            badge with the existing webview handoff + breakout fallback.
            Desktop/unknown → both badges side by side. */}
        {isAndroid ? (
          <div className="flex justify-center">
            <a {...playAnchorProps} aria-label="Get it on Google Play" className={`${badgeClass} funnel-bounce`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/badges/google-play.svg" alt="Get it on Google Play" style={{ height: 56, width: "auto", display: "block" }} />
            </a>
          </div>
        ) : isIOS ? (
          <>
            <div className="flex justify-center">
              <a {...anchorProps} aria-label="Download on the App Store" className={`${badgeClass} funnel-bounce`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/badges/apple-app-store.svg" alt="Download on the App Store" style={{ height: 56, width: "auto", display: "block" }} />
              </a>
            </div>
            {browserEnv.isWebView && (
              <WebviewBreakout browserEnv={browserEnv} copied={copied} copyFailed={copyFailed} />
            )}
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a {...anchorProps} aria-label="Download on the App Store" className={badgeClass}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/badges/apple-app-store.svg" alt="Download on the App Store" style={{ height: 56, width: "auto", display: "block" }} />
            </a>
            <a {...playAnchorProps} aria-label="Get it on Google Play" className={badgeClass}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/badges/google-play.svg" alt="Get it on Google Play" style={{ height: 56, width: "auto", display: "block" }} />
            </a>
          </div>
        )}

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
