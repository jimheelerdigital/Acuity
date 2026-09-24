"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getProviders, signIn, useSession } from "next-auth/react";
import { displayAnnual, displayAnnualAsMonthly, displayMonthly, displaySavingsPct, planValueDollars } from "@/lib/pricing";
import { trackOnboardingEvent, captureUtmParams, type UtmParams } from "@/lib/track-onboarding";
import { PRIORITY_COLOR } from "@acuity/shared";
import { AppleLogo, GoogleLogo } from "@/components/debrief-shared";
import { fireFbq, waitForFbq, TrackCompleteRegistration } from "@/components/meta-pixel-events";
import { detectBrowserEnv, useAppStoreCta, WebviewBreakout } from "@/components/app-store-cta";
import { PRE_TAP_KEY } from "@/components/funnel-ssr-entry";
import { FunnelEntryIntro } from "@/components/funnel-entry-intro";
import { APP_STORE_RATING_LABEL } from "@/lib/social-proof";
import {
  type Branch,
  type Question,
  type FunnelStep,
  type FunnelVariantConfig,
  DEFAULT_FUNNEL_CONFIG,
} from "@/lib/funnel-config";

// ─── Variant config context ─────────────────────────────────────────────────
//
// All funnel copy is read through this context. The default value is the
// original /start (women's) config, so rendering <OnboardingFunnel /> bare is
// byte-identical to the pre-variant behavior. Alternate funnels (e.g.
// /start-bwk) wrap the component in <FunnelConfigProvider config={...}>.

const FunnelConfigContext = createContext<FunnelVariantConfig>(DEFAULT_FUNNEL_CONFIG);

export function FunnelConfigProvider({ config, children }: { config: FunnelVariantConfig; children: ReactNode }) {
  return <FunnelConfigContext.Provider value={config}>{children}</FunnelConfigContext.Provider>;
}

function useFunnelConfig(): FunnelVariantConfig {
  return useContext(FunnelConfigContext);
}

// ─── Types ──────────────────────────────────────────────────────────────────
//
// The step ORDER is per variant (cfg.STEP_ORDER, 11 steps each since v8).
// ALL_STEPS is just the set of screens this component can render, used to
// validate ?step= params and restored state.

type Step = FunnelStep;

const ALL_STEPS: Step[] = [
  "entry", "branch-q2", "branch-q3", "branch-q6",
  "pain", "current-future", "mechanism",
  "processing", "pattern-result", "timeline",
  "create-account", "savings", "download",
];

// ─── Constants ──────────────────────────────────────────────────────────────

const APP_STORE_URL = "https://apps.apple.com/us/app/acuity-daily/id6762633410";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.heelerdigital.acuity";

// Testimonials used on Download screen
const DOWNLOAD_TESTIMONIALS = [
  { quote: "I found out I mention quitting my job every Monday. That one pattern changed everything.", name: "Sarah M." },
  { quote: "My therapist asked what changed. I showed her my Ripple report.", name: "James K." },
  { quote: "Week 3, Ripple connected my mom to my work stress. A year of therapy never did.", name: "Priya R." },
];

// ── Reusable social proof (App Store rating line + real testimonials) ──
// The rating line is five stars "on the App Store", no number or user count
// (Keenan, 2026-09-24; see APP_STORE_RATING_LABEL). Testimonial quotes are reused from the real
// PAYWALL_TESTIMONIALS_V2 set — no new or fabricated copy. Each element fires
// funnel_social_proof_viewed with its placement so we can measure step drop-off.

function SocialProofRating({ track, placement, className }: {
  track: (event: string, props?: Record<string, unknown>) => void;
  placement: string;
  className?: string;
}) {
  useEffect(() => { track("funnel_social_proof_viewed", { value: placement }); }, []);
  return (
    <p className={`text-[13px] font-semibold text-acuity-text-ter ${className ?? ""}`}>
      <span className="text-acuity-warn">&#9733;&#9733;&#9733;&#9733;&#9733;</span>{" "}
      <span className="font-medium text-acuity-text-ter">{APP_STORE_RATING_LABEL}</span>
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
    <div className={`rounded-xl border border-acuity-line-strong bg-acuity-card-bg px-4 py-3 text-center ${className ?? ""}`} style={style}>
      <p className="text-[13px] italic leading-relaxed text-acuity-text-sec">&ldquo;{testimonial.quote}&rdquo;</p>
      <p className="mt-1.5 text-[11px] font-semibold text-acuity-text-ter">&mdash; {testimonial.name}</p>
    </div>
  );
}

// Screen 1 intro: what Ripple is + rating line above the question, the
// say/catch example below the answers. Same component the server renders in
// FunnelSsrEntry, so hydration doesn't shift.
// Keeps the funnel_social_proof_viewed "entry" event the old rating line fired.
function EntryIntroSlot({ track }: { track: (event: string, props?: Record<string, unknown>) => void }) {
  const cfg = useFunnelConfig();
  useEffect(() => { track("funnel_social_proof_viewed", { value: "entry" }); }, []);
  return <FunnelEntryIntro intro={cfg.ENTRY_INTRO} theme={cfg.theme} part="top" />;
}

function EntryExampleSlot() {
  const cfg = useFunnelConfig();
  return <FunnelEntryIntro intro={cfg.ENTRY_INTRO} theme={cfg.theme} part="bottom" />;
}

// ─── Session Tracking ───────────────────────────────────────────────────────

const SESSION_STORAGE_KEY = "acuity_funnel_session";
const SESSION_LOCALSTORAGE_KEY = "acuity_funnel_session_persist";
const FUNNEL_STATE_KEY = "acuity_funnel_state";

// ─── Funnel State Persistence ───────────────────────────────────────────────
// Saves step + branch + answers + selectedPlan to sessionStorage so the user
// can refresh or use browser back without losing their place.

const STEP_SET = new Set<string>(ALL_STEPS);

interface FunnelState {
  step: Step;
  branch: Branch | null;
  answers: Record<string, string | string[]>;
  selectedPlan: "monthly" | "yearly";
}

// Keyed per funnel path so a visitor who opens /start and /start-bwk in the
// same tab never resumes one funnel with the other's answers.
function saveFunnelState(path: string, state: FunnelState): void {
  try { sessionStorage.setItem(`${FUNNEL_STATE_KEY}:${path}`, JSON.stringify(state)); } catch {}
}

function loadFunnelState(path: string): FunnelState | null {
  try {
    const raw = sessionStorage.getItem(`${FUNNEL_STATE_KEY}:${path}`);
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

function useFunnelTracker(flowVersion: string) {
  const sessionId = useRef(getOrCreateSessionId());
  const utmRef = useRef<UtmParams>({});
  useEffect(() => { utmRef.current = captureUtmParams(); }, []);
  return useCallback((event: string, props?: Record<string, unknown>) => {
    // flowVersion comes from the variant config ("v8" / "v8-bwk") so /start and
    // /start-bwk read as separate cohorts. The funnels share every event name.
    trackOnboardingEvent(event, { sessionToken: sessionId.current, utm: utmRef.current, flowVersion, ...props });
  }, [flowVersion]);
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

interface OAuthPending { provider: string; ts: number; env: string; path?: string; }

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

// Web funnel accounts start on the FREE plan; the 7-day Pro trial needs a card
// (see /api/onboarding/funnel-free-plan for the why). Fire-and-forget: the
// route only touches a brand-new, still-TRIAL, card-less account, so calling it
// on an existing user's sign-in return is a no-op.
function moveNewAccountToFreePlan(): void {
  fetch("/api/onboarding/funnel-free-plan", { method: "POST", keepalive: true }).catch(() => {});
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function OnboardingFunnel() {
  const cfg = useFunnelConfig();
  const { data: session, status: authStatus } = useSession();
  // Restore persisted state from sessionStorage so refresh doesn't lose progress.
  // URL ?step= params (OAuth/Stripe returns) take priority over stored state.
  const order = cfg.STEP_ORDER;
  const inFunnel = (s: string): s is Step => s === "download" || (order as string[]).includes(s);
  // Position used for progress + forward-only resume. download sits after the
  // last counted step.
  const rank = (s: Step) => (s === "download" ? order.length : order.indexOf(s));
  const nextOf = (s: Step): Step => order[order.indexOf(s) + 1] ?? "download";
  const savedRaw = typeof window !== "undefined" ? loadFunnelState(cfg.path) : null;
  const saved = savedRaw && inFunnel(savedRaw.step) ? savedRaw : null;
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
  const track = useFunnelTracker(cfg.flowVersion);

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
      if (targetStep && inFunnel(targetStep)) {
        isPopstateNav.current = true;
        setStepRaw(targetStep);
      } else {
        // Fallback: read step from URL
        const params = new URLSearchParams(window.location.search);
        const urlStep = params.get("step");
        if (urlStep && inFunnel(urlStep)) {
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
    saveFunnelState(cfg.path, { step, branch, answers, selectedPlan });
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
              // StartTrial fires HERE — verified Stripe checkout is the only
              // moment a 7-day trial actually begins. It must never fire on
              // mere account creation (per Keenan, 2026-09-23): cardless
              // signups were inflating StartTrial and polluting Meta's
              // optimization signal.
              fireFbq("StartTrial", { value: planValueDollars(selectedPlan), currency: "USD", predicted_ltv: planValueDollars("yearly") });
              fireFbq("Purchase", { value: planValueDollars(selectedPlan), currency: "USD", content_name: "Ripple Pro Subscription" });
            } else {
              setStep("savings");
              setApiError("Payment didn\u2019t go through. Try again, or continue with the free plan.");
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
      moveNewAccountToFreePlan();
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
    } else if (stepParam && inFunnel(stepParam)) {
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
        if (hasStepParam || !serverStep || !inFunnel(serverStep)) return;
        // Only advance forward: never send a user back to an earlier step than
        // the one they're already viewing (e.g. don't pull "download" → "savings").
        setStepRaw((current) => {
          if (rank(serverStep) <= rank(current)) {
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
          landingPath: cookieAttr.landingPath || window.location.pathname,
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
      "branch-q6": "funnel_branch_q6_viewed",
      pain: "funnel_pain_viewed",
      "current-future": "funnel_current_future_viewed",
      mechanism: "funnel_mechanism_viewed",
      processing: "funnel_processing_viewed",
      "pattern-result": "funnel_pattern_result_viewed",
      timeline: "funnel_timeline_viewed",
      "create-account": "funnel_create_account_viewed",
      savings: "funnel_savings_viewed",
      download: "funnel_download_viewed",
    };
    if (eventMap[step]) {
      track(eventMap[step], step === "entry" && adMatchBranch ? { value: `ad_match:${adMatchBranch}` } : undefined);
      // Lead fires on the pattern result — the value-reveal moment, and the one
      // late screen both v8 funnels share (v7 fired it on timeline, which
      // /start no longer shows). Never on create-account, which inflated Lead
      // for users who merely saw the form.
      if (step === "pattern-result") fireFbq("Lead", { content_name: "Funnel Pattern Result Reached" });
      // Signal to the cookie consent banner that the user has progressed
      // far enough for consent to be shown without competing with content.
      if (step === "create-account") {
        window.dispatchEvent(new CustomEvent("acuity:funnel-consent-ready"));
      }
    }
  }, [step, track]);

  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  const goBack = () => {
    const idx = order.indexOf(step);
    if (idx > 0) setStep(order[idx - 1]);
  };
  const advance = () => setStep(nextOf(step));

  const progressPct = step === "download" ? 100 : ((order.indexOf(step) + 1) / order.length) * 100;

  // ── Entry answer — shared by the live screen and the pre-hydration tap ──
  const selectEntry = (opt: { label: string; branch?: Branch }, via: "tap" | "pretap") => {
    if (!opt.branch) return;
    setBranch(opt.branch);
    handleAnswer("entry", opt.label, "funnel_entry_selected");
    track("funnel_entry_selected", { value: opt.branch });
    if (via === "pretap") track("funnel_entry_pretap_used", { value: opt.branch });
    if (adMatchBranch) {
      track("funnel_ad_match", { value: opt.branch === adMatchBranch ? "matched" : "different" });
    }
  };

  // A tap on the server-rendered Screen 1 before JS loaded (see
  // FunnelSsrEntry). Apply it once, as if it happened here.
  const preTapApplied = useRef(false);
  useEffect(() => {
    if (preTapApplied.current || step !== "entry") return;
    preTapApplied.current = true;
    const pre = (window as unknown as Record<string, { branch?: string } | undefined>)[PRE_TAP_KEY];
    const opt = pre?.branch ? cfg.ENTRY_QUESTION.options.find((o) => o.branch === pre.branch) : undefined;
    if (!opt) return;
    selectEntry(opt, "pretap");
    setStep(nextOf("entry"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Quiz answer handler ──
  const handleAnswer = (questionId: string, value: string | string[], eventName: string) => {
    setAnswers((a) => ({ ...a, [questionId]: value }));
    track(eventName, { value: Array.isArray(value) ? value.join(", ") : value });
  };

  // ── Get current question for branch/shared steps ──
  const getCurrentQuestion = (): Question | null => {
    if (step === "entry") return cfg.ENTRY_QUESTION;
    if (step === "branch-q6" && branch) return cfg.BRANCH_Q6[branch];
    if (step.startsWith("branch-") && branch) {
      const idx = parseInt(step.replace("branch-q", "")) - 2; // q2 → 0, q3 → 1
      return cfg.BRANCH_QUESTIONS[branch][idx] ?? null;
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
        // funnel = the path Stripe returns to, so /start-bwk buyers land back
        // in /start-bwk (server allowlists it).
        body: JSON.stringify({ interval: selectedPlan, funnel: cfg.path }),
      });
      const data = await res.json();
      if (data.url) {
        track("funnel_checkout_started", { value: selectedPlan });
        fireFbq("InitiateCheckout", { content_name: "Start Free Trial", currency: "USD", value: planValueDollars(selectedPlan) });
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
    <div
      className="funnel-root min-h-screen bg-acuity-hero-grad text-acuity-text"
      data-theme={cfg.theme === "dusk" ? "dark" : undefined}
      data-funnel-theme={cfg.theme}>
      <style dangerouslySetInnerHTML={{ __html: `
        /* ── Dusk theme (/start-bwk) — the dark logo scheme: near-black navy
           (#0E0C1E, ripple-lockup-dusk.png) with white type and the indigo of
           ripple-mark-indigo.png as the accent. data-theme="dark" on the same
           element pulls in the dark text/hairline/shadow tokens; this block
           swaps the palette. Gradient + glow tokens are declared at :root with
           var() inside, so they resolve to coral there — re-declared here so
           they pick up the indigo. */
        [data-funnel-theme="dusk"] {
          --acuity-primary: oklch(0.64 0.16 292);
          --acuity-primary-hi: oklch(0.74 0.14 293);
          --acuity-primary-lo: oklch(0.54 0.19 291);
          --acuity-primary-soft: oklch(0.64 0.16 292 / 0.18);
          --acuity-primary-h: 292;
          --acuity-secondary-h: 287;
          --acuity-bg: oklch(0.168 0.037 287);
          --acuity-bg-sub: oklch(0.2 0.042 287);
          --acuity-bg-inset: oklch(0.14 0.03 287);
          --acuity-card-bg: oklch(0.215 0.048 287);
          --acuity-grad-primary: linear-gradient(135deg, var(--acuity-primary-hi) 0%, var(--acuity-primary) 55%, var(--acuity-primary-lo) 100%);
          --acuity-glow-primary: 0 0 16px 0 color-mix(in oklch, var(--acuity-primary), transparent 70%), 0 8px 18px 0 color-mix(in oklch, var(--acuity-primary-lo), transparent 78%);
          --acuity-glow-soft: 0 6px 18px 0 color-mix(in oklch, var(--acuity-primary), transparent 82%);
          --acuity-hero-grad:
            radial-gradient(120% 70% at 50% 0%, oklch(0.34 0.12 292 / 0.35) 0%, transparent 60%),
            linear-gradient(180deg, oklch(0.19 0.042 287) 0%, oklch(0.168 0.037 287) 100%);
          color-scheme: dark;
        }
        /* Semantic surfaces — every screen reads these instead of zinc/white,
           so both themes come from the same markup. (Tailwind's /opacity
           modifier does not work on the var()-based acuity colors, so tints
           live here as color-mix.) */
        .funnel-root .f-card { background: var(--acuity-card-bg); border: 1px solid var(--acuity-line-strong); }
        .funnel-root .f-sub { background: var(--acuity-bg-sub); border: 1px solid var(--acuity-line); }
        .funnel-root .f-tint { background: color-mix(in oklch, var(--acuity-primary) 8%, transparent); border: 1px solid color-mix(in oklch, var(--acuity-primary) 32%, transparent); }
        .funnel-root .f-track { background: color-mix(in oklch, var(--acuity-primary) 14%, transparent); }
        .funnel-root .f-grad-text { background-image: var(--acuity-grad-primary); -webkit-background-clip: text; background-clip: text; color: transparent; }
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
          background-image: linear-gradient(to right, color-mix(in oklch, var(--acuity-primary) 45%, transparent), color-mix(in oklch, var(--acuity-primary) 35%, transparent));
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
          border: 1px solid color-mix(in oklch, var(--acuity-primary) 28%, var(--acuity-line-strong));
          background: color-mix(in oklch, var(--acuity-card-bg) 88%, transparent);
          box-shadow: 0 1px 2px oklch(0 0 0 / 0.06);
          transition: transform 200ms cubic-bezier(.32,.72,0,1), box-shadow 200ms ease, background 200ms ease, border-color 200ms ease, opacity 200ms ease;
        }
        @media (hover: hover) {
          .funnel-choice:not(.funnel-choice-selected):not(.funnel-choice-dim):hover {
            background: var(--acuity-primary-soft);
            border-color: color-mix(in oklch, var(--acuity-primary) 50%, transparent);
            transform: translateY(-2px);
            box-shadow: var(--acuity-glow-soft);
          }
        }
        .funnel-choice:active { transform: translateY(0) scale(0.985); }
        .funnel-choice-selected {
          border-color: var(--acuity-primary);
          background: var(--acuity-primary-soft);
          box-shadow: var(--acuity-glow-soft), inset 0 0 0 1px var(--acuity-primary);
        }
        .funnel-choice-dim { opacity: 0.4; }
        /* Ad-match hint on entry — coral-tinted but softer than a full selection. */
        .funnel-choice-hint {
          border-color: color-mix(in oklch, var(--acuity-primary) 50%, transparent);
          background: var(--acuity-primary-soft);
        }
        /* Coral left marker — a guided ring that fills on selection. */
        .funnel-marker {
          flex-shrink: 0;
          width: 9px; height: 9px;
          border-radius: 9999px;
          border: 1.5px solid color-mix(in oklch, var(--acuity-primary) 55%, transparent);
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
      <div className="fixed top-[var(--install-banner-h)] inset-x-0 z-50 h-[3px] f-track">
        <div className="h-full bg-acuity-primary transition-all duration-700 ease-out"
          style={{ width: `${progressPct}%`, boxShadow: "0 0 8px var(--acuity-glow-primary)" }} />
      </div>

      {/* Back button — hidden on entry, savings and download. On savings the
          account already exists, so "back" landed people on a sign-up form
          they'd just completed — a dead end (09-24: a paid Meta signup tapped
          it 4s into the paywall and left). */}
      {step !== "entry" && step !== "savings" && step !== "download" && (
        <button onClick={goBack} className="fixed top-5 left-5 z-50 rounded-full bg-acuity-bg-sub p-2 text-acuity-text-ter hover:text-acuity-text transition" aria-label="Go back">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* ── Question Screens (Entry, Branch, Shared) ── */}
      {(step === "entry" || step.startsWith("branch-")) && (() => {
        const q = getCurrentQuestion();
        if (!q) return null;
        const isEntry = step === "entry";

        const nextStep = (): Step => nextOf(step);

        const eventBase = isEntry ? "funnel_entry" : `funnel_${step.replace("-", "_")}`;
        const answerKey = isEntry ? "entry" : step.replace("branch-", "branch_");

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
            question={q.text}
            compactQuestion={isEntry}
            options={q.options}
            normalization={q.normalization}
            highlightBranch={isEntry ? adMatchBranch : undefined}
            topSlot={isEntry ? <EntryIntroSlot track={track} /> : undefined}
            bottomSlot={isEntry ? <EntryExampleSlot /> : undefined}
            onSelect={(opt) => {
              if (isEntry && opt.branch) {
                selectEntry(opt, "tap");
              } else {
                handleAnswer(answerKey, opt.label, `${eventBase}_selected`);
              }
              setTimeout(() => setStep(nextStep()), 400);
            }}
          />
        );
      })()}

      {/* ── Pain / Mirror (answer-aware, assembled from Q2+Q3+Q6) ── */}
      {step === "pain" && branch && (
        <PainScreen key="pain" branch={branch} answers={answers} onContinue={advance} />
      )}

      {/* ── Current You vs Future You (/start only — answer-aware contrast) ── */}
      {step === "current-future" && branch && (
        <CurrentFutureScreen key="current-future" branch={branch} answers={answers} onContinue={advance} />
      )}

      {/* ── Mechanism / Product Explainer ── */}
      {step === "mechanism" && branch && (
        <MechanismScreen key="mechanism" branch={branch} answers={answers} onContinue={advance} track={track} />
      )}

      {/* ── Processing Theater ── */}
      {step === "processing" && (
        <ProcessingTheater key="processing" onComplete={advance} />
      )}

      {/* ── Pattern Result (deterministic label reveal) ── */}
      {step === "pattern-result" && branch && (
        <PatternResultScreen key="pattern-result" branch={branch} answers={answers} track={track} onContinue={advance} />
      )}

      {/* ── Personalized Timeline (/start-bwk only — the Week 1 / Month 1 / Year 1 plan) ── */}
      {step === "timeline" && branch && (
        <TimelineScreen key="timeline" branch={branch} answers={answers} onContinue={advance} track={track} />
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
            moveNewAccountToFreePlan();
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
            // "Start free trial" — the account already exists, so go straight
            // to Stripe checkout (no account-creation detour).
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
  "funnel-choice funnel-card-stagger w-full text-left rounded-2xl px-5 py-4 text-[15px] flex items-center gap-3 text-acuity-text";

// ─── Single Select Question Screen ──────────────────────────────────────────

function SingleSelectScreen({ question, questionLarge, compactQuestion, options, normalization, onSelect, highlightBranch, topSlot, bottomSlot }: {
  question?: string;
  questionLarge?: string;
  /** Screen 1: the intro above holds the h1, so the question sits closer to the options. */
  compactQuestion?: boolean;
  options: { label: string; branch?: Branch }[];
  normalization?: string;
  onSelect: (opt: { label: string; branch?: Branch }) => void;
  highlightBranch?: Branch;
  topSlot?: React.ReactNode;
  bottomSlot?: React.ReactNode;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleTap = (opt: { label: string; branch?: Branch }) => {
    if (selected) return;
    setSelected(opt.label);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
    onSelect(opt);
  };

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center px-6 text-acuity-text ${compactQuestion ? "pt-8 pb-8" : ""}`}>
      <div className="max-w-md w-full">
        {topSlot && (
          <div className={compactQuestion ? "w-full funnel-screen" : "mb-7 flex justify-center funnel-screen"}>{topSlot}</div>
        )}
        {questionLarge ? (
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-10 funnel-screen">{questionLarge}</h1>
        ) : question ? (
          <h2 className={`font-bold tracking-tight text-center funnel-screen ${compactQuestion ? "text-2xl sm:text-3xl leading-tight mb-6" : "text-xl sm:text-2xl mb-8"}`}>{question}</h2>
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
          <p className="mt-6 text-center text-xs italic text-acuity-text-ter funnel-screen" style={{ animationDelay: `${options.length * 100 + 200}ms` }}>
            {normalization}
          </p>
        )}
        {bottomSlot && <div className="w-full">{bottomSlot}</div>}
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
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-acuity-text">
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
          <p className="mt-4 text-center text-xs italic text-acuity-text-ter">{normalization}</p>
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
  const cfg = useFunnelConfig();
  // Answer-aware: assemblePainCopy stitches the user's Q2/Q3/Q6 selections into
  // an ordered set of beats — [opener, Q2 echo, Q3 amplifier, Q6 cost, closer].
  // Length varies per branch/answers (empty fragments are dropped upstream), so
  // this renders whatever beats it's handed: first = recognition (border-left),
  // last = emphasized closer, middle = body lines.
  const beats = cfg.assemblePainCopy(branch, answers);
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
  const emphasis = cfg.PAIN_EMPHASIS[branch];

  // One unified left-aligned column — an intimate reflection, revealed one line
  // at a time. Opener sets the scene, body lines carry the echo, and the closer
  // lands as a set-apart payoff beat. Clean background (page gradient only) so
  // the words are the sole focus.
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 py-16 text-acuity-text"
      onClick={phase < ctaPhase ? skip : undefined}>
      <div className="relative z-10 max-w-md w-full text-left">

        {beats.map((text, i) => {
          const revealed = shown(i + 1);
          const isOpener = i === 0;
          const isCloser = i === lastIndex;
          const cls = isCloser
            ? "mt-9 text-[17px] sm:text-lg font-medium text-acuity-text leading-[1.65]"
            : isOpener
              ? "mb-6 text-[17px] sm:text-lg text-acuity-text leading-[1.65]"
              : "mb-6 text-[15px] sm:text-base text-acuity-text-sec leading-[1.7]";
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

// ─── Current You vs Future You (Screen 9 — answer-aware two-state contrast) ──

function CurrentFutureScreen({ branch, answers, onContinue }: {
  branch: Branch; answers: Record<string, string | string[]>; onContinue: () => void;
}) {
  const cfg = useFunnelConfig();
  const content = cfg.assembleCurrentFuture(branch, answers);
  // The branch framing pair (formerly the header subtext) now leads the rows as
  // its own paired left→arrow→right row, consistent with the transformation rows.
  const rows: [string, string][] = [[content.currentSub, content.futureSub], ...cfg.TRANSFORMATION_ROWS[branch]];
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
    <div className="relative min-h-screen flex flex-col items-center justify-center px-5 py-16 text-acuity-text"
      onClick={!done ? skip : undefined}>
      <div className="w-full max-w-md">

        {/* Header */}
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-center mb-7 leading-snug">{content.header}</h2>

        {/* Paneled transformation diagram — dead-grey "before" vs alive-coral
            "after". The contrast makes the shift visible before the words. */}
        <div className="relative">
          {/* Background panel layer — same grid so panels align under columns */}
          <div className={`absolute inset-0 ${grid}`} aria-hidden>
            <div className="rounded-2xl bg-acuity-bg-inset ring-1 ring-acuity-line-strong" />
            <div />
            <div className="rounded-2xl f-tint" />
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
              <div className="px-3 pb-2 border-b border-acuity-line-strong">
                <p className="text-center text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.12em] leading-tight text-acuity-text-ter">{content.currentLabel}</p>
              </div>
              <span />
              {/* right: standalone centered header, coral divider */}
              <div className="px-3 pb-2 border-b border-acuity-primary">
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
                    <p className={`text-center px-2.5 sm:px-3 text-[11px] sm:text-[12.5px] leading-snug text-acuity-text break-words transition-all duration-1000 ease-out ${on ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[6px]"}`}>
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
                    <p className={`text-center px-2.5 sm:px-3 text-[11.5px] sm:text-[13px] font-semibold leading-snug text-acuity-text break-words transition-all duration-1000 ease-out ${on ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-[6px] scale-95"}`}
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
        <p className={`text-center text-[14px] text-acuity-text-sec leading-relaxed mt-7 transition-all duration-500 ${done ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[8px]"}`}>{content.footer}</p>

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
      { text: "Habit checked off: walk after dinner \u00B7 4 days running", icon: "\u21BB" },
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
      { text: "Habit checked off: pause before replying \u00B7 3 days running", icon: "\u21BB" },
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
      { text: "Habit checked off: phone out of the bedroom \u00B7 5 nights running", icon: "\u21BB" },
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
      { text: "Habit checked off: 20 minutes on your own goal \u00B7 3 days running", icon: "\u21BB" },
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
      { text: "Habit checked off: one honest check-in with yourself \u00B7 4 days running", icon: "\u21BB" },
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
  const cfg = useFunnelConfig();
  const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const q2 = typeof answers.branch_q2 === "string" ? answers.branch_q2 : "";
  // Variant examples (e.g. /start-bwk) reuse the default card icons in order.
  const override = cfg.MECHANISM_CONTENT?.[branch];
  const base = MECH_CONTENT[branch];
  const cards = override
    ? override.cards.map((text, i) => ({ text, icon: base.cards(q2)[i]?.icon ?? "\u25A1" }))
    : base.cards(q2);
  const content = { insight: override?.insight ?? base.insight };

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
    <div className="min-h-[100dvh] overflow-y-auto px-6 py-10 text-acuity-text">
      <style dangerouslySetInnerHTML={{ __html: mechanismStyles }} />

      {/* Headline */}
      <h2 className="mb-9 text-center text-[26px] font-bold leading-[33px] tracking-tight text-acuity-text" style={fadeUp(0)}>
        Talk it out.<br />Ripple does the rest.
      </h2>

      {/* ── STEP 1: TALK ── */}
      <div className="mb-8" style={fadeUp(800)}>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-acuity-primary">Step 1</p>
        <p className="mb-1.5 text-xl font-bold text-acuity-text">Just say what&rsquo;s on your mind.</p>
        <p className="mb-4 text-sm leading-5 text-acuity-text-ter">About whatever&rsquo;s on your mind &mdash; and get it out of your head, where it&rsquo;s been costing you sleep and patience.</p>
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
        <p className="mb-1.5 text-xl font-bold text-acuity-text">Ripple pulls out what matters.</p>
        <p className="mb-4 text-sm leading-5 text-acuity-text-ter">Tasks, goals, habits, moods, patterns &mdash; so nothing you said falls through the cracks. Mention a habit you kept and it&rsquo;s checked off for you.</p>
        <div className="space-y-2">
          {cards.map((c, i) => (
            <div key={i} className="flex items-center rounded-xl border-l-[3px] border-acuity-primary bg-acuity-card-bg px-3.5 py-3 shadow-sm"
              style={fadeUpShort(2200 + 600 + i * 200)}>
              <span className="mr-2.5 text-[13px] font-semibold text-acuity-primary">{c.icon}</span>
              <span className="text-[13px] font-medium leading-[18px] text-acuity-text">{c.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── STEP 3: YOUR PICTURE (branch-personalized) ── */}
      <div className="mb-8" style={fadeUp(3800)}>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-acuity-primary">Step 3</p>
        <p className="mb-1.5 text-xl font-bold text-acuity-text">See the patterns running your weeks.</p>
        <p className="mb-5 text-sm leading-5 text-acuity-text-ter">Within a few debriefs, Ripple starts showing you the patterns you can&rsquo;t see from inside them. Seeing them is how they finally change.</p>
        <div className="mb-4 flex items-center justify-between px-2">
          {["M","T","W","T","F","S","S"].map((d, i) => {
            const filled = i < 5;
            const dotDelay = 3800 + 600 + i * 100;
            return (
              <div key={i} className="flex flex-col items-center">
                <div className="relative flex items-center">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] ${filled ? "border-acuity-primary-hi" : "border-acuity-line-strong"}`}>
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
                <span className={`mt-1 text-[9px] font-semibold ${filled ? "text-acuity-text-ter" : "text-acuity-text-ter"}`}>{d}</span>
              </div>
            );
          })}
        </div>
        <div className="rounded-xl border-l-[3px] border-acuity-primary bg-acuity-primary-soft px-3.5 py-3"
          style={fadeUpShort(3800 + 600 + 500 + 500)}>
          <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.06em] text-acuity-primary">Weekly insight</p>
          <p className="text-[13px] font-medium leading-[18px] text-acuity-text">{content.insight}</p>
        </div>
      </div>

      {/* ── Closing line ── */}
      <p className="mb-6 text-center text-base font-bold italic text-acuity-text" style={fadeUp(5000)}>
        You already think about your life every day. Ripple just makes sure it counts.
      </p>

      {/* ── Social proof — reused real testimonial validating the weekly-report mechanism ── */}
      <div className="mx-auto mb-6 max-w-md" style={fadeUp(5400)}>
        <SocialProofQuote track={track} placement="mechanism" testimonial={cfg.PAYWALL_TESTIMONIALS_V2[0]} />
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

// ─── Processing Theater (Screen 12) ─────────────────────────────────────────

function ProcessingTheater({ onComplete }: { onComplete: () => void }) {
  const cfg = useFunnelConfig();
  const [elapsed, setElapsed] = useState(0);
  const [showSocial, setShowSocial] = useState(false);
  const startRef = useRef(Date.now());

  // Screen length = the last stage's endSec (6s in v8, was a fixed 10s).
  const totalSec = cfg.PROCESSING_STAGES[cfg.PROCESSING_STAGES.length - 1].endSec;
  // onComplete is a fresh closure every parent render; read it through a ref
  // so re-renders don't restart the timer.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const interval = setInterval(() => {
      const s = (Date.now() - startRef.current) / 1000;
      setElapsed(s);
      if (s >= totalSec) { clearInterval(interval); onCompleteRef.current(); }
    }, 100);
    const socialTimer = setTimeout(() => setShowSocial(true), (totalSec * 1000) / 2.5);
    return () => { clearInterval(interval); clearTimeout(socialTimer); };
  }, [totalSec]);

  const stage = cfg.PROCESSING_STAGES.find((s) => elapsed < s.endSec) ?? cfg.PROCESSING_STAGES[cfg.PROCESSING_STAGES.length - 1];
  const pct = Math.min(100, (elapsed / totalSec) * 100);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-acuity-text">
      <div className="max-w-md w-full text-center funnel-screen">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-8">Building your insight profile&hellip;</h2>
        <div className="mx-auto w-64 mb-6">
          <div className="h-2 w-full rounded-full bg-acuity-line-strong overflow-hidden">
            <div className="h-full bg-acuity-primary rounded-full transition-all duration-300 ease-out" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <p className="text-sm text-acuity-text-ter h-6 transition-opacity duration-300">{stage.text}</p>
        <div className={`mt-10 transition-all duration-500 ${showSocial ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
          <p className="text-xs text-acuity-text-ter">
            <span className="text-acuity-warn">&#9733;&#9733;&#9733;&#9733;&#9733;</span> {APP_STORE_RATING_LABEL}
          </p>
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
  const cfg = useFunnelConfig();
  const labels = cfg.getPatternLabels(branch, answers);
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
    <div className="min-h-screen flex flex-col items-center px-6 py-12 text-acuity-text">
      <div className="max-w-md w-full">

        {/* ── Hero: Primary Pattern in its own box (the centerpiece) ── */}
        <div className={`mb-6 rounded-[22px] f-tint px-6 py-7 text-center transition-all duration-[800ms] ${show(1)}`}>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-acuity-primary mb-3">Your pattern</p>
          <h2 className="text-[32px] sm:text-[40px] font-extrabold tracking-tight text-acuity-text leading-[1.1]">{labels.primary}</h2>
        </div>

        {/* ── Description: loop line + reframe, directly under the pattern ── */}
        <div className={`mb-6 rounded-xl bg-acuity-bg-sub border border-acuity-line-strong px-5 py-4 transition-all duration-[800ms] ${show(2)}`}>
          <p className="text-center text-[15px] font-semibold italic text-acuity-text-sec leading-relaxed">&ldquo;{labels.loopLine}&rdquo;</p>
        </div>
        <div className={`mb-8 transition-all duration-[800ms] ${show(3)}`}>
          <p className="text-[15px] text-acuity-text-sec leading-relaxed">{labels.bodyCopy}</p>
        </div>

        {/* ── Secondary + Area — prominent cards side by side ── */}
        <div className={`grid ${labels.secondaryVisible && labels.secondary ? "grid-cols-2" : "grid-cols-1"} gap-3 mb-8 transition-all duration-[800ms] ${show(4)}`}>
          {labels.secondaryVisible && labels.secondary && (
            <div className="rounded-[18px] f-sub p-4 text-center">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-acuity-text-ter mb-1.5">Secondary signal</p>
              <p className="text-lg font-bold text-acuity-text">{labels.secondary}</p>
            </div>
          )}
          <div className="rounded-[18px] f-tint p-4 text-center">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-acuity-text-ter mb-1.5">Most affected area</p>
            <p className="text-lg font-bold text-acuity-primary">{labels.area}</p>
          </div>
        </div>

        {/* ── How Ripple Helps — actionable, breaking-free focused ── */}
        <div className={`mb-10 transition-all duration-[800ms] ${show(5)}`}>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-acuity-text-ter mb-4">How Ripple helps</p>
          <div className="space-y-3">
            {[
              { label: "Surface the triggers you can\u2019t see from inside the pattern", icon: "\u25C6" },
              { label: "Track the tasks and goals that keep slipping through", icon: "\u2611" },
              { label: "Check off your habits from what you say, so your streaks keep themselves", icon: "\u21BB" },
              { label: "Show you which life areas are draining and which are growing", icon: "\u25CE" },
              { label: "Catch subconscious patterns before they run another week", icon: "\u25C8" },
              { label: "Give you a weekly mirror \u2014 so you stop guessing and start seeing", icon: "\u25A8" },
            ].map((item, i) => (
              <div key={i} className={`flex items-start gap-3 transition-all duration-500 ${vis >= 5 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
                style={{ transitionDelay: `${i * 120}ms` }}>
                <span className="text-acuity-primary text-sm mt-0.5 flex-shrink-0">{item.icon}</span>
                <p className="text-[14px] text-acuity-text-sec leading-snug">{item.label}</p>
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
  const cfg = useFunnelConfig();
  const weeks = cfg.getTimelineWeeks(branch, answers);
  const bottomLine = cfg.SNAPSHOT_BOTTOM[branch];
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
    <div className="min-h-screen flex flex-col items-center px-6 py-16 text-acuity-text">
      <div className="max-w-md w-full">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-center mb-10 funnel-screen">
          This is what changes.
        </h2>

        {/* Week-by-week timeline */}
        <div className="relative mb-10">
          <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-acuity-line-strong overflow-hidden">
            <div className="w-full bg-acuity-primary transition-all duration-700" style={{ height: `${(visibleNodes / weeks.length) * 100}%` }} />
          </div>
          <div className="space-y-6">
            {weeks.map((w, i) => (
              <div key={i} className={`relative pl-10 transition-all duration-500 ${i < visibleNodes ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
                <div className={`absolute left-1 top-1 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                  i < visibleNodes ? "border-acuity-primary bg-acuity-primary-soft scale-100" : "border-acuity-line-strong bg-acuity-card-bg scale-75"
                }`}>
                  {i === 0 && visibleNodes > 0 ? (
                    <svg className="h-3 w-3 text-acuity-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-acuity-primary" />
                  )}
                </div>
                <p className="text-sm text-acuity-text-sec"><span className="font-bold">{w.week}:</span> {w.text}</p>
                {w.badge && <span className="text-[11px] text-acuity-primary font-medium">{w.badge}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom line — branch-specific closer */}
        <div className={`mb-8 text-center transition-all duration-[800ms] ${showBottom ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <p className="text-base font-semibold text-acuity-text leading-relaxed">{bottomLine}</p>
        </div>

        {/* Social proof — the App Store rating line */}
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
  const cfg = useFunnelConfig();
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signupLoading, setSignupLoading] = useState<"email" | "google" | "apple" | null>(null);
  const [signupError, setSignupError] = useState<string | null>(null);
  // In-app browsers (FB/IG) put email first: email signup succeeded 21/21
  // there, Google 42/67 (v6-v7 data). Set after mount — the UA isn't known
  // during SSR.
  const [inApp, setInApp] = useState(false);
  // True when the visitor just came back from a Google attempt that didn't
  // finish (bounced back here, or sent back by /auth/error). We say so and
  // point at the email form instead of leaving them on a silent form.
  const [oauthFailed, setOauthFailed] = useState(false);
  // Which provider failed, for the note ("Google" / "Apple"). Null when we
  // only know *a* sign-in failed (the /auth/error bounce loses the marker).
  const [failedProvider, setFailedProvider] = useState<string | null>(null);
  // Apple shows only when the server actually has the Apple provider
  // configured (APPLE_CLIENT_ID + APPLE_CLIENT_SECRET). As of 2026-09-24 prod
  // doesn't, so the button stays hidden instead of leading to an error page,
  // and appears on its own once the env vars are set.
  const [appleAvailable, setAppleAvailable] = useState(false);

  const headline = branch ? cfg.getCreateAccountHeadline(branch) : "Your patterns are already forming. Create your free account to see them.";

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
    setInApp(env.isWebView);
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
      setOauthFailed(true);
      setFailedProvider(pending.provider);
    } else if (qs.get("oauth") === "failed") {
      // Sent back by /auth/error. The pending marker may be gone (webview
      // storage partitioning), so the URL flag alone is enough to show the note.
      setOauthFailed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    getProviders()
      .then((p) => { if (!cancelled && p?.apple) setAppleAvailable(true); })
      .catch(() => {});
    return () => { cancelled = true; };
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
        landingPath: window.location.pathname,
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

  // Apple: pulled on 2026-09-24 after 1 success in 15 (0/10 inside FB/IG).
  // The cause was the PKCE cookie being SameSite=Lax on Apple's cross-site
  // form POST (fixed in lib/auth.ts the same day). Back from v8.2, shown only
  // when the provider is configured (appleAvailable). If an Apple attempt
  // bounces, the same "use your email" note as Google appears.
  const handleOAuthSignup = async (provider: "google" | "apple") => {
    track("funnel_signup_started", { value: provider });
    const envDiag = getSignupEnvDiag();
    track(`funnel_oauth_${provider}_tapped`, { value: envDiag });
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
      localStorage.setItem(OAUTH_PENDING_KEY, JSON.stringify({ provider, ts: Date.now(), env: envDiag, path: cfg.path }));
    } catch {}
    // Confirm we actually reached the provider hand-off (if this fires but no
    // return event ever does, the death happened at the provider — the exact
    // silent-death we've been unable to see).
    track("funnel_oauth_redirect_started", { value: `${provider}|${envDiag}` });

    await signIn(provider, { callbackUrl: `${window.location.pathname}?${params.toString()}` });
  };

  const googleButton = (
    <button
      onClick={() => handleOAuthSignup("google")}
      disabled={signupLoading !== null}
      className="w-full flex items-center justify-center gap-3 rounded-full f-card px-4 py-3.5 text-[15px] font-semibold text-acuity-text transition hover:bg-acuity-bg-sub active:scale-[0.98] disabled:opacity-50"
    >
      {signupLoading === "google" ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-acuity-line-strong border-t-acuity-text" />
      ) : (
        <GoogleLogo />
      )}
      Continue with Google
    </button>
  );

  // Apple's guidelines: black button with white text on light backgrounds,
  // white with black text on dark ones (the dusk /start-bwk theme).
  const appleButton = appleAvailable ? (
    <button
      onClick={() => handleOAuthSignup("apple")}
      disabled={signupLoading !== null}
      className={`w-full flex items-center justify-center gap-3 rounded-full px-4 py-3.5 text-[15px] font-semibold transition active:scale-[0.98] disabled:opacity-50 ${cfg.theme === "dusk" ? "bg-white text-black hover:bg-zinc-100" : "bg-black text-white hover:bg-zinc-800"}`}
    >
      {signupLoading === "apple" ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <AppleLogo />
      )}
      Continue with Apple
    </button>
  ) : null;

  const oauthButtons = (
    <div className="space-y-3">
      {appleButton}
      {googleButton}
    </div>
  );

  const divider = (
    <div className="flex items-center gap-3 my-6">
      <div className="flex-1 h-px bg-acuity-line-strong" />
      <span className="text-xs text-acuity-text-ter">or</span>
      <div className="flex-1 h-px bg-acuity-line-strong" />
    </div>
  );

  const inputClass = "w-full rounded-[14px] bg-acuity-bg-inset border border-acuity-line-strong px-4 py-3.5 text-[15px] text-acuity-text placeholder:text-acuity-text-ter outline-none focus:border-acuity-primary";

  const emailForm = (
    <form onSubmit={handleSignup} className="space-y-3">
      <input type="text" value={signupName} onChange={(e) => setSignupName(e.target.value)} placeholder="First name (optional)" autoComplete="given-name"
        className={inputClass} />
      <input type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} placeholder="Email address" autoComplete="email" inputMode="email"
        className={inputClass} />
      <div className="relative">
        <input type={showPassword ? "text" : "password"} value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} placeholder="Password (8+ characters)" autoComplete="new-password"
          className={`${inputClass} pr-16`} />
        <button type="button" onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-acuity-text-ter hover:text-acuity-text font-medium">
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>

      {signupError && (
        <div className={`text-xs px-1 rounded-lg ${accountCreatedButSigninFailed ? "f-sub p-3 text-acuity-good" : "text-acuity-bad"}`}>
          <p>{signupError}</p>
          {signupError.includes("already have an account") && (
            <button type="button" onClick={() => signIn(undefined, { callbackUrl: `${window.location.pathname}?step=post-signup` })}
              className="mt-1.5 inline-block text-acuity-primary font-semibold underline">
              Sign in to your existing account
            </button>
          )}
          {accountCreatedButSigninFailed && (
            <button type="button" onClick={() => signIn(undefined, { callbackUrl: `${window.location.pathname}?step=post-signup` })}
              className="mt-1.5 inline-block text-acuity-primary font-semibold underline">
              Tap here to sign in
            </button>
          )}
        </div>
      )}

      <button type="submit" disabled={signupLoading !== null}
        className="w-full rounded-full bg-acuity-primary py-3.5 text-[15px] font-semibold text-white transition hover:bg-acuity-primary-lo active:scale-[0.98] disabled:opacity-50 funnel-cta">
        {signupLoading === "email" ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            Creating your account...
          </span>
        ) : "Create my free account"}
      </button>
    </form>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-md w-full funnel-screen">
        <section className="text-center mb-7">
          <h2 className="text-[22px] sm:text-[28px] font-bold tracking-tight leading-snug">{headline}</h2>
          <p className="text-[15px] text-acuity-text-sec mt-3">Create your account. Next, start your 7 days of Pro free.</p>
        </section>

        {/* Social proof — auto-rotating testimonials */}
        <SignupTestimonialStrip />

        {oauthFailed && (
          <div className="mb-5 rounded-[14px] f-tint px-4 py-3 text-[13px] leading-snug text-acuity-text" role="status">
            {failedProvider === "apple" ? "Apple" : failedProvider === "google" ? "Google" : "That"} sign-in didn&rsquo;t go through{inApp ? " inside this app" : ""}. Use your email below instead. It works everywhere.
          </div>
        )}

        {/* In FB/IG in-app browsers email leads (it never fails there);
            everywhere else the one-tap buttons lead (Apple, then Google).
            Both are offered in both. */}
        {inApp ? (
          <>
            {emailForm}
            {divider}
            {oauthButtons}
          </>
        ) : (
          <>
            {oauthButtons}
            {divider}
            {emailForm}
          </>
        )}

        <p className="text-xs text-acuity-text-ter text-center mt-6">
          Already have an account?{" "}
          <button onClick={() => signIn(undefined, { callbackUrl: `${window.location.pathname}?step=post-signup` })} className="text-acuity-primary font-semibold underline">Sign in</button>
        </p>
        <p className="text-[11px] text-acuity-text-ter text-center mt-3 flex items-center justify-center gap-1.5">
          <svg className="h-3 w-3 text-acuity-text-quiet" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
          Private by design. Your debriefs are yours alone.
        </p>
      </div>
    </div>
  );
}

// ── Signup Testimonial Strip (auto-rotating, doesn't push form below fold) ──

function SignupTestimonialStrip() {
  const cfg = useFunnelConfig();
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % cfg.PAYWALL_TESTIMONIALS_V2.length), 4000);
    return () => clearInterval(t);
  }, [cfg.PAYWALL_TESTIMONIALS_V2.length]);
  const t = cfg.PAYWALL_TESTIMONIALS_V2[idx];
  return (
    <div className="mb-5 rounded-xl bg-acuity-card-bg border border-acuity-line-strong px-4 py-3 text-center transition-all duration-300 funnel-card-stagger">
      <p className="text-[13px] text-acuity-text-sec italic leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
      <p className="text-[11px] text-acuity-text-ter font-semibold mt-1.5">&mdash; {t.name}</p>
    </div>
  );
}

// ─── Lock In Your Savings (Screen 17 — optional paywall) ──────────────────

// ─── Paywall (v8.1, 2026-09-24) ─────────────────────────────────────────────
//
// The 7-day Pro trial now requires a card on the web funnels (new accounts
// start FREE). So the page sells the trial itself: trial is the headline,
// the Today / Day 4 / Day 7 timeline sits right under it, the plan picker is
// a compact toggle, and Pro is three things people can picture. Habit
// tracking leads (key feature for both audiences). "Signals" was cut: it's
// coaching language, and Ripple is a mirror, not a coach. Weekly report was
// cut on 2026-09-24 (see PRO_FEATURES).

// Ordered by where users actually get value (prod data, 2026-09-24):
// users with 5+ debriefs completed 1,095 of 1,634 extracted tasks (67%), and
// 3 of 4 App Store reviews name the task list. Patterns / Life Matrix is the
// other thing reviews praise ("surprisingly spot on"). Weekly report was cut:
// no review mentions it and nothing shows people reading it. Habit tracking
// stays first by Keenan's call (key feature for both audiences).
const PRO_FEATURES = [
  { name: "Habit tracking", description: "Set your habits. When a debrief mentions one, it\u2019s checked off for you and the streak keeps going." },
  { name: "A to-do list that writes itself", description: "Every task you mention is pulled out and kept on one list until it\u2019s done. Nothing slips." },
  { name: "Patterns you can\u2019t see from inside", description: "Your mood, the themes that keep coming back, and your Life Matrix show what\u2019s working and what isn\u2019t." },
];

function SavingsScreen({ branch, answers: _answers, track, selectedPlan, onPlanChange, onCheckout, onSkip, loading, error }: {
  branch: Branch | null;
  answers: Record<string, string | string[]>;
  track: (event: string, props?: Record<string, unknown>) => void;
  selectedPlan: "monthly" | "yearly"; onPlanChange: (p: "monthly" | "yearly") => void;
  onCheckout: () => void; onSkip: () => void; loading: boolean; error: string | null;
}) {
  // Event names are unchanged (lock_in_selected / continue_selected /
  // plan_selected) so the admin funnel split keeps working.
  const cfg = useFunnelConfig();
  const afterTrialPrice = selectedPlan === "yearly"
    ? `${displayAnnual()}/yr`
    : `${displayMonthly()}/mo`;
  const testimonial = cfg.getPaywallTestimonialPool(branch)[0];
  const paywallHook = branch ? cfg.PAYWALL_HOOKS[branch] : null;

  const pickPlan = (p: "monthly" | "yearly") => { onPlanChange(p); track("funnel_paywall_plan_selected", { value: p }); };
  const segment = (on: boolean) =>
    `flex-1 rounded-full px-3 py-2.5 text-center transition ${on ? "bg-acuity-card-bg text-acuity-text" : "text-acuity-text-sec"}`;

  const timeline: { label: string; text: string }[] = [
    { label: "Today", text: "Full Pro access. $0." },
    { label: "Day 4", text: "We email you a reminder." },
    { label: "Day 7", text: `${afterTrialPrice} starts. Cancel before then and you pay nothing.` },
  ];

  return (
    <div className="min-h-screen pb-60">
      <div className="max-w-lg mx-auto px-6 pt-20">

        {/* Header — the trial is the offer */}
        <section className="text-center mb-6 funnel-screen">
          {paywallHook && (
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-acuity-primary mb-3">{paywallHook}</p>
          )}
          <h2 className="text-[28px] sm:text-[32px] font-bold tracking-tight leading-tight text-balance">Try Ripple Pro free for 7 days</h2>
          <p className="text-[15px] text-acuity-text-sec mt-3">$0 today. Cancel anytime before day 7 and you pay nothing.</p>
        </section>

        {/* How the trial works — first, because it answers "will I be charged?" */}
        <section className="mb-5 rounded-[22px] f-card px-5 py-4 funnel-card-stagger" style={{ animationDelay: "80ms" }}>
          <ol>
            {timeline.map((t, i) => (
              <li key={t.label} className="flex gap-3">
                <div className="flex flex-col items-center pt-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-acuity-primary" : "border border-acuity-line-strong"}`} />
                  {i < timeline.length - 1 && <span className="w-px flex-1 bg-acuity-line-strong my-1" />}
                </div>
                <div className={i < timeline.length - 1 ? "pb-3" : ""}>
                  <p className="text-[15px] font-semibold">{t.label}</p>
                  <p className="text-[13px] text-acuity-text-sec tabular-nums">{t.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Plan toggle — monthly first and default (never lead with annual) */}
        <section className="mb-5 funnel-card-stagger" style={{ animationDelay: "160ms" }}>
          <div className="flex gap-1 rounded-full f-sub p-1" role="radiogroup" aria-label="Choose a plan">
            <button type="button" role="radio" aria-checked={selectedPlan === "monthly"} onClick={() => pickPlan("monthly")}
              className={segment(selectedPlan === "monthly")}
              style={selectedPlan === "monthly" ? { boxShadow: "inset 0 0 0 1px var(--acuity-primary)" } : undefined}>
              <span className="block text-[14px] font-semibold">Monthly</span>
              <span className="block text-[12px] tabular-nums">{displayMonthly()}/mo</span>
            </button>
            <button type="button" role="radio" aria-checked={selectedPlan === "yearly"} onClick={() => pickPlan("yearly")}
              className={segment(selectedPlan === "yearly")}
              style={selectedPlan === "yearly" ? { boxShadow: "inset 0 0 0 1px var(--acuity-primary)" } : undefined}>
              <span className="block text-[14px] font-semibold">Yearly <span className="text-acuity-good">&middot; save {displaySavingsPct()}</span></span>
              <span className="block text-[12px] tabular-nums">{displayAnnual()}/yr ({displayAnnualAsMonthly()}/mo)</span>
            </button>
          </div>
        </section>

        {/* What Pro gives you — three things, habit tracking first */}
        <section className="mb-5 rounded-[22px] f-card px-5 py-4 funnel-card-stagger" style={{ animationDelay: "240ms" }}>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-acuity-primary mb-2">What Pro gives you</p>
          {PRO_FEATURES.map((f) => (
            <div key={f.name} className="flex items-start gap-3 py-1.5">
              <span className="text-acuity-primary text-sm mt-0.5 leading-none">&#10003;</span>
              <div>
                <p className="text-[15px] font-semibold leading-tight">{f.name}</p>
                <p className="text-[13px] text-acuity-text-sec leading-snug mt-0.5">{f.description}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Social proof — the App Store rating line + one real quote */}
        <section className="text-center mb-4 funnel-card-stagger" style={{ animationDelay: "320ms" }}>
          <p className="text-[13px] font-semibold text-acuity-text-sec">
            <span className="text-acuity-warn">&#9733;&#9733;&#9733;&#9733;&#9733;</span>{" "}
            <span className="font-medium text-acuity-text-ter">{APP_STORE_RATING_LABEL}</span>
          </p>
          {testimonial && (
            <figure className="mt-3 rounded-[18px] f-sub px-4 py-3">
              <blockquote className="text-[14px] italic leading-relaxed text-acuity-text-sec">&ldquo;{testimonial.quote}&rdquo;</blockquote>
              <figcaption className="mt-1.5 text-[12px] font-semibold text-acuity-text-ter">&mdash; {testimonial.name}</figcaption>
            </figure>
          )}
        </section>
      </div>

      {/* Sticky footer — one primary action, the free plan as a quiet link */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-acuity-bg border-t border-acuity-line px-6 pt-3 pb-4 safe-area-pb">
        <div className="max-w-lg mx-auto">
          {error && <p className="text-xs text-acuity-bad text-center mb-2">{error}</p>}
          <button onClick={onCheckout} disabled={loading}
            className="w-full rounded-full bg-acuity-primary py-3.5 text-[15px] font-semibold text-white transition hover:bg-acuity-primary-lo active:scale-[0.98] disabled:opacity-50">
            {loading ? "Loading\u2026" : "Start my free 7 days"}
          </button>
          <p className="text-[12px] text-center mt-2 text-acuity-text-sec tabular-nums">
            <span className="font-semibold text-acuity-text">$0 today.</span> We&rsquo;ll email you before you&rsquo;re charged.
            <span className="block">Then {afterTrialPrice}. Cancel anytime from your account.</span>
          </p>
          <button onClick={onSkip} disabled={loading}
            className="w-full mt-2 py-1.5 text-[14px] font-medium text-acuity-text-sec underline-offset-4 hover:underline disabled:opacity-50">
            Continue with the free plan
          </button>
          {/* Exactly what FREE gets (lib/entitlements.ts: record + one-line
              summary + history; extraction is Pro). */}
          <p className="text-[11px] text-center text-acuity-text-ter">Record debriefs and get a one-line summary. No card.</p>
          <p className="text-[10px] text-acuity-text-quiet text-center mt-1">If you&rsquo;re in crisis, call or text 988 (Suicide &amp; Crisis Lifeline).</p>
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
        confetti({ particleCount: 120, spread: 90, origin: { y: 0.4 }, colors: ["#8E6FE6", "#A78BFA", "#C4B5FD", "#F59E0B", "#22C55E"] });
        setTimeout(() => confetti({ particleCount: 60, spread: 120, origin: { y: 0.35, x: 0.3 } }), 250);
        setTimeout(() => confetti({ particleCount: 60, spread: 120, origin: { y: 0.35, x: 0.7 } }), 400);
      });
    }
  }, [paymentConfirmed]);

  useEffect(() => {
    const interval = setInterval(() => setTestimonialIdx((i) => (i + 1) % DOWNLOAD_TESTIMONIALS.length), 4000);
    return () => clearInterval(interval);
  }, []);

  const planPrice = selectedPlan === "yearly" ? displayAnnual() + "/yr" : displayMonthly() + "/mo";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-acuity-text">
      <div className="max-w-sm w-full text-center funnel-screen">
        {paymentConfirmed ? (
          <>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">Your free trial is on. Welcome to Ripple.</h2>
            <p className="text-sm text-acuity-text-ter mb-2 tabular-nums">$0 today, then {planPrice} after day 7.</p>
            <p className="text-sm text-acuity-text-ter mb-10">Record your first debrief &mdash; in the app or right here on the web.</p>
          </>
        ) : (
          <>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">Your free account is ready.</h2>
            <p className="text-sm text-acuity-text-ter mb-10">Record your first debrief &mdash; in the app or right here on the web.</p>
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
          className="w-full mt-3 rounded-full border-2 border-acuity-primary px-8 py-3.5 text-[15px] font-semibold text-acuity-primary text-center transition hover:bg-acuity-primary-soft active:scale-[0.98]"
        >
          Continue in the Web App
          <span className="block text-[11px] font-normal text-acuity-text-ter mt-0.5">Record your first debrief right now &mdash; no download needed.</span>
        </button>

        {/* QR code — desktop only */}
        <div className="mt-8 hidden sm:block">
          <p className="text-xs text-acuity-text-ter mb-3">Or scan with your phone</p>
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(APP_STORE_URL)}&bgcolor=ffffff&color=181614`}
            alt="QR code" width={140} height={140} className="mx-auto rounded-lg" />
        </div>

        {!paymentConfirmed && (
          <p className="mt-8 text-xs text-acuity-text-ter">
            Want tasks, habits and your weekly report? You can upgrade to Pro any time in the app.
          </p>
        )}

        <div className="mt-8">
          <p className="text-sm font-semibold text-acuity-text-ter mb-1">
            <span className="text-acuity-warn">&#9733;&#9733;&#9733;&#9733;&#9733;</span> {APP_STORE_RATING_LABEL}
          </p>
          <div className="mt-3 min-h-[60px] relative">
            {DOWNLOAD_TESTIMONIALS.map((t, i) => (
              <div key={i} className={`transition-opacity duration-500 ${i === testimonialIdx ? "opacity-100" : "opacity-0 absolute inset-0"}`}>
                <p className="text-xs italic text-acuity-text-ter">&ldquo;{t.quote}&rdquo; &mdash; {t.name}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
