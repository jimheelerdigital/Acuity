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

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { signIn } from "next-auth/react";
import {
  Activity, ArrowRight, Baby, BatteryLow, Bell, Brain, Briefcase, CalendarCheck, CalendarClock,
  CalendarDays, CalendarRange, Car, Check, ChevronLeft, ChevronRight, CircleCheck, CloudRain, Compass,
  Eye, Feather, Footprints, Heart, HeartHandshake, Home, Hourglass, Keyboard, KeyRound, Layers,
  LineChart, ListTodo, Lock, Mail, Mic, Moon, Repeat, RotateCcw, ShieldCheck, Smartphone, Sparkles,
  Star, Sunrise, Target, TrendingDown, TrendingUp, User, Users, Zap, type LucideIcon,
} from "lucide-react";

import { fireFbq, waitForFbq } from "@/components/meta-pixel-events";
import { trackOnboardingEvent, captureUtmParams, type UtmParams } from "@/lib/track-onboarding";
import {
  displayAnnual,
  displayAnnualAsMonthly,
  displayMonthly,
  displaySavingsPct,
  planValueDollars,
} from "@/lib/pricing";
import { APP_STORE_RATING_LABEL } from "@/lib/social-proof";
import {
  V9_FAQ,
  V9_FLOW_VERSION,
  V9_HOOK_LINE,
  V9_PATH,
  V9_PROGRESS_END,
  V9_REVIEWS,
  V9_SAMPLES,
  V9_STEPS,
  v9StateName,
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
  "offload:everyone": Users, "offload:tasks": ListTodo, "offload:worry": CloudRain, "offload:behind": TrendingDown, "offload:drain": BatteryLow,
  "talktype:talk": Mic, "talktype:type": Keyboard, "talktype:both": Layers,
  "notice:drains": BatteryLow, "notice:lifts": TrendingUp, "notice:habits": Target, "notice:putoff": Hourglass, "notice:mood": LineChart,
  "when:car": Car, "when:walk": Footprints, "when:quiet": Moon, "when:whenever": Zap,
  "commit:ready": Sparkles, "commit:try": Compass,
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

function randomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `Rp-${Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("")}-9a`;
}

declare global {
  interface Window {
    Stripe?: (pk: string) => {
      initEmbeddedCheckout: (opts: {
        fetchClientSecret: () => Promise<string>;
      }) => Promise<{ mount: (el: HTMLElement | string) => void; destroy: () => void }>;
    };
  }
}

function loadStripeJs(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Stripe) return resolve(true);
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://js.stripe.com/v3"]');
    const s = existing ?? document.createElement("script");
    s.src = "https://js.stripe.com/v3";
    s.async = true;
    s.onload = () => resolve(!!window.Stripe);
    s.onerror = () => resolve(false);
    if (!existing) document.head.appendChild(s);
    setTimeout(() => resolve(!!window.Stripe), 8000);
  });
}

const CSS = `
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

export function FunnelV9() {
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

  const idx = V9_STEPS.findIndex((s) => s.id === stepId);
  const step = V9_STEPS[Math.max(0, idx)];

  const track = useCallback((event: string, value?: string) => {
    trackOnboardingEvent(event, {
      sessionToken: sid.current || null,
      utm: utm.current,
      flowVersion: V9_FLOW_VERSION,
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
    const params = new URLSearchParams(window.location.search);
    try {
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
        const raw = sessionStorage.getItem(STATE_KEY);
        if (raw) saved = JSON.parse(raw) as Persisted;
      } catch {}
    } else {
      try {
        sessionStorage.removeItem(STATE_KEY);
      } catch {}
    }
    if (saved) {
      setAnswers({ ...EMPTY, ...saved.answers });
      setPlan(saved.plan ?? "yearly");
    }

    if (urlStep === "download" && params.get("payment") === "success" && params.get("session_id")) {
      setStepId("download");
      fetch(`/api/onboarding/verify-payment?session_id=${encodeURIComponent(params.get("session_id")!)}`)
        .then((r) => r.json())
        .then((d: { paid?: boolean }) => {
          if (d.paid) {
            setPaid(true);
            const p = saved?.plan ?? "yearly";
            track("funnel_payment_completed", p);
            fireFbq("StartTrial", { value: planValueDollars(p), currency: "USD", predicted_ltv: planValueDollars("yearly") });
            fireFbq("Purchase", { value: planValueDollars(p), currency: "USD", content_name: "Ripple Pro Subscription" });
          } else {
            setStepId("paywall");
          }
        })
        .catch(() => {});
    } else if (urlStep && V9_STEPS.some((s) => s.id === urlStep)) {
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
      sessionStorage.setItem(STATE_KEY, JSON.stringify({ stepId, answers, plan } satisfies Persisted));
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
      const ti = V9_STEPS.findIndex((s) => s.id === target);
      if (ti < 0) return;
      // Once the account exists, anything before the result (the quiz, the
      // email gate) is a dead end: send them to their result instead.
      const resultIdx = V9_STEPS.findIndex((s) => s.id === "result");
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
  const next = useCallback(() => {
    const i = V9_STEPS.findIndex((s) => s.id === stepId);
    if (i >= 0 && i < V9_STEPS.length - 1) setStepId(V9_STEPS[i + 1].id);
  }, [stepId]);
  const back = useCallback(() => {
    const i = V9_STEPS.findIndex((s) => s.id === stepId);
    if (i > 0) setStepId(V9_STEPS[i - 1].id);
  }, [stepId]);

  // Back is allowed through the quiz, and from checkout to the paywall.
  // Never from the result onward (the account exists; the email gate would
  // be a dead end), mirroring the /start fix.
  const canGoBack =
    (idx > 0 && idx <= V9_STEPS.findIndex((s) => s.id === "name")) || stepId === "checkout";
  const showProgress = idx >= 0 && idx < V9_PROGRESS_END && stepId !== "loader";
  const progressPct = Math.max(4, Math.round(((idx + 1) / V9_PROGRESS_END) * 100));

  const firstName = answers.name.trim().split(/\s+/)[0] ?? "";

  return (
    <div className="v9 funnel-root min-h-screen bg-acuity-hero-grad text-acuity-text">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {(showProgress || canGoBack) && (
        <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md" style={{ background: "color-mix(in oklch, var(--acuity-bg) 82%, transparent)" }}>
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
            <div className="w-9 shrink-0 text-right text-[12px] font-semibold tabular-nums text-acuity-text-ter">
              {showProgress ? `${Math.min(idx + 1, V9_PROGRESS_END)}/${V9_PROGRESS_END}` : ""}
            </div>
          </div>
        </header>
      )}

      <main className="max-w-lg mx-auto px-5 pt-20 pb-44">
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
        />
      </main>
    </div>
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
};

function StepView(p: ViewProps) {
  const { step } = p;
  switch (step.kind) {
    case "single":
      return <SingleScreen {...p} step={step} />;
    case "multi":
      return <MultiScreen {...p} step={step} />;
    case "slider":
      return <SliderScreen {...p} step={step} />;
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="v9"><div className="fixed bottom-0 inset-x-0 z-40 backdrop-blur-md border-t border-acuity-line px-5 pt-3 pb-5" style={{ background: "color-mix(in oklch, var(--acuity-bg) 88%, transparent)" }}>
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
      onClick={onClick}
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
          <p className="mt-5 text-center text-[15px] font-semibold text-acuity-text-sec text-balance">{V9_HOOK_LINE}</p>
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
                onClick={() => toggle(o.id)}
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

const SLIDER_STEPS = V9_STEPS.filter((s): s is Extract<V9Step, { kind: "slider" }> => s.kind === "slider");

function SliderScreen({ step, answers, setAnswers, next, track }: ViewProps & { step: Extract<V9Step, { kind: "slider" }> }) {
  // Stored answers are 1-5; the range input is 0-100.
  const saved = answers.sliders[step.id];
  const [val, setVal] = useState<number>(saved != null ? (saved - 1) * 25 : 50);
  const [moved, setMoved] = useState(answers.sliders[step.id] != null);
  const pos = SLIDER_STEPS.findIndex((s) => s.id === step.id);
  const lean = val < 42 ? "left" : val > 58 ? "right" : "middle";
  const commit = () => {
    const five = Math.min(5, Math.max(1, Math.round(val / 25) + 1));
    setAnswers((a) => ({ ...a, sliders: { ...a.sliders, [step.id]: five } }));
    track(`funnel_v9_${step.id.replace(/-/g, "_")}_answered`, String(five));
    next();
  };
  return (
    <div className="enter">
      <Heading eyebrow={`Statement ${pos + 1} of ${SLIDER_STEPS.length}`} title="Which sounds more like you?" sub="Drag toward the one that fits." />
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

const SMALL_THINGS = ["Emma's form", "Refill Mom's meds", "Call the plumber", "Dentist Thursday", "Reply to Dana", "Birthday gift", "Book my checkup", "Groceries"];

function ReassureScreen({ next }: ViewProps) {
  return (
    <div className="enter">
      <Heading title="You're not the only one holding all of it." />
      <div className="relative h-[210px] mb-6 overflow-hidden">
        {SMALL_THINGS.map((t, i) => (
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
          <span className="h-9 w-9 rounded-xl grad flex items-center justify-center">
            <Feather className="h-4 w-4 text-white" />
          </span>
          <div className="text-left">
            <p className="text-[13px] font-bold">Ripple</p>
            <p className="text-[11px] text-acuity-text-ter">keeps track of it</p>
          </div>
        </div>
      </div>
      <p className="text-center text-[16px] leading-relaxed text-acuity-text-sec text-balance">
        Most of what fills a busy head isn&rsquo;t one big problem. It&rsquo;s fifty small things for other people, with nowhere to set them down.
      </p>
      <div className="mt-6">
        <ReviewCard {...V9_REVIEWS[0]} />
      </div>
      <BottomBar>
        <PrimaryButton onClick={next}>That&rsquo;s me</PrimaryButton>
      </BottomBar>
    </div>
  );
}

function ReviewScreen({ next }: ViewProps) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const reviews = [V9_REVIEWS[1], V9_REVIEWS[2], V9_REVIEWS[0]];
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

function pickSample(plate: string[]) {
  if (plate.includes("kids")) return V9_SAMPLES.kids;
  if (plate.includes("parents")) return V9_SAMPLES.parents;
  return V9_SAMPLES.work;
}

function HowScreen({ answers, next, track }: ViewProps) {
  const sample = pickSample(answers.multi.plate ?? []);
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

function plateLabel(plate: string[]): string {
  const map: Record<string, string> = {
    kids: "your kids",
    parents: "your parents",
    work: "work",
    partner: "your partner",
    house: "the house",
    health: "your health",
  };
  const parts = plate.map((p) => map[p]).filter(Boolean).slice(0, 3);
  if (parts.length === 0) return "everything on your plate";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function LoaderScreen({ answers, firstName, next }: ViewProps) {
  const lines = useMemo(
    () => [
      { icon: Users, text: `Reading your answers about ${plateLabel(answers.multi.plate ?? [])}` },
      { icon: Layers, text: "Weighing what slips through the cracks" },
      { icon: Brain, text: "Matching you to how Ripple sorts a debrief" },
      { icon: Sparkles, text: firstName ? `Building ${firstName}'s first week` : "Building your first week" },
    ],
    [answers.multi.plate, firstName]
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
  const C = 2 * Math.PI * R;
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
          <circle cx="70" cy="70" r={R} fill="none" stroke="url(#v9g)" strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} />
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

function EmailScreen({ answers, setAnswers, firstName, next, track }: ViewProps) {
  const [email, setEmail] = useState(answers.email);
  const [optIn, setOptIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const state = v9StateName({ plate: answers.multi.plate ?? [], sliders: answers.sliders, pileup: answers.single.pileup });

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
            landingPath: V9_PATH,
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
          <PrimaryButton onClick={() => signIn(undefined, { callbackUrl: `${V9_PATH}?step=result` })}>Sign in</PrimaryButton>
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
  const state = v9StateName({ plate: answers.multi.plate ?? [], sliders: answers.sliders, pileup: answers.single.pileup });
  const bars = SLIDER_STEPS.map((s) => {
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

      {plate.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <span className="text-[13px] text-acuity-text-ter w-full text-center">You&rsquo;re carrying</span>
          {plate.map((p) => {
            const Icon = OPTION_ICONS[`plate:${p}`] ?? Sparkles;
            const label = V9_STEPS.find((s) => s.id === "plate" && s.kind === "multi") as Extract<V9Step, { kind: "multi" }>;
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
        None of this means something is wrong with you. It means there&rsquo;s nowhere to set it down. That&rsquo;s the part Ripple does.
      </p>
      <BottomBar>
        <PrimaryButton onClick={next}>See my first week</PrimaryButton>
      </BottomBar>
    </div>
  );
}

function PlanScreen({ answers, firstName, next }: ViewProps) {
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
  ];
  return (
    <div className="enter">
      <Heading eyebrow="Built from your answers" title={firstName ? `${firstName}'s first week with Ripple` : "Your first week with Ripple"} />
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

function PaywallScreen({ plan, setPlan, next, go, track, firstName, answers }: ViewProps) {
  const [open, setOpen] = useState<number | null>(null);
  const state = v9StateName({ plate: answers.multi.plate ?? [], sliders: answers.sliders, pileup: answers.single.pileup });
  const after = plan === "yearly" ? `${displayAnnual()}/year` : `${displayMonthly()}/month`;
  const pick = (p: Plan) => {
    setPlan(p);
    track("funnel_paywall_plan_selected", p);
  };
  const timeline = [
    { label: "Today", text: "Full access. $0.", icon: Sparkles },
    { label: "Day 4", text: "Reminder email", icon: Bell },
    { label: "Day 7", text: `Plan starts`, icon: CalendarCheck },
  ];
  return (
    <div className="enter">
      <div className="flex justify-center mb-3">
        <span className="flex items-center gap-1.5 rounded-full card px-3 py-1.5 text-[12px] font-semibold">
          <CircleCheck className="h-3.5 w-3.5 text-acuity-good" /> Your plan is ready{firstName ? `, ${firstName}` : ""}
        </span>
      </div>
      <Heading title={<>Try Ripple Pro <span className="grad-text">free for 7 days</span></>} sub={<>Made for <span className="font-semibold text-acuity-text">{state.name}</span>. $0 today, cancel any time.</>} />

      <div className="space-y-3">
        <button onClick={() => pick("yearly")} className={`relative w-full text-left rounded-3xl px-5 pt-5 pb-4 transition ${plan === "yearly" ? "card card-sel" : "card"}`}>
          <span className="absolute -top-3 left-5 rounded-full grad px-3 py-1 text-[11px] font-bold text-white shadow">BEST VALUE · SAVE {displaySavingsPct()}</span>
          <div className="flex items-center justify-between gap-3">
            <Radio on={plan === "yearly"} />
            <div className="flex-1">
              <p className="text-[16px] font-semibold">Yearly</p>
              <p className="text-[13px] text-acuity-text-sec tabular-nums">{displayAnnual()} a year after your free week</p>
            </div>
            <div className="text-right">
              <p className="text-[24px] font-bold tabular-nums leading-none">{displayAnnualAsMonthly()}</p>
              <p className="text-[12px] text-acuity-text-ter">per month</p>
            </div>
          </div>
        </button>
        <button onClick={() => pick("monthly")} className={`relative w-full text-left rounded-3xl px-5 py-4 transition ${plan === "monthly" ? "card card-sel" : "card"}`}>
          <div className="flex items-center justify-between gap-3">
            <Radio on={plan === "monthly"} />
            <div className="flex-1">
              <p className="text-[16px] font-semibold">Monthly</p>
              <p className="text-[13px] text-acuity-text-sec">Billed monthly after your free week</p>
            </div>
            <div className="text-right">
              <p className="text-[24px] font-bold tabular-nums leading-none">{displayMonthly()}</p>
              <p className="text-[12px] text-acuity-text-ter">per month</p>
            </div>
          </div>
        </button>
      </div>

      <div className="mt-5 card rounded-3xl px-4 py-5">
        <div className="relative grid grid-cols-3">
          <span className="absolute left-[16.6%] right-[16.6%] top-5 h-0.5 soft" />
          <span className="absolute left-[16.6%] top-5 h-0.5 grad" style={{ width: "33.4%" }} />
          {timeline.map((t, i) => {
            const Icon = t.icon;
            return (
              <div key={t.label} className="relative flex flex-col items-center text-center">
                <span className={`relative z-10 h-10 w-10 rounded-full flex items-center justify-center ${i === 0 ? "grad text-white" : "card text-acuity-primary"}`}>
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <p className="mt-2 text-[13px] font-bold">{t.label}</p>
                <p className="text-[12px] text-acuity-text-sec leading-tight">{t.text}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-center text-[13px] text-acuity-text-sec">Cancel before day 7 and you pay nothing.</p>
      </div>

      <div className="mt-5 card rounded-3xl p-5 space-y-3.5">
        <p className="text-[13px] font-bold">What Pro gives you</p>
        {PRO_FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.title} className="flex gap-3">
              <span className="h-9 w-9 shrink-0 rounded-xl chip-ico flex items-center justify-center">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <div>
                <p className="text-[15px] font-semibold leading-tight">{f.title}</p>
                <p className="text-[13px] text-acuity-text-sec leading-snug">{f.text}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <Stars />
        <div className="mt-3 snap noscroll -mx-5 px-5 flex gap-3 overflow-x-auto pb-1">
          {V9_REVIEWS.map((r) => (
            <ReviewCard key={r.name} {...r} className="w-[84%] shrink-0" />
          ))}
        </div>
      </div>

      <div className="mt-6 card rounded-3xl px-5 py-2">
        {V9_FAQ.map((f, i) => (
          <div key={f.q} className={i < V9_FAQ.length - 1 ? "border-b border-acuity-line" : ""}>
            <button onClick={() => setOpen(open === i ? null : i)} className="w-full py-3.5 text-left text-[15px] font-semibold flex items-center justify-between gap-3">
              {f.q}
              <ChevronRight className={`h-4 w-4 shrink-0 text-acuity-text-ter transition ${open === i ? "rotate-90" : ""}`} />
            </button>
            {open === i && <p className="up pb-3.5 text-[14px] text-acuity-text-sec leading-relaxed">{f.a}</p>}
          </div>
        ))}
      </div>

      <button
        onClick={() => {
          track("funnel_paywall_skip_selected");
          go("download");
        }}
        className="mt-6 w-full py-2 text-[14px] font-medium text-acuity-text-ter underline-offset-4 hover:underline"
      >
        Continue with the free plan
      </button>
      <p className="mt-1 text-center text-[11px] text-acuity-text-quiet">If you&rsquo;re in crisis, call or text 988 (Suicide &amp; Crisis Lifeline).</p>

      <BottomBar>
        <PrimaryButton
          onClick={() => {
            track("funnel_paywall_paid_selected", plan);
            next();
          }}
        >
          Start my 7-day free trial
        </PrimaryButton>
        <p className="mt-2 text-center text-[12px] text-acuity-text-sec tabular-nums">
          <span className="font-semibold text-acuity-text">$0 today.</span> Then {after}, renews automatically. Cancel any time.
        </p>
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

function CheckoutScreen({ plan, go, track }: ViewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "fallback" | "error">("loading");
  const [err, setErr] = useState<string | null>(null);

  const hosted = useCallback(async () => {
    const res = await fetch("/api/onboarding/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval: plan, funnel: V9_PATH }),
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
              body: JSON.stringify({ interval: plan, funnel: V9_PATH, embedded: true }),
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
  }, [plan, hosted, track]);

  return (
    <div className="enter">
      <Heading title="Start your free week" />
      <div className="card rounded-3xl px-5 py-4 mb-4 flex items-center justify-between">
        <div>
          <p className="text-[15px] font-semibold">Ripple Pro, {plan === "yearly" ? "yearly" : "monthly"}</p>
          <p className="text-[13px] text-acuity-text-sec tabular-nums">$0 today, then {plan === "yearly" ? `${displayAnnual()}/year` : `${displayMonthly()}/month`}</p>
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
          <button onClick={() => (err?.includes("session") ? go("email") : hosted())} className="mt-4 rounded-full grad px-6 py-3 text-white font-semibold">
            {err?.includes("session") ? "Continue" : "Try again"}
          </button>
        </div>
      )}
      <div ref={mountRef} className="rounded-3xl overflow-hidden" />
      <p className="mt-4 flex items-center justify-center gap-1.5 text-[12px] text-acuity-text-ter">
        <Lock className="h-3.5 w-3.5" /> Secure checkout by Stripe. Cancel any time.
      </p>
    </div>
  );
}

function DownloadScreen({ answers, firstName, paid, track }: ViewProps) {
  const [linkSent, setLinkSent] = useState(false);
  useEffect(() => {
    if (!paid) return;
    import("canvas-confetti")
      .then(({ default: confetti }) => {
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.3 }, colors: ["#f59f7c", "#f7b48f", "#8f7cf5", "#ffd6c4"] });
      })
      .catch(() => {});
  }, [paid]);
  const sendLink = async () => {
    if (!answers.email) return;
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: answers.email }),
    }).catch(() => {});
    setLinkSent(true);
    track("funnel_v9_password_link_sent");
  };
  const openWeb = async () => {
    track("funnel_continue_web_app_clicked");
    try {
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipped: true, skippedAtStep: 0 }),
      });
    } catch {}
    window.location.href = "/home";
  };
  return (
    <div className="enter">
      <div className="mb-5">
        <RippleMark size={84} />
      </div>
      <Heading
        title={firstName ? `You're in, ${firstName}.` : "You're in."}
        sub={paid ? "Your 7 free days of Ripple Pro have started." : "Your free Ripple account is ready."}
      />
      <div className="space-y-3">
        <div className="card rounded-3xl p-5">
          <StepBadge n={1} icon={Mic} title="Do your first debrief now" text="Talk or type whatever's on your mind. Ripple pulls out your list." />
          <button onClick={openWeb} className="mt-4 w-full rounded-full grad py-3.5 text-[15px] font-semibold text-white">
            Start my first debrief
          </button>
        </div>
        <div className="card rounded-3xl p-5">
          <StepBadge n={2} icon={Smartphone} title="Get the app" text="Debrief from anywhere, any time of day." />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a href={APP_STORE_URL} onClick={() => track("funnel_app_store_clicked")} className="rounded-full soft py-3 text-center text-[14px] font-semibold">
              App Store
            </a>
            <a href={PLAY_STORE_URL} onClick={() => track("funnel_play_store_clicked")} className="rounded-full soft py-3 text-center text-[14px] font-semibold">
              Google Play
            </a>
          </div>
        </div>
        <div className="card rounded-3xl p-5">
          <StepBadge n={3} icon={KeyRound} title="Set a password for the app" text={linkSent ? `Check ${answers.email} for your link.` : "You'll use it to sign in on your phone."} />
          {answers.email && !linkSent && (
            <button onClick={sendLink} className="mt-4 w-full rounded-full soft py-3 text-[14px] font-semibold">
              Email me a link
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
