"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { trackOnboardingEvent } from "@/lib/track-onboarding";
import {
  type ExtractionResult,
  MOOD_LABELS,
} from "@acuity/shared";
import {
  PROCESSING_SLIDES,
  SLIDE_MS,
  MicIcon,
  Spinner,
  bestMimeType,
  extFromMime,
  formatTime,
  MAX_SECONDS,
  MIN_SECONDS,
  AppleLogo,
  GoogleLogo,
} from "@/components/debrief-shared";

// ─── Types ───────────────────────────────────────────────────────────────────

type Step =
  | "pain"
  | "diagnostic1"
  | "diagnostic2"
  | "diagnostic3"
  | "diagnostic4"
  | "diagnostic5"
  | "failed-solution"
  | "promise"
  | "commitment"
  | "mock-extraction"
  | "record"
  | "processing"
  | "extraction"
  | "signup"
  | "paywall"
  | "download";

interface TryApiResult {
  sessionToken: string;
  extraction: ExtractionResult;
  expiresAt: Date;
}

interface DiagnosticAnswers {
  loop?: string;
  duration?: string;
  tried?: string[];
  cost?: string[];
  desire?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const APP_STORE_URL = "https://apps.apple.com/us/app/acuity-daily/id6762633410";

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

function getPersonalizedPromise(answers: DiagnosticAnswers): string {
  const { loop, duration, cost, desire } = answers;

  // Priority: combinations with cost/desire first (more specific)
  if (loop === "Days that blur together" && duration === "Over a year" && cost?.includes("My relationships are suffering")) {
    return "You've been stuck in this loop for over a year, and your relationships are paying the price. Acuity will show you the pattern in 60 seconds of your voice.";
  }
  if (loop === "Work bleeds into life" && cost?.includes("I don't recognize myself anymore")) {
    return "Work has been swallowing your life and you don't even recognize yourself anymore. Acuity will show you exactly where you disappeared.";
  }
  if (loop === "Goals that never become real" && desire === "I'd actually follow through on goals") {
    return "You know what you want. Acuity catches the goals you mention and holds you to them — so this time, you actually follow through.";
  }
  if (loop === "Same fights, same conversations" && cost?.includes("My relationships are suffering")) {
    return "The same arguments keep cycling and your relationships are paying for it. Acuity surfaces the pattern so you can finally break it.";
  }

  // Fallback: original combinations
  if (loop === "Days that blur together" && duration === "Over a year") {
    return "You've been stuck in this loop for over a year. Acuity will show you the pattern in 60 seconds of your voice.";
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

// ─── In-app browser detection ────────────────────────────────────────────────

function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /FBAN|FBAV|Instagram|FB_IAB|FBIOS/i.test(ua);
}

// Mock extraction for in-app browser path (can't record in FB/IG WebView)
const MOCK_EXTRACTION = {
  mood: "good",
  summary: "A productive day with a gym session and two big meetings. Feeling stretched but making progress on the quarterly goal.",
  tasks: [
    { title: "Follow up on client proposal", priority: "HIGH" },
    { title: "Book dentist appointment", priority: "MEDIUM" },
    { title: "Review budget spreadsheet", priority: "LOW" },
  ],
  goals: [{ title: "Close 3 new deals this quarter — mentioned 4 of last 5 entries" }],
  themes: ["Work-Life Balance", "Fitness Goals", "Career Growth"],
};

// ─── Tracking helper ─────────────────────────────────────────────────────────

function useFunnelTracker() {
  const sessionId = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `funnel_${Date.now()}_${Math.random().toString(36).slice(2)}`
  );

  return useCallback((event: string) => {
    trackOnboardingEvent(event, { sessionToken: sessionId.current });
  }, []);
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function OnboardingFunnel() {
  const { data: session, status: authStatus } = useSession();
  const [step, setStep] = useState<Step>("pain");
  const [answers, setAnswers] = useState<DiagnosticAnswers>({});
  const [apiResult, setApiResult] = useState<TryApiResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("monthly");
  const [inApp, setInApp] = useState(false);
  const track = useFunnelTracker();

  // Detect in-app browser on mount
  useEffect(() => {
    if (isInAppBrowser()) {
      setInApp(true);
      track("funnel_inapp_browser_detected");
    }
  }, [track]);

  // Check URL params for return from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("step") === "download") {
      setStep("download");
    } else if (params.get("step") === "paywall") {
      setStep("paywall");
    }
  }, []);

  // If already logged in with active subscription, skip to download
  useEffect(() => {
    if (authStatus === "authenticated" && session?.user) {
      // Check if already subscribed
      fetch("/api/user/me")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.user?.subscriptionStatus === "PRO") {
            setStep("download");
          } else if (step === "pain" && data?.user) {
            // Logged in but not paid — go to paywall
            setStep("paywall");
          }
        })
        .catch(() => {});
    }
  }, [authStatus, session, step]);

  // Track step views
  useEffect(() => {
    const eventMap: Record<string, string> = {
      pain: "funnel_pain_hook_viewed",
      promise: "funnel_promise_viewed",
      extraction: "funnel_extraction_viewed",
      paywall: "funnel_paywall_viewed",
      download: "funnel_download_screen_viewed",
    };
    if (eventMap[step]) track(eventMap[step]);
  }, [step, track]);

  const goBack = () => {
    const order: Step[] = ["pain", "diagnostic1", "diagnostic2", "diagnostic3", "diagnostic4", "diagnostic5", "failed-solution", "promise", "commitment", "mock-extraction", "record", "processing", "extraction", "signup", "paywall", "download"];
    const idx = order.indexOf(step);
    if (idx > 0) setStep(order[idx - 1]);
  };

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/onboarding/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: selectedPlan }),
      });
      const data = await res.json();
      if (data.url) {
        track("funnel_payment_completed");
        window.location.href = data.url;
      } else {
        setApiError(data.error || "Checkout failed");
        setCheckoutLoading(false);
      }
    } catch {
      setApiError("Something went wrong. Please try again.");
      setCheckoutLoading(false);
    }
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen">
      {/* Global funnel animations */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes funnel-glow {
          0%, 100% { box-shadow: 0 4px 16px rgba(124,92,252,0.3); }
          50% { box-shadow: 0 4px 28px rgba(124,92,252,0.55), 0 0 8px rgba(124,92,252,0.2); }
        }
        @keyframes funnel-slide-up {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes funnel-fade-word {
          from { opacity: 0; transform: translateY(8px); }
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
        .funnel-screen { animation: funnel-slide-up 0.3s ease-out both; }
        .funnel-card-stagger { animation: funnel-card-in 0.3s ease-out both; }
        .funnel-bounce { animation: funnel-bounce-in 0.4s ease-out both; }
      `}} />
      {/* Back button (not on first/last steps) */}
      {step !== "pain" && step !== "download" && step !== "processing" && (
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

      {step === "pain" && (
        <PainHookScreen onContinue={() => setStep("diagnostic1")} />
      )}
      {step === "diagnostic1" && (
        <DiagnosticScreen
          question="What's the loop you can't break?"
          options={DIAGNOSTIC1_OPTIONS}
          multiSelect={false}
          testimonial={{ quote: "I picked 'days that blur together.' Seeing it written down hit different.", name: "David K." }}
          onSelect={(val) => {
            setAnswers((a) => ({ ...a, loop: val as string }));
            track("funnel_diagnostic_1_completed");
            setStep("diagnostic2");
          }}
        />
      )}
      {step === "diagnostic2" && (
        <DiagnosticScreen
          question="How long have you been stuck in this loop?"
          options={DIAGNOSTIC2_OPTIONS}
          multiSelect={false}
          testimonial={{ quote: "Over a year. It was uncomfortable to admit, but that's what made me try it.", name: "Sarah K." }}
          onSelect={(val) => {
            setAnswers((a) => ({ ...a, duration: val as string }));
            track("funnel_diagnostic_2_completed");
            setStep("diagnostic3");
          }}
        />
      )}
      {step === "diagnostic3" && (
        <DiagnosticMultiScreen
          question="What have you tried to fix it?"
          options={DIAGNOSTIC3_OPTIONS}
          testimonial={{ quote: "I tried three journaling apps. This is the first one that stuck because I just talk.", name: "Jamie L." }}
          onSubmit={(vals) => {
            setAnswers((a) => ({ ...a, tried: vals }));
            track("funnel_diagnostic_3_completed");
            setStep("diagnostic4");
          }}
        />
      )}
      {step === "diagnostic4" && (
        <DiagnosticMultiScreen
          question="What's it costing you?"
          options={DIAGNOSTIC4_OPTIONS}
          testimonial={{ quote: "My partner noticed the difference before I did. I'm actually present when I get home now.", name: "David K." }}
          onSubmit={(vals) => {
            setAnswers((a) => ({ ...a, cost: vals }));
            track("funnel_diagnostic_cost");
            setStep("diagnostic5");
          }}
        />
      )}
      {step === "diagnostic5" && (
        <DiagnosticScreen
          question="What would change if you could finally see the pattern?"
          options={DIAGNOSTIC5_OPTIONS}
          multiSelect={false}
          testimonial={{ quote: "I finally feel like I'm in control of my week instead of my week controlling me.", name: "Marcus T." }}
          onSelect={(val) => {
            setAnswers((a) => ({ ...a, desire: val as string }));
            track("funnel_diagnostic_desire");
            setStep("failed-solution");
          }}
        />
      )}
      {step === "failed-solution" && (
        <AtmosphericScreen
          headline="Written journaling asks for discipline. Acuity just asks for one minute."
          subtext="No typing. No prompts. No blank pages. Just talk."
          testimonial={{ quote: "I used to let tasks pile up in my head until 2 AM. Now I debrief into Acuity and actually sleep.", name: "Sarah K." }}
          onContinue={() => setStep("promise")}
        />
      )}
      {step === "promise" && (
        <AtmosphericScreen
          headline={getPersonalizedPromise(answers)}
          subtext="Over time, the insights get richer as you map your own life in 60 seconds a day."
          testimonial={{ quote: "The weekly reports are unreal. It's like having a therapist and a project manager rolled into one.", name: "Marcus T." }}
          typewriter
          onContinue={() => setStep("commitment")}
        />
      )}
      {step === "commitment" && (
        <CommitmentScreen
          track={track}
          onComplete={() => setStep(inApp ? "mock-extraction" : "record")}
        />
      )}
      {step === "mock-extraction" && (
        <MockExtractionScreen onContinue={() => setStep("signup")} />
      )}
      {step === "record" && (
        <RecordScreen
          track={track}
          onStartedProcessing={() => setStep("processing")}
          onUploaded={(result) => {
            setApiResult(result);
          }}
          onError={(err) => setApiError(err)}
        />
      )}
      {step === "processing" && (
        <ProcessingScreen
          apiResult={apiResult}
          apiError={apiError}
          onComplete={() => setStep("extraction")}
          onError={() => setStep("signup")}
        />
      )}
      {step === "extraction" && apiResult && (
        <ExtractionScreen
          extraction={apiResult.extraction}
          onContinue={() => setStep("signup")}
        />
      )}
      {step === "signup" && (
        <SignupScreen
          track={track}
          onComplete={() => setStep("paywall")}
        />
      )}
      {step === "paywall" && (
        <PaywallScreen
          selectedPlan={selectedPlan}
          onPlanChange={setSelectedPlan}
          onCheckout={handleCheckout}
          loading={checkoutLoading}
          error={apiError}
        />
      )}
      {step === "download" && (
        <DownloadScreen track={track} />
      )}
    </div>
  );
}

// ─── Shared: subtle testimonial at bottom of screen ──────────────────────────

function ScreenTestimonial({ quote, name }: { quote: string; name: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 500); return () => clearTimeout(t); }, []);
  return (
    <p className={`mt-10 text-xs italic text-zinc-400 transition-opacity duration-500 ${visible ? "opacity-100" : "opacity-0"}`}>
      "{quote}" — {name}
    </p>
  );
}

// ─── Screen Components ───────────────────────────────────────────────────────

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
      {/* Subtle living gradient background */}
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
          <button
            onClick={onContinue}
            className="rounded-full bg-[#7C5CFC] px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function DiagnosticScreen({
  question,
  options,
  multiSelect,
  onSelect,
  testimonial,
}: {
  question: string;
  options: string[];
  multiSelect: boolean;
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
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-10" style={{ animation: "funnel-slide-up 0.3s ease-out" }}>
          {question}
        </h2>
        <div className="space-y-3">
          {options.map((opt, i) => (
            <button
              key={opt}
              onClick={() => handleSelect(opt)}
              className={`w-full text-left rounded-xl border px-5 py-4 text-[15px] transition-all duration-200 active:scale-[0.98] funnel-card-stagger ${
                selected === opt
                  ? "border-[#7C5CFC] bg-[#7C5CFC]/10 text-zinc-900 animate-[funnel-pulse-select_0.2s_ease-out]"
                  : selected
                    ? "border-zinc-200 bg-zinc-50 text-zinc-700 opacity-50"
                    : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
              }`}
              style={{ animationDelay: `${i * 100}ms` }}
            >
              {selected === opt && <span className="mr-2 text-[#7C5CFC]">&#10003;</span>}
              {opt}
            </button>
          ))}
        </div>
        {testimonial && <ScreenTestimonial quote={testimonial.quote} name={testimonial.name} />}
        <div className={`mt-8 transition-all duration-300 ${selected ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <button
            onClick={() => { if (selected) onSelect(selected); }}
            disabled={!selected}
            className="w-full rounded-full bg-[#7C5CFC] py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function DiagnosticMultiScreen({
  question,
  options,
  onSubmit,
  testimonial,
}: {
  question: string;
  options: string[];
  onSubmit: (vals: string[]) => void;
  testimonial?: { quote: string; name: string };
}) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (opt: string) => {
    const isExclusive = opt === "Nothing — I just push through";
    if (isExclusive) {
      setSelected([opt]);
    } else {
      setSelected((prev) => {
        const without = prev.filter((o) => o !== "Nothing — I just push through");
        return without.includes(opt) ? without.filter((o) => o !== opt) : [...without, opt];
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-zinc-900">
      <div className="max-w-md w-full funnel-screen">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-10">
          {question}
        </h2>
        <div className="space-y-3">
          {options.map((opt, i) => (
            <button
              key={opt}
              onClick={() => { toggle(opt); if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10); }}
              className={`w-full text-left rounded-xl border px-5 py-4 text-[15px] transition-all duration-200 active:scale-[0.98] funnel-card-stagger ${
                selected.includes(opt)
                  ? "border-[#7C5CFC] bg-[#7C5CFC]/10 text-zinc-900 animate-[funnel-pulse-select_0.2s_ease-out]"
                  : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
              }`}
              style={{ animationDelay: `${i * 100}ms` }}
            >
              {selected.includes(opt) && <span className="mr-2 text-[#7C5CFC]">&#10003;</span>}
              {opt}
            </button>
          ))}
        </div>
        {testimonial && <ScreenTestimonial quote={testimonial.quote} name={testimonial.name} />}
        <button
          onClick={() => onSubmit(selected.length > 0 ? selected : ["Nothing — I just push through"])}
          disabled={selected.length === 0}
          className="mt-8 w-full rounded-full bg-[#7C5CFC] py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98] disabled:opacity-40 disabled:animate-none animate-[funnel-glow_2s_ease-in-out_infinite]"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function AtmosphericScreen({
  headline,
  subtext,
  onContinue,
  testimonial,
  typewriter,
}: {
  headline: string;
  subtext: string;
  onContinue: () => void;
  testimonial?: { quote: string; name: string };
  typewriter?: boolean;
}) {
  const [typedChars, setTypedChars] = useState(0);
  const [showSub, setShowSub] = useState(false);
  const [showBtn, setShowBtn] = useState(false);

  useEffect(() => {
    if (typewriter) {
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
    } else {
      setTimeout(() => setShowSub(true), 600);
      setTimeout(() => setShowBtn(true), 1000);
    }
  }, [headline, typewriter]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-zinc-900">
      <div className="max-w-md text-center funnel-screen">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-snug min-h-[3em]">
          {typewriter ? headline.slice(0, typedChars) : headline}
          {typewriter && typedChars < headline.length && <span className="inline-block w-0.5 h-6 bg-[#7C5CFC] ml-0.5 animate-pulse" />}
        </h2>
        <p className={`mt-6 text-zinc-500 text-sm leading-relaxed transition-all duration-500 ${showSub ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
          {subtext}
        </p>
        {testimonial && <ScreenTestimonial quote={testimonial.quote} name={testimonial.name} />}
        <div className={`mt-8 transition-all duration-300 ${showBtn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <button
            onClick={onContinue}
            className="rounded-full bg-[#7C5CFC] px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function RecordScreen({
  track,
  onStartedProcessing,
  onUploaded,
  onError,
}: {
  track: (event: string) => void;
  onStartedProcessing: () => void;
  onUploaded: (result: TryApiResult) => void;
  onError: (err: string) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "recording" | "uploading">("idle");
  const [elapsed, setElapsed] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  const startRecording = async () => {
    track("funnel_recording_started");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: bestMimeType() });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        const baseMime = mr.mimeType.split(";")[0] || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: baseMime });
        upload(blob, baseMime);
      };
      mr.start(1000);
      startTimeRef.current = Date.now();
      setPhase("recording");
      timerRef.current = setInterval(() => {
        const secs = Math.round((Date.now() - startTimeRef.current) / 1000);
        setElapsed(secs);
        if (secs >= MAX_SECONDS) stopRecording();
      }, 500);
    } catch {
      onError("Microphone access denied. Try signing up directly.");
    }
  };

  const stopRecording = () => {
    if (elapsed < MIN_SECONDS) return;
    mediaRecorderRef.current?.stop();
  };

  const upload = (blob: Blob, mime: string) => {
    track("funnel_recording_completed");
    // Immediately transition to processing slides — don't wait for API
    onStartedProcessing();
    const fd = new FormData();
    fd.append("audio", blob, `recording.${extFromMime(mime)}`);

    console.log("[funnel] Starting /api/try-recording upload...");
    fetch("/api/try-recording", { method: "POST", body: fd })
      .then(async (res) => {
        console.log("[funnel] /api/try-recording response:", res.status);
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          console.error("[funnel] API error:", res.status, errBody);
          throw new Error(`Recording failed (${res.status})`);
        }
        const body = await res.json();
        console.log("[funnel] Extraction received, transitioning to reveal");
        onUploaded({
          sessionToken: body.sessionToken,
          extraction: body.extraction as ExtractionResult,
          expiresAt: new Date(body.expiresAt as string),
        });
      })
      .catch((err) => {
        console.error("[funnel] Upload failed:", err);
        onError(err.message);
      });
  };

  const handleMicClick = () => {
    if (phase === "recording") return stopRecording();
    if (phase === "idle") return startRecording();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-zinc-900 transition-colors duration-1000">
      <div className="max-w-md text-center">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Talk for 60 seconds about what&rsquo;s on your mind right now.
        </h2>
        <p className="mt-4 text-sm text-zinc-500">
          No judgment. No structure. Just talk.
        </p>

        {/* Mic button */}
        <div className="mt-12 flex justify-center">
          <button
            onClick={handleMicClick}
            disabled={phase === "uploading"}
            className={`relative flex items-center justify-center rounded-full transition-all duration-300 ${
              phase === "recording"
                ? "h-32 w-32 scale-110"
                : "h-32 w-32 hover:scale-105 active:scale-95"
            }`}
            style={
              phase === "recording"
                ? { background: "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)", boxShadow: "0 8px 32px rgba(239,68,68,0.35)" }
                : { background: "linear-gradient(135deg, #7C5CFC 0%, #9F7AEA 50%, #7C3AED 100%)", boxShadow: "0 8px 40px rgba(124,92,252,0.3)" }
            }
          >
            {phase === "uploading" ? (
              <Spinner />
            ) : phase === "recording" ? (
              elapsed < MIN_SECONDS ? (
                <div className="flex items-center gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className="w-1.5 rounded-full bg-white animate-pulse" style={{ height: 20 + Math.random() * 12, animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              ) : (
                <span className="h-10 w-10 rounded-lg bg-white" />
              )
            ) : (
              <MicIcon size={48} />
            )}
          </button>
        </div>

        {/* Timer */}
        {phase === "recording" && (
          <p className="mt-6 font-mono text-lg text-zinc-600">{formatTime(elapsed)}</p>
        )}

        {phase === "idle" && (
          <p className="mt-8 text-sm text-zinc-400">
            No wrong answers. Most people start with &ldquo;Today I...&rdquo;
          </p>
        )}

        {phase === "uploading" && (
          <p className="mt-6 text-sm text-zinc-500">Processing your debrief...</p>
        )}
      </div>
    </div>
  );
}

function ProcessingScreen({
  apiResult,
  apiError,
  onComplete,
  onError,
}: {
  apiResult: TryApiResult | null;
  apiError: string | null;
  onComplete: () => void;
  onError: () => void;
}) {
  const [slideIdx, setSlideIdx] = useState(0);
  const [fadeState, setFadeState] = useState<"in" | "out">("in");
  const completedRef = useRef(false);

  const STATUS_TEXTS = [
    "Finding the pattern...",
    "Reading between your words...",
    "Mapping what's on your mind...",
    "Building your first snapshot...",
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      // Start fade out
      setFadeState("out");
      // After fade out, swap slide and fade in
      setTimeout(() => {
        setSlideIdx((i) => {
          const next = i + 1;
          if (next >= PROCESSING_SLIDES.length) return i;
          return next;
        });
        setFadeState("in");
      }, 400);
    }, SLIDE_MS);
    return () => clearInterval(interval);
  }, []);

  // Advance when API result arrives
  useEffect(() => {
    if (apiResult && !completedRef.current) {
      completedRef.current = true;
      console.log("[funnel] ProcessingScreen: apiResult received, advancing in 1.5s");
      setTimeout(onComplete, 1500);
    }
  }, [apiResult, onComplete]);

  // Handle API errors — skip to signup after a delay
  useEffect(() => {
    if (apiError && !completedRef.current) {
      completedRef.current = true;
      console.error("[funnel] ProcessingScreen: API error, skipping to signup:", apiError);
      setTimeout(onError, 2000);
    }
  }, [apiError, onError]);

  const slide = PROCESSING_SLIDES[slideIdx];
  const statusText = STATUS_TEXTS[slideIdx % STATUS_TEXTS.length];
  const progressPct = Math.min(100, ((slideIdx + 1) / PROCESSING_SLIDES.length) * 100);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-zinc-900">
      <div className="max-w-sm w-full text-center">
        {/* Slide content — fades as one group */}
        <div
          className="transition-all duration-400 ease-out min-h-[200px] flex flex-col justify-center"
          style={{
            opacity: fadeState === "in" ? 1 : 0,
            transform: fadeState === "in" ? "translateY(0)" : "translateY(-12px)",
            transition: "opacity 0.4s ease-out, transform 0.4s ease-out",
          }}
        >
          <p className="text-xs font-bold uppercase tracking-wider text-[#7C5CFC] mb-3">
            {slide.label}
          </p>
          <h3 className="text-xl font-bold mb-3">{slide.text}</h3>
          {slide.testimonial && (
            <blockquote className="mt-4 mb-4">
              <p className="text-sm italic text-zinc-500 leading-relaxed">
                "{slide.testimonial.quote}"
              </p>
              <cite className="mt-2 block text-xs font-medium not-italic text-zinc-400">
                — {slide.testimonial.name}
              </cite>
            </blockquote>
          )}
          <p className="mt-4 text-xs text-zinc-400 animate-pulse">{statusText}</p>
        </div>

        {/* Progress bar — persistent, no fade */}
        <div className="mt-8">
          <div className="h-1 w-full rounded-full bg-zinc-200 overflow-hidden">
            <div
              className="h-full bg-[#7C5CFC]"
              style={{ width: `${progressPct}%`, transition: "width 1s ease-out" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ExtractionScreen({
  extraction,
  onContinue,
}: {
  extraction: ExtractionResult;
  onContinue: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(0);
  const items: { type: string; label: string; value: string }[] = [];

  if (extraction.mood) items.push({ type: "mood", label: "Mood", value: MOOD_LABELS[extraction.mood] || extraction.mood });
  extraction.tasks.forEach((t) => items.push({ type: "task", label: "Task", value: t.title }));
  extraction.goals.forEach((g) => items.push({ type: "goal", label: "Goal", value: g.title }));
  extraction.themes.forEach((t) => items.push({ type: "theme", label: "Theme", value: t }));

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    items.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleCount(i + 1), 400 + i * 200));
    });
    return () => timers.forEach(clearTimeout);
  }, [items.length]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-white text-zinc-900">
      <div className="max-w-md w-full">
        <div className="space-y-3 mb-10">
          {items.slice(0, visibleCount).map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 funnel-bounce"
            >
              <span className="shrink-0 rounded-md bg-[#7C5CFC]/10 px-2 py-0.5 text-[11px] font-bold uppercase text-[#7C5CFC]">
                {item.label}
              </span>
              <span className="text-sm text-zinc-700">{item.value}</span>
            </div>
          ))}
        </div>

        {visibleCount >= items.length && (
          <div className="text-center animate-fade-in">
            <p className="text-lg font-bold text-zinc-900 mb-2">
              That&rsquo;s what 60 seconds gets you.
            </p>
            <p className="text-sm text-zinc-500 mb-8">
              Do this daily and every Sunday you&rsquo;ll get a report showing how your life is actually going.
            </p>
            <button
              onClick={onContinue}
              className="rounded-full bg-[#7C5CFC] px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]"
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SignupScreen({
  track,
  onComplete,
}: {
  track: (event: string) => void;
  onComplete: () => void;
}) {
  const { status } = useSession();
  const [loading, setLoading] = useState<"google" | "apple" | "email" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // If already authenticated, advance
  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/try-recording/claim", { method: "POST" }).catch(() => {});
      track("funnel_signup_completed");
      onComplete();
    }
  }, [status, track, onComplete]);

  const handleGoogle = async () => {
    setLoading("google");
    track("funnel_signup_completed");
    await signIn("google", { callbackUrl: "/start?step=paywall" });
  };

  const handleApple = async () => {
    setLoading("apple");
    track("funnel_signup_completed");
    await signIn("apple", { callbackUrl: "/start?step=paywall" });
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading("email");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, name: name.trim() || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error === "AlreadyRegistered" ? "Account exists. Try signing in." : body.message || "Something went wrong.");
        return;
      }
      track("funnel_signup_completed");
      // Sign in with credentials
      const result = await signIn("credentials", { email: email.trim(), password, redirect: false });
      if (result?.ok) {
        // useEffect above will detect authenticated status and advance
      } else {
        // Fallback: redirect manually
        window.location.href = "/start?step=paywall";
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-zinc-900">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold tracking-tight mb-2">
            Save your debrief and start your free trial.
          </h2>
          <p className="text-sm text-zinc-500">
            Your tasks, goals, and insights will be saved to your account.
          </p>
        </div>

        {/* OAuth */}
        <button
          onClick={handleGoogle}
          disabled={loading !== null}
          className="flex w-full items-center justify-center gap-3 rounded-full border border-zinc-200 bg-white px-6 py-3.5 text-[15px] font-semibold text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98] disabled:opacity-50"
        >
          <GoogleLogo />
          {loading === "google" ? "Redirecting…" : "Continue with Google"}
        </button>

        <button
          onClick={handleApple}
          disabled={loading !== null}
          className="mt-3 flex w-full items-center justify-center gap-3 rounded-full bg-black px-6 py-3.5 text-[15px] font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
        >
          <AppleLogo />
          {loading === "apple" ? "Redirecting…" : "Continue with Apple"}
        </button>

        {/* Divider */}
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-zinc-200" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">or</span>
          <div className="h-px flex-1 bg-zinc-200" />
        </div>

        {/* Email form */}
        {error && (
          <p className="mb-4 text-center text-sm text-red-500">{error}</p>
        )}
        <form onSubmit={handleEmail} className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name (optional)"
            autoComplete="name"
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/20"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/20"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (8+ characters)"
            autoComplete="new-password"
            required
            minLength={8}
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/20"
          />
          <button
            type="submit"
            disabled={loading !== null || !email.trim() || password.length < 8}
            className="w-full rounded-full bg-[#7C5CFC] py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98] disabled:opacity-40 disabled:animate-none animate-[funnel-glow_2s_ease-in-out_infinite]"
          >
            {loading === "email" ? "Creating account…" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}

function PaywallScreen({
  selectedPlan,
  onPlanChange,
  onCheckout,
  loading,
  error,
}: {
  selectedPlan: "monthly" | "yearly";
  onPlanChange: (plan: "monthly" | "yearly") => void;
  onCheckout: () => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-white text-zinc-900">
      <div className="max-w-sm w-full">
        <h2 className="text-2xl font-bold tracking-tight text-center mb-2">
          You&rsquo;ve already started. Keep going.
        </h2>
        <p className="text-sm text-zinc-500 text-center mb-8">
          All of this is free for 30 days.
        </p>

        {/* What they unlock */}
        <div className="space-y-3 mb-8">
          <UnlockItem week="Week 1" text="Daily task extraction + mood tracking" badge="You just did this" />
          <UnlockItem week="Week 2" text="Patterns start forming" />
          <UnlockItem week="Week 3" text="Your Life Matrix takes shape" />
          <UnlockItem week="Week 4" text="Your first monthly memoir" />
        </div>

        {/* Plan toggle */}
        <div className="flex rounded-full border border-zinc-200 p-1 mb-6">
          <button
            onClick={() => onPlanChange("monthly")}
            className={`flex-1 rounded-full py-2.5 text-sm font-medium transition ${
              selectedPlan === "monthly" ? "bg-[#7C5CFC] text-white" : "text-zinc-600"
            }`}
          >
            $4.99/month
          </button>
          <button
            onClick={() => onPlanChange("yearly")}
            className={`flex-1 rounded-full py-2.5 text-sm font-medium transition ${
              selectedPlan === "yearly" ? "bg-[#7C5CFC] text-white" : "text-zinc-600"
            }`}
          >
            $39.99/year
            <span className="ml-1 text-xs opacity-75">save 33%</span>
          </button>
        </div>

        {error && (
          <p className="mb-4 text-center text-sm text-red-500">{error}</p>
        )}

        <button
          onClick={onCheckout}
          disabled={loading}
          className="w-full rounded-full py-4 text-[15px] font-semibold text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, #7C5CFC 0%, #9F7AEA 50%, #6D28D9 100%)",
            boxShadow: "0 4px 16px rgba(124,92,252,0.3)",
          }}
        >
          {loading ? "Loading…" : "Start My 30-Day Free Trial"}
        </button>

        <p className="mt-4 text-center text-xs text-zinc-400">
          Cancel anytime. You won&rsquo;t be charged during your trial.
        </p>
      </div>
    </div>
  );
}

function UnlockItem({ week, text, badge }: { week: string; text: string; badge?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 mt-0.5 h-5 w-5 rounded-full bg-[#7C5CFC]/10 flex items-center justify-center">
        <svg className="h-3 w-3 text-[#7C5CFC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
      <div>
        <p className="text-sm font-medium text-zinc-900">
          {week}: {text}
        </p>
        {badge && (
          <span className="text-[11px] text-[#7C5CFC] font-medium">{badge}</span>
        )}
      </div>
    </div>
  );
}

function CommitmentScreen({
  track,
  onComplete,
}: {
  track: (event: string) => void;
  onComplete: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [abandonCount, setAbandonCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  const HOLD_DURATION = 3000; // 3 seconds

  const startHold = () => {
    setHolding(true);
    startTimeRef.current = Date.now();
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([10, 50, 10, 50, 10]);
    }
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(1, elapsed / HOLD_DURATION);
      setProgress(pct);
      if (typeof navigator !== "undefined" && navigator.vibrate && pct < 1) {
        navigator.vibrate(5);
      }
      if (pct >= 1) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setHolding(false);
        track("funnel_commitment_completed");
        // Confetti burst on completion
        import("canvas-confetti").then((mod) => {
          const confetti = mod.default;
          confetti({ particleCount: 100, spread: 80, origin: { y: 0.5 }, colors: ["#7C5CFC", "#A78BFA", "#C4B5FD", "#F59E0B", "#22C55E"] });
          // Second burst slightly delayed
          setTimeout(() => confetti({ particleCount: 50, spread: 100, origin: { y: 0.4, x: 0.3 } }), 200);
          setTimeout(() => confetti({ particleCount: 50, spread: 100, origin: { y: 0.4, x: 0.7 } }), 350);
        });
        // Transition to recording after confetti starts
        setTimeout(onComplete, 800);
      }
    }, 16);
  };

  const endHold = () => {
    if (!holding) return;
    if (progress < 1) {
      setAbandonCount((c) => {
        const next = c + 1;
        if (next >= 3) track("funnel_commitment_abandoned");
        return next;
      });
    }
    setHolding(false);
    setProgress(0);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  return (
    <>
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-zinc-900 select-none"
      >
        <div className="max-w-md text-center">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-12">
            Hold to commit to one minute a day for a life of clarity.
          </h2>

          {/* Hold circle with progress ring */}
          <div className="relative inline-flex items-center justify-center">
            <svg className="h-40 w-40" viewBox="0 0 120 120">
              {/* Background ring */}
              <circle cx="60" cy="60" r="54" fill="none" stroke="#e4e4e7" strokeWidth="4" />
              {/* Progress ring */}
              <circle
                cx="60" cy="60" r="54"
                fill="none"
                stroke="#7C5CFC"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 54}`}
                strokeDashoffset={`${2 * Math.PI * 54 * (1 - progress)}`}
                transform="rotate(-90 60 60)"
                className="transition-[stroke-dashoffset] duration-100"
              />
            </svg>
            {/* Touch target */}
            <button
              onMouseDown={startHold}
              onMouseUp={endHold}
              onMouseLeave={endHold}
              onTouchStart={startHold}
              onTouchEnd={endHold}
              className={`absolute inset-4 rounded-full bg-[#7C5CFC]/5 border border-zinc-200 flex items-center justify-center transition active:bg-[#7C5CFC]/10 ${!holding && progress === 0 ? "animate-[funnel-breathe_2s_ease-in-out_infinite]" : ""}`}
              aria-label="Hold to commit"
            >
              <span className="text-3xl">{progress >= 1 ? "✓" : ""}</span>
            </button>
          </div>

          <p className="mt-8 text-xs text-zinc-400">
            {holding ? "Keep holding..." : "Press and hold the circle"}
          </p>
        </div>
      </div>
    </>
  );
}

function MockExtractionScreen({ onContinue }: { onContinue: () => void }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const items = [
    { label: "Mood", value: "Good · Energy 7/10" },
    { label: "Task", value: "Follow up on client proposal (HIGH)" },
    { label: "Task", value: "Book dentist appointment (MEDIUM)" },
    { label: "Task", value: "Review budget spreadsheet (LOW)" },
    { label: "Goal", value: "Close 3 new deals this quarter — mentioned 4 of last 5 entries" },
    { label: "Theme", value: "Work-Life Balance" },
    { label: "Theme", value: "Fitness Goals" },
    { label: "Theme", value: "Career Growth" },
  ];

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    items.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleCount(i + 1), 400 + i * 200));
    });
    return () => timers.forEach(clearTimeout);
  }, [items.length]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-white text-zinc-900">
      <div className="max-w-md w-full">
        <p className="text-sm text-zinc-500 text-center mb-6">
          Here's what Acuity pulls from a single 60-second debrief:
        </p>

        <div className="space-y-3 mb-10">
          {items.slice(0, visibleCount).map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 funnel-bounce"
            >
              <span className="shrink-0 rounded-md bg-[#7C5CFC]/10 px-2 py-0.5 text-[11px] font-bold uppercase text-[#7C5CFC]">
                {item.label}
              </span>
              <span className="text-sm text-zinc-700">{item.value}</span>
            </div>
          ))}
        </div>

        {visibleCount >= items.length && (
          <div className="text-center animate-fade-in">
            <p className="text-lg font-bold text-zinc-900 mb-2">
              That's what 60 seconds gets you.
            </p>
            <p className="text-sm text-zinc-500 mb-8">
              Your first real debrief happens in the app.
            </p>
            <button
              onClick={onContinue}
              className="rounded-full bg-[#7C5CFC] px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]"
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DownloadScreen({ track }: { track: (event: string) => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-zinc-900">
      <div className="max-w-sm w-full text-center">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
          You're all set. Get Acuity on your phone.
        </h2>
        <p className="text-sm text-zinc-500 mb-10">
          Your debrief, tasks, and goals are waiting for you in the app.
        </p>

        <a
          href={APP_STORE_URL}
          onClick={() => track("funnel_app_store_clicked")}
          className="inline-block w-full rounded-full px-8 py-4 text-[15px] font-semibold text-white transition hover:brightness-110 active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #7C5CFC 0%, #9F7AEA 50%, #6D28D9 100%)", boxShadow: "0 4px 16px rgba(124,92,252,0.3)" }}
        >
          Download on the App Store
        </a>

        {/* QR for desktop */}
        <div className="mt-8 hidden sm:block">
          <p className="text-xs text-zinc-400 mb-3">Or scan with your phone</p>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(APP_STORE_URL)}&bgcolor=ffffff&color=181614`}
            alt="QR code"
            width={140}
            height={140}
            className="mx-auto rounded-lg"
          />
        </div>

        <p className="mt-10 text-sm text-[#7C5CFC] font-medium">
          Your 30-day free trial has started. Open the app to keep the streak going.
        </p>
      </div>
    </div>
  );
}
