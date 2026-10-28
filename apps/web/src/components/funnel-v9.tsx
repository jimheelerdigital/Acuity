"use client";

/**
 * /start-test — v9 evidence-based funnel. Screen list and copy live in
 * lib/funnel-v9-config.ts; the research behind each choice is in
 * reports/Web funnel conversion evidence.md.
 *
 * Standalone on purpose: it shares the APIs of the /start funnel
 * (signup, funnel-free-plan, create-checkout, verify-payment, onboarding
 * events) but none of its UI, so it can be tested without touching /start.
 *
 * Visual language (2026-09-25 redesign, per Keenan: "not cohesive at all…
 * much more intuitive, interactive, and creative"): the /start light theme
 * (centered headings, rounded cards, coral accent) plus icons on every
 * answer, a draggable slider, an animated "you say it, Ripple catches it"
 * demo, a progress-ring loader, a locked-result teaser at the email gate,
 * an animated map of her own answers, and a Headway-style paywall.
 *
 * Account flow: the email gate creates the account behind the scenes with
 * a random password the user never sees, signs her in, and moves her to
 * the free plan. After payment she gets a "set your password" link (the
 * forgot-password email) so she can sign in to the app.
 */

import { loadStripeJs } from "@/lib/stripe-embedded";
import { isRcWebBillingEnabled, startRcWebPurchase } from "@/lib/revenuecat/web-billing-client";
import { consumeTestArrival } from "@/lib/funnel-split-shared";
import { MoodAvatar } from "@/components/mood-avatar";
import { FunnelEntryIntro } from "@/components/funnel-entry-intro";
import { PayInBrowserButton, PaywallTrustLine } from "@/components/pay-in-browser";
import { firstDebriefOutcome, type FirstDebriefOutcome } from "@/components/funnel-first-debrief";
import type { AdMatch } from "@/lib/funnel-ad-match";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { signIn } from "next-auth/react";
import {
  Activity, ArrowRight, Baby, BatteryLow, Bell, BookOpen, Brain, Briefcase, CalendarCheck, CalendarClock,
  CalendarDays, CalendarRange, Car, Check, ChevronLeft, ChevronRight, CircleCheck, Compass,
  Eye, Footprints, Heart, HeartHandshake, Home, Hourglass, Keyboard, KeyRound, Layers,
  LineChart, ListChecks, ListTodo, Lock, Mail, Mic, Moon, Repeat, RotateCcw, ShieldCheck, Smartphone, Sparkles, Sprout, Waves, X,
  Star, Sunrise, Target, TrendingUp, User, Users, Zap, Dumbbell, Wallet, Rocket, Flame, Truck, type LucideIcon,
} from "lucide-react";

import { fireFbq, waitForFbq } from "@/components/meta-pixel-events";
import { purchaseEventId } from "@/lib/meta-event-ids";
import { trackOnboardingEvent, captureUtmParams, type UtmParams } from "@/lib/track-onboarding";
import { armPlanValueDollars, clientArmLabel, clientPriceArm, pricesForArm, type ArmPrices, type PriceArm } from "@/lib/price-test-shared";

// Web price test (lib/price-test.ts): the arm lives in the rp_ptest cookie,
// set by /api/funnel/price-arm when the funnel mounts. Every price shown and
// every pixel value reads it, and checkout charges the same arm.
type PriceArmState = { arm: PriceArm; on: boolean };
let priceArmNow: PriceArmState = { arm: "std", on: false };
const priceArmListeners = new Set<(a: PriceArmState) => void>();
function setPriceArm(a: PriceArmState) {
  priceArmNow = a;
  priceArmListeners.forEach((l) => l(a));
}
function useArmPrices(): ArmPrices & { testOn: boolean } {
  const [st, setSt] = useState<PriceArmState>(priceArmNow);
  useEffect(() => {
    setSt({ ...priceArmNow, arm: clientPriceArm() });
    priceArmListeners.add(setSt);
    return () => {
      priceArmListeners.delete(setSt);
    };
  }, []);
  return { ...pricesForArm(st.arm), testOn: st.on };
}
const planValueDollars = (plan: string | null | undefined) => armPlanValueDollars(clientPriceArm(), plan);
import { APP_STORE_RATING_LABEL } from "@/lib/social-proof";
import {
  RIPPLE_V9,
  V9_CONFIGS,
  type V9Brand,
  type V9Config,
  type V9Step,
} from "@/lib/funnel-v9-config";

const APP_STORE_URL = "https://apps.apple.com/us/app/acuity-daily/id6762633410";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.heelerdigital.acuity";
const STATE_KEY = "acuity_v9_state";
const SESSION_KEY = "acuity_funnel_session";

type Plan = "yearly" | "monthly";
type Answers = {
  single: Record<string, string>;
  multi: Record<string, string[]>;
  sliders: Record<string, number>;
  name: string;
  email: string;
};
type Persisted = { stepId: string; answers: Answers; plan: Plan };

const EMPTY: Answers = { single: {}, multi: {}, sliders: {}, name: "", email: "" };

/** Icon per answer id (step:option). Falls back to a dot. */
const OPTION_ICONS: Record<string, LucideIcon> = {
  "hook:daily": CalendarDays, "hook:weekly": CalendarRange, "hook:sometimes": CalendarClock, "hook:rarely": CalendarCheck,
  "age:u35": User, "age:35": User, "age:45": User, "age:55": User,
  "plate:kids": Baby, "plate:parents": HeartHandshake, "plate:work": Briefcase, "plate:partner": Heart, "plate:house": Home, "plate:health": Activity,
  "pileup:morning": Sunrise, "pileup:car": Car, "pileup:quiet": Moon, "pileup:night": Hourglass, "pileup:allday": Repeat,
  "talktype:talk": Mic, "talktype:type": Keyboard, "talktype:both": Layers,
  "notice:drains": BatteryLow, "notice:lifts": TrendingUp, "notice:habits": Target, "notice:putoff": Hourglass, "notice:mood": LineChart,
  "when:car": Car, "when:walk": Footprints, "when:quiet": Moon, "when:whenever": Zap,
  "commit:ready": Sparkles, "commit:try": Compass,
  // BWK (/start-test-bwk)
  "age:u25": User, "age:25": User,
  "plate:side": Rocket, "plate:training": Dumbbell, "plate:money": Wallet, "plate:family": Users,
  "pileup:drive": Car,
  "notice:fires": Flame,
  "when:truck": Truck, "when:gym": Dumbbell,
};

function sessionId(): string {
  try {
    const got = sessionStorage.getItem(SESSION_KEY);
    if (got) return got;
    const id = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return "sess_nostorage";
  }
}

/** A light tap on phones that support it (Android). No-op elsewhere. */
function haptic() {
  try {
    navigator.vibrate?.(8);
  } catch {}
}


function randomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `Rp-${Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("")}-9a`;
}


/** The brand config for the page (Ripple /start-test or BWK /start-test-bwk). */
const V9Ctx = createContext<V9Config>(RIPPLE_V9);
const useV9 = () => useContext(V9Ctx);

const CSS = `
.v9[data-funnel-theme="dusk"] {
  /* BWK: gunmetal steel + cobalt, amber stars (2026-09-25, Keenan: take the
     regular /start look, men's colors). Cobalt/amber is the design system's
     "cobalt" accent preset. Solid button, no gradient glow. */
  --acuity-primary: oklch(0.6 0.17 256); --acuity-primary-hi: oklch(0.66 0.16 256); --acuity-primary-lo: oklch(0.54 0.18 256);
  --acuity-primary-soft: oklch(0.6 0.17 256 / 0.16);
  --acuity-bg: oklch(0.19 0.014 250); --acuity-bg-sub: oklch(0.225 0.016 250); --acuity-bg-inset: oklch(0.165 0.012 250); --acuity-card-bg: oklch(0.235 0.017 250);
  --acuity-text: oklch(0.97 0.004 250); --acuity-text-sec: oklch(0.8 0.012 250); --acuity-text-ter: oklch(0.65 0.014 250); --acuity-text-quiet: oklch(0.5 0.014 250);
  --acuity-line: oklch(1 0 0 / 0.08); --acuity-line-strong: oklch(1 0 0 / 0.14);
  --acuity-grad-primary: linear-gradient(0deg, var(--acuity-primary) 0%, var(--acuity-primary) 100%);
  --acuity-hero-grad: radial-gradient(100% 50% at 50% 0%, oklch(0.6 0.17 256 / 0.12) 0%, transparent 70%), linear-gradient(180deg, oklch(0.205 0.015 250) 0%, oklch(0.175 0.013 250) 100%);
  color-scheme: dark;
}
.v9 { --v9-tint: color-mix(in oklch, var(--acuity-primary) 9%, var(--acuity-card-bg)); --v9-ring: color-mix(in oklch, var(--acuity-primary) 38%, transparent); }
.v9 .card { background: var(--acuity-card-bg); border: 1px solid var(--acuity-line-strong); box-shadow: 0 1px 2px rgba(20,16,40,.04), 0 6px 18px rgba(20,16,40,.05); }
.v9 .card-sel { background: var(--v9-tint); border-color: var(--acuity-primary); box-shadow: 0 0 0 3px var(--v9-ring); }
.v9 .soft { background: var(--acuity-bg-sub); border: 1px solid var(--acuity-line); }
.v9 .chip-ico { background: color-mix(in oklch, var(--acuity-primary) 12%, transparent); color: var(--acuity-primary); }
.v9 .grad { background-image: var(--acuity-grad-primary); }
.v9 .grad-text { background-image: var(--acuity-grad-primary); -webkit-background-clip: text; background-clip: text; color: transparent; }
@keyframes v9-in { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: none; } }
@keyframes v9-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes v9-pop { 0% { transform: scale(.4); opacity: 0; } 70% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
@keyframes v9-ripple { 0% { transform: scale(.55); opacity: .55; } 100% { transform: scale(1.6); opacity: 0; } }
@keyframes v9-float { 0% { transform: translate(var(--x0), -30px) rotate(var(--r)); opacity: 0; } 15% { opacity: 1; } 70% { opacity: 1; } 100% { transform: translate(0, 112px) rotate(0deg) scale(.6); opacity: 0; } }
@keyframes v9-bar { from { width: 0; } }
@keyframes v9-strike { from { background-size: 0% 1.5px; } to { background-size: 100% 1.5px; } }
.v9 .strike { background-image: linear-gradient(rgb(239 68 68 / .6), rgb(239 68 68 / .6)); background-repeat: no-repeat; background-position: 0 60%; background-size: 0% 1.5px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.v9 .on .strike { animation: v9-strike .5s ease-out both; animation-delay: var(--d, 0ms); }
@keyframes v9-glow { 0%,100% { box-shadow: 0 0 0 0 color-mix(in oklch, var(--acuity-primary) 0%, transparent); } 50% { box-shadow: 0 0 0 6px color-mix(in oklch, var(--acuity-primary) 22%, transparent); } }
.v9 .rv { opacity: 0; }
.v9 .rv.on, .v9 .on .rv { animation: v9-up .5s cubic-bezier(.2,.8,.2,1) both; animation-delay: var(--d, 0ms); }
.v9 .rv-pop { opacity: 0; }
.v9 .on .rv-pop { animation: v9-pop .45s cubic-bezier(.2,.8,.2,1) both; animation-delay: var(--d, 0ms); }
.v9 .glow { animation: v9-glow 2.4s ease-in-out infinite; }
.v9 .paper { background-color: #fbf7ec; background-image: repeating-linear-gradient(to bottom, transparent 0 21px, rgb(120 150 190 / .28) 21px 22px); border: 1px solid #e4dcc6; box-shadow: 0 2px 6px rgba(80,60,20,.08); color: #6f6656; }
.v9 .scrawl { font-family: "Bradley Hand", "Segoe Print", "Comic Sans MS", "Chalkboard SE", cursive; }
.v9 .dogear { position: absolute; right: 0; bottom: 0; width: 22px; height: 22px; background: linear-gradient(135deg, transparent 50%, #e4dcc6 50%); border-top-left-radius: 4px; }
.v9 .stain { position: absolute; right: 8px; bottom: 10px; width: 54px; height: 54px; border-radius: 50%; border: 5px solid rgb(150 110 60 / .10); pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .v9 .rv, .v9 .rv-pop { opacity: 1 !important; animation: none !important; } .v9 .strike { background-size: 100% 1.5px; animation: none !important; } .v9 .glow { animation: none; } }
@keyframes v9-card-in { from { opacity: 0; transform: translateY(24px) scale(.96); } to { opacity: 1; transform: none; } }
.v9 .card-in { animation: v9-card-in .45s cubic-bezier(.2,.8,.2,1) both; }
.v9 .fly-yes { transform: translateX(115%) rotate(10deg); opacity: 0; transition: transform .38s ease-in, opacity .38s ease-in; }
.v9 .fly-no { transform: translateX(-115%) rotate(-10deg); opacity: 0; transition: transform .38s ease-in, opacity .38s ease-in; }
@keyframes v9-caret { 50% { opacity: 0; } }
.v9 .enter { animation: v9-in .38s cubic-bezier(.2,.8,.2,1) both; }
.v9 .up { animation: v9-up .45s cubic-bezier(.2,.8,.2,1) both; }
.v9 .pop { animation: v9-pop .32s cubic-bezier(.2,.8,.2,1) both; }
.v9 .ripple-ring { position: absolute; inset: 0; border-radius: 9999px; border: 2px solid var(--acuity-primary); animation: v9-ripple 2.6s ease-out infinite; }
.v9 .caret { display: inline-block; width: 2px; height: 1em; background: currentColor; margin-left: 2px; vertical-align: -2px; animation: v9-caret 1s steps(1) infinite; }
.v9 input[type=range].v9-range { -webkit-appearance: none; appearance: none; width: 100%; height: 10px; border-radius: 9999px; background: linear-gradient(90deg, color-mix(in oklch, var(--acuity-primary) 25%, var(--acuity-bg-sub)) 0%, var(--acuity-primary) 100%); outline: none; }
.v9 input[type=range].v9-range::-webkit-slider-thumb { -webkit-appearance: none; width: 34px; height: 34px; border-radius: 9999px; background: #fff; border: 3px solid var(--acuity-primary); box-shadow: 0 4px 14px rgba(0,0,0,.18); cursor: grab; }
.v9 input[type=range].v9-range::-moz-range-thumb { width: 30px; height: 30px; border-radius: 9999px; background: #fff; border: 3px solid var(--acuity-primary); box-shadow: 0 4px 14px rgba(0,0,0,.18); cursor: grab; }
.v9 .snap { scroll-snap-type: x mandatory; }
.v9 .snap > * { scroll-snap-align: center; }
.v9 .noscroll::-webkit-scrollbar { display: none; }
@media (prefers-reduced-motion: reduce) { .v9 * { animation: none !important; transition: none !important; } }
`;

export function FunnelV9({ brand = "ripple", adMatch }: { brand?: V9Brand; adMatch?: AdMatch | null }) {
  // Ad-matched screen 1 (2026-09-30): the tapped ad's hook replaces the
  // generic hook line, and its say/catch example shows under the buttons.
  const C = useMemo<V9Config>(() => {
    const base = V9_CONFIGS[brand];
    if (!adMatch) return base;
    return {
      ...base,
      hookLine: adMatch.headline || base.hookLine,
      ...(adMatch.said && adMatch.caught ? { adDemo: { said: adMatch.said, caught: adMatch.caught } } : {}),
    };
  }, [brand, adMatch]);
  // Per-brand session state so /start-test and /start-test-bwk never mix.
  const stateKey = `${STATE_KEY}_${C.brand}`;
  const [stepId, setStepId] = useState<string>("hook");
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [plan, setPlan] = useState<Plan>("yearly");
  const [paid, setPaid] = useState(false);
  const sid = useRef<string>("");
  const utm = useRef<UtmParams>({});
  // State (not a ref) so the persist effect only runs on a render where the
  // saved answers are already back in state. With a ref, the first persist
  // wrote EMPTY answers over the saved ones (seen in dev StrictMode, where
  // the mount effect runs twice and re-read the overwritten copy).
  const [ready, setReady] = useState(false);

  const idx = C.steps.findIndex((s) => s.id === stepId);
  const step = C.steps[Math.max(0, idx)];

  const track = useCallback((event: string, value?: string) => {
    trackOnboardingEvent(event, {
      sessionToken: sid.current || null,
      utm: utm.current,
      flowVersion: C.flowVersion,
      value: value ?? null,
    });
  }, []);

  // ── Mount: session, UTMs, attribution cookie, CAPI PageView, restore ──
  useEffect(() => {
    sid.current = sessionId();
    utm.current = captureUtmParams();
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { setAttributionCookie } = require("@/lib/attribution");
      setAttributionCookie();
    } catch {}
    // Arrived from /start or /start-bwk through the normal-vs-test split:
    // remember the arm and log it once (lib/funnel-split.ts).
    if (consumeTestArrival()) track("funnel_split_arm", "test");
    // Price test: place her in an arm (or clear it when the test is off).
    // The arm is logged at the paywall, where she's signed in.
    const qs = new URLSearchParams(window.location.search);
    const ptest = qs.get("ptest");
    const ptsrc = qs.get("ptsrc");
    fetch(
      `/api/funnel/price-arm${ptest === "low" || ptest === "std" ? `?force=${ptest}${ptsrc ? `&src=${encodeURIComponent(ptsrc)}` : ""}` : ""}`,
      { method: "POST" }
    )
      .then((r) => r.json())
      .then((d: { on?: boolean }) => setPriceArm({ arm: clientPriceArm(), on: !!d.on }))
      .catch(() => {});
    const params = new URLSearchParams(window.location.search);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    if (!require("@/lib/internal-traffic").isInternalClient()) try {
      fetch("/api/capi/pageview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: window.location.href, fbclid: params.get("fbclid") || undefined }),
      }).catch(() => {});
    } catch {}

    // Every screen has its own URL (?step=<id>). A bare /start-test link is
    // a fresh start on screen 1; a ?step= link resumes with the answers
    // saved in this browser session (refresh, back/forward, Stripe return).
    const urlStep = params.get("step");
    let saved: Persisted | null = null;
    if (urlStep) {
      try {
        const raw = sessionStorage.getItem(stateKey);
        if (raw) saved = JSON.parse(raw) as Persisted;
      } catch {}
    } else {
      try {
        sessionStorage.removeItem(stateKey);
      } catch {}
    }
    if (saved) {
      setAnswers({ ...EMPTY, ...saved.answers });
      setPlan(saved.plan ?? "yearly");
    }

    // Local QA only: preview the paid ending without a card. Dead in production.
    if (process.env.NODE_ENV !== "production" && urlStep === "download" && params.get("qa_paid") === "1") {
      setPaid(true);
      setStepId("download");
    } else if (urlStep === "download" && params.get("payment") === "success" && params.get("session_id")) {
      verifyingPayment = true;
      setStepId("download");
      fetch(`/api/onboarding/verify-payment?session_id=${encodeURIComponent(params.get("session_id")!)}`)
        .finally(() => {
          verifyingPayment = false;
        })
        .then((r) => r.json())
        .then((d: { paid?: boolean }) => {
          if (d.paid) {
            setPaid(true);
            const p = saved?.plan ?? "yearly";
            track("funnel_payment_completed", p);
            fireFbq("StartTrial", { value: planValueDollars(p), currency: "USD", predicted_ltv: planValueDollars("yearly") });
            fireFbq("Purchase", { value: planValueDollars(p), currency: "USD", content_name: "Ripple Pro Subscription" }, purchaseEventId(params.get("session_id")!));
          } else {
            setStepId("paywall");
          }
        })
        .catch(() => {});
    } else if (urlStep && C.steps.some((s) => s.id === urlStep)) {
      // The loader auto-advances; landing on it directly shows the email gate.
      setStepId(urlStep === "loader" ? "email" : urlStep);
    }
    setReady(true);
    // Screen actually rendered + interactive (the report's measurement fix:
    // Meta prefetches landing pages, so server hits overstate visits).
    track("funnel_entry_rendered");
  }, [track]);

  // ── Persist + step view events ──
  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(stateKey, JSON.stringify({ stepId, answers, plan } satisfies Persisted));
    } catch {}
  }, [ready, stepId, answers, plan]);

  // ── URL per screen: push on every step change, follow back/forward ──
  const urlSynced = useRef(false);
  useEffect(() => {
    if (!ready) return;
    const u = new URL(window.location.href);
    if (u.searchParams.get("step") === stepId && urlSynced.current) return;
    u.searchParams.set("step", stepId);
    u.searchParams.delete("payment");
    u.searchParams.delete("session_id");
    if (urlSynced.current) window.history.pushState({ v9: stepId }, "", u);
    else window.history.replaceState({ v9: stepId }, "", u);
    urlSynced.current = true;
  }, [ready, stepId]);

  const accountRef = useRef(false);
  accountRef.current = !!answers.email;
  useEffect(() => {
    const onPop = () => {
      const target = new URLSearchParams(window.location.search).get("step") ?? "hook";
      const ti = C.steps.findIndex((s) => s.id === target);
      if (ti < 0) return;
      // Once the account exists, anything before the result (the quiz, the
      // email gate) is a dead end: send them to their result instead.
      const resultIdx = C.steps.findIndex((s) => s.id === "result");
      const dest = accountRef.current && ti < resultIdx ? "result" : target === "loader" ? "email" : target;
      setStepId(dest);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.scrollTo(0, 0);
    track(`funnel_v9_${stepId.replace(/-/g, "_")}_viewed`);
    if (stepId === "hook") track("funnel_entry_viewed");
    if (stepId === "email") track("funnel_email_gate_viewed");
    if (stepId === "paywall") track("funnel_savings_viewed");
  }, [ready, stepId, track]);

  const go = useCallback((id: string) => setStepId(id), []);
  // RevenueCat Web Billing completes in-page (no Stripe redirect / session_id),
  // so it lands here instead of in the ?payment=success branch above. Same
  // events, same destination. Fired only after the server confirmed the
  // entitlement with RevenueCat (/api/revenuecat/web-checkout/confirm).
  const onPaid = useCallback(
    (p: Plan) => {
      setPaid(true);
      track("funnel_payment_completed", p);
      fireFbq("StartTrial", { value: planValueDollars(p), currency: "USD", predicted_ltv: planValueDollars("yearly") });
      fireFbq("Purchase", { value: planValueDollars(p), currency: "USD", content_name: "Ripple Pro Subscription" });
      setStepId("download");
    },
    [track]
  );
  const next = useCallback(() => {
    const i = C.steps.findIndex((s) => s.id === stepId);
    if (i >= 0 && i < C.steps.length - 1) setStepId(C.steps[i + 1].id);
  }, [stepId]);
  const back = useCallback(() => {
    const i = C.steps.findIndex((s) => s.id === stepId);
    if (i > 0) setStepId(C.steps[i - 1].id);
  }, [stepId]);

  // Back is allowed through the quiz, and from checkout to the paywall.
  // Never from the result onward (the account exists; the email gate would
  // be a dead end), mirroring the /start fix.
  const canGoBack =
    (idx > 0 && idx <= C.steps.findIndex((s) => s.id === "name")) || stepId === "checkout";
  const showProgress = idx >= 0 && idx < C.progressEnd && stepId !== "loader";
  const progressPct = Math.max(4, Math.round(((idx + 1) / C.progressEnd) * 100));

  const firstName = answers.name.trim().split(/\s+/)[0] ?? "";

  return (
    <V9Ctx.Provider value={C}>
    <div
      className="v9 funnel-root min-h-screen bg-acuity-hero-grad text-acuity-text"
      data-theme={C.theme === "dusk" ? "dark" : undefined}
      data-funnel-theme={C.theme}
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {(showProgress || canGoBack) && (
        <header className="fixed top-0 inset-x-0 z-50">
          <div className="max-w-lg mx-auto flex items-center gap-3 px-4 h-14">
            <button
              onClick={stepId === "checkout" ? () => go("paywall") : back}
              className={`h-9 w-9 shrink-0 rounded-full soft flex items-center justify-center text-acuity-text-sec transition ${canGoBack ? "opacity-100" : "opacity-0 pointer-events-none"}`}
              aria-label="Go back"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            {showProgress ? (
              <div className="flex-1 h-2 rounded-full soft overflow-hidden">
                <div className="h-full rounded-full grad transition-all duration-500 ease-out" style={{ width: `${progressPct}%` }} />
              </div>
            ) : (
              <div className="flex-1" />
            )}
            <div className="w-9 shrink-0" />
          </div>
        </header>
      )}

      {/* Screens with a fixed bottom CTA bar need room under the content;
          tap-to-advance screens don't, so they can center in the viewport. */}
      <main className={`max-w-lg mx-auto px-5 pt-16 ${["statement", "single", "loader", "checkout", "download"].includes(step.kind) ? "pb-8" : "pb-44"}`}>
        {C.milestones[stepId] && (
          <div key={`m-${stepId}`} className="up -mt-1 mb-4 flex justify-center">
            <span className="flex items-center gap-1.5 rounded-full card px-3 py-1 text-[12px] font-semibold text-acuity-text-sec">
              <Sparkles className="h-3.5 w-3.5 text-acuity-primary" /> {C.milestones[stepId]}
            </span>
          </div>
        )}
        <StepView
          key={step.id}
          step={step}
          answers={answers}
          setAnswers={setAnswers}
          firstName={firstName}
          plan={plan}
          setPlan={setPlan}
          paid={paid}
          next={next}
          go={go}
          track={track}
          onPaid={onPaid}
        />
      </main>
    </div>
    </V9Ctx.Provider>
  );
}

// ─── Shared building blocks ────────────────────────────────────────────────

type ViewProps = {
  step: V9Step;
  answers: Answers;
  setAnswers: React.Dispatch<React.SetStateAction<Answers>>;
  firstName: string;
  plan: Plan;
  setPlan: (p: Plan) => void;
  paid: boolean;
  next: () => void;
  go: (id: string) => void;
  track: (event: string, value?: string) => void;
  /** RevenueCat Web Billing purchase confirmed in-page (no redirect). */
  onPaid: (p: Plan) => void;
};

function StepView(p: ViewProps) {
  const { step } = p;
  switch (step.kind) {
    case "single":
      return <SingleScreen {...p} step={step} />;
    case "multi":
      return <MultiScreen {...p} step={step} />;
    case "week":
      return <WeekScreen {...p} step={step} />;
    case "slider":
      return <SliderScreen {...p} step={step} />;
    case "statement":
      return <StatementScreen {...p} step={step} />;
    case "info":
      return step.screen === "reassure" ? <ReassureScreen {...p} /> : step.screen === "review" ? <ReviewScreen {...p} /> : <HowScreen {...p} />;
    case "name":
      return <NameScreen {...p} />;
    case "loader":
      return <LoaderScreen {...p} />;
    case "email":
      return <EmailScreen {...p} />;
    case "result":
      return <ResultScreen {...p} />;
    case "plan":
      return <PlanScreen {...p} />;
    case "paywall":
      return <PaywallScreen {...p} />;
    case "checkout":
      return <CheckoutScreen {...p} />;
    case "download":
      return <DownloadScreen {...p} />;
  }
}

function Heading({ eyebrow, title, sub }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="text-center mb-7">
      {eyebrow && <p className="mb-2 text-[13px] font-semibold tracking-wide text-acuity-primary">{eyebrow}</p>}
      <h1 className="text-[27px] leading-[1.15] font-bold tracking-tight text-balance">{title}</h1>
      {sub && <p className="mt-2.5 text-[15px] leading-relaxed text-acuity-text-sec text-balance">{sub}</p>}
    </div>
  );
}

/**
 * Rendered into document.body: the screens slide in with a transform
 * animation, and a transformed ancestor turns position:fixed into
 * "fixed to that ancestor", which floated the CTA mid-screen over content.
 */
function BottomBar({ children }: { children: ReactNode }) {
  const C = useV9();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    // Portaled outside the themed root, so it carries the theme itself.
    <div className="v9" data-theme={C.theme === "dusk" ? "dark" : undefined} data-funnel-theme={C.theme}><div className="fixed bottom-0 inset-x-0 z-40 backdrop-blur-md border-t border-acuity-line px-5 pt-3 pb-5" style={{ background: "color-mix(in oklch, var(--acuity-bg) 88%, transparent)" }}>
      <div className="max-w-lg mx-auto">{children}</div>
    </div></div>,
    document.body
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group w-full rounded-full grad py-4 text-[16px] font-semibold text-white shadow-[0_8px_22px_-6px_var(--acuity-primary)] transition active:scale-[0.98] disabled:opacity-40 disabled:shadow-none flex items-center justify-center gap-2"
    >
      {children}
      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
    </button>
  );
}

function Stars({ label = true, size = "h-4 w-4" }: { label?: boolean; size?: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 text-[13px] text-acuity-text-ter">
      <span className="flex text-acuity-warn">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className={`${size} fill-current`} />
        ))}
      </span>
      {label && <span className="font-medium">{APP_STORE_RATING_LABEL}</span>}
    </div>
  );
}

function initials(name: string) {
  if (name.toLowerCase().includes("app store")) return "";
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function ReviewCard({ quote, name, className = "" }: { quote: string; name: string; className?: string }) {
  const ini = initials(name);
  return (
    <figure className={`card rounded-3xl p-5 text-left ${className}`}>
      <div className="flex text-acuity-warn mb-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className="h-3.5 w-3.5 fill-current" />
        ))}
      </div>
      <blockquote className="text-[15px] leading-relaxed">&ldquo;{quote}&rdquo;</blockquote>
      <figcaption className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-acuity-text-sec">
        <span className="h-7 w-7 rounded-full chip-ico flex items-center justify-center text-[11px] font-bold">
          {ini || <Smartphone className="h-3.5 w-3.5" />}
        </span>
        {name}
      </figcaption>
    </figure>
  );
}

function RippleMark({ size = 72 }: { size?: number }) {
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <span className="ripple-ring" />
      <span className="ripple-ring" style={{ animationDelay: "0.85s" }} />
      <span className="ripple-ring" style={{ animationDelay: "1.7s" }} />
      <span className="absolute inset-[22%] rounded-full grad shadow-[0_6px_18px_-4px_var(--acuity-primary)]" />
    </div>
  );
}

// ─── Question screens ──────────────────────────────────────────────────────

function OptionCard({ icon: Icon, label, selected, onClick, trailing = "check", delay = 0 }: {
  icon?: LucideIcon; label: string; selected: boolean; onClick: () => void; trailing?: "check" | "box"; delay?: number;
}) {
  return (
    <button
      onClick={() => {
        haptic();
        onClick();
      }}
      style={{ animationDelay: `${delay}ms` }}
      className={`up w-full flex items-center gap-3.5 text-left rounded-2xl px-4 py-3.5 transition active:scale-[0.985] ${selected ? "card card-sel" : "card"}`}
    >
      {Icon && (
        <span className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center transition ${selected ? "grad text-white" : "chip-ico"}`}>
          <Icon className="h-5 w-5" />
        </span>
      )}
      <span className="flex-1 text-[16px] font-medium leading-snug">{label}</span>
      {trailing === "box" ? (
        <span className={`h-6 w-6 shrink-0 rounded-lg border-2 flex items-center justify-center transition ${selected ? "grad border-transparent" : "border-acuity-line-strong"}`}>
          {selected && <Check className="pop h-4 w-4 text-white" strokeWidth={3} />}
        </span>
      ) : selected ? (
        <CircleCheck className="pop h-6 w-6 shrink-0 text-acuity-primary" />
      ) : (
        <ChevronRight className="h-5 w-5 shrink-0 text-acuity-text-quiet" />
      )}
    </button>
  );
}

function SingleScreen({ step, answers, setAnswers, next, track }: ViewProps & { step: Extract<V9Step, { kind: "single" }> }) {
  const C = useV9();
  const isHook = step.id === "hook";
  const [picked, setPicked] = useState<string | null>(answers.single[step.id] ?? null);
  // Guards a double-tap from advancing twice. It must NOT key off `picked`:
  // going back to an answered question pre-fills picked, which made every
  // option dead and stranded the user (2026-09-25).
  const advancing = useRef(false);
  return (
    <div className="enter">
      {isHook && (
        <div className="mb-6">
          <RippleMark />
          <p className="mt-5 text-center text-[15px] font-semibold text-acuity-text-sec text-balance">{C.hookLine}</p>
        </div>
      )}
      <Heading title={step.title} sub={step.sub} />
      <div className="space-y-2.5">
        {step.options.map((o, i) => (
          <OptionCard
            key={o.id}
            delay={i * 45}
            icon={OPTION_ICONS[`${step.id}:${o.id}`]}
            label={o.label}
            selected={picked === o.id}
            onClick={() => {
              if (advancing.current) return;
              advancing.current = true;
              setPicked(o.id);
              setAnswers((a) => ({ ...a, single: { ...a.single, [step.id]: o.id } }));
              track(`funnel_v9_${step.id}_answered`, o.id);
              if (isHook) track("funnel_entry_selected", o.id);
              setTimeout(next, 320);
            }}
          />
        ))}
      </div>
      {isHook && (
        <div className="mt-7">
          <Stars />
          <p className="mt-2 text-center text-[12px] text-acuity-text-ter">About 2 minutes. No card to see your results.</p>
        </div>
      )}
    </div>
  );
}

function MultiScreen({ step, answers, setAnswers, next, track }: ViewProps & { step: Extract<V9Step, { kind: "multi" }> }) {
  const C = useV9();
  const picked = answers.multi[step.id] ?? [];
  const toggle = (id: string) =>
    setAnswers((a) => {
      const cur = a.multi[step.id] ?? [];
      const nextSel = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...a, multi: { ...a.multi, [step.id]: nextSel } };
    });
  const grid = step.options.length >= 6;
  return (
    <div className="enter">
      <Heading title={step.title} sub={step.sub} />
      {grid ? (
        <div className="grid grid-cols-2 gap-2.5">
          {step.options.map((o, i) => {
            const sel = picked.includes(o.id);
            const Icon = OPTION_ICONS[`${step.id}:${o.id}`] ?? Sparkles;
            return (
              <button
                key={o.id}
                onClick={() => {
                  haptic();
                  toggle(o.id);
                }}
                style={{ animationDelay: `${i * 40}ms` }}
                className={`up relative rounded-2xl px-3 pt-4 pb-3.5 flex flex-col items-center gap-2 text-center transition active:scale-[0.97] ${sel ? "card card-sel" : "card"}`}
              >
                {sel && (
                  <span className="pop absolute top-2 right-2 h-5 w-5 rounded-full grad flex items-center justify-center">
                    <Check className="h-3 w-3 text-white" strokeWidth={3} />
                  </span>
                )}
                <span className={`h-11 w-11 rounded-2xl flex items-center justify-center transition ${sel ? "grad text-white" : "chip-ico"}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-[14px] font-semibold leading-tight">{o.label}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2.5">
          {step.options.map((o, i) => (
            <OptionCard
              key={o.id}
              delay={i * 45}
              trailing="box"
              icon={OPTION_ICONS[`${step.id}:${o.id}`]}
              label={o.label}
              selected={picked.includes(o.id)}
              onClick={() => toggle(o.id)}
            />
          ))}
        </div>
      )}
      <BottomBar>
        <PrimaryButton
          disabled={picked.length === 0}
          onClick={() => {
            track(`funnel_v9_${step.id}_answered`, picked.join(","));
            next();
          }}
        >
          {picked.length === 0 ? "Pick at least one" : `Continue with ${picked.length}`}
        </PrimaryButton>
      </BottomBar>
    </div>
  );
}

/**
 * "What's on your list this week?" (2026-09-25, Keenan picked this from the
 * engagement ideas). Tappable chips for everyday things; a counter shows how
 * much she's holding as she taps. The picks come back on the loader
 * ("Catching …") and as a "Your week, caught" list on the result. Mirror,
 * not coach: the only reaction is "That's a lot to hold."
 */
function WeekScreen({ step, answers, setAnswers, next, track }: ViewProps & { step: Extract<V9Step, { kind: "week" }> }) {
  const picked = answers.multi[step.id] ?? [];
  const toggle = (id: string) =>
    setAnswers((a) => {
      const cur = a.multi[step.id] ?? [];
      const nextSel = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...a, multi: { ...a.multi, [step.id]: nextSel } };
    });
  const n = picked.length;
  const fill = Math.min(1, n / 8);
  return (
    <div className="enter">
      <Heading title={step.title} sub={step.sub} />
      <div className="flex flex-wrap justify-center gap-2">
        {step.items.map((it, i) => {
          const sel = picked.includes(it.id);
          return (
            <button
              key={it.id}
              onClick={() => {
                haptic();
                toggle(it.id);
              }}
              aria-pressed={sel}
              style={{ animationDelay: `${i * 35}ms` }}
              className={`up flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[15px] font-medium transition active:scale-[0.96] ${sel ? "grad text-white shadow-[0_6px_16px_-8px_var(--acuity-primary)]" : "card"}`}
            >
              {sel && <Check className="pop h-4 w-4" strokeWidth={3} />}
              {it.chip}
            </button>
          );
        })}
      </div>

      <div className="mt-7 card rounded-3xl px-5 py-4" aria-live="polite">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] font-semibold">
            <span className="tabular-nums">{n}</span> {n === 1 ? "thing" : "things"} you&rsquo;re holding
          </p>
          {n >= 5 && <p className="pop text-[13px] italic text-acuity-text-sec">That&rsquo;s a lot to hold.</p>}
        </div>
        <div className="mt-3 h-2.5 rounded-full soft overflow-hidden">
          <div className="h-full rounded-full grad transition-[width] duration-300 ease-out" style={{ width: `${Math.max(n ? 6 : 0, fill * 100)}%` }} />
        </div>
      </div>

      <BottomBar>
        <PrimaryButton
          disabled={n === 0}
          onClick={() => {
            track(`funnel_v9_${step.id}_answered`, picked.join(","));
            next();
          }}
        >
          {n === 0 ? "Tap at least one" : `Continue with ${n}`}
        </PrimaryButton>
      </BottomBar>
    </div>
  );
}

/** The picked week items, in step order. */
function weekPicks(C: V9Config, answers: Answers) {
  const step = C.steps.find((s): s is Extract<V9Step, { kind: "week" }> => s.kind === "week");
  if (!step) return [];
  const picked = answers.multi[step.id] ?? [];
  return step.items.filter((it) => picked.includes(it.id));
}
const weekTasks = (C: V9Config, answers: Answers) => weekPicks(C, answers).map((it) => it.task);

const weekChips = (C: V9Config, answers: Answers) => weekPicks(C, answers).map((it) => it.chip);

const statementSteps = (C: V9Config) => C.steps.filter((s): s is Extract<V9Step, { kind: "statement" }> => s.kind === "statement");

/**
 * One statement as a big "thought" card, two stacked buttons. The card flies
 * right on "That's me" and left on "Not really", then the next one arrives.
 * Vertically centered so the screen never has a dead lower half.
 */
function StatementScreen({ step, answers, setAnswers, next, track }: ViewProps & { step: Extract<V9Step, { kind: "statement" }> }) {
  const C = useV9();
  const isHook = step.id === "hook";
  const [fly, setFly] = useState<"yes" | "no" | null>(null);
  const advancing = useRef(false);
  const answer = (v: "yes" | "no") => {
    if (advancing.current) return;
    advancing.current = true;
    haptic();
    setFly(v);
    setAnswers((a) => ({ ...a, single: { ...a.single, [step.id]: v } }));
    track(`funnel_v9_${step.id.replace(/-/g, "_")}_answered`, v);
    if (isHook) track("funnel_entry_selected", v);
    setTimeout(next, 380);
  };
  const pos = statementSteps(C).findIndex((s) => s.id === step.id);
  const prev = answers.single[step.id];
  const lux = C.theme === "dusk";
  return (
    <div className="flex min-h-[calc(100svh-6rem)] flex-col justify-center">
      {lux ? (
        // BWK (steel/cobalt): the regular /start layout. A bold promise line
        // with the rating on the hook, no logo, then the question.
        <>
          {isHook ? (
            <div className="up mb-6 text-center">
              <p className="text-[18px] font-bold leading-snug tracking-tight text-balance">{C.hookLine}</p>
              <div className="mt-2 flex items-center justify-center gap-1.5 text-[13px] text-acuity-text-ter">
                <span className="flex text-acuity-warn">
                  {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-3.5 w-3.5 fill-current" />)}
                </span>
                <span>{APP_STORE_RATING_LABEL} &middot; about 2 minutes</span>
              </div>
            </div>
          ) : (
            <p className="up mb-3 text-center text-[13px] font-semibold tracking-wide text-acuity-primary">
              Tap what&rsquo;s true &middot; {pos} of {statementSteps(C).length - 1}
            </p>
          )}
          <h1 className="up mb-5 text-center text-[clamp(26px,7.4vw,30px)] font-bold leading-tight tracking-tight">{step.title ?? "Does this sound like you?"}</h1>
        </>
      ) : isHook ? (
        <div className="up mb-5 flex flex-col items-center text-center">
          <div className="flex items-center gap-2">
            <img src="/ripple-mark-coral-t.png" alt="" width={36} height={36} className="h-9 w-9" />
            <span className="text-[24px] font-bold tracking-tight">ripple</span>
          </div>
          <p className="mt-2.5 max-w-[20rem] text-[14px] leading-snug text-acuity-text-sec text-balance">{C.hookLine}</p>
        </div>
      ) : (
        <p className="up mb-3 text-center text-[13px] font-semibold tracking-wide text-acuity-primary">
          Tap what&rsquo;s true &middot; {pos} of {statementSteps(C).length - 1}
        </p>
      )}
      {!lux && <h1 className="up mb-5 text-center text-[clamp(22px,6.6vw,27px)] font-bold leading-tight tracking-tight">{step.title ?? "Does this sound like you?"}</h1>}

      {/* The statement as a quote: a face showing the feeling, then the line
          centered in italics (2026-09-25, per Keenan). */}
      {lux ? (
        <figure className={`card-in relative flex flex-col items-center rounded-[26px] card px-6 pb-7 pt-6 text-center ${fly === "yes" ? "fly-yes" : fly === "no" ? "fly-no" : ""}`}>
          <MoodAvatar mood={step.mood} tone="steel" size={56} />
          <blockquote className="mt-4 text-[clamp(21px,6vw,24px)] font-bold leading-[1.28] tracking-tight text-balance">
            &ldquo;{step.statement}&rdquo;
          </blockquote>
        </figure>
      ) : (
        <figure className={`card-in relative flex flex-col items-center overflow-hidden rounded-[28px] card px-6 pb-[clamp(22px,6vw,30px)] pt-6 text-center ${fly === "yes" ? "fly-yes" : fly === "no" ? "fly-no" : ""}`}>
          <MoodAvatar mood={step.mood} size={60} />
          <blockquote className="relative mt-4 text-[clamp(19px,5.6vw,22px)] font-medium italic leading-[1.35] tracking-tight text-balance">
            &ldquo;{step.statement}&rdquo;
          </blockquote>
        </figure>
      )}

      <div className={`mt-5 ${lux ? "space-y-3" : "space-y-1.5"}`}>
        <button
          onClick={() => answer("yes")}
          className={`w-full rounded-full grad py-4 text-[17px] font-semibold text-white transition active:scale-[0.98] flex items-center justify-center gap-2 ${lux ? "tracking-[0.01em]" : ""}`}
          style={{ boxShadow: lux ? "0 8px 18px -12px var(--acuity-primary)" : "0 10px 26px -8px var(--acuity-primary)" }}
        >
          {fly === "yes" || prev === "yes" ? <Check className="h-5 w-5" strokeWidth={3} /> : null}
          Yes, that&rsquo;s me
        </button>
        <button
          onClick={() => answer("no")}
          className={`w-full rounded-full py-3.5 text-[16px] font-semibold text-acuity-text-sec transition hover:text-acuity-text active:scale-[0.98] ${lux ? "border border-acuity-line-strong" : ""}`}
        >
          Not really
        </button>
      </div>

      {isHook && C.adDemo && (
        <div className="up" style={{ animationDelay: "200ms" }}>
          <FunnelEntryIntro
            intro={{ headline: C.hookLine, said: C.adDemo.said, caught: C.adDemo.caught, quizLine: "" }}
            theme={lux ? "dusk" : "light"}
            part="bottom"
          />
        </div>
      )}

      {isHook && !lux && (
        <div className="up mt-4" style={{ animationDelay: "250ms" }}>
          <Stars />
          <p className="mt-1.5 text-center text-[12px] text-acuity-text-ter">About 2 minutes. No card to see your results.</p>
        </div>
      )}
    </div>
  );
}

const sliderSteps = (C: V9Config) => C.steps.filter((s): s is Extract<V9Step, { kind: "slider" }> => s.kind === "slider");

function SliderScreen({ step, answers, setAnswers, next, track }: ViewProps & { step: Extract<V9Step, { kind: "slider" }> }) {
  const C = useV9();
  // Stored answers are 1-5; the range input is 0-100.
  const saved = answers.sliders[step.id];
  const [val, setVal] = useState<number>(saved != null ? (saved - 1) * 25 : 50);
  const [moved, setMoved] = useState(answers.sliders[step.id] != null);
  const pos = sliderSteps(C).findIndex((s) => s.id === step.id);
  const lean = val < 42 ? "left" : val > 58 ? "right" : "middle";
  const done = useRef(false);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    haptic();
    const five = Math.min(5, Math.max(1, Math.round(val / 25) + 1));
    setAnswers((a) => ({ ...a, sliders: { ...a.sliders, [step.id]: five } }));
    track(`funnel_v9_${step.id.replace(/-/g, "_")}_answered`, String(five));
    next();
  };
  return (
    <div className="enter">
      <Heading eyebrow={`Slider ${pos + 1} of ${sliderSteps(C).length}`} title="Which sounds more like you?" sub="Drag toward the one that fits, then let go." />
      <div className="card rounded-3xl p-5">
        <div className="grid grid-cols-2 gap-3">
          {[step.left, step.right].map((s, i) => {
            const on = (i === 0 && lean === "left") || (i === 1 && lean === "right");
            return (
              <div
                key={s}
                className={`rounded-2xl p-3.5 min-h-[92px] flex items-center text-[15px] font-semibold leading-snug transition-all duration-300 ${on ? "card-sel scale-[1.03]" : "soft opacity-70"} ${i === 1 ? "text-right justify-end" : ""}`}
              >
                {s}
              </div>
            );
          })}
        </div>
        <div className="mt-7 px-1">
          <input
            type="range"
            min={0}
            max={100}
            value={val}
            aria-label={`${step.left} or ${step.right}`}
            onChange={(e) => {
              setVal(Number(e.target.value));
              setMoved(true);
            }}
            // One gesture per statement: letting go of the thumb moves on.
            // The Next button stays for keyboards and accessibility.
            onPointerUp={() => moved && setTimeout(commit, 380)}
            onTouchEnd={() => moved && setTimeout(commit, 380)}
            className="v9-range"
          />
          <div className="mt-3 flex justify-between text-[12px] font-medium text-acuity-text-ter">
            <span>That&rsquo;s me</span>
            <span>In between</span>
            <span>That&rsquo;s me</span>
          </div>
        </div>
      </div>
      <BottomBar>
        <PrimaryButton onClick={commit} disabled={!moved}>
          {moved ? "Next" : "Drag the slider"}
        </PrimaryButton>
      </BottomBar>
    </div>
  );
}

// ─── Info screens ──────────────────────────────────────────────────────────

function ReassureScreen({ next }: ViewProps) {
  const C = useV9();
  return (
    <div className="enter">
      <Heading title={C.reassure.title} />
      <div className="relative h-[210px] mb-6 overflow-hidden">
        {C.reassure.things.map((t, i) => (
          <span
            key={t}
            className="absolute left-1/2 top-0 -ml-[60px] w-[120px] text-center rounded-full card px-3 py-1.5 text-[12px] font-semibold text-acuity-text-sec"
            style={{
              animation: `v9-float 3.4s ${i * 0.42}s ease-in infinite both`,
              ["--x0" as string]: `${(i % 2 ? 1 : -1) * (40 + (i % 3) * 28)}px`,
              ["--r" as string]: `${(i % 2 ? 1 : -1) * 8}deg`,
            }}
          >
            {t}
          </span>
        ))}
        <div className="absolute left-1/2 bottom-2 -translate-x-1/2 w-[190px] rounded-3xl card px-4 py-3 flex items-center gap-2.5">
          {/* The Ripple mark in white on the brand square, like the app icon. */}
          <span className="h-9 w-9 rounded-xl grad flex items-center justify-center">
            <img src="/ripple-mark-coral-t.png" alt="" width={22} height={22} className="h-[22px] w-[22px]" style={{ filter: "brightness(0) invert(1)" }} />
          </span>
          <div className="text-left">
            <p className="text-[13px] font-bold">Ripple</p>
            <p className="text-[11px] text-acuity-text-ter">keeps track of it</p>
          </div>
        </div>
      </div>
      <p className="text-center text-[16px] leading-relaxed text-acuity-text-sec text-balance">
        {C.reassure.body}
      </p>
      <div className="mt-6">
        <ReviewCard {...C.reviews[0]} />
      </div>
      <BottomBar>
        <PrimaryButton onClick={next}>{C.reassure.cta}</PrimaryButton>
      </BottomBar>
    </div>
  );
}

function ReviewScreen({ next }: ViewProps) {
  const C = useV9();
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const reviews = [C.reviews[1], C.reviews[2], C.reviews[0]];
  return (
    <div className="enter">
      <Heading eyebrow="From people who use it" title="What they notice after a few weeks" />
      <div
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget;
          setActive(Math.round(el.scrollLeft / (el.clientWidth * 0.86)));
        }}
        className="snap noscroll -mx-5 px-5 flex gap-3 overflow-x-auto pb-2"
      >
        {reviews.map((r) => (
          <ReviewCard key={r.name} {...r} className="w-[86%] shrink-0" />
        ))}
      </div>
      <div className="mt-3 flex justify-center gap-1.5">
        {reviews.map((r, i) => (
          <span key={r.name} className={`h-1.5 rounded-full transition-all ${i === active ? "w-5 grad" : "w-1.5 soft"}`} />
        ))}
      </div>
      <div className="mt-6">
        <Stars />
      </div>
      <BottomBar>
        <PrimaryButton onClick={next}>Continue</PrimaryButton>
      </BottomBar>
    </div>
  );
}

function pickSample(plate: string[], C: V9Config) {
  return C.samples.find((x) => x.match.some((m) => plate.includes(m))) ?? C.samples[C.samples.length - 1];
}

function HowScreen({ answers, next, track }: ViewProps) {
  const C = useV9();
  const sample = pickSample(answers.multi.plate ?? [], C);
  const [run, setRun] = useState(0);
  const [typed, setTyped] = useState(0);
  const [shown, setShown] = useState(0);
  const [checked, setChecked] = useState<string[]>([]);
  useEffect(() => {
    setTyped(0);
    setShown(0);
    setChecked([]);
    const iv = setInterval(() => {
      setTyped((t) => {
        if (t >= sample.said.length) {
          clearInterval(iv);
          return t;
        }
        return t + 2;
      });
    }, 28);
    return () => clearInterval(iv);
  }, [run, sample.said]);
  const doneTyping = typed >= sample.said.length;
  useEffect(() => {
    if (!doneTyping) return;
    const total = sample.tasks.length + 2;
    const timers = Array.from({ length: total }, (_, i) => setTimeout(() => setShown(i + 1), 350 + i * 380));
    return () => timers.forEach(clearTimeout);
  }, [doneTyping, sample.tasks.length, run]);
  return (
    <div className="enter">
      <Heading eyebrow="How Ripple works" title="You say it. Ripple catches it." />
      <div className="flex items-end gap-2">
        <span className="h-8 w-8 shrink-0 rounded-full soft flex items-center justify-center">
          <Mic className="h-4 w-4 text-acuity-text-sec" />
        </span>
        <div className="card rounded-3xl rounded-bl-md px-4 py-3 text-[15px] leading-relaxed min-h-[84px]">
          {sample.said.slice(0, typed)}
          {!doneTyping && <span className="caret text-acuity-primary" />}
        </div>
      </div>
      <div className={`mt-4 rounded-3xl card p-4 transition-opacity duration-300 ${doneTyping ? "opacity-100" : "opacity-40"}`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="h-7 w-7 rounded-lg grad flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </span>
          <p className="text-[13px] font-bold">Ripple caught</p>
        </div>
        <div className="space-y-2">
          {sample.tasks.map((t, i) =>
            shown > i ? (
              <button
                key={t}
                onClick={() => {
                  setChecked((c) => (c.includes(t) ? c.filter((x) => x !== t) : [...c, t]));
                  track("funnel_v9_how_task_tapped");
                }}
                className="up w-full flex items-center gap-3 rounded-2xl soft px-3 py-2.5 text-left"
              >
                <span className={`h-5 w-5 rounded-md border-2 flex items-center justify-center ${checked.includes(t) ? "grad border-transparent" : "border-acuity-line-strong"}`}>
                  {checked.includes(t) && <Check className="pop h-3.5 w-3.5 text-white" strokeWidth={3} />}
                </span>
                <span className={`text-[15px] ${checked.includes(t) ? "line-through text-acuity-text-ter" : ""}`}>{t}</span>
              </button>
            ) : null
          )}
          {shown > sample.tasks.length && (
            <div className="up flex items-center justify-between rounded-2xl soft px-3 py-2.5">
              <span className="text-[13px] text-acuity-text-ter">Mood</span>
              <span className="rounded-full chip-ico px-3 py-1 text-[13px] font-semibold">{sample.mood}</span>
            </div>
          )}
          {shown > sample.tasks.length + 1 && (
            <div className="up rounded-2xl soft px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[13px] text-acuity-text-ter">
                <Eye className="h-3.5 w-3.5" /> A pattern to watch
              </p>
              <p className="mt-0.5 text-[15px] font-medium">{sample.pattern}</p>
            </div>
          )}
        </div>
      </div>
      {shown > sample.tasks.length + 1 && (
        <button onClick={() => setRun((r) => r + 1)} className="up mt-3 mx-auto flex items-center gap-1.5 text-[13px] font-medium text-acuity-text-ter">
          <RotateCcw className="h-3.5 w-3.5" /> Play again
        </button>
      )}
      <p className="mt-4 text-center text-[13px] text-acuity-text-ter">Tap a task to check it off.</p>
      <BottomBar>
        <PrimaryButton onClick={next}>Continue</PrimaryButton>
      </BottomBar>
    </div>
  );
}

function NameScreen({ answers, setAnswers, next, track }: ViewProps) {
  const [v, setV] = useState(answers.name);
  const first = v.trim().split(/\s+/)[0];
  const save = () => {
    setAnswers((a) => ({ ...a, name: v.trim().slice(0, 40) }));
    track("funnel_v9_name_answered", v.trim() ? "given" : "skipped");
    next();
  };
  return (
    <div className="enter">
      <Heading title="What should Ripple call you?" sub="Your results will be made for you." />
      <div className="card rounded-3xl p-2 flex items-center gap-2">
        <span className="h-11 w-11 rounded-2xl chip-ico flex items-center justify-center">
          <User className="h-5 w-5" />
        </span>
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="First name"
          autoComplete="given-name"
          autoFocus
          className="flex-1 bg-transparent px-1 py-3 text-[18px] font-medium outline-none"
        />
      </div>
      <p className={`mt-5 text-center text-[17px] font-semibold transition-all duration-300 ${first ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}`}>
        Nice to meet you, <span className="grad-text">{first || "friend"}</span>.
      </p>
      <BottomBar>
        <PrimaryButton onClick={save}>{v.trim() ? "Continue" : "Skip for now"}</PrimaryButton>
      </BottomBar>
    </div>
  );
}

function plateLabel(plate: string[], map: Record<string, string>): string {
  const parts = plate.map((p) => map[p]).filter(Boolean).slice(0, 3);
  if (parts.length === 0) return "everything on your plate";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function LoaderScreen({ answers, firstName, next }: ViewProps) {
  const C = useV9();
  const lines = useMemo(
    () => [
      { icon: Users, text: `Reading your answers about ${plateLabel(answers.multi.plate ?? [], C.plateLabels)}` },
      (() => {
        const chips = weekChips(C, answers);
        if (chips.length === 0) return { icon: Layers, text: "Weighing what slips through the cracks" };
        // Lowercase mid-sentence, except possessive names ("Mom’s appointment").
        const lc = (c: string) => (/^\S+[’']s\b/.test(c) ? c : c.charAt(0).toLowerCase() + c.slice(1));
        const shown = chips.slice(0, 2).map(lc);
        const rest = chips.length - shown.length;
        const list = rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.join(" and ");
        return { icon: ListChecks, text: `Catching ${chips.length} ${chips.length === 1 ? "thing" : "things"}: ${list}` };
      })(),
      { icon: Brain, text: "Matching you to how Ripple sorts a debrief" },
      { icon: Sparkles, text: firstName ? `Building ${firstName}'s first week` : "Building your first week" },
    ],
    [answers.multi.plate, answers.multi.week, firstName]
  );
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const DURATION = 6200;
    const iv = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / DURATION);
      setPct(Math.round(100 * (1 - Math.pow(1 - t, 2.2))));
      if (t >= 1) clearInterval(iv);
    }, 50);
    const end = setTimeout(next, DURATION + 700);
    return () => {
      clearInterval(iv);
      clearTimeout(end);
    };
  }, [next]);
  const R = 58;
  const CIRC = 2 * Math.PI * R;
  return (
    <div className="enter pt-4">
      <div className="relative mx-auto h-[150px] w-[150px]">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <defs>
            <linearGradient id="v9g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--acuity-primary-hi)" />
              <stop offset="100%" stopColor="var(--acuity-primary-lo)" />
            </linearGradient>
          </defs>
          <circle cx="70" cy="70" r={R} fill="none" stroke="var(--acuity-bg-sub)" strokeWidth="10" />
          <circle cx="70" cy="70" r={R} fill="none" stroke="url(#v9g)" strokeWidth="10" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct / 100)} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[30px] font-bold tabular-nums">{pct}%</div>
      </div>
      <h1 className="mt-6 text-center text-[24px] font-bold tracking-tight">Putting your results together</h1>
      <div className="mt-6 space-y-2.5">
        {lines.map((l, i) => {
          const done = pct >= (i + 1) * 25;
          const active = !done && pct >= i * 25;
          const Icon = l.icon;
          return (
            <div key={l.text} className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-300 ${done ? "card" : active ? "card opacity-90" : "soft opacity-50"}`}>
              <span className={`h-8 w-8 shrink-0 rounded-xl flex items-center justify-center ${done ? "grad text-white" : "chip-ico"}`}>
                {done ? <Check className="pop h-4 w-4" strokeWidth={3} /> : <Icon className="h-4 w-4" />}
              </span>
              <span className="text-[15px] font-medium">{l.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmailScreen({ answers, setAnswers, firstName, next, go, track }: ViewProps) {
  const C = useV9();
  const [email, setEmail] = useState(answers.email);
  const [optIn, setOptIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const state = C.stateName({ plate: answers.multi.plate ?? [], sliders: answers.sliders, pileup: answers.single.pileup, said: answers.single });

  // Already gave an email this session (refresh, a ?step=email link, or
  // history): the account exists, so go straight to the result instead of
  // re-running signup into "you already have an account".
  useEffect(() => {
    if (answers.email) go("result");
  }, [answers.email, go]);

  const submit = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setErr("That email doesn’t look right.");
      return;
    }
    setBusy(true);
    setErr(null);
    track("funnel_email_submitted");
    fireFbq("Lead", { content_name: "Funnel v9 Email Gate" });
    let funnelUtm: Record<string, string> = {};
    try {
      const s = sessionStorage.getItem("acuity_funnel_utm");
      if (s) funnelUtm = JSON.parse(s);
    } catch {}
    const password = randomPassword();
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: e,
          password,
          name: answers.name.trim() || undefined,
          attribution: {
            ...(funnelUtm.utmSource ? { utm_source: funnelUtm.utmSource } : {}),
            ...(funnelUtm.utmMedium ? { utm_medium: funnelUtm.utmMedium } : {}),
            ...(funnelUtm.utmCampaign ? { utm_campaign: funnelUtm.utmCampaign } : {}),
            ...(funnelUtm.utmContent ? { utm_content: funnelUtm.utmContent } : {}),
            ...(funnelUtm.fbclid ? { fbclid: funnelUtm.fbclid } : {}),
            landingPath: C.path,
            marketingOptIn: optIn ? "yes" : "no",
          },
        }),
      });
      if (res.status === 409) {
        setExists(true);
        track("funnel_email_exists");
        setBusy(false);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(body.error === "RateLimited" ? "Too many tries. Wait a few minutes and try again." : "Something went wrong. Try again.");
        track("funnel_signup_failed", `v9:${body.error ?? res.status}`);
        setBusy(false);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { capiEventId?: string };
      waitForFbq().then((ok) => {
        if (ok) fireFbq("CompleteRegistration", { content_name: "Free Trial Signup", currency: "USD", value: 0 }, data.capiEventId);
      });
      const r = await signIn("credentials", { email: e, password, redirect: false });
      setAnswers((a) => ({ ...a, email: e }));
      track("funnel_account_created", `method:email-gate|signin:${r?.ok ? "ok" : "failed"}`);
      // Funnel accounts start on the free plan; the 7-day Pro trial needs a card.
      fetch("/api/onboarding/funnel-free-plan", { method: "POST", keepalive: true }).catch(() => {});
      next();
    } catch {
      setErr("Connection issue. Try again.");
      setBusy(false);
    }
  };

  if (exists) {
    return (
      <div className="enter">
        <Heading title="You already have a Ripple account." sub="Sign in and we'll take you straight to your results." />
        <BottomBar>
          <PrimaryButton onClick={() => signIn(undefined, { callbackUrl: `${C.path}?step=result` })}>Sign in</PrimaryButton>
        </BottomBar>
      </div>
    );
  }

  return (
    <div className="enter">
      <Heading eyebrow={firstName ? `${firstName}, your results are ready` : "Your results are ready"} title="Where should we send them?" />
      <div className="relative card rounded-3xl p-5 overflow-hidden mb-5">
        <p className="text-[12px] font-semibold text-acuity-text-ter">Your pattern</p>
        <p className="mt-1 text-[24px] font-bold select-none blur-[7px]">{state.name}</p>
        <div className="mt-3 space-y-2 blur-[5px] select-none">
          <div className="h-2.5 rounded-full grad w-4/5" />
          <div className="h-2.5 rounded-full grad w-3/5 opacity-70" />
          <div className="h-2.5 rounded-full grad w-2/3 opacity-50" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex items-center gap-2 rounded-full bg-acuity-bg px-4 py-2 text-[13px] font-semibold shadow-md">
            <Lock className="h-4 w-4 text-acuity-primary" /> Unlocks with your email
          </span>
        </div>
      </div>
      <div className="card rounded-3xl p-2 flex items-center gap-2">
        <span className="h-11 w-11 rounded-2xl chip-ico flex items-center justify-center">
          <Mail className="h-5 w-5" />
        </span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
          placeholder="you@email.com"
          className="flex-1 bg-transparent px-1 py-3 text-[17px] outline-none"
        />
      </div>
      {err && <p className="mt-2 text-center text-[14px] text-acuity-bad">{err}</p>}
      <div className="mt-4 space-y-2 text-[13px] text-acuity-text-sec">
        <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-acuity-good" /> Saved to a private Ripple account. No password yet.</p>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="h-4 w-4 accent-[var(--acuity-primary)]" />
          Send me occasional notes from Ripple.
        </label>
      </div>
      <BottomBar>
        <PrimaryButton onClick={submit} disabled={busy || !email.trim()}>
          {busy ? "Saving…" : "See my results"}
        </PrimaryButton>
      </BottomBar>
    </div>
  );
}

// ─── Result, plan, paywall ─────────────────────────────────────────────────

function ResultScreen({ answers, firstName, next }: ViewProps) {
  const C = useV9();
  const state = C.stateName({ plate: answers.multi.plate ?? [], sliders: answers.sliders, pileup: answers.single.pileup, said: answers.single });
  const bars = sliderSteps(C).map((s) => {
    const v = answers.sliders[s.id] ?? 3;
    return { label: s.right, pct: Math.round(((v - 1) / 4) * 100) };
  });
  const plate = answers.multi.plate ?? [];
  return (
    <div className="enter">
      <p className="text-center text-[13px] font-semibold text-acuity-primary mb-3">
        {firstName ? `${firstName}, here's what you told us` : "Here's what you told us"}
      </p>
      <div className="relative rounded-[28px] grad p-6 text-white overflow-hidden shadow-[0_14px_36px_-12px_var(--acuity-primary)]">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -right-2 top-16 h-24 w-24 rounded-full bg-white/10" />
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/80">Your pattern</p>
        <h1 className="mt-1 text-[32px] font-bold leading-tight">{state.name}</h1>
        <p className="mt-2 text-[16px] leading-relaxed text-white/90">{state.line}</p>
      </div>

      <div className="mt-5 card rounded-3xl p-5">
        <p className="text-[13px] font-bold mb-3.5">Your mental load, in your answers</p>
        <div className="space-y-3">
          {bars.map((b, i) => (
            <div key={b.label}>
              <div className="flex justify-between text-[13px] mb-1">
                <span className="text-acuity-text-sec">{b.label}</span>
                <span className="font-semibold tabular-nums">{b.pct}%</span>
              </div>
              <div className="h-2.5 rounded-full soft overflow-hidden">
                <div className="h-full rounded-full grad" style={{ width: `${Math.max(6, b.pct)}%`, animation: `v9-bar 900ms ${200 + i * 140}ms cubic-bezier(.2,.8,.2,1) both` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {statementSteps(C).some((st) => answers.single[st.id] === "yes") && (
        <div className="mt-4 card rounded-3xl p-5">
          <p className="text-[13px] font-bold mb-2.5">In your own words</p>
          <div className="space-y-2">
            {statementSteps(C).filter((st) => answers.single[st.id] === "yes").map((st, i) => (
              <p key={st.id} className="up flex items-center gap-2.5 text-[15px] italic leading-snug" style={{ animationDelay: `${300 + i * 120}ms` }}>
                <MoodAvatar mood={st.mood} tone={C.theme === "dusk" ? "steel" : "hue"} size={28} />
                <span>&ldquo;{st.statement}&rdquo;</span>
              </p>
            ))}
          </div>
        </div>
      )}

      {weekTasks(C, answers).length > 0 && (
        <div className="mt-4 card rounded-3xl p-5">
          <p className="text-[13px] font-bold">Your week, caught</p>
          <p className="mt-1 text-[13px] leading-snug text-acuity-text-sec">
            Say these out loud once and Ripple turns them into a list like this.
          </p>
          <ul className="mt-3 space-y-2">
            {weekTasks(C, answers).map((t, i) => (
              <li key={t} className="up flex items-center gap-2.5 text-[15px] leading-snug" style={{ animationDelay: `${300 + i * 90}ms` }}>
                <span className="h-5 w-5 shrink-0 rounded-md grad flex items-center justify-center">
                  <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {plate.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <span className="text-[13px] text-acuity-text-ter w-full text-center">You&rsquo;re carrying</span>
          {plate.map((p) => {
            const Icon = OPTION_ICONS[`plate:${p}`] ?? Sparkles;
            const label = C.steps.find((s) => s.id === "plate" && s.kind === "multi") as Extract<V9Step, { kind: "multi" }>;
            return (
              <span key={p} className="up flex items-center gap-1.5 rounded-full card px-3 py-1.5 text-[13px] font-semibold">
                <Icon className="h-3.5 w-3.5 text-acuity-primary" />
                {label.options.find((o) => o.id === p)?.label}
              </span>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-center text-[15px] leading-relaxed text-acuity-text-sec text-balance">
        {C.resultOutro}
      </p>
      <BottomBar>
        <PrimaryButton onClick={next}>See my first week</PrimaryButton>
      </BottomBar>
    </div>
  );
}

function PlanScreen({ answers, firstName, next }: ViewProps) {
  const C = useV9();
  const notice = answers.multi.notice ?? [];
  const noticeText: Record<string, string> = {
    drains: "what drains you",
    lifts: "what lifts you",
    habits: "the habits you're building",
    putoff: "what you keep putting off",
    mood: "how your mood moves",
  };
  const picked = notice.map((n) => noticeText[n]).filter(Boolean).slice(0, 2);
  const day7 = picked.length ? `Your first pattern: ${picked.join(" and ")}. Plus your first weekly report.` : "Your first pattern and your first weekly report.";
  const talk = answers.single.talktype === "type" ? "Type" : answers.single.talktype === "talk" ? "Talk" : "Talk or type";
  const rows = [
    { day: "Day 1", icon: ListTodo, title: "Your to-do list writes itself", text: `${talk} whatever's on your mind. Ripple pulls out the tasks.` },
    { day: "Day 3", icon: Target, title: "Habits track themselves", text: "The habits you mention start tracking on their own. Your mood gets a read after every debrief." },
    { day: "Day 7", icon: Eye, title: "You see your own pattern", text: day7 },
    // Day 30 / 365 added 2026-09-25 (Keenan): the ripple effect, then the
    // whole-life view. Describes what Ripple shows, not promised outcomes.
    {
      day: "Day 30",
      icon: Waves,
      title: "The ripple effect starts",
      text: "A month of your own words adds up. Fewer things slip, the habits that stuck are clear, and you can see which weeks wear you down.",
    },
    {
      day: "Day 365",
      icon: Sprout,
      title: "It spreads through your whole life",
      text: C.brand === "bwk"
        ? "A year of debriefs across work, training, money and family, all in your Life Matrix. You can see how far you've come, in your own words."
        : "A year of debriefs across work, family, health and money, all in your Life Matrix. You can see how far you've come, in your own words.",
    },
  ];
  return (
    <div className="enter">
      <Heading eyebrow="Built from your answers" title={firstName ? `${firstName}'s year with Ripple` : "Your year with Ripple"} />
      <ol className="relative">
        <span className="absolute left-[27px] top-4 bottom-4 w-0.5 soft" />
        {rows.map((r, i) => {
          const Icon = r.icon;
          return (
            <li key={r.day} className="up relative flex gap-4 pb-4" style={{ animationDelay: `${150 + i * 180}ms` }}>
              <span className="relative z-10 h-14 w-14 shrink-0 rounded-2xl grad flex items-center justify-center shadow-[0_6px_16px_-6px_var(--acuity-primary)]">
                <Icon className="h-6 w-6 text-white" />
              </span>
              <div className="card rounded-2xl px-4 py-3 flex-1">
                <p className="text-[12px] font-bold uppercase tracking-wide text-acuity-primary">{r.day}</p>
                <p className="text-[16px] font-semibold">{r.title}</p>
                <p className="mt-0.5 text-[14px] leading-snug text-acuity-text-sec">{r.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <BottomBar>
        <PrimaryButton onClick={next}>Start my first week</PrimaryButton>
      </BottomBar>
    </div>
  );
}

const PRO_FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: ListTodo, title: "A to-do list that writes itself", text: "Every task you mention, pulled out and kept." },
  { icon: Target, title: "Habit tracking", text: "The habits you talk about track themselves." },
  { icon: Eye, title: "Patterns you can't see from inside", text: "What drains you, what lifts you, week over week." },
  { icon: Bell, title: "Your weekly report", text: "The story of your week, written from your own words." },
];

/** Paper planner vs Ripple, for the paywall comparison (2026-10-27). */
const PLANNER_VS_RIPPLE: [string, string][] = [
  ["You write every task out by hand", "Just talk. Ripple writes the list"],
  ["Left in a bag or a drawer by February", "On your phone, always with you"],
  ["Habits tracked with checkboxes you forget", "Tracks the habits you mention"],
  ["Can't show you what keeps coming up", "Shows your patterns week to week"],
  ["Run out of pages, buy another", "Picks up right where you left off"],
];
/** Ripple column tiles: short title + one small line (same order as above). */
const RIPPLE_TILES: { title: string; sub: string }[] = [
  { title: "Just talk", sub: "It writes the list" },
  { title: "Always on you", sub: "Right on your phone" },
  { title: "Tracks habits", sub: "From what you say" },
  { title: "Your patterns", sub: "Week to week" },
  { title: "Never runs out", sub: "Picks up anytime" },
];
/** Keenan's figures (2026-10-27): average planner $27.43, 2 bought a year. */
const PLANNER_PRICE_CENTS = 2743;
const PLANNERS_PER_YEAR_CENTS = PLANNER_PRICE_CENTS * 2;
/** Published yearly prices, Oct 2026: Day One Silver $49.99, Habitify Premium $39.99 (US). */
const JOURNAL_APP_CENTS = 4999;
const HABIT_APP_CENTS = 3999;
const formatCents = (c: number) => `$${(c / 100).toFixed(2)}`;

/** Adds "on" to the element once it scrolls into view (drives .rv animations). */
function useInView<T extends HTMLElement>(): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || on) return;
    if (typeof IntersectionObserver === "undefined") {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [on]);
  return [ref, on];
}

/** Counts from 0 to `cents` once `run` is true. */
function CountUp({ cents, run, ms = 900 }: { cents: number; run: boolean; ms?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(cents * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, cents, ms]);
  return <>{formatCents(run ? v : 0)}</>;
}

/** Ripple-side icons, one per PLANNER_VS_RIPPLE row. */
const RIPPLE_ROW_ICONS = [Mic, Smartphone, Repeat, TrendingUp, RotateCcw];
/** Hand-written mess: each planner note a little crooked, in a different pen. */
const SCRAWL_STYLE = [
  { rot: -1.4, x: 1, ink: "#33456b" },
  { rot: 1.1, x: 6, ink: "#4a4236" },
  { rot: -0.8, x: 0, ink: "#5a3a3a" },
  { rot: 1.3, x: 4, ink: "#33456b" },
  { rot: -1.1, x: 2, ink: "#4a4236" },
];

function PlannerVsRipple() {
  const [ref, on] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={`card rounded-3xl p-4 ${on ? "on" : ""}`}>
      <p className="text-center text-[22px] font-bold leading-tight tracking-tight">
        Paper planner <span className="text-acuity-text-ter font-semibold">vs</span> <span className="grad-text">Ripple</span>
      </p>
      <p className="mt-1 text-center text-[13px] text-acuity-text-sec">Why people are switching</p>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {/* The planner: crumpled lined paper, crooked notes in mixed pens, scribbled out. */}
        <div className="paper rv relative -rotate-[1.5deg] rounded-lg px-2.5 pb-3 pt-9" style={{ "--d": "0ms" } as CSSProperties}>
          <span className="absolute left-0 right-0 top-0 h-6 rounded-t-lg bg-[#e9e2cf] text-center text-[11px] font-bold uppercase tracking-wide leading-6 text-[#8a7f66]">
            Paper planner
          </span>
          <span className="stain" aria-hidden />
          <span className="dogear" aria-hidden />
          {PLANNER_VS_RIPPLE.map(([planner], i) => {
            const st = SCRAWL_STYLE[i % SCRAWL_STYLE.length];
            return (
              <div key={planner} className="flex min-h-[66px] items-start gap-1 py-1" style={{ transform: `rotate(${st.rot}deg) translateX(${st.x}px)` }}>
                <X className="rv-pop mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" strokeWidth={3} style={{ "--d": `${300 + i * 170}ms` } as CSSProperties} />
                <p className="scrawl text-[15.5px] font-semibold leading-[1.25]" style={{ color: st.ink }}>
                  <span className="strike" style={{ "--d": `${400 + i * 170}ms` } as CSSProperties}>{planner}</span>
                </p>
              </div>
            );
          })}
        </div>
        {/* Ripple: a clean, organized app view. */}
        <div className="rv relative overflow-hidden rounded-2xl grad p-1.5 pt-8 shadow-lg" style={{ "--d": "150ms" } as CSSProperties}>
          <span className="absolute left-0 right-0 top-0 flex h-7 items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-wide text-white">
            <Sparkles className="h-3 w-3" /> Ripple
          </span>
          <div className="space-y-1.5">
            {PLANNER_VS_RIPPLE.map(([planner, ripple], i) => {
              const Icon = RIPPLE_ROW_ICONS[i % RIPPLE_ROW_ICONS.length];
              return (
                <div
                  key={planner}
                  className="rv flex min-h-[64px] items-center gap-1.5 rounded-xl bg-white px-1.5 py-2 text-acuity-text shadow-sm"
                  style={{ "--d": `${700 + i * 170}ms` } as CSSProperties}
                >
                  <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg chip-ico">
                    <Icon className="h-3.5 w-3.5" />
                    <span className="rv-pop absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-acuity-good text-white ring-2 ring-white" style={{ "--d": `${850 + i * 170}ms` } as CSSProperties}>
                      <Check className="h-2 w-2" strokeWidth={4} />
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-nowrap text-[13px] font-bold leading-tight">{RIPPLE_TILES[i]?.title ?? ripple}</p>
                    <p className="mt-0.5 text-[11px] leading-tight text-acuity-text-sec">{RIPPLE_TILES[i]?.sub}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SystemCost() {
  const [ref, on] = useInView<HTMLDivElement>();
  const rows = [
    { label: "Paper planner or journal", note: "2 a year at $27.43", cents: PLANNERS_PER_YEAR_CENTS, icon: BookOpen },
    { label: "Journaling app", note: "e.g. Day One", cents: JOURNAL_APP_CENTS, icon: Smartphone },
    { label: "Habit tracker app", note: "e.g. Habitify", cents: HABIT_APP_CENTS, icon: Repeat },
  ];
  const total = rows.reduce((n, r) => n + r.cents, 0);
  return (
    <div ref={ref} className={`mt-5 card rounded-3xl p-5 ${on ? "on" : ""}`}>
      <p className="text-center text-[22px] font-bold leading-tight tracking-tight">
        What your system <span className="grad-text">costs now</span>
      </p>
      <div className="mt-5 space-y-2.5">
        {rows.map((r, i) => (
          <div key={r.label} className={`rv flex items-center gap-3 ${on ? "on" : ""}`} style={{ "--d": `${i * 180}ms` } as CSSProperties}>
            <span className="h-9 w-9 shrink-0 rounded-xl chip-ico flex items-center justify-center">
              <r.icon className="h-[18px] w-[18px]" />
            </span>
            <div className="flex-1">
              <p className="text-[14.5px] font-semibold leading-tight">{r.label}</p>
              <p className="text-[12px] text-acuity-text-ter">{r.note}</p>
            </div>
            <p className="text-[15px] font-semibold tabular-nums">
              <CountUp cents={r.cents} run={on} />
            </p>
          </div>
        ))}
      </div>
      <div className={`rv mt-4 rounded-2xl soft px-4 py-3 text-center ${on ? "on" : ""}`} style={{ "--d": "600ms" } as CSSProperties}>
        <p className="text-[12px] font-bold uppercase tracking-wide text-acuity-text-ter">Every year, combined</p>
        <p className="mt-0.5 text-[30px] font-bold tabular-nums leading-none text-red-500">
          <CountUp cents={total} run={on} ms={1300} />
        </p>
      </div>
      <div className={`rv mt-3 flex items-center justify-center gap-2 rounded-2xl grad px-4 py-3.5 text-white glow ${on ? "on" : ""}`} style={{ "--d": "1100ms" } as CSSProperties}>
        <Sparkles className="h-4 w-4" />
        <p className="text-[15px] font-bold">Ripple does all three, in one app.</p>
      </div>
    </div>
  );
}

function PaywallScreen({ plan, setPlan, next, go, track, firstName, answers }: ViewProps) {
  const C = useV9();
  const [open, setOpen] = useState<number | null>(null);
  // Warm Stripe.js while she reads the paywall so checkout mounts fast.
  useEffect(() => {
    loadStripeJs().catch(() => {});
  }, []);
  const price = useArmPrices();
  const after = plan === "yearly" ? `${price.annual}/year` : `${price.monthly}/month`;
  // Price test, low arm (2026-10-27, Keenan): framed as an early bird price
  // against the normal one, which is true: low-arm members keep it.
  const normal = pricesForArm("std");
  const earlyBird = price.arm === "low" && normal.annualCents > price.annualCents;
  const earlyBirdOffPct = Math.round((1 - price.annualCents / normal.annualCents) * 100);
  // "Ends today" in her own time zone (Keenan 2026-10-27: urgency is industry
  // standard). Set after mount so the server render never disagrees.
  const [endsLabel, setEndsLabel] = useState("");
  useEffect(() => {
    setEndsLabel(`today, ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
  }, []);
  // Value against something she already pays for.
  const perMonthCents = Math.round(price.annualCents / 12);
  const coffeeLine =
    perMonthCents <= 500 ? "Less than one coffee a month" : perMonthCents <= 1000 ? "About the price of two coffees a month" : "";
  // Log which price she saw, once per browser session (signed in by now, so
  // the event carries her userId as well as the funnel session).
  useEffect(() => {
    if (!price.testOn) return;
    const label = clientArmLabel(price.arm);
    try {
      if (sessionStorage.getItem("rp_ptest_logged") === label) return;
      sessionStorage.setItem("rp_ptest_logged", label);
    } catch {}
    track("funnel_price_arm", label);
  }, [price.testOn, price.arm, track]);
  const pick = (p: Plan) => {
    setPlan(p);
    track("funnel_paywall_plan_selected", p);
  };
  // FAQ, reviews first (2026-10-27, Keenan: "Read our reviews").
  const faqItems: { q: string; a: ReactNode }[] = [
    {
      q: "Read our reviews",
      a: (
        <div className="space-y-2.5">
          {C.reviews.map((r) => (
            <ReviewCard key={r.name} {...r} className="w-full" />
          ))}
        </div>
      ),
    },
    ...C.faq,
  ];
  return (
    <div className="enter">
      <div className="flex justify-center mb-3">
        <span className="flex items-center gap-1.5 rounded-full card px-3 py-1.5 text-[12px] font-semibold">
          <CircleCheck className="h-3.5 w-3.5 text-acuity-good" /> Your plan is ready{firstName ? `, ${firstName}` : ""}
        </span>
      </div>
      {/* Annual is always highlighted; the radio shows which plan is picked.
          Order (2026-10-27, Keenan): why it's for her → what she gets → proof
          → then the price. The CTA stays pinned at the bottom throughout. */}
      <Heading
        title={<>Less to carry.<br /><span className="grad-text">A clearer next step.</span></>}
      />

      {/* Planner vs Ripple + what her system costs (2026-10-27, Keenan: our
          best ads win on this; made livelier with on-scroll animation). */}
      <PlannerVsRipple />
      <SystemCost />

      <div className="mt-5 card rounded-3xl px-4 py-5">
        <div className="relative grid grid-cols-3">
          <span className="absolute left-[16.6%] right-[16.6%] top-5 h-0.5 soft" />
          <span className="absolute left-[16.6%] top-5 h-0.5 grad" style={{ width: "33.4%" }} />
          {[
            { label: "Today", text: "Full access. $0.", icon: Sparkles },
            { label: "Day 4", text: "Reminder email", icon: Bell },
            { label: "Day 7", text: "Plan starts", icon: CalendarCheck },
          ].map((t, i) => (
            <div key={t.label} className="relative flex flex-col items-center text-center">
              <span className={`relative z-10 h-10 w-10 rounded-full flex items-center justify-center ${i === 0 ? "grad text-white" : "card text-acuity-primary"}`}>
                <t.icon className="h-[18px] w-[18px]" />
              </span>
              <p className="mt-2 text-[13px] font-bold">{t.label}</p>
              <p className="text-[12px] text-acuity-text-sec leading-tight">{t.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-[13px] text-acuity-text-sec">Cancel before day 7 and you pay nothing.</p>
      </div>

      <div className="mt-8 mb-7 text-center">
        <p className="text-[19px] font-bold tracking-tight">Free for your first 7 days</p>
        <p className="mt-1 text-[13px] text-acuity-text-sec">$0 today &middot; reminder on day 4 &middot; cancel in 2 taps</p>
      </div>
      <div className="space-y-3">
        <button onClick={() => pick("yearly")} className="relative w-full text-left rounded-3xl px-5 pt-5 pb-4 transition card card-sel outline-none focus-visible:ring-2 focus-visible:ring-acuity-primary">
          <span className="absolute -top-3 left-5 rounded-full grad px-3 py-1 text-[11px] font-bold text-white shadow">{earlyBird ? `EARLY BIRD · ${earlyBirdOffPct}% OFF${endsLabel ? ` · ENDS ${endsLabel.toUpperCase()}` : ""}` : `BEST VALUE · SAVE ${price.savingsPct}`}</span>
          <div className="flex items-center justify-between gap-3">
            <Radio on={plan === "yearly"} />
            <div className="flex-1">
              <p className="text-[16px] font-semibold">Yearly</p>
              <p className="text-[13px] text-acuity-text-sec tabular-nums">
                {earlyBird && <span className={`mr-1 ${SLASH}`}>{normal.annual}</span>}
                <span className="font-bold text-acuity-text">{price.annual}/year</span> after your free week
              </p>
              {coffeeLine && <p className="mt-0.5 text-[12px] font-semibold text-acuity-primary">{coffeeLine}</p>}
            </div>
            <div className="text-right">
              {earlyBird && <p className={`text-[13px] tabular-nums ${SLASH}`}>{normal.annualAsMonthly}</p>}
              <p className="text-[24px] font-bold tabular-nums leading-none">{price.annualAsMonthly}</p>
              <p className="text-[12px] text-acuity-text-ter">per month</p>
            </div>
          </div>
        </button>
        <button onClick={() => pick("monthly")} className={`relative w-full text-left rounded-3xl px-5 py-4 transition card outline-none focus-visible:ring-2 focus-visible:ring-acuity-primary ${plan === "monthly" ? "border-acuity-primary" : ""}`}>
          <div className="flex items-center justify-between gap-3">
            <Radio on={plan === "monthly"} />
            <div className="flex-1">
              <p className="text-[16px] font-semibold">Monthly</p>
              <p className="text-[13px] text-acuity-text-sec">Billed monthly after your free week</p>
            </div>
            <div className="text-right">
              {earlyBird && <p className={`text-[13px] tabular-nums ${SLASH}`}>{normal.monthly}</p>}
              <p className="text-[24px] font-bold tabular-nums leading-none">{price.monthly}</p>
              <p className="text-[12px] text-acuity-text-ter">per month</p>
            </div>
          </div>
        </button>
      </div>

      {/* Reviews live in the FAQ now (2026-10-27, Keenan), first item. */}
      <div className="mt-8 flex justify-center">
        <span className="flex items-center gap-2 rounded-full card px-3.5 py-1.5 text-[13px] font-semibold">
          <span className="flex">{[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />)}</span>
          Loved on the App Store
        </span>
      </div>
      <div className="mt-3 card rounded-3xl px-5 py-2">
        {faqItems.map((f, i) => (
          <div key={f.q} className={i < faqItems.length - 1 ? "border-b border-acuity-line" : ""}>
            <button
              onClick={() => {
                setOpen(open === i ? null : i);
                if (i === 0 && open !== 0) track("funnel_paywall_reviews_opened");
              }}
              className="w-full py-3.5 text-left text-[15px] font-semibold flex items-center justify-between gap-3"
            >
              {f.q}
              <ChevronRight className={`h-4 w-4 shrink-0 text-acuity-text-ter transition ${open === i ? "rotate-90" : ""}`} />
            </button>
            {open === i && <div className="up pb-3.5 text-[14px] text-acuity-text-sec leading-relaxed">{f.a}</div>}
          </div>
        ))}
      </div>

      {/* No free-plan escape (2026-10-27, Keenan: "there's no free version").
          ~1 in 8 paywall viewers took it and almost none ever paid. */}

      <BottomBar>
        <PrimaryButton
          onClick={() => {
            track("funnel_paywall_paid_selected", plan);
            next();
          }}
        >
          Start my free 7 days
        </PrimaryButton>
        <p className="mt-2 text-center text-[12px] text-acuity-text-sec tabular-nums">
          <span className="font-semibold text-acuity-text">$0 today.</span> Then {after}, renews automatically.
        </p>
        <PaywallTrustLine className="mt-1" />
        <PayInBrowserButton interval={plan} funnel={C.path} track={track} className="mt-3" />
      </BottomBar>
    </div>
  );
}

function Radio({ on }: { on: boolean }) {
  return (
    <span className={`h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center ${on ? "border-acuity-primary" : "border-acuity-line-strong"}`}>
      {on && <span className="pop h-2.5 w-2.5 rounded-full grad" />}
    </span>
  );
}

/** Red strike-through for the normal price next to an early bird price. */
const SLASH = "line-through decoration-red-500 decoration-2 text-acuity-text-ter";

function CheckoutScreen({ plan, go, track, onPaid }: ViewProps) {
  const price = useArmPrices();
  const C = useV9();
  const mountRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "fallback" | "error">("loading");
  const [err, setErr] = useState<string | null>(null);
  const rcBilling = isRcWebBillingEnabled();
  // Bumped by "Try again" to re-run the RevenueCat checkout effect.
  const [rcAttempt, setRcAttempt] = useState(0);

  // ── RevenueCat Web Billing (NEXT_PUBLIC_RC_WEB_BILLING=1) ──
  // RevenueCat's checkout renders into mountRef; the Stripe effect below
  // stands down. Server picks the offering (default → v2 prices + 1-week
  // trial), so the "$0 today" card above stays true.
  useEffect(() => {
    if (!rcBilling) return;
    let destroyed = false;
    setState("loading");
    (async () => {
      const outcome = await startRcWebPurchase({
        surface: "funnel",
        interval: plan,
        htmlTarget: mountRef.current ?? undefined,
        onCheckoutShown: () => {
          if (destroyed) return;
          setState("ready");
          track("funnel_checkout_started", `${plan}|rc`);
          fireFbq("InitiateCheckout", { content_name: "Start Free Trial", currency: "USD", value: planValueDollars(plan) });
        },
      });
      if (destroyed) return;
      switch (outcome.status) {
        case "purchased":
          onPaid(plan);
          return;
        case "cancelled":
          go("paywall");
          return;
        case "unauthorized":
          setErr("Your session ended. Enter your email again to continue.");
          setState("error");
          return;
        case "consent_required":
          // Funnel surface never requires the upgrade-page acknowledgement.
          setErr("Checkout failed. Try again.");
          setState("error");
          return;
        default:
          track("funnel_checkout_embed_failed", `rc:${outcome.message.slice(0, 110)}`);
          setErr(outcome.message);
          setState("error");
      }
    })();
    return () => {
      destroyed = true;
    };
  }, [rcBilling, rcAttempt, plan, go, track, onPaid]);

  const hosted = useCallback(async () => {
    const res = await fetch("/api/onboarding/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval: plan, funnel: C.path }),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (data.url) {
      track("funnel_checkout_started", `${plan}|hosted`);
      window.location.href = data.url;
    } else {
      setErr(res.status === 401 ? "Your session ended. Enter your email again to continue." : data.error ?? `Checkout failed (${res.status})`);
      setState("error");
    }
  }, [plan, track]);

  useEffect(() => {
    if (rcBilling) return;
    let destroyed = false;
    let instance: { destroy: () => void } | null = null;
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    (async () => {
      if (!pk || !(await loadStripeJs()) || !window.Stripe) {
        setState("fallback");
        hosted();
        return;
      }
      try {
        const stripe = window.Stripe(pk);
        const checkout = await stripe.initEmbeddedCheckout({
          fetchClientSecret: async () => {
            const res = await fetch("/api/onboarding/create-checkout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ interval: plan, funnel: C.path, embedded: true }),
            });
            const data = (await res.json()) as { clientSecret?: string; error?: string };
            if (!data.clientSecret) throw new Error(res.status === 401 ? "unauthorized" : data.error ?? "No client secret");
            return data.clientSecret;
          },
        });
        if (destroyed) {
          checkout.destroy();
          return;
        }
        instance = checkout;
        if (mountRef.current) checkout.mount(mountRef.current);
        setState("ready");
        track("funnel_checkout_started", `${plan}|embedded`);
        fireFbq("InitiateCheckout", { content_name: "Start Free Trial", currency: "USD", value: planValueDollars(plan) });
      } catch (e) {
        track("funnel_checkout_embed_failed", e instanceof Error ? e.message.slice(0, 120) : "unknown");
        setState("fallback");
        hosted();
      }
    })();
    return () => {
      destroyed = true;
      instance?.destroy();
    };
  }, [rcBilling, plan, hosted, track]);

  return (
    <div className="enter">
      <Heading title="Start your free week" />
      <div className="card rounded-3xl px-5 py-4 mb-4 flex items-center justify-between">
        <div>
          <p className="text-[15px] font-semibold">Ripple, {plan === "yearly" ? "yearly" : "monthly"}</p>
          <p className="text-[13px] text-acuity-text-sec tabular-nums">$0 today, then {plan === "yearly" ? `${price.annual}/year` : `${price.monthly}/month`}</p>
        </div>
        <button onClick={() => go("paywall")} className="text-[13px] font-semibold text-acuity-primary">Change</button>
      </div>
      {(state === "loading" || state === "fallback") && (
        <div className="card rounded-3xl p-5 space-y-3">
          {[70, 100, 100, 60].map((w, i) => (
            <div key={i} className="h-11 rounded-xl soft animate-pulse" style={{ width: `${w}%` }} />
          ))}
          <p className="text-center text-[13px] text-acuity-text-ter">{state === "fallback" ? "Opening secure checkout…" : "Loading secure checkout…"}</p>
        </div>
      )}
      {state === "error" && (
        <div className="card rounded-3xl p-5 text-center">
          <p className="text-[15px] text-acuity-bad">{err}</p>
          <button onClick={() => (err?.includes("session") ? go("email") : rcBilling ? setRcAttempt((n) => n + 1) : hosted())} className="mt-4 rounded-full grad px-6 py-3 text-white font-semibold">
            {err?.includes("session") ? "Continue" : "Try again"}
          </button>
        </div>
      )}
      <div ref={mountRef} className="rounded-3xl overflow-hidden" />
      <p className="mt-4 flex items-center justify-center gap-1.5 text-[12px] text-acuity-text-ter">
        <Lock className="h-3.5 w-3.5" /> {rcBilling ? "Secure checkout. Cancel any time." : "Secure checkout by Stripe. Cancel any time."}
      </p>
    </div>
  );
}

/**
 * The end of the funnel (2026-09-28, per Keenan). After checkout she goes
 * straight to the app: "make them download the app first before they record
 * ... the analyzation process takes too long". A web first debrief was tried
 * the same day and dropped: 30-40s of processing right after paying was too
 * long a wait. The sign-in link is emailed automatically (72h, install-then-
 * tap), so the app opens signed in and her first debrief happens there.
 */
const MAGIC_SENT_KEY = "acuity_v9_magic_sent";
/** True while the Stripe return is being verified (set by FunnelV9's mount
 *  effect). The URL can already be cleaned by then, so read this, not it. */
let verifyingPayment = false;

function DownloadScreen({ answers, firstName, paid, track }: ViewProps) {
  // `paid` flips true only after /api/onboarding/verify-payment answers on the
  // Stripe return. Hold a short "confirming" state so the copy (Pro trial vs
  // free account) and the confetti are right, with a 10s fallback.
  const [returning] = useState(() => {
    if (verifyingPayment) return true;
    try {
      return new URLSearchParams(window.location.search).get("payment") === "success";
    } catch {
      return false;
    }
  });
  const [gaveUp, setGaveUp] = useState(false);
  // A debrief saved by an earlier version of this page still changes the copy.
  const [debrief] = useState<FirstDebriefOutcome | null>(() => (typeof window === "undefined" ? null : firstDebriefOutcome()));
  useEffect(() => {
    if (!returning) return;
    const t = window.setTimeout(() => setGaveUp(true), 10_000);
    return () => window.clearTimeout(t);
  }, [returning]);
  useEffect(() => {
    if (!paid) return;
    import("canvas-confetti")
      .then(({ default: confetti }) => {
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.3 }, colors: ["#f59f7c", "#f7b48f", "#8f7cf5", "#ffd6c4"] });
      })
      .catch(() => {});
  }, [paid]);
  if (returning && !paid && !gaveUp) {
    return (
      <div className="enter text-center">
        <div className="mb-6">
          <RippleMark size={96} />
        </div>
        <Heading title="Confirming your free week…" />
      </div>
    );
  }
  // Web first debrief removed 2026-10-23 (Keenan): a debrief recorded here
  // didn't reach the app and in-app browsers almost always block the mic.
  // After payment everyone goes straight to Get the app, where the first
  // debrief happens. No password step either (removed 2026-10-23): the
  // emailed one-tap link signs her into the app. FunnelFirstDebrief is kept for the
  // older funnel only.
  return <GetTheApp answers={answers} firstName={firstName} paid={paid} track={track} debriefSaved={debrief === "voice" || debrief === "text"} />;
}

function GetTheApp({
  answers,
  firstName,
  paid,
  track,
  debriefSaved = false,
}: {
  answers: ViewProps["answers"];
  firstName: string;
  paid: boolean;
  track: ViewProps["track"];
  debriefSaved?: boolean;
}) {
  const [sent, setSent] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("ios");
  const sendLink = useCallback(
    async (manual: boolean) => {
      if (!answers.email) return;
      try {
        const res = await fetch("/api/auth/mobile-magic-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: answers.email, context: "funnel" }),
        });
        if (res.ok) {
          setSent(true);
          try {
            sessionStorage.setItem(MAGIC_SENT_KEY, "1");
          } catch {}
          track("funnel_v9_magic_link_sent", manual ? "resend" : "auto");
        }
      } catch {}
    },
    [answers.email, track]
  );
  useEffect(() => {
    const ua = navigator.userAgent;
    setPlatform(/Android/i.test(ua) ? "android" : /iPhone|iPad|iPod/i.test(ua) ? "ios" : "desktop");
    let already = false;
    try {
      already = sessionStorage.getItem(MAGIC_SENT_KEY) === "1";
    } catch {}
    if (already) setSent(true);
    else void sendLink(false);
  }, [sendLink]);
  const store =
    platform === "android"
      ? [{ href: PLAY_STORE_URL, label: "Get it on Google Play", ev: "funnel_play_store_clicked" }]
      : platform === "ios"
        ? [{ href: APP_STORE_URL, label: "Download on the App Store", ev: "funnel_app_store_clicked" }]
        : [
            { href: APP_STORE_URL, label: "App Store", ev: "funnel_app_store_clicked" },
            { href: PLAY_STORE_URL, label: "Google Play", ev: "funnel_play_store_clicked" },
          ];
  return (
    <div className="enter">
      <div className="mb-5">
        <RippleMark size={84} />
      </div>
      <Heading
        eyebrow={firstName ? `You're in, ${firstName}` : "You're in"}
        title={debriefSaved ? "Your results are in the app" : "Last step: get the app"}
        sub={
          debriefSaved
            ? "Your first debrief is saved. Open Ripple to see the tasks and habits it pulled out, and keep going from there."
            : `${paid ? "Your 7 free days of Ripple have started." : "Your free Ripple account is ready."} Your first debrief happens in the app.`
        }
      />
      <div className="space-y-3">
        <div className="card rounded-3xl p-5">
          <StepBadge n={1} icon={Smartphone} title="Download Ripple" text="Free on your phone. You already have your account." />
          <div className={`mt-4 grid gap-2 ${store.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {store.map((s) => (
              <a key={s.href} href={s.href} onClick={() => track(s.ev)} className="rounded-full grad py-3.5 text-center text-[15px] font-semibold text-white">
                {s.label}
              </a>
            ))}
          </div>
        </div>
        <div className="card rounded-3xl p-5">
          {/* 2026-10-27: 0 of 4 web payers reached the app after the web
              debrief + password were removed (10-23). The old copy named app
              buttons that 1.9.1+ no longer has. Lead with the in-app path
              (Log in → email → 6-digit code); the email link is the backup. */}
          <StepBadge
            n={2}
            icon={Mail}
            title="Open Ripple and log in"
            text={
              platform === "android"
                ? "In the app, tap Already have an account? Sign in, enter this email, then tap Email me a sign-in link:"
                : "In the app, tap I have an account · Log in, and enter this email:"
            }
          />
          {answers.email && (
            <p className="soft mt-3 rounded-2xl px-4 py-3 text-center text-[16px] font-semibold break-all">{answers.email}</p>
          )}
          <p className="mt-3 text-[14px] leading-relaxed text-acuity-text-sec">
            {platform === "android" ? "Then tap the link we email you." : "We\u2019ll email you a code to type in."} No password. Please don&rsquo;t start as new: your membership is on this account.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-acuity-text-sec">
            {sent ? `We also emailed a one-tap sign-in link to ${answers.email}. Tapping it on your phone works too.` : "We're also emailing you a one-tap sign-in link."}
          </p>
          {sent && answers.email && (
            <button onClick={() => void sendLink(true)} className="mt-2 text-[13px] font-semibold text-acuity-primary">
              Didn&rsquo;t get the email? Send again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


function StepBadge({ n, icon: Icon, title, text }: { n: number; icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="relative h-11 w-11 shrink-0 rounded-2xl chip-ico flex items-center justify-center">
        <Icon className="h-5 w-5" />
        <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full grad text-[11px] font-bold text-white flex items-center justify-center">{n}</span>
      </span>
      <div>
        <p className="text-[16px] font-semibold">{title}</p>
        <p className="text-[14px] text-acuity-text-sec leading-snug">{text}</p>
      </div>
    </div>
  );
}
