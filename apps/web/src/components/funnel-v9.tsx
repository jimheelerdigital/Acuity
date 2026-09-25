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
 * Account flow: the email gate creates the account behind the scenes with
 * a random password the user never sees, signs her in, and moves her to
 * the free plan. After payment she gets a "set your password" link (the
 * forgot-password email) so she can sign in to the app.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signIn } from "next-auth/react";

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

    let saved: Persisted | null = null;
    try {
      const raw = sessionStorage.getItem(STATE_KEY);
      if (raw) saved = JSON.parse(raw) as Persisted;
    } catch {}
    if (saved) {
      setAnswers({ ...EMPTY, ...saved.answers });
      setPlan(saved.plan ?? "yearly");
    }

    const urlStep = params.get("step");
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
      setStepId(urlStep);
    } else if (saved?.stepId && saved.stepId !== "loader") {
      setStepId(saved.stepId);
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
  const progressPct = Math.round(((idx + 1) / V9_PROGRESS_END) * 100);

  const firstName = answers.name.trim().split(/\s+/)[0] ?? "";

  return (
    <div className="funnel-root min-h-screen bg-acuity-hero-grad text-acuity-text">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .funnel-root .f-card { background: var(--acuity-card-bg); border: 1px solid var(--acuity-line-strong); }
        .funnel-root .f-sub { background: var(--acuity-bg-sub); border: 1px solid var(--acuity-line); }
        .funnel-root .f-tint { background: color-mix(in oklch, var(--acuity-primary) 8%, transparent); border: 1px solid color-mix(in oklch, var(--acuity-primary) 32%, transparent); }
        .funnel-root .f-track { background: color-mix(in oklch, var(--acuity-primary) 14%, transparent); }
        .funnel-root .f-sel { background: color-mix(in oklch, var(--acuity-primary) 10%, var(--acuity-card-bg)); border: 1.5px solid var(--acuity-primary); }
        @keyframes v9-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .funnel-root .v9-in { animation: v9-up .35s ease-out both; }
      `,
        }}
      />

      {showProgress && (
        <div className="fixed top-0 inset-x-0 z-50 h-[3px] f-track">
          <div className="h-full bg-acuity-primary transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
      )}
      {canGoBack && (
        <button
          onClick={stepId === "checkout" ? () => go("paywall") : back}
          className="fixed top-4 left-4 z-50 rounded-full bg-acuity-bg-sub p-2 text-acuity-text-ter"
          aria-label="Go back"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      <main className="max-w-lg mx-auto px-5 pt-14 pb-40">
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

// ─── Screens ───────────────────────────────────────────────────────────────

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
      return step.screen === "reassure" ? (
        <ReassureScreen {...p} />
      ) : step.screen === "review" ? (
        <ReviewScreen {...p} />
      ) : (
        <HowScreen {...p} />
      );
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

function Title({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-[26px] leading-tight font-bold tracking-tight">{children}</h1>
      {sub && <p className="mt-2 text-[15px] text-acuity-text-sec">{sub}</p>}
    </div>
  );
}

function Cta({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-acuity-bg border-t border-acuity-line px-5 pt-3 pb-5">
      <div className="max-w-lg mx-auto">
        <button
          onClick={onClick}
          disabled={disabled}
          className="w-full rounded-full bg-acuity-primary py-3.5 text-[16px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-40"
        >
          {children}
        </button>
      </div>
    </div>
  );
}

function Stars() {
  return (
    <p className="text-[13px] font-semibold text-acuity-text-sec">
      <span className="text-acuity-warn">&#9733;&#9733;&#9733;&#9733;&#9733;</span>{" "}
      <span className="font-medium text-acuity-text-ter">{APP_STORE_RATING_LABEL}</span>
    </p>
  );
}

function Quote({ quote, name }: { quote: string; name: string }) {
  return (
    <figure className="rounded-[18px] f-sub px-4 py-3">
      <blockquote className="text-[15px] leading-relaxed text-acuity-text-sec">&ldquo;{quote}&rdquo;</blockquote>
      <figcaption className="mt-1.5 text-[12px] font-semibold text-acuity-text-ter">{name}</figcaption>
    </figure>
  );
}

function SingleScreen({ step, answers, setAnswers, next, track }: ViewProps & { step: Extract<V9Step, { kind: "single" }> }) {
  const isHook = step.id === "hook";
  return (
    <div className="v9-in">
      {isHook && (
        <p className="mb-3 text-[14px] font-semibold text-acuity-primary">{V9_HOOK_LINE}</p>
      )}
      <Title sub={step.sub}>{step.title}</Title>
      <div className="space-y-2.5">
        {step.options.map((o) => {
          const sel = answers.single[step.id] === o.id;
          return (
            <button
              key={o.id}
              onClick={() => {
                setAnswers((a) => ({ ...a, single: { ...a.single, [step.id]: o.id } }));
                track(`funnel_v9_${step.id}_answered`, o.id);
                if (isHook) track("funnel_entry_selected", o.id);
                setTimeout(next, 180);
              }}
              className={`w-full text-left rounded-2xl px-5 py-4 text-[16px] font-medium transition ${sel ? "f-sel" : "f-card"}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {isHook && (
        <div className="mt-6">
          <Stars />
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
  return (
    <div className="v9-in">
      <Title sub={step.sub}>{step.title}</Title>
      <div className="space-y-2.5">
        {step.options.map((o) => {
          const sel = picked.includes(o.id);
          return (
            <button
              key={o.id}
              onClick={() => toggle(o.id)}
              className={`w-full flex items-center justify-between text-left rounded-2xl px-5 py-4 text-[16px] font-medium transition ${sel ? "f-sel" : "f-card"}`}
            >
              <span>{o.label}</span>
              <span className={`ml-3 h-5 w-5 shrink-0 rounded-md border ${sel ? "bg-acuity-primary border-acuity-primary" : "border-acuity-line-strong"}`}>
                {sel && (
                  <svg viewBox="0 0 20 20" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path d="M5 10.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <Cta
        disabled={picked.length === 0}
        onClick={() => {
          track(`funnel_v9_${step.id}_answered`, picked.join(","));
          next();
        }}
      >
        Continue
      </Cta>
    </div>
  );
}

function SliderScreen({ step, answers, setAnswers, next, track }: ViewProps & { step: Extract<V9Step, { kind: "slider" }> }) {
  const val = answers.sliders[step.id];
  return (
    <div className="v9-in">
      <Title>{step.title}</Title>
      <div className="rounded-[22px] f-card px-5 py-6">
        <div className="flex justify-between gap-4 text-[15px] font-semibold">
          <span className="max-w-[45%]">{step.left}</span>
          <span className="max-w-[45%] text-right">{step.right}</span>
        </div>
        <div className="mt-6 flex items-center justify-between">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              aria-label={`${n} of 5`}
              onClick={() => {
                setAnswers((a) => ({ ...a, sliders: { ...a.sliders, [step.id]: n } }));
                track(`funnel_v9_${step.id.replace(/-/g, "_")}_answered`, String(n));
                setTimeout(next, 220);
              }}
              className={`rounded-full transition ${val === n ? "bg-acuity-primary" : "f-sub"}`}
              style={{ height: 22 + Math.abs(n - 3) * 6, width: 22 + Math.abs(n - 3) * 6 }}
            />
          ))}
        </div>
        <div className="mt-3 flex justify-between text-[12px] text-acuity-text-ter">
          <span>More like this</span>
          <span>More like this</span>
        </div>
      </div>
    </div>
  );
}

function ReassureScreen({ next }: ViewProps) {
  return (
    <div className="v9-in">
      <Title>You&rsquo;re not the only one holding all of it.</Title>
      <p className="text-[16px] leading-relaxed text-acuity-text-sec">
        Most of what fills a busy head isn&rsquo;t one big problem. It&rsquo;s fifty small things for other people, with nowhere to put them down.
      </p>
      <p className="mt-4 text-[16px] leading-relaxed text-acuity-text-sec">
        Ripple is the place to put them. You talk or type, and it keeps track.
      </p>
      <div className="mt-6 space-y-3">
        <Stars />
        <Quote {...V9_REVIEWS[0]} />
      </div>
      <Cta onClick={next}>Continue</Cta>
    </div>
  );
}

function ReviewScreen({ next }: ViewProps) {
  return (
    <div className="v9-in">
      <Title>What people notice after a few weeks</Title>
      <div className="space-y-3">
        <Quote {...V9_REVIEWS[1]} />
        <Quote {...V9_REVIEWS[2]} />
      </div>
      <div className="mt-5">
        <Stars />
      </div>
      <Cta onClick={next}>Continue</Cta>
    </div>
  );
}

function pickSample(plate: string[]) {
  if (plate.includes("kids")) return V9_SAMPLES.kids;
  if (plate.includes("parents")) return V9_SAMPLES.parents;
  return V9_SAMPLES.work;
}

function HowScreen({ answers, next }: ViewProps) {
  const sample = pickSample(answers.multi.plate ?? []);
  return (
    <div className="v9-in">
      <Title sub="Here's a real example of one debrief.">You say it. Ripple catches it.</Title>
      <div className="rounded-[20px] f-sub px-4 py-3">
        <p className="text-[12px] font-semibold text-acuity-text-ter mb-1">What she said</p>
        <p className="text-[15px] leading-relaxed">&ldquo;{sample.said}&rdquo;</p>
      </div>
      <div className="my-3 text-center text-acuity-text-ter">&darr;</div>
      <div className="rounded-[20px] f-card px-4 py-4 space-y-3">
        <div>
          <p className="text-[12px] font-semibold text-acuity-text-ter mb-1.5">Her to-do list</p>
          {sample.tasks.map((t) => (
            <p key={t} className="flex items-center gap-2 text-[15px]">
              <span className="h-4 w-4 rounded border border-acuity-line-strong" /> {t}
            </p>
          ))}
        </div>
        <div>
          <p className="text-[12px] font-semibold text-acuity-text-ter">Mood</p>
          <p className="text-[15px]">{sample.mood}</p>
        </div>
        <div>
          <p className="text-[12px] font-semibold text-acuity-text-ter">A pattern to watch</p>
          <p className="text-[15px]">{sample.pattern}</p>
        </div>
      </div>
      <Cta onClick={next}>Continue</Cta>
    </div>
  );
}

function NameScreen({ answers, setAnswers, next, track }: ViewProps) {
  const [v, setV] = useState(answers.name);
  const save = () => {
    setAnswers((a) => ({ ...a, name: v.trim().slice(0, 40) }));
    track("funnel_v9_name_answered", v.trim() ? "given" : "skipped");
    next();
  };
  return (
    <div className="v9-in">
      <Title sub="So your results are yours.">What should Ripple call you?</Title>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="First name"
        autoComplete="given-name"
        className="w-full rounded-2xl f-card px-5 py-4 text-[17px] outline-none focus:border-acuity-primary"
      />
      <Cta onClick={save}>{v.trim() ? "Continue" : "Skip"}</Cta>
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
      `Reading your answers about ${plateLabel(answers.multi.plate ?? [])}`,
      "Weighing what slips through the cracks",
      "Matching you to how Ripple sorts a debrief",
      firstName ? `Building ${firstName}'s first week` : "Building your first week",
    ],
    [answers.multi.plate, firstName]
  );
  const [done, setDone] = useState(0);
  useEffect(() => {
    const t = lines.map((_, i) => setTimeout(() => setDone(i + 1), 1300 * (i + 1)));
    const end = setTimeout(next, 1300 * lines.length + 600);
    return () => {
      t.forEach(clearTimeout);
      clearTimeout(end);
    };
  }, [lines, next]);
  return (
    <div className="v9-in pt-10">
      <Title>Putting your results together</Title>
      <div className="space-y-4">
        {lines.map((l, i) => (
          <div key={l} className={`flex items-center gap-3 text-[16px] transition ${i < done ? "text-acuity-text" : "text-acuity-text-ter"}`}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full ${i < done ? "bg-acuity-primary text-white" : "f-sub"}`}>
              {i < done ? "✓" : ""}
            </span>
            {l}
          </div>
        ))}
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
      waitForFbq().then((ready) => {
        if (ready) fireFbq("CompleteRegistration", { content_name: "Free Trial Signup", currency: "USD", value: 0 }, data.capiEventId);
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
      <div className="v9-in">
        <Title sub="Sign in and we'll take you straight to your results.">You already have a Ripple account.</Title>
        <Cta onClick={() => signIn(undefined, { callbackUrl: `${V9_PATH}?step=result` })}>Sign in</Cta>
      </div>
    );
  }

  return (
    <div className="v9-in">
      <Title sub="Where should we send them?">{firstName ? `${firstName}, your results are ready.` : "Your results are ready."}</Title>
      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
        placeholder="you@email.com"
        className="w-full rounded-2xl f-card px-5 py-4 text-[17px] outline-none"
      />
      {err && <p className="mt-2 text-[14px] text-acuity-bad">{err}</p>}
      <label className="mt-4 flex items-start gap-3 text-[14px] text-acuity-text-sec">
        <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="mt-1" />
        Send me occasional notes from Ripple. Unsubscribe any time.
      </label>
      <p className="mt-4 text-[13px] text-acuity-text-ter">
        This saves your results to a private Ripple account. No password needed yet.
      </p>
      <Cta onClick={submit} disabled={busy || !email.trim()}>
        {busy ? "Saving…" : "See my results"}
      </Cta>
    </div>
  );
}

function ResultScreen({ answers, firstName, next }: ViewProps) {
  const state = v9StateName({
    plate: answers.multi.plate ?? [],
    sliders: answers.sliders,
    pileup: answers.single.pileup,
  });
  const mirrored = V9_STEPS.filter((s): s is Extract<V9Step, { kind: "slider" }> => s.kind === "slider")
    .map((s) => {
      const v = answers.sliders[s.id] ?? 3;
      return { label: v >= 3 ? s.right : s.left, strength: Math.abs(v - 3) };
    })
    .filter((m) => m.strength > 0)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3);
  return (
    <div className="v9-in">
      <p className="text-[14px] font-semibold text-acuity-primary mb-2">
        {firstName ? `${firstName}, here's what you told us` : "Here's what you told us"}
      </p>
      <Title>{state.name}</Title>
      <p className="-mt-3 mb-6 text-[17px] leading-relaxed text-acuity-text-sec">{state.line}</p>
      <div className="rounded-[20px] f-card px-5 py-4 space-y-3">
        <p className="text-[13px] font-semibold text-acuity-text-ter">In your words</p>
        <p className="text-[15px]">You&rsquo;re carrying {plateLabel(answers.multi.plate ?? [])}.</p>
        {mirrored.map((m) => (
          <p key={m.label} className="text-[15px]">&ldquo;{m.label}.&rdquo;</p>
        ))}
      </div>
      <p className="mt-5 text-[15px] leading-relaxed text-acuity-text-sec">
        None of this means something is wrong with you. It means there&rsquo;s nowhere to set it down. That&rsquo;s the part Ripple does.
      </p>
      <Cta onClick={next}>See my first week</Cta>
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
    { day: "Day 1", text: `${talk} whatever's on your mind. Ripple pulls out your to-do list.` },
    { day: "Day 3", text: "The habits you mention start tracking themselves. Your mood gets a read after every debrief." },
    { day: "Day 7", text: day7 },
  ];
  return (
    <div className="v9-in">
      <Title sub="Built from your answers.">{firstName ? `${firstName}'s first week with Ripple` : "Your first week with Ripple"}</Title>
      <ol className="rounded-[22px] f-card px-5 py-5">
        {rows.map((r, i) => (
          <li key={r.day} className="flex gap-3">
            <div className="flex flex-col items-center pt-1">
              <span className="h-3 w-3 rounded-full bg-acuity-primary" />
              {i < rows.length - 1 && <span className="w-px flex-1 bg-acuity-line-strong my-1" />}
            </div>
            <div className={i < rows.length - 1 ? "pb-4" : ""}>
              <p className="text-[15px] font-semibold">{r.day}</p>
              <p className="text-[15px] text-acuity-text-sec leading-snug">{r.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <Cta onClick={next}>Start my first week</Cta>
    </div>
  );
}

function PaywallScreen({ plan, setPlan, next, go, track, firstName }: ViewProps) {
  const [open, setOpen] = useState<number | null>(null);
  const after = plan === "yearly" ? `${displayAnnual()}/year` : `${displayMonthly()}/month`;
  const timeline = [
    { label: "Today", text: "Full Pro access. $0." },
    { label: "Day 4", text: "We email you a reminder." },
    { label: "Day 7", text: `Your plan starts at ${after}. Cancel before then and you pay nothing.` },
  ];
  const pick = (p: Plan) => {
    setPlan(p);
    track("funnel_paywall_plan_selected", p);
  };
  return (
    <div className="v9-in">
      <Title sub="$0 today. Cancel any time.">{firstName ? `${firstName}, try Ripple Pro free for 7 days` : "Try Ripple Pro free for 7 days"}</Title>

      <div className="space-y-2.5">
        <button onClick={() => pick("yearly")} className={`w-full text-left rounded-2xl px-5 py-4 transition ${plan === "yearly" ? "f-sel" : "f-card"}`}>
          <div className="flex items-center justify-between">
            <span className="text-[16px] font-semibold">Yearly</span>
            <span className="rounded-full bg-acuity-primary px-2.5 py-0.5 text-[12px] font-semibold text-white">Save {displaySavingsPct()}</span>
          </div>
          <p className="mt-1 text-[22px] font-bold tabular-nums">
            {displayAnnualAsMonthly()}
            <span className="text-[14px] font-medium text-acuity-text-sec">/mo</span>
          </p>
          <p className="text-[13px] text-acuity-text-sec tabular-nums">Billed {displayAnnual()} a year after your free week</p>
        </button>
        <button onClick={() => pick("monthly")} className={`w-full text-left rounded-2xl px-5 py-4 transition ${plan === "monthly" ? "f-sel" : "f-card"}`}>
          <span className="text-[16px] font-semibold">Monthly</span>
          <p className="mt-1 text-[22px] font-bold tabular-nums">
            {displayMonthly()}
            <span className="text-[14px] font-medium text-acuity-text-sec">/mo</span>
          </p>
          <p className="text-[13px] text-acuity-text-sec">Billed monthly after your free week</p>
        </button>
      </div>

      <section className="mt-5 rounded-[22px] f-card px-5 py-4">
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

      <section className="mt-6 space-y-3">
        <Stars />
        {V9_REVIEWS.map((r) => (
          <Quote key={r.name} {...r} />
        ))}
      </section>

      <section className="mt-6">
        <p className="mb-2 text-[13px] font-semibold text-acuity-text-ter">Questions</p>
        {V9_FAQ.map((f, i) => (
          <div key={f.q} className="border-b border-acuity-line">
            <button onClick={() => setOpen(open === i ? null : i)} className="w-full py-3 text-left text-[15px] font-medium flex justify-between">
              {f.q}
              <span className="text-acuity-text-ter">{open === i ? "−" : "+"}</span>
            </button>
            {open === i && <p className="pb-3 text-[14px] text-acuity-text-sec leading-relaxed">{f.a}</p>}
          </div>
        ))}
      </section>

      <button
        onClick={() => {
          track("funnel_paywall_skip_selected");
          go("download");
        }}
        className="mt-6 w-full py-2 text-[14px] font-medium text-acuity-text-sec underline-offset-4 hover:underline"
      >
        Continue with the free plan
      </button>
      <p className="mt-2 text-center text-[11px] text-acuity-text-quiet">
        If you&rsquo;re in crisis, call or text 988 (Suicide &amp; Crisis Lifeline).
      </p>

      <div className="fixed bottom-0 inset-x-0 z-40 bg-acuity-bg border-t border-acuity-line px-5 pt-3 pb-4">
        <div className="max-w-lg mx-auto">
          <button
            onClick={() => {
              track("funnel_paywall_paid_selected", plan);
              next();
            }}
            className="w-full rounded-full bg-acuity-primary py-3.5 text-[16px] font-semibold text-white active:scale-[0.98]"
          >
            Start my 7-day free trial
          </button>
          <p className="mt-2 text-center text-[12px] text-acuity-text-sec tabular-nums">
            <span className="font-semibold text-acuity-text">$0 today.</span> Then {after}, renews automatically. Cancel any time in your account.
          </p>
        </div>
      </div>
    </div>
  );
}

function CheckoutScreen({ plan, track }: ViewProps) {
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
      setErr(data.error ?? `Checkout failed (${res.status})`);
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
            if (!data.clientSecret) throw new Error(data.error ?? "No client secret");
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
    <div className="v9-in">
      <Title sub={plan === "yearly" ? `Yearly: $0 today, then ${displayAnnual()}/year` : `Monthly: $0 today, then ${displayMonthly()}/month`}>
        Start your free week
      </Title>
      {state === "loading" && <p className="text-[15px] text-acuity-text-sec">Loading secure checkout&hellip;</p>}
      {state === "fallback" && <p className="text-[15px] text-acuity-text-sec">Opening secure checkout&hellip;</p>}
      {state === "error" && (
        <div>
          <p className="text-[15px] text-acuity-bad">{err}</p>
          <button onClick={hosted} className="mt-3 rounded-full bg-acuity-primary px-5 py-2.5 text-white font-semibold">
            Try again
          </button>
        </div>
      )}
      <div ref={mountRef} className="rounded-2xl overflow-hidden" />
    </div>
  );
}

function DownloadScreen({ answers, firstName, paid, track }: ViewProps) {
  const [linkSent, setLinkSent] = useState(false);
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
    <div className="v9-in">
      <Title sub={paid ? "Your 7 free days of Ripple Pro have started." : "Your free Ripple account is ready."}>
        {firstName ? `You're in, ${firstName}.` : "You're in."}
      </Title>

      <div className="rounded-[22px] f-card px-5 py-5 space-y-4">
        <div>
          <p className="text-[15px] font-semibold">1. Do your first debrief now</p>
          <p className="text-[14px] text-acuity-text-sec">Talk or type whatever&rsquo;s on your mind. Ripple pulls out your list.</p>
          <button onClick={openWeb} className="mt-3 w-full rounded-full bg-acuity-primary py-3 text-[15px] font-semibold text-white">
            Start my first debrief
          </button>
        </div>
        <div>
          <p className="text-[15px] font-semibold">2. Get the app</p>
          <div className="mt-2 flex gap-2">
            <a href={APP_STORE_URL} onClick={() => track("funnel_app_store_clicked")} className="flex-1 rounded-full f-sub py-2.5 text-center text-[14px] font-semibold">
              App Store
            </a>
            <a href={PLAY_STORE_URL} onClick={() => track("funnel_play_store_clicked")} className="flex-1 rounded-full f-sub py-2.5 text-center text-[14px] font-semibold">
              Google Play
            </a>
          </div>
        </div>
        <div>
          <p className="text-[15px] font-semibold">3. Set a password for the app</p>
          {answers.email ? (
            linkSent ? (
              <p className="text-[14px] text-acuity-text-sec">Check {answers.email} for a link to set your password.</p>
            ) : (
              <button onClick={sendLink} className="mt-2 w-full rounded-full f-sub py-2.5 text-[14px] font-semibold">
                Email me a link
              </button>
            )
          ) : (
            <p className="text-[14px] text-acuity-text-sec">Use &ldquo;Forgot password&rdquo; on the app&rsquo;s sign-in screen with your email.</p>
          )}
        </div>
      </div>
    </div>
  );
}
