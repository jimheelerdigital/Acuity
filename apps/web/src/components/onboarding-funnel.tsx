"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import {
  ANNUAL_PRICE_CENTS,
  MONTHLY_PRICE_CENTS,
  PRICING,
  formatDollars,
} from "@/lib/pricing";
import { trackOnboardingEvent } from "@/lib/track-onboarding";
import { PRIORITY_COLOR } from "@acuity/shared";
import { MoodDot, AppleLogo, GoogleLogo } from "@/components/debrief-shared";

// ─── Types ───────────────────────────────────────────────────────────────────

type Step =
  | "pain"
  | "diagnostic1"
  | "diagnostic2"
  | "diagnostic3"
  | "diagnostic4"
  | "diagnostic5"
  | "mirror"
  | "failed-solution"
  | "promise"
  | "commitment"
  | "mock-extraction"
  | "journey"
  | "signup"
  | "paywall"
  | "download";

interface DiagnosticAnswers {
  loop?: string;
  duration?: string;
  tried?: string[];
  cost?: string[];
  desire?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const APP_STORE_URL = "https://apps.apple.com/us/app/acuity-daily/id6762633410";

const STEP_ORDER: Step[] = [
  "pain", "diagnostic1", "diagnostic2", "diagnostic3", "diagnostic4",
  "diagnostic5", "mirror", "failed-solution", "promise", "commitment",
  "mock-extraction", "journey", "signup", "paywall", "download",
];

const DIAGNOSTIC1_OPTIONS = [
  "Work bleeds into life",
  "Same fights, same conversations",
  "Goals that never become real",
  "Days that blur together",
  "Something else",
];

const DIAGNOSTIC2_OPTIONS = [
  "A few weeks",
  "A few months",
  "Over a year",
  "I can't remember when it started",
];

const DIAGNOSTIC3_OPTIONS = [
  "Journaling (couldn't keep it up)",
  "Therapy (not enough between sessions)",
  "Productivity apps (too much work)",
  "Meditation or mindfulness (didn't stick)",
  "Nothing — I just push through",
];

const DIAGNOSTIC4_OPTIONS = [
  "I'm dropping balls at work",
  "My relationships are suffering",
  "My health is slipping",
  "I don't recognize myself anymore",
];

const DIAGNOSTIC5_OPTIONS = [
  "I'd stop repeating the same mistakes",
  "I'd actually follow through on goals",
  "I'd feel in control of my life again",
  "I'd be the person I know I can be",
];

const PAYWALL_TESTIMONIALS = [
  { quote: "I used to let tasks pile up in my head until 2 AM. Now I debrief into Acuity and actually sleep.", name: "Sarah K.", role: "Product Manager" },
  { quote: "The weekly reports are unreal. It's like having a therapist and a project manager rolled into one.", name: "Marcus T.", role: "Product Manager" },
  { quote: "I mentioned 'morning routine' 12 times in two weeks but never built one. Seeing that in my report changed everything.", name: "Priya R.", role: "Consultant" },
  { quote: "My partner noticed the difference before I did. I'm actually present when I get home now.", name: "David K.", role: "Engineer" },
];

const INCLUDED_FEATURES = [
  "Unlimited daily debriefs",
  "Tasks extracted automatically",
  "Goals tracked across weeks",
  "Mood and energy scored every entry",
  "Weekly report every Sunday",
  "Life Matrix across 6 domains",
  "Pattern detection over time",
  "Quarterly memoir",
  "Export your data anytime",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPersonalizedPromise(answers: DiagnosticAnswers): string {
  const { loop, duration, cost, desire } = answers;
  if (loop === "Days that blur together" && duration === "Over a year" && cost?.includes("My relationships are suffering")) {
    return "You\u2019ve been stuck in this loop for over a year, and your relationships are paying the price. Acuity will show you the pattern in 60 seconds of your voice.";
  }
  if (loop === "Work bleeds into life" && cost?.includes("I don't recognize myself anymore")) {
    return "Work has been swallowing your life and you don\u2019t even recognize yourself anymore. Acuity will show you exactly where you disappeared.";
  }
  if (loop === "Goals that never become real" && desire === "I'd actually follow through on goals") {
    return "You know what you want. Acuity catches the goals you mention and holds you to them \u2014 so this time, you actually follow through.";
  }
  if (loop === "Same fights, same conversations" && cost?.includes("My relationships are suffering")) {
    return "The same arguments keep cycling and your relationships are paying for it. Acuity surfaces the pattern so you can finally break it.";
  }
  if (loop === "Days that blur together" && duration === "Over a year") {
    return "You\u2019ve been stuck in this loop for over a year. Acuity will show you the pattern in 60 seconds of your voice.";
  }
  if (loop === "Work bleeds into life" && (duration === "A few months" || duration === "Over a year")) {
    return "Work has been bleeding into your life for months. Acuity will show you exactly where the line disappears.";
  }
  if (loop === "Same fights, same conversations") {
    return "The same conversations keep happening because the same patterns keep running. Acuity will show you the loop.";
  }
  if (loop === "Goals that never become real") {
    return "Your goals stay abstract because nothing holds you accountable daily. Acuity extracts action from intention.";
  }
  return "Acuity will show you the pattern in 60 seconds of your voice.";
}

function getMockInsight(answers: DiagnosticAnswers): string {
  const { loop, cost } = answers;
  if (loop === "Goals that never become real") return "You told us goals never become real. Acuity tracks every goal you mention \u2014 so this time, they stick.";
  if (loop === "Days that blur together") return "You said your days blur together. Imagine seeing this breakdown every single day.";
  if (loop === "Work bleeds into life") return "You said work bleeds into life. Your weekly report will show you exactly where the line disappears.";
  if (cost?.includes("My relationships are suffering")) return "You said your relationships are suffering. Acuity tracks your mood and themes so you can see what\u2019s really driving the tension.";
  return "This is what one debrief gets you. Do this daily and patterns emerge that you\u2019d never see on your own.";
}

function formatTrialEndDate(): string {
  const d = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// ─── Tracking helper ─────────────────────────────────────────────────────────

function useFunnelTracker() {
  const sessionId = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `funnel_${Date.now()}_${Math.random().toString(36).slice(2)}`
  );
  return useCallback((event: string, props?: Record<string, unknown>) => {
    trackOnboardingEvent(event, { sessionToken: sessionId.current, ...props });
  }, []);
}

// ─── Shared Icons ────────────────────────────────────────────────────────────

function CheckboxIcon() {
  return (
    <svg className="h-5 w-5 shrink-0 mt-0.5 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <rect x="3" y="3" width="18" height="18" rx="4" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg className="h-5 w-5 shrink-0 mt-0.5 text-[#A78BFA]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4 text-[#7C5CFC] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

const MOOD_GLOW: Record<string, string> = {
  GREAT: "0 0 24px 4px rgba(34,197,94,0.15)",
  GOOD: "0 0 24px 4px rgba(74,222,128,0.12)",
  NEUTRAL: "0 0 24px 4px rgba(148,163,184,0.10)",
  LOW: "0 0 24px 4px rgba(245,158,11,0.12)",
  ROUGH: "0 0 24px 4px rgba(239,68,68,0.15)",
};

// ─── Shared: subtle testimonial ─────────────────────────────────────────────

function ScreenTestimonial({ quote, name }: { quote: string; name: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 500); return () => clearTimeout(t); }, []);
  return (
    <p className={`mt-10 text-xs italic text-zinc-400 transition-opacity duration-500 ${visible ? "opacity-100" : "opacity-0"}`}>
      &ldquo;{quote}&rdquo; &mdash; {name}
    </p>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function OnboardingFunnel() {
  const { data: session, status: authStatus } = useSession();
  const [step, setStep] = useState<Step>("pain");
  const [answers, setAnswers] = useState<DiagnosticAnswers>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("monthly");
  const track = useFunnelTracker();

  // Check URL params for return from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("step") === "download") setStep("download");
    else if (params.get("step") === "paywall") setStep("paywall");
  }, []);

  // If already logged in with active subscription, skip to download
  useEffect(() => {
    if (authStatus === "authenticated" && session?.user) {
      fetch("/api/user/me")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.user?.subscriptionStatus === "PRO") setStep("download");
          else if (step === "pain" && data?.user) setStep("paywall");
        })
        .catch(() => {});
    }
  }, [authStatus, session, step]);

  // Track step views
  useEffect(() => {
    const eventMap: Record<string, string> = {
      pain: "funnel_pain_hook_viewed",
      mirror: "funnel_mirror_viewed",
      "failed-solution": "funnel_failed_solution_viewed",
      promise: "funnel_promise_viewed",
      "mock-extraction": "funnel_mock_extraction_viewed",
      journey: "funnel_journey_viewed",
      paywall: "funnel_paywall_viewed",
      download: "funnel_download_screen_viewed",
    };
    if (eventMap[step]) track(eventMap[step]);
  }, [step, track]);

  const goBack = () => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
  };

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
        track("funnel_payment_completed", { plan: selectedPlan });
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
    <div className="min-h-screen">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes funnel-glow {
          0%, 100% { box-shadow: 0 4px 16px rgba(124,92,252,0.3); }
          50% { box-shadow: 0 4px 28px rgba(124,92,252,0.55), 0 0 8px rgba(124,92,252,0.2); }
        }
        @keyframes funnel-slide-up {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes funnel-card-in {
          from { opacity: 0; transform: translateY(12px) scale(0.95); }
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
        @keyframes funnel-gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
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
        .funnel-screen { animation: funnel-slide-up 0.3s ease-out both; }
        .funnel-card-stagger { animation: funnel-card-in 0.3s ease-out both; }
        .funnel-bounce { animation: funnel-bounce-in 0.4s ease-out both; }
      `}} />

      {step !== "pain" && step !== "download" && (
        <button
          onClick={goBack}
          className="fixed top-5 left-5 z-50 rounded-full bg-zinc-100 p-2 text-zinc-500 hover:text-zinc-900 transition"
          aria-label="Go back"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {step === "pain" && <PainHookScreen onContinue={() => setStep("diagnostic1")} />}

      {step === "diagnostic1" && (
        <DiagnosticScreen question="What's the loop you can't break?" options={DIAGNOSTIC1_OPTIONS} multiSelect={false}
          testimonial={{ quote: "I picked \u2018days that blur together.\u2019 Seeing it written down hit different.", name: "David K." }}
          onSelect={(val) => { setAnswers((a) => ({ ...a, loop: val as string })); track("funnel_diagnostic_loop", { value: val }); setStep("diagnostic2"); }}
        />
      )}
      {step === "diagnostic2" && (
        <DiagnosticScreen question="How long have you been stuck in this loop?" options={DIAGNOSTIC2_OPTIONS} multiSelect={false}
          testimonial={{ quote: "Over a year. It was uncomfortable to admit, but that\u2019s what made me try it.", name: "Sarah K." }}
          onSelect={(val) => { setAnswers((a) => ({ ...a, duration: val as string })); track("funnel_diagnostic_duration", { value: val }); setStep("diagnostic3"); }}
        />
      )}
      {step === "diagnostic3" && (
        <DiagnosticMultiScreen question="What have you tried to fix it?" options={DIAGNOSTIC3_OPTIONS}
          testimonial={{ quote: "I tried three journaling apps. This is the first one that stuck because I just talk.", name: "Jamie L." }}
          onSubmit={(vals) => { setAnswers((a) => ({ ...a, tried: vals })); track("funnel_diagnostic_attempts", { values: vals }); setStep("diagnostic4"); }}
        />
      )}
      {step === "diagnostic4" && (
        <DiagnosticMultiScreen question="What's it costing you?" options={DIAGNOSTIC4_OPTIONS}
          testimonial={{ quote: "My partner noticed the difference before I did. I\u2019m actually present when I get home now.", name: "David K." }}
          onSubmit={(vals) => { setAnswers((a) => ({ ...a, cost: vals })); track("funnel_diagnostic_cost", { value: vals }); setStep("diagnostic5"); }}
        />
      )}
      {step === "diagnostic5" && (
        <DiagnosticScreen question="What would change if you could finally see the pattern?" options={DIAGNOSTIC5_OPTIONS} multiSelect={false}
          testimonial={{ quote: "I finally feel like I\u2019m in control of my week instead of my week controlling me.", name: "Marcus T." }}
          onSelect={(val) => { setAnswers((a) => ({ ...a, desire: val as string })); track("funnel_diagnostic_desire", { value: val }); setStep("mirror"); }}
        />
      )}
      {step === "mirror" && <MirrorScreen answers={answers} onContinue={() => setStep("failed-solution")} />}
      {step === "failed-solution" && (
        <FailedSolutionScreen onContinue={() => setStep("promise")} />
      )}
      {step === "promise" && (
        <PromiseScreen headline={getPersonalizedPromise(answers)} onContinue={() => setStep("commitment")} />
      )}
      {step === "commitment" && (
        <CommitmentScreen track={track} onComplete={() => setStep("mock-extraction")} />
      )}
      {step === "mock-extraction" && (
        <MockExtractionScreen answers={answers} onContinue={() => setStep("journey")} />
      )}
      {step === "journey" && <JourneyScreen onContinue={() => setStep("signup")} />}
      {step === "signup" && <SignupScreen track={track} onComplete={() => setStep("paywall")} />}
      {step === "paywall" && (
        <PaywallScreen
          selectedPlan={selectedPlan} onPlanChange={setSelectedPlan}
          onCheckout={handleCheckout} loading={checkoutLoading} error={apiError}
        />
      )}
      {step === "download" && <DownloadScreen track={track} />}
    </div>
  );
}

// ─── Screen 1: Pain Hook ─────────────────────────────────────────────────────

function PainHookScreen({ onContinue }: { onContinue: () => void }) {
  const words = ["Same", "week.", "Same", "loop.", "Same", "you."];
  const [visibleWords, setVisibleWords] = useState(0);
  const [showSub, setShowSub] = useState(false);
  const [showBtn, setShowBtn] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    words.forEach((_, i) => { timers.push(setTimeout(() => setVisibleWords(i + 1), 200 + i * 200)); });
    timers.push(setTimeout(() => setShowSub(true), 200 + words.length * 200 + 600));
    timers.push(setTimeout(() => setShowBtn(true), 200 + words.length * 200 + 1000));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-zinc-900 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30" style={{ background: "linear-gradient(135deg, #f8f6ff 0%, #ffffff 40%, #f5f0ff 70%, #ffffff 100%)", backgroundSize: "200% 200%", animation: "funnel-gradient-shift 8s ease infinite" }} />
      <div className="relative max-w-md text-center">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
          {words.map((w, i) => (
            <span key={i} className={`inline-block mr-2 transition-all duration-300 ${i < visibleWords ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>{w}</span>
          ))}
        </h1>
        <p className={`mt-6 text-zinc-500 text-base transition-all duration-500 ${showSub ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
          Days blur. Nothing sticks. Life passes.
        </p>
        <ScreenTestimonial quote="I didn't realize I was living the same week on repeat until Acuity showed me." name="Priya R." />
        <div className={`mt-8 transition-all duration-300 ${showBtn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <button onClick={onContinue} className="rounded-full bg-[#7C5CFC] px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Screens 2-6: Diagnostics ────────────────────────────────────────────────

function DiagnosticScreen({ question, options, multiSelect, onSelect, testimonial }: {
  question: string; options: string[]; multiSelect: boolean;
  onSelect: (val: string | string[]) => void;
  testimonial?: { quote: string; name: string };
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const handleSelect = (opt: string) => {
    setSelected(opt);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-zinc-900">
      <div className="max-w-md w-full funnel-screen">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-10">{question}</h2>
        <div className="space-y-3">
          {options.map((opt, i) => (
            <button key={opt} onClick={() => handleSelect(opt)}
              className={`w-full text-left rounded-xl border px-5 py-4 text-[15px] transition-all duration-200 active:scale-[0.98] funnel-card-stagger ${
                selected === opt ? "border-[#7C5CFC] bg-[#7C5CFC]/10 text-zinc-900" : selected ? "border-zinc-200 bg-zinc-50 text-zinc-700 opacity-50" : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
              }`}
              style={{ animationDelay: `${i * 100}ms` }}
            >
              {selected === opt && <span className="mr-2 text-[#7C5CFC]">&#10003;</span>}{opt}
            </button>
          ))}
        </div>
        {testimonial && <ScreenTestimonial quote={testimonial.quote} name={testimonial.name} />}
        <div className={`mt-8 transition-all duration-300 ${selected ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <button onClick={() => { if (selected) onSelect(selected); }} disabled={!selected}
            className="w-full rounded-full bg-[#7C5CFC] py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function DiagnosticMultiScreen({ question, options, onSubmit, testimonial }: {
  question: string; options: string[];
  onSubmit: (vals: string[]) => void;
  testimonial?: { quote: string; name: string };
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (opt: string) => {
    if (opt === "Nothing \u2014 I just push through") { setSelected([opt]); return; }
    setSelected((prev) => {
      const without = prev.filter((o) => o !== "Nothing \u2014 I just push through");
      return without.includes(opt) ? without.filter((o) => o !== opt) : [...without, opt];
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-zinc-900">
      <div className="max-w-md w-full funnel-screen">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-10">{question}</h2>
        <div className="space-y-3">
          {options.map((opt, i) => (
            <button key={opt}
              onClick={() => { toggle(opt); if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10); }}
              className={`w-full text-left rounded-xl border px-5 py-4 text-[15px] transition-all duration-200 active:scale-[0.98] funnel-card-stagger ${
                selected.includes(opt) ? "border-[#7C5CFC] bg-[#7C5CFC]/10 text-zinc-900" : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
              }`}
              style={{ animationDelay: `${i * 100}ms` }}
            >
              {selected.includes(opt) && <span className="mr-2 text-[#7C5CFC]">&#10003;</span>}{opt}
            </button>
          ))}
        </div>
        {testimonial && <ScreenTestimonial quote={testimonial.quote} name={testimonial.name} />}
        <button onClick={() => onSubmit(selected.length > 0 ? selected : ["Nothing \u2014 I just push through"])}
          disabled={selected.length === 0}
          className="mt-8 w-full rounded-full bg-[#7C5CFC] py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98] disabled:opacity-40 disabled:animate-none animate-[funnel-glow_2s_ease-in-out_infinite]">
          Continue
        </button>
      </div>
    </div>
  );
}

// ─── Screen 7: The Mirror ────────────────────────────────────────────────────

function mirrorDuration(raw: string | undefined): string {
  const MAP: Record<string, string> = {
    "A few weeks": "a few weeks",
    "A few months": "a few months",
    "Over a year": "over a year",
    "I can't remember when it started": "longer than you can remember",
  };
  return MAP[raw ?? ""] ?? "longer than you\u2019d like to admit";
}

function mirrorAttempts(raw: string[] | undefined): string {
  if (!raw?.length) return "You haven\u2019t found anything that works yet.";
  if (raw.includes("Nothing \u2014 I just push through")) return "You haven\u2019t tried anything \u2014 you just push through.";
  const cleaned = raw.map((t) => t.replace(/ \(.*\)/, "").toLowerCase());
  const joined = cleaned.length === 1
    ? cleaned[0]
    : cleaned.slice(0, -1).join(", ") + " and " + cleaned[cleaned.length - 1];
  return `You\u2019ve tried ${joined}. None of them stuck.`;
}

function mirrorCosts(raw: string[] | undefined): string {
  if (!raw?.length) return "";
  const MAP: Record<string, string> = {
    "I'm dropping balls at work": "your career",
    "My relationships are suffering": "your relationships",
    "My health is slipping": "your health",
    "I don't recognize myself anymore": "your sense of self",
  };
  const mapped = raw.map((c) => MAP[c] ?? c.toLowerCase());
  const joined = mapped.length === 1
    ? mapped[0]
    : mapped.slice(0, -1).join(", ") + " and " + mapped[mapped.length - 1];
  return `It\u2019s costing you ${joined}.`;
}

function mirrorDesire(raw: string | undefined): string {
  const MAP: Record<string, string> = {
    "I'd stop repeating the same mistakes": "to break the cycle",
    "I'd actually follow through on goals": "to finally follow through",
    "I'd feel in control of my life again": "to feel in control again",
    "I'd be the person I know I can be": "to become who you know you can be",
  };
  return `What you want: ${MAP[raw ?? ""] ?? "to feel in control again"}.`;
}

function MirrorScreen({ answers, onContinue }: { answers: DiagnosticAnswers; onContinue: () => void }) {
  const [visibleLines, setVisibleLines] = useState(0);
  const [showPivot, setShowPivot] = useState(false);
  const [showBtn, setShowBtn] = useState(false);

  const lines = [
    `You\u2019re stuck in a loop of ${(answers.loop ?? "something you can\u2019t name").toLowerCase()}.`,
    `You\u2019ve been stuck for ${mirrorDuration(answers.duration)}.`,
    mirrorAttempts(answers.tried),
    mirrorCosts(answers.cost),
    mirrorDesire(answers.desire),
  ].filter(Boolean);

  const LINE_DELAY = 700;

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    lines.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleLines(i + 1), 500 + i * LINE_DELAY));
    });
    const afterLines = 500 + lines.length * LINE_DELAY;
    timers.push(setTimeout(() => setShowPivot(true), afterLines + 1200));
    timers.push(setTimeout(() => setShowBtn(true), afterLines + 2400));
    return () => timers.forEach(clearTimeout);
  }, [lines.length]);

  // Subtle gradient intensity tied to reveal progress
  const gradientOpacity = Math.min(0.35, 0.08 + visibleLines * 0.05);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-zinc-900 relative overflow-hidden transition-colors duration-1000"
      style={{ background: `linear-gradient(180deg, #ffffff ${100 - gradientOpacity * 100}%, #f8f6ff 100%)` }}>
      <div className="max-w-md w-full funnel-screen">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-14">
          We heard you.
        </h2>
        <div className="space-y-6">
          {lines.map((line, i) => (
            <div key={i}
              className={`transition-all duration-700 ease-out ${i < visibleLines ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
              style={{ transitionDelay: `${i < visibleLines ? 0 : 100}ms` }}>
              <div className="border-l-2 border-[#7C5CFC]/40 pl-5 py-1">
                <p className="text-base text-zinc-700 leading-relaxed">{line}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Emotional pivot */}
        <div className={`mt-14 text-center transition-all duration-1000 ${showPivot ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <p className="text-lg font-semibold text-zinc-900 tracking-tight">
            You don&rsquo;t have to keep living like this.
          </p>
        </div>

        {/* Continue */}
        <div className={`mt-10 text-center transition-all duration-700 ${showBtn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <button onClick={onContinue} className="rounded-full bg-[#7C5CFC] px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 8: Failed Solution ───────────────────────────────────────────────

function FailedSolutionScreen({ onContinue }: { onContinue: () => void }) {
  const words1 = "Written journaling asks for discipline.".split(" ");
  const words2 = "Acuity just asks for one minute.".split(" ");
  const [vis1, setVis1] = useState(0);
  const [vis2, setVis2] = useState(0);
  const [showSub, setShowSub] = useState(false);
  const [showBtn, setShowBtn] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    words1.forEach((_, i) => { timers.push(setTimeout(() => setVis1(i + 1), 200 + i * 150)); });
    const pause = 200 + words1.length * 150 + 600;
    words2.forEach((_, i) => { timers.push(setTimeout(() => setVis2(i + 1), pause + i * 150)); });
    timers.push(setTimeout(() => setShowSub(true), pause + words2.length * 150 + 400));
    timers.push(setTimeout(() => setShowBtn(true), pause + words2.length * 150 + 800));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-zinc-900">
      <div className="max-w-md text-center funnel-screen">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-snug">
          {words1.map((w, i) => (
            <span key={`a${i}`} className={`inline-block mr-1.5 transition-all duration-300 ${i < vis1 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>{w}</span>
          ))}
        </h2>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-snug mt-4">
          {words2.map((w, i) => (
            <span key={`b${i}`} className={`inline-block mr-1.5 transition-all duration-300 ${i < vis2 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
              {w === "Acuity" ? <span className="text-[#7C5CFC]">{w}</span> : w}
            </span>
          ))}
        </h2>
        <p className={`mt-6 text-zinc-500 text-sm leading-relaxed transition-all duration-500 ${showSub ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
          No typing. No prompts. No blank pages. Just talk.
        </p>
        <ScreenTestimonial quote="I used to let tasks pile up in my head until 2 AM. Now I debrief into Acuity and actually sleep." name="Sarah K." />
        <div className={`mt-8 transition-all duration-300 ${showBtn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <button onClick={onContinue} className="rounded-full bg-[#7C5CFC] px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 9: Personalized Promise ──────────────────────────────────────────

function PromiseScreen({ headline, onContinue }: { headline: string; onContinue: () => void }) {
  const [typedChars, setTypedChars] = useState(0);
  const [showSub, setShowSub] = useState(false);
  const [showBtn, setShowBtn] = useState(false);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setTypedChars(i);
      if (i >= headline.length) {
        clearInterval(interval);
        setTimeout(() => setShowSub(true), 400);
        setTimeout(() => setShowBtn(true), 800);
      }
    }, 30);
    return () => clearInterval(interval);
  }, [headline]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-zinc-900">
      <div className="max-w-md text-center funnel-screen">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-snug min-h-[3em]">
          {headline.slice(0, typedChars)}
          {typedChars < headline.length && <span className="inline-block w-0.5 h-6 bg-[#7C5CFC] ml-0.5 animate-pulse" />}
        </h2>
        <p className={`mt-6 text-zinc-500 text-sm leading-relaxed transition-all duration-500 ${showSub ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
          Over time, the insights get richer as you map your own life in 60 seconds a day.
        </p>
        <ScreenTestimonial quote="The weekly reports are unreal. It's like having a therapist and a project manager rolled into one." name="Marcus T." />
        <div className={`mt-8 transition-all duration-300 ${showBtn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <button onClick={onContinue} className="rounded-full bg-[#7C5CFC] px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 10: Commitment ───────────────────────────────────────────────────

function CommitmentScreen({ track, onComplete }: { track: (event: string) => void; onComplete: () => void }) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [abandonCount, setAbandonCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  const startHold = () => {
    setHolding(true);
    startTimeRef.current = Date.now();
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([10, 50, 10, 50, 10]);
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(1, elapsed / 3000);
      setProgress(pct);
      if (typeof navigator !== "undefined" && navigator.vibrate && pct < 1) navigator.vibrate(5);
      if (pct >= 1) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setHolding(false);
        track("funnel_commitment_completed");
        import("canvas-confetti").then((mod) => {
          const confetti = mod.default;
          confetti({ particleCount: 100, spread: 80, origin: { y: 0.5 }, colors: ["#7C5CFC", "#A78BFA", "#C4B5FD", "#F59E0B", "#22C55E"] });
          setTimeout(() => confetti({ particleCount: 50, spread: 100, origin: { y: 0.4, x: 0.3 } }), 200);
          setTimeout(() => confetti({ particleCount: 50, spread: 100, origin: { y: 0.4, x: 0.7 } }), 350);
        });
        setTimeout(onComplete, 800);
      }
    }, 16);
  };

  const endHold = () => {
    if (!holding) return;
    if (progress < 1) setAbandonCount((c) => { const n = c + 1; if (n >= 3) track("funnel_commitment_abandoned"); return n; });
    setHolding(false);
    setProgress(0);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-zinc-900 select-none">
      <div className="max-w-md text-center">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-12">Hold to commit to one minute a day for a life of clarity.</h2>
        <div className="relative inline-flex items-center justify-center">
          <svg className="h-40 w-40" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="#e4e4e7" strokeWidth="4" />
            <circle cx="60" cy="60" r="54" fill="none" stroke="#7C5CFC" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 54}`} strokeDashoffset={`${2 * Math.PI * 54 * (1 - progress)}`}
              transform="rotate(-90 60 60)" className="transition-[stroke-dashoffset] duration-100" />
          </svg>
          <button onMouseDown={startHold} onMouseUp={endHold} onMouseLeave={endHold} onTouchStart={startHold} onTouchEnd={endHold}
            className={`absolute inset-4 rounded-full bg-[#7C5CFC]/5 border border-zinc-200 flex items-center justify-center transition active:bg-[#7C5CFC]/10 ${!holding && progress === 0 ? "animate-[funnel-breathe_2s_ease-in-out_infinite]" : ""}`}
            aria-label="Hold to commit">
            <span className="text-3xl">{progress >= 1 ? "\u2713" : ""}</span>
          </button>
        </div>
        <p className="mt-8 text-xs text-zinc-400">{holding ? "Keep holding..." : "Press and hold the circle"}</p>
      </div>
    </div>
  );
}

// ─── Screen 11: Mock Extraction ──────────────────────────────────────────────

function MockExtractionScreen({ answers, onContinue }: { answers: DiagnosticAnswers; onContinue: () => void }) {
  const [step, setStep] = useState(0);
  const totalSteps = 14; // mood + tasksH + 3tasks + goalsH + 2goals + themesH + 3themes + insight + button

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= totalSteps; i++) {
      timers.push(setTimeout(() => setStep(i), i === 1 ? 400 : 400 + (i - 1) * 150));
    }
    return () => timers.forEach(clearTimeout);
  }, []);

  const vis = (at: number) => step >= at ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3";
  const scaleVis = (at: number) => step >= at ? "opacity-100 scale-100" : "opacity-0 scale-75";

  const tasks = [
    { title: "Follow up on client proposal", desc: "You\u2019re targeting 9 deals this month. Map out your pipeline to stay on track.", priority: "HIGH" },
    { title: "Book dentist appointment", desc: "", priority: "MEDIUM" },
    { title: "Review budget spreadsheet", desc: "End-of-month review before team sync on Friday.", priority: "LOW" },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 bg-white text-zinc-900">
      <div className="w-full max-w-md">
        <div className="text-center mb-10 animate-fade-in">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
            Here&rsquo;s what Acuity pulls from a single 60-second debrief.
          </h2>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#7C5CFC]">Day 1</p>
        </div>

        {/* Mood */}
        <div className={`mb-5 rounded-2xl bg-white border border-zinc-200 p-5 transition-all duration-500 ${vis(1)}`} style={{ boxShadow: step >= 1 ? MOOD_GLOW.GOOD : "none" }}>
          <div className="flex items-center gap-2 mb-3">
            <MoodDot mood="GOOD" />
            <span className="text-sm font-semibold text-zinc-800">Good</span>
            <span className="text-xs text-zinc-400">&middot; Energy 7/10</span>
          </div>
          <p className="text-sm text-zinc-600 leading-relaxed">A productive day with a gym session and two big meetings. Feeling stretched but making progress on the quarterly goal.</p>
        </div>

        {/* Tasks */}
        <div className={`mb-5 transition-all duration-500 ${vis(2)}`}>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#7C5CFC] mb-3">Tasks</p>
          <div className="space-y-2">
            {tasks.map((t, i) => (
              <div key={i} className={`flex items-start gap-3 rounded-xl bg-white border border-zinc-200 px-4 py-3 transition-all duration-400 ${vis(3 + i)}`} style={{ borderLeft: "3px solid #7C5CFC" }}>
                <CheckboxIcon />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-800">{t.title}</p>
                  {t.desc && <p className="text-xs text-zinc-400 mt-0.5">{t.desc}</p>}
                </div>
                <span className="shrink-0 mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase" style={{ color: PRIORITY_COLOR[t.priority] ?? PRIORITY_COLOR.MEDIUM, backgroundColor: `${PRIORITY_COLOR[t.priority] ?? PRIORITY_COLOR.MEDIUM}15` }}>
                  {t.priority}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Goals */}
        <div className={`mb-5 transition-all duration-500 ${vis(6)}`}>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#7C5CFC] mb-3">Goals</p>
          <div className="space-y-2">
            {[{ title: "Close 3 new deals this quarter", desc: "Mentioned 4 of last 5 entries. Acuity will track this daily." },
              { title: "Get to gym 4x this week", desc: "2 sessions logged so far. On track." }].map((g, i) => (
              <div key={i} className={`flex items-start gap-3 rounded-xl bg-white border border-zinc-200 px-4 py-3 transition-all duration-400 ${vis(7 + i)}`} style={{ borderLeft: "3px solid #A78BFA" }}>
                <FlagIcon />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-800">{g.title}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{g.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Themes */}
        <div className={`mb-5 transition-all duration-500 ${vis(9)}`}>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#7C5CFC] mb-3">What&rsquo;s on your mind</p>
          <div className="flex flex-wrap gap-2">
            {["Work-Life Balance", "Fitness Goals", "Career Growth"].map((t, i) => (
              <span key={t} className={`rounded-full bg-[#7C5CFC]/8 border border-[#7C5CFC]/15 px-3.5 py-1.5 text-sm font-medium text-[#7C5CFC] transition-all duration-300 ${scaleVis(10 + i)}`}>{t}</span>
            ))}
          </div>
        </div>

        {/* Personalized insight */}
        <div className={`mb-10 rounded-2xl border border-[#7C5CFC]/20 bg-[#7C5CFC]/5 p-5 transition-all duration-500 ${vis(13)}`}>
          <p className="text-sm font-medium text-zinc-800 leading-relaxed">{getMockInsight(answers)}</p>
        </div>

        {/* Continue */}
        <div className={`text-center transition-all duration-500 ${vis(totalSteps)}`}>
          <button onClick={onContinue}
            className="inline-flex items-center gap-2 rounded-full px-8 py-4 text-base font-semibold text-white transition-all duration-300 hover:scale-105 active:scale-95 animate-[funnel-glow_2s_ease-in-out_infinite]"
            style={{ background: "linear-gradient(135deg, #7C5CFC 0%, #9F7AEA 50%, #7C3AED 100%)" }}>
            Continue &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 12: The Journey ──────────────────────────────────────────────────

const JOURNEY_STAGES = [
  { day: "Day 1", text: "Tasks extracted. Goals tracked. Mood captured.", detail: "You just saw this \u2014 from a single 60-second debrief.", icon: "\u2705" },
  { day: "Day 3", text: "Patterns start connecting between entries.", detail: "\"You mentioned \u2018deadline stress\u2019 3 times this week.\"", icon: "\uD83D\uDD17" },
  { day: "Day 7", text: "Your first weekly report lands.", detail: "A 400-word narrative of your week, written by AI, about YOUR life. \"This week was dominated by work pressure, but your mood lifted on days you exercised.\"", icon: "\uD83D\uDCCA", testimonial: { quote: "Sunday mornings I open my report before I open Instagram.", name: "Jordan K." } },
  { day: "Day 14", text: "Your Life Matrix takes shape.", detail: "See how you\u2019re doing across 6 areas of your life \u2014 Health, Career, Relationships, Growth, Fun, and Purpose.", icon: "\uD83D\uDDFA\uFE0F" },
  { day: "Day 30", text: "Your first monthly memoir.", detail: "A PDF of your entire month. Patterns you\u2019d never see on your own. Progress you didn\u2019t know you were making. Blind spots you\u2019ve been ignoring.", icon: "\uD83D\uDCD6", testimonial: { quote: "I shared my quarterly memoir with my therapist. She said it was the most useful thing I\u2019d ever brought in.", name: "Alex R." } },
  { day: "The Future", text: "A living model of your entire life.", detail: "Day 90: quarterly memoir. Day 365: you know yourself better than you ever have. The longer you use Acuity, the more it understands you.", icon: "\uD83D\uDE80" },
];

function JourneyScreen({ onContinue }: { onContinue: () => void }) {
  const [visibleStage, setVisibleStage] = useState(0);
  const [showBtn, setShowBtn] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    JOURNEY_STAGES.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleStage(i + 1), 600 + i * 1200));
    });
    timers.push(setTimeout(() => setShowBtn(true), 600 + JOURNEY_STAGES.length * 1200 + 400));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 bg-white text-zinc-900">
      <div className="w-full max-w-md">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-12 animate-fade-in">
          Here&rsquo;s how your life changes over 30&nbsp;days.
        </h2>

        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-zinc-200" />

          <div className="space-y-8">
            {JOURNEY_STAGES.map((stage, i) => (
              <div key={i} className={`relative pl-12 transition-all duration-700 ${i < visibleStage ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
                {/* Timeline dot */}
                <div className={`absolute left-2 top-1 h-5 w-5 rounded-full border-2 flex items-center justify-center text-[10px] transition-colors duration-300 ${i < visibleStage ? "border-[#7C5CFC] bg-[#7C5CFC]/10" : "border-zinc-300 bg-white"}`}>
                  <span>{stage.icon}</span>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#7C5CFC] mb-1">{stage.day}</p>
                  <p className="text-sm font-semibold text-zinc-900 mb-1">{stage.text}</p>
                  <p className="text-xs text-zinc-500 leading-relaxed">{stage.detail}</p>
                  {stage.testimonial && (
                    <p className="mt-3 text-xs italic text-zinc-400">
                      &ldquo;{stage.testimonial.quote}&rdquo; &mdash; {stage.testimonial.name}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`mt-12 text-center transition-all duration-500 ${showBtn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <button onClick={onContinue}
            className="inline-flex items-center gap-2 rounded-full px-8 py-4 text-base font-semibold text-white transition-all duration-300 hover:scale-105 active:scale-95 animate-[funnel-glow_2s_ease-in-out_infinite]"
            style={{ background: "linear-gradient(135deg, #7C5CFC 0%, #9F7AEA 50%, #7C3AED 100%)" }}>
            Continue &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 13: Signup ───────────────────────────────────────────────────────

function SignupScreen({ track, onComplete }: { track: (event: string, props?: Record<string, unknown>) => void; onComplete: () => void }) {
  const { status } = useSession();
  const [loading, setLoading] = useState<"google" | "apple" | "email" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      track("funnel_signup_completed", { method: "session" });
      onComplete();
    }
  }, [status, track, onComplete]);

  const handleGoogle = async () => { setLoading("google"); track("funnel_signup_completed", { method: "google" }); await signIn("google", { callbackUrl: "/start?step=paywall" }); };
  const handleApple = async () => { setLoading("apple"); track("funnel_signup_completed", { method: "apple" }); await signIn("apple", { callbackUrl: "/start?step=paywall" }); };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading("email");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, name: name.trim() || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error === "AlreadyRegistered" ? "Account exists. Try signing in." : body.message || "Something went wrong.");
        return;
      }
      track("funnel_signup_completed", { method: "email" });
      const result = await signIn("credentials", { email: email.trim(), password, redirect: false });
      if (!result?.ok) window.location.href = "/start?step=paywall";
    } catch { setError("Something went wrong. Please try again."); } finally { setLoading(null); }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-zinc-900">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold tracking-tight mb-2">Create your account.</h2>
          <p className="text-sm text-zinc-500">Your first real debrief is waiting.</p>
        </div>
        <button onClick={handleGoogle} disabled={loading !== null}
          className="flex w-full items-center justify-center gap-3 rounded-full border border-zinc-200 bg-white px-6 py-3.5 text-[15px] font-semibold text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98] disabled:opacity-50">
          <GoogleLogo />{loading === "google" ? "Redirecting\u2026" : "Continue with Google"}
        </button>
        <button onClick={handleApple} disabled={loading !== null}
          className="mt-3 flex w-full items-center justify-center gap-3 rounded-full bg-black px-6 py-3.5 text-[15px] font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50">
          <AppleLogo />{loading === "apple" ? "Redirecting\u2026" : "Continue with Apple"}
        </button>
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-zinc-200" /><span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">or</span><div className="h-px flex-1 bg-zinc-200" />
        </div>
        {error && <p className="mb-4 text-center text-sm text-red-500">{error}</p>}
        <form onSubmit={handleEmail} className="space-y-3">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" autoComplete="name"
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/20" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/20" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (8+ characters)" autoComplete="new-password" required minLength={8}
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/20" />
          <button type="submit" disabled={loading !== null || !email.trim() || password.length < 8}
            className="w-full rounded-full bg-[#7C5CFC] py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98] disabled:opacity-40 disabled:animate-none animate-[funnel-glow_2s_ease-in-out_infinite]">
            {loading === "email" ? "Creating account\u2026" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Screen 14: Paywall (full selling page) ──────────────────────────────────

function PaywallScreen({ selectedPlan, onPlanChange, onCheckout, loading, error }: {
  selectedPlan: "monthly" | "yearly"; onPlanChange: (p: "monthly" | "yearly") => void;
  onCheckout: () => void; loading: boolean; error: string | null;
}) {
  const [testimonialIdx, setTestimonialIdx] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTestimonialIdx((i) => (i + 1) % PAYWALL_TESTIMONIALS.length), 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <div className="max-w-lg mx-auto px-6 pt-16 pb-40">

        {/* Section 1 — Hook */}
        <section className="text-center mb-16 funnel-screen">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
            Change your life for less than a cup of&nbsp;coffee.
          </h2>
          <p className="mt-4 text-zinc-500 text-base leading-relaxed">
            That latte you buy every morning? Acuity costs less. And it actually changes something.
          </p>
        </section>

        {/* Section 2 — Timeline */}
        <section className="mb-16">
          <h3 className="text-lg font-bold mb-6">What your next 14 days look like:</h3>
          <div className="space-y-4">
            {[
              { day: "Day 1", text: "Tasks extracted. Goals tracked. Mood captured.", badge: "You just saw this" },
              { day: "Day 3", text: "Patterns start forming between your entries" },
              { day: "Day 7", text: "Your first weekly report \u2014 a 400-word narrative of your week" },
              { day: "Day 10", text: "Your Life Matrix takes shape across 6 life domains" },
              { day: "Day 14", text: "You see yourself more clearly than you have in years" },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="shrink-0 mt-0.5 h-5 w-5 rounded-full bg-[#7C5CFC]/10 flex items-center justify-center"><CheckIcon /></span>
                <div>
                  <p className="text-sm font-medium text-zinc-900"><span className="font-bold">{item.day}:</span> {item.text}</p>
                  {item.badge && <span className="text-[11px] text-[#7C5CFC] font-medium">{item.badge}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3 — Social proof */}
        <section className="mb-16 text-center">
          <p className="text-sm font-semibold text-zinc-900 mb-1">
            4.9 <span className="text-amber-400">&#9733;&#9733;&#9733;&#9733;&#9733;</span> from 127+ users
          </p>
          <div className="mt-4 min-h-[80px] relative">
            {PAYWALL_TESTIMONIALS.map((t, i) => (
              <div key={i} className={`transition-opacity duration-500 ${i === testimonialIdx ? "opacity-100" : "opacity-0 absolute inset-0"}`}>
                <p className="text-sm italic text-zinc-600 leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                <p className="mt-2 text-xs font-medium text-zinc-400">&mdash; {t.name}, {t.role}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 4 — Comparison */}
        <section className="mb-16">
          <h3 className="text-lg font-bold mb-5">What else costs {formatDollars(MONTHLY_PRICE_CENTS)} a month?</h3>
          <div className="space-y-3">
            {[
              { emoji: "\u2615", label: "A coffee", desc: "gone in 10 minutes" },
              { emoji: "\uD83D\uDCFA", label: "A streaming service", desc: "passive entertainment" },
              { emoji: "\uD83D\uDDA4", label: "Acuity", desc: "an actual understanding of your own life" },
            ].map((item, i) => (
              <div key={i} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${i === 2 ? "border-[#7C5CFC] bg-[#7C5CFC]/5" : "border-zinc-200 bg-zinc-50"}`}>
                <span className="text-lg">{item.emoji}</span>
                <div>
                  <p className={`text-sm font-medium ${i === 2 ? "text-[#7C5CFC]" : "text-zinc-700"}`}>{item.label}</p>
                  <p className="text-xs text-zinc-400">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 5 — What's included */}
        <section className="mb-16">
          <h3 className="text-lg font-bold mb-5">What&rsquo;s included:</h3>
          <div className="space-y-2.5">
            {INCLUDED_FEATURES.map((f) => (
              <div key={f} className="flex items-center gap-2.5">
                <CheckIcon /><span className="text-sm text-zinc-700">{f}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Section 6 — Reassurance */}
        <section className="mb-8 text-center">
          <p className="text-xs text-zinc-400 leading-relaxed">
            Your data is encrypted and private. Audio is deleted within 24 hours. We never sell your data.
          </p>
        </section>
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-zinc-200 px-6 py-4 z-40">
        <div className="max-w-lg mx-auto">
          {/* Plan toggle */}
          <div className="flex rounded-full border border-zinc-200 p-1 mb-3">
            <button onClick={() => onPlanChange("monthly")}
              className={`flex-1 rounded-full py-2 text-sm font-medium transition ${selectedPlan === "monthly" ? "bg-[#7C5CFC] text-white" : "text-zinc-600"}`}>
              {formatDollars(MONTHLY_PRICE_CENTS)}/month
            </button>
            <button onClick={() => onPlanChange("yearly")}
              className={`flex-1 rounded-full py-2 text-sm font-medium transition ${selectedPlan === "yearly" ? "bg-[#7C5CFC] text-white" : "text-zinc-600"}`}>
              {formatDollars(ANNUAL_PRICE_CENTS)}/year <span className="text-xs opacity-75">save {PRICING.annual.savingsVsMonthly}</span>
            </button>
          </div>

          {error && <p className="mb-2 text-center text-xs text-red-500">{error}</p>}

          <button onClick={onCheckout} disabled={loading}
            className="w-full rounded-full py-3.5 text-[15px] font-semibold text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50 animate-[funnel-glow_2s_ease-in-out_infinite]"
            style={{ background: "linear-gradient(135deg, #7C5CFC 0%, #9F7AEA 50%, #6D28D9 100%)" }}>
            {loading ? "Loading\u2026" : "Start My 14-Day Free Trial"}
          </button>
          <p className="mt-2 text-center text-[11px] text-zinc-400">Cancel anytime. You won&rsquo;t be charged for 14 days.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 15: Download ─────────────────────────────────────────────────────

function DownloadScreen({ track }: { track: (event: string) => void }) {
  const [testimonialIdx, setTestimonialIdx] = useState(0);
  const celebratedRef = useRef(false);

  useEffect(() => {
    if (!celebratedRef.current) {
      celebratedRef.current = true;
      import("canvas-confetti").then((mod) => {
        const confetti = mod.default;
        confetti({ particleCount: 120, spread: 90, origin: { y: 0.4 }, colors: ["#7C5CFC", "#A78BFA", "#C4B5FD", "#F59E0B", "#22C55E"] });
        setTimeout(() => confetti({ particleCount: 60, spread: 120, origin: { y: 0.35, x: 0.3 } }), 250);
        setTimeout(() => confetti({ particleCount: 60, spread: 120, origin: { y: 0.35, x: 0.7 } }), 400);
      });
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setTestimonialIdx((i) => (i + 1) % PAYWALL_TESTIMONIALS.length), 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-zinc-900">
      <div className="max-w-sm w-full text-center">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
          You&rsquo;re in. Your first real debrief is&nbsp;waiting.
        </h2>
        <p className="text-sm text-zinc-500 mb-10">
          Open the app, hit record, and talk for 60 seconds. Acuity handles the rest.
        </p>

        <a href={APP_STORE_URL} onClick={() => track("funnel_app_store_clicked")}
          className="relative inline-block w-full rounded-full px-8 py-4 text-[15px] font-semibold text-white transition hover:brightness-110 active:scale-[0.98] overflow-hidden"
          style={{ background: "linear-gradient(135deg, #7C5CFC 0%, #9F7AEA 50%, #6D28D9 100%)", boxShadow: "0 4px 24px rgba(124,92,252,0.4)" }}>
          <span className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)", backgroundSize: "200% 100%", animation: "funnel-shimmer 2s ease-in-out infinite" }} />
          <span className="relative">Download on the App Store</span>
        </a>

        {/* QR for desktop */}
        <div className="mt-8 hidden sm:block">
          <p className="text-xs text-zinc-400 mb-3">Or scan with your phone</p>
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(APP_STORE_URL)}&bgcolor=ffffff&color=181614`}
            alt="QR code" width={140} height={140} className="mx-auto rounded-lg" />
        </div>

        <p className="mt-10 text-sm text-[#7C5CFC] font-medium">
          Your 14-day free trial is active. No charge until {formatTrialEndDate()}.
        </p>

        {/* Social proof */}
        <div className="mt-8">
          <p className="text-sm font-semibold text-zinc-500 mb-1">
            4.9 <span className="text-amber-400">&#9733;&#9733;&#9733;&#9733;&#9733;</span> from 127+ users
          </p>
          <div className="mt-3 min-h-[60px] relative">
            {PAYWALL_TESTIMONIALS.map((t, i) => (
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
