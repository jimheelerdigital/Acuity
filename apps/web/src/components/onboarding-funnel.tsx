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
import {
  type Branch,
  type Question,
  ENTRY_QUESTION,
  BRANCH_QUESTIONS,
  SHARED_QUESTIONS,
  buildMirrorLines,
  PROCESSING_STAGES,
  SNAPSHOT_TEMPLATES,
  DESIRE_TO_THEME,
  getSnapshotGoal,
  TIMELINE_TEMPLATES,
  PAYWALL_HOOKS,
  PRICING_COPY,
} from "@/lib/funnel-config";

// ─── Types ──────────────────────────────────────────────────────────────────

type Step =
  | "entry"
  | "branch-q2" | "branch-q3" | "branch-q4"
  | "shared-q5" | "shared-q6" | "shared-q7" | "shared-q8" | "shared-q9"
  | "mirror"
  | "commit"
  | "processing"
  | "snapshot"
  | "timeline"
  | "paywall"
  | "download";

const STEP_ORDER: Step[] = [
  "entry", "branch-q2", "branch-q3", "branch-q4",
  "shared-q5", "shared-q6", "shared-q7", "shared-q8", "shared-q9",
  "mirror", "commit", "processing", "snapshot", "timeline",
  "paywall", "download",
];

const TOTAL_STEPS = STEP_ORDER.length;

// ─── Constants ──────────────────────────────────────────────────────────────

const APP_STORE_URL = "https://apps.apple.com/us/app/acuity-daily/id6762633410";

const PAYWALL_OUTCOMES = [
  { icon: "\uD83D\uDCCB", title: "Never lose a task again", desc: "Every action item you mention is captured automatically." },
  { icon: "\uD83D\uDD0D", title: "See your patterns", desc: "Weekly reports surface what you can\u2019t see yourself." },
  { icon: "\uD83C\uDFAF", title: "Track what matters", desc: "Goals tracked passively from your own words." },
  { icon: "\uD83D\uDCD6", title: "A living record of your life", desc: "Monthly memoirs you\u2019ll actually want to read." },
];

const PAYWALL_TESTIMONIALS = [
  { quote: "I didn\u2019t realize I was living the same week on repeat until Acuity showed me.", name: "Sarah M." },
  { quote: "It\u2019s like having a life coach who actually remembers everything.", name: "James K." },
  { quote: "The weekly report made me cry. In a good way.", name: "Priya R." },
];

const FAQ_ITEMS = [
  { q: "What happens during the free trial?", a: "You get full access for 14 days. Cancel anytime before your trial ends and you won\u2019t be charged." },
  { q: "How does it work?", a: "Open the app, tap record, talk for 60 seconds about whatever\u2019s on your mind. AI extracts your tasks, goals, mood, and themes instantly." },
  { q: "Is my data private?", a: "Your recordings are transcribed and deleted within 24 hours. Your data is encrypted and never sold." },
  { q: "Can I cancel anytime?", a: "Yes. Cancel in one tap from your account settings. No questions asked." },
];

// ─── Session Tracking ───────────────────────────────────────────────────────

const SESSION_STORAGE_KEY = "acuity_funnel_session";
const SESSION_LOCALSTORAGE_KEY = "acuity_funnel_session_persist";

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
    trackOnboardingEvent(event, { sessionToken: sessionId.current, utm: utmRef.current, ...props });
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
  const [step, setStep] = useState<Step>("entry");
  const [branch, setBranch] = useState<Branch | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("yearly");
  const track = useFunnelTracker();

  // Handle return from OAuth / Stripe
  const oauthReturnTracked = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("step") === "download") {
      setStep("download");
      if (params.get("session_id")) {
        track("funnel_payment_completed", { value: "stripe_return" });
      }
    } else if (params.get("step") === "paywall") {
      setStep("paywall");
      if (authStatus === "authenticated" && !oauthReturnTracked.current) {
        oauthReturnTracked.current = true;
        track("funnel_signup_completed", { value: "oauth_return" });
      }
    }
  }, []);

  // Track OAuth return when auth status resolves async
  useEffect(() => {
    if (authStatus === "authenticated" && !oauthReturnTracked.current) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("step") === "paywall") {
        oauthReturnTracked.current = true;
        track("funnel_signup_completed", { value: "oauth_return" });
      }
    }
    // If already logged in with active subscription, skip to download
    if (authStatus === "authenticated" && session?.user) {
      fetch("/api/user/me")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.user?.subscriptionStatus === "PRO") setStep("download");
        })
        .catch(() => {});
    }
  }, [authStatus, session, track]);

  // Track step views
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
      mirror: "funnel_mirror_viewed",
      commit: "funnel_commit_viewed",
      processing: "funnel_processing_viewed",
      snapshot: "funnel_snapshot_viewed",
      timeline: "funnel_timeline_viewed",
      paywall: "funnel_paywall_viewed",
      download: "funnel_download_viewed",
    };
    if (eventMap[step]) track(eventMap[step]);
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
        .funnel-screen { animation: funnel-slide-up 0.4s ease-out both; }
        .funnel-card-stagger { animation: funnel-card-in 0.35s ease-out both; }
        .funnel-bounce { animation: funnel-bounce-in 0.4s ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .funnel-screen, .funnel-card-stagger, .funnel-bounce { animation: none !important; opacity: 1 !important; transform: none !important; }
          * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
        }
      `}} />

      {/* Progress bar */}
      <div className="fixed top-0 inset-x-0 z-50 h-[2px] bg-zinc-200/50">
        <div className="h-full bg-[#7C5CFC] transition-all duration-700 ease-out" style={{ width: `${progressPct}%` }} />
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
            onSelect={(opt) => {
              if (isEntry && opt.branch) {
                setBranch(opt.branch);
                handleAnswer("entry", opt.label, "funnel_entry_selected");
                track("funnel_entry_selected", { value: opt.branch });
              } else {
                handleAnswer(answerKey, opt.label, `${eventBase}_selected`);
              }
              setTimeout(() => setStep(nextStep()), 400);
            }}
          />
        );
      })()}

      {/* ── Mirror (Screen 10) ── */}
      {step === "mirror" && branch && (
        <MirrorScreen
          key="mirror"
          branch={branch}
          answers={answers}
          onContinue={() => setStep("commit")}
        />
      )}

      {/* ── Hold-to-Commit (Screen 11) ── */}
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
        <TimelineScreen key="timeline" branch={branch} onContinue={() => setStep("paywall")} />
      )}

      {/* ── Paywall + Inline Signup (Screen 15) ── */}
      {step === "paywall" && (
        <PaywallScreen
          key="paywall"
          branch={branch}
          track={track}
          selectedPlan={selectedPlan}
          onPlanChange={setSelectedPlan}
          onCheckout={handleCheckout}
          loading={checkoutLoading}
          error={apiError}
        />
      )}

      {/* ── Download (Screen 16) ── */}
      {step === "download" && (
        <DownloadScreen key="download" track={track} />
      )}
    </div>
  );
}

// ─── Single Select Question Screen ──────────────────────────────────────────

function SingleSelectScreen({ question, questionLarge, options, normalization, onSelect }: {
  question?: string;
  questionLarge?: string;
  options: { label: string; branch?: Branch }[];
  normalization?: string;
  onSelect: (opt: { label: string; branch?: Branch }) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleTap = (opt: { label: string; branch?: Branch }) => {
    if (selected) return;
    setSelected(opt.label);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
    onSelect(opt);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-zinc-900">
      <div className="max-w-md w-full">
        {questionLarge ? (
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-10 funnel-screen">{questionLarge}</h1>
        ) : question ? (
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-center mb-8 funnel-screen">{question}</h2>
        ) : null}
        <div className="space-y-3" style={{ minHeight: `${options.length * 64}px` }}>
          {options.map((opt, i) => (
            <button key={opt.label} onClick={() => handleTap(opt)}
              className={`w-full text-left rounded-xl border px-5 py-4 text-[15px] transition-all duration-200 active:scale-[0.98] funnel-card-stagger ${
                selected === opt.label
                  ? "border-[#7C5CFC] bg-[#7C5CFC]/10 text-zinc-900 animate-[funnel-pulse-select_0.2s_ease-out]"
                  : selected
                    ? "border-zinc-200 bg-zinc-50 text-zinc-700 opacity-40"
                    : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
              }`}
              style={{ animationDelay: `${i * 100}ms` }}
              disabled={!!selected}
            >
              {selected === opt.label && <span className="mr-2 text-[#7C5CFC]">&#10003;</span>}
              {opt.label}
            </button>
          ))}
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
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-zinc-900">
      <div className="max-w-md w-full">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-center mb-8 funnel-screen">{question}</h2>
        <div className="space-y-3" style={{ minHeight: `${options.length * 64}px` }}>
          {options.map((opt, i) => (
            <button key={opt} onClick={() => toggle(opt)}
              className={`w-full text-left rounded-xl border px-5 py-4 text-[15px] transition-all duration-200 active:scale-[0.98] funnel-card-stagger ${
                selected.has(opt)
                  ? "border-[#7C5CFC] bg-[#7C5CFC]/10 text-zinc-900"
                  : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
              }`}
              style={{ animationDelay: `${i * 100}ms` }}
            >
              {selected.has(opt) ? (
                <span className="mr-2 text-[#7C5CFC]">&#10003;</span>
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
              className="rounded-full bg-[#7C5CFC] px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]">
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Mirror Screen (Screen 10) ──────────────────────────────────────────────

function MirrorScreen({ branch, answers, onContinue }: {
  branch: Branch; answers: Record<string, string | string[]>; onContinue: () => void;
}) {
  const lines = buildMirrorLines(branch, answers);
  const [visibleLines, setVisibleLines] = useState(0);
  const [showClosing, setShowClosing] = useState(false);
  const [showBtn, setShowBtn] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Header fades in at 400ms, then lines stagger
    lines.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleLines(i + 1), 1200 + i * 800));
    });
    timers.push(setTimeout(() => setShowClosing(true), 1200 + lines.length * 800 + 1200));
    timers.push(setTimeout(() => setShowBtn(true), 1200 + lines.length * 800 + 2000));
    return () => timers.forEach(clearTimeout);
  }, [lines.length]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-zinc-900">
      <div className="max-w-md w-full">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-10 funnel-screen">
          We heard you.
        </h2>
        <div className="space-y-6">
          {lines.map((line, i) => (
            <div
              key={i}
              className={`border-l-2 border-[#7C5CFC]/40 pl-5 transition-all duration-600 ${
                i < visibleLines ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
              style={{ transitionDelay: "0ms" }}
            >
              <p className="text-sm text-zinc-700 leading-relaxed">{line}</p>
            </div>
          ))}
        </div>
        <div className={`mt-10 text-center transition-all duration-500 ${showClosing ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
          <p className="text-base font-semibold text-zinc-900">You don&rsquo;t have to keep living like this.</p>
        </div>
        <div className={`mt-8 text-center transition-all duration-300 ${showBtn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <button onClick={onContinue}
            className="rounded-full bg-[#7C5CFC] px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Hold-to-Commit Screen (Screen 11) ──────────────────────────────────────

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
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-zinc-900 select-none">
      <div className="max-w-md text-center">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-12">Hold to commit to one minute a day.</h2>
        <div className="relative inline-flex items-center justify-center">
          <svg className="h-40 w-40" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="#e4e4e7" strokeWidth="4" />
            <circle ref={ringRef} cx="60" cy="60" r="54" fill="none" stroke="#7C5CFC" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE}
              transform="rotate(-90 60 60)" />
          </svg>
          <button
            onPointerDown={startHold} onPointerUp={endHold} onPointerLeave={endHold} onPointerCancel={endHold}
            onTouchStart={(e) => { e.preventDefault(); startHold(); }} onTouchEnd={endHold}
            onContextMenu={(e) => e.preventDefault()}
            className={`absolute inset-4 rounded-full bg-[#7C5CFC]/5 border border-zinc-200 flex items-center justify-center transition active:bg-[#7C5CFC]/10 ${!holding && !completed ? "animate-[funnel-breathe_2s_ease-in-out_infinite]" : ""}`}
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
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-zinc-900">
      <div className="max-w-md w-full text-center funnel-screen">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-8">Building your insight profile&hellip;</h2>
        <div className="mx-auto w-64 mb-6">
          <div className="h-2 w-full rounded-full bg-zinc-200 overflow-hidden">
            <div className="h-full bg-[#7C5CFC] rounded-full transition-all duration-300 ease-out" style={{ width: `${pct}%` }} />
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
  const snap = SNAPSHOT_TEMPLATES[branch];
  const goal = getSnapshotGoal(branch, answers);
  const desire = String(answers.shared_q9 ?? "");
  const theme = DESIRE_TO_THEME[desire] ?? snap.theme;
  const [visibleSections, setVisibleSections] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= 5; i++) {
      timers.push(setTimeout(() => setVisibleSections(i), 400 + i * 500));
    }
    return () => timers.forEach(clearTimeout);
  }, []);

  const vis = (at: number) => visibleSections >= at ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4";

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-16 bg-white text-zinc-900">
      <div className="max-w-md w-full">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-center mb-2 funnel-screen">
          Here&rsquo;s what one 60-second debrief reveals.
        </h2>
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#7C5CFC] text-center mb-8">Day 1</p>

        {/* Mood */}
        <div className={`mb-5 rounded-2xl bg-white border border-zinc-200 p-5 transition-all duration-500 ${vis(1)}`}
          style={{ boxShadow: visibleSections >= 1 ? "0 0 24px 4px rgba(245,158,11,0.12)" : "none" }}>
          <div className="flex items-center gap-2 mb-2">
            <MoodDot mood="NEUTRAL" />
            <span className="text-sm font-semibold text-zinc-800">Overwhelmed</span>
            <span className="text-xs text-zinc-400">&rarr; Aware</span>
          </div>
          <p className="text-xs text-zinc-500">First debrief captured. Awareness is the first shift.</p>
        </div>

        {/* Tasks */}
        <div className={`mb-5 transition-all duration-500 ${vis(2)}`}>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#7C5CFC] mb-3">Tasks Extracted</p>
          <div className="space-y-2">
            {snap.tasks.map((t, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl bg-white border border-zinc-200 px-4 py-3" style={{ borderLeft: "3px solid #7C5CFC" }}>
                <p className="text-sm text-zinc-700">{t}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Goal */}
        <div className={`mb-5 transition-all duration-500 ${vis(3)}`}>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#7C5CFC] mb-3">Goal Tracked</p>
          <div className="rounded-xl bg-white border border-zinc-200 px-4 py-3" style={{ borderLeft: "3px solid #A78BFA" }}>
            <p className="text-sm text-zinc-700">{goal}</p>
          </div>
        </div>

        {/* Theme */}
        <div className={`mb-8 transition-all duration-500 ${vis(4)}`}>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#7C5CFC] mb-3">Theme Detected</p>
          <div className="rounded-xl bg-[#7C5CFC]/5 border border-[#7C5CFC]/20 px-4 py-3">
            <p className="text-sm font-medium text-[#7C5CFC]">{theme}</p>
          </div>
        </div>

        {/* CTA */}
        <div className={`text-center transition-all duration-500 ${vis(5)}`}>
          <p className="text-xs text-zinc-500 mb-6">This is what 60 seconds of talking produces. Do this daily and watch the patterns emerge.</p>
          <button onClick={onContinue}
            className="rounded-full bg-[#7C5CFC] px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Personalized Timeline (Screen 14) ──────────────────────────────────────

function TimelineScreen({ branch, onContinue }: { branch: Branch; onContinue: () => void }) {
  const weeks = TIMELINE_TEMPLATES[branch];
  const [visibleNodes, setVisibleNodes] = useState(0);
  const [showBtn, setShowBtn] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    weeks.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleNodes(i + 1), 600 + i * 700));
    });
    timers.push(setTimeout(() => setShowBtn(true), 600 + weeks.length * 700 + 500));
    return () => timers.forEach(clearTimeout);
  }, [weeks.length]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-zinc-900">
      <div className="max-w-md w-full">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-center mb-10 funnel-screen">
          Here&rsquo;s what the next 30 days look like.
        </h2>
        <div className="relative">
          <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-zinc-200 overflow-hidden">
            <div className="w-full bg-[#7C5CFC] transition-all duration-700" style={{ height: `${(visibleNodes / weeks.length) * 100}%` }} />
          </div>
          <div className="space-y-6">
            {weeks.map((w, i) => (
              <div key={i} className={`relative pl-10 transition-all duration-500 ${i < visibleNodes ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
                <div className={`absolute left-1 top-1 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                  i < visibleNodes ? "border-[#7C5CFC] bg-[#7C5CFC]/10 scale-100" : "border-zinc-200 bg-white scale-75"
                }`}>
                  {i === 0 && visibleNodes > 0 ? (
                    <svg className="h-3 w-3 text-[#7C5CFC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-[#7C5CFC]" />
                  )}
                </div>
                <p className="text-sm text-zinc-700"><span className="font-bold">{w.week}:</span> {w.text}</p>
                {w.badge && <span className="text-[11px] text-[#7C5CFC] font-medium">{w.badge}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className={`mt-10 text-center transition-all duration-300 ${showBtn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <button onClick={onContinue}
            className="rounded-full bg-[#7C5CFC] px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98] animate-[funnel-glow_2s_ease-in-out_infinite]">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Paywall + Inline Signup (Screen 15) ────────────────────────────────────

function PaywallScreen({ branch, track, selectedPlan, onPlanChange, onCheckout, loading, error }: {
  branch: Branch | null;
  track: (event: string, props?: Record<string, unknown>) => void;
  selectedPlan: "monthly" | "yearly"; onPlanChange: (p: "monthly" | "yearly") => void;
  onCheckout: () => void; loading: boolean; error: string | null;
}) {
  const { status } = useSession();
  const [showAuth, setShowAuth] = useState(false);
  const [authLoading, setAuthLoading] = useState<"google" | "apple" | "email" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [testimonialIdx, setTestimonialIdx] = useState(0);

  const browserEnv = typeof window !== "undefined" ? detectBrowserEnv() : { isWebView: false, label: "ssr", ua: "" };
  const isWebView = browserEnv.isWebView;
  const isAuthenticated = status === "authenticated";

  useEffect(() => {
    const interval = setInterval(() => setTestimonialIdx((i) => (i + 1) % PAYWALL_TESTIMONIALS.length), 4000);
    return () => clearInterval(interval);
  }, []);

  const headline = branch ? PAYWALL_HOOKS[branch] : "You\u2019ve already taken the first step.";
  const annualMonthly = Math.round(ANNUAL_PRICE_CENTS / 12);

  const handleCTA = () => {
    if (isAuthenticated) {
      onCheckout();
    } else {
      setShowAuth(true);
    }
  };

  const handleGoogle = async () => {
    setAuthLoading("google");
    track("funnel_signup_attempted", { value: "google" });
    await signIn("google", { callbackUrl: "/start?step=paywall" });
  };

  const handleApple = async () => {
    setAuthLoading("apple");
    track("funnel_signup_attempted", { value: "apple" });
    await signIn("apple", { callbackUrl: "/start?step=paywall" });
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (password.length < 8) { setAuthError("Password must be at least 8 characters."); return; }
    setAuthLoading("email");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, name: name.trim() || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setAuthError(body.error === "AlreadyRegistered" ? "Account exists. Try signing in." : body.message || "Something went wrong.");
        track("funnel_signup_failed", { value: body.error || "unknown" });
        return;
      }
      track("funnel_signup_completed", { value: "email" });
      const result = await signIn("credentials", { email: email.trim(), password, redirect: false });
      if (result?.ok) {
        setShowAuth(false);
        // Small delay for session to propagate, then trigger checkout
        setTimeout(onCheckout, 500);
      } else {
        window.location.href = "/start?step=paywall";
      }
    } catch {
      setAuthError("Something went wrong. Please try again.");
    } finally { setAuthLoading(null); }
  };

  return (
    <div className="min-h-screen bg-white text-zinc-900 pb-32">
      <div className="max-w-lg mx-auto px-6 pt-16">
        {/* Section 1 — Personalized Hook */}
        <section className="text-center mb-16 funnel-screen">
          <h2 className="text-[28px] sm:text-4xl font-bold tracking-tight leading-tight">{headline}</h2>
          <p className="mt-3 text-sm text-zinc-500">14 days free. Cancel anytime.</p>
        </section>

        {/* Section 2 — Outcomes */}
        <section className="mb-16">
          <div className="space-y-4">
            {PAYWALL_OUTCOMES.map((item, i) => (
              <div key={i} className="flex items-start gap-4 rounded-xl border border-zinc-200 bg-white px-5 py-4 funnel-card-stagger" style={{ animationDelay: `${150 + i * 100}ms` }}>
                <span className="text-2xl shrink-0 mt-0.5">{item.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">{item.title}</p>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3 — Social Proof */}
        <section className="mb-16 text-center">
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
        </section>

        {/* Section 4 — Pricing */}
        <section className="mb-16">
          {branch && (
            <p className="text-sm text-zinc-600 text-center mb-5">{PRICING_COPY[branch]}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => onPlanChange("monthly")}
              className={`rounded-xl border-2 p-4 text-center transition ${selectedPlan === "monthly" ? "border-[#7C5CFC] bg-[#7C5CFC]/5" : "border-zinc-200 bg-white"}`}>
              <p className="text-xs text-zinc-500 mb-1">Monthly</p>
              <p className="text-xl font-bold">{formatDollars(MONTHLY_PRICE_CENTS)}<span className="text-sm font-normal text-zinc-400">/mo</span></p>
              <p className="text-[10px] text-zinc-400 mt-1">Billed monthly</p>
            </button>
            <button onClick={() => onPlanChange("yearly")}
              className={`rounded-xl border-2 p-4 text-center transition relative ${selectedPlan === "yearly" ? "border-[#7C5CFC] bg-[#7C5CFC]/5 shadow-[0_0_16px_rgba(124,92,252,0.15)]" : "border-zinc-200 bg-white"}`}>
              <span className="absolute -top-2.5 right-3 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">SAVE $19.89</span>
              <p className="text-xs text-zinc-500 mb-1">Annual</p>
              <p className="text-sm text-zinc-400 line-through">{formatDollars(MONTHLY_PRICE_CENTS)}/mo</p>
              <p className="text-xl font-bold">{formatDollars(annualMonthly)}<span className="text-sm font-normal text-zinc-400">/mo</span></p>
              <p className="text-[10px] text-zinc-400 mt-0.5">{formatDollars(ANNUAL_PRICE_CENTS)}/year</p>
            </button>
          </div>
          <p className="text-sm font-semibold text-zinc-800 text-center mt-6">
            What&rsquo;s worth more &mdash; a coffee on Monday, or understanding yourself by Sunday?
          </p>
        </section>

        {/* Section 5 — FAQ */}
        <section className="mb-16">
          <div className="space-y-2">
            {FAQ_ITEMS.map((faq, i) => (
              <div key={i} className="rounded-xl border border-zinc-200 overflow-hidden">
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-3.5 text-left text-sm font-medium text-zinc-900">
                  {faq.q}
                  <span className={`text-zinc-400 transition-transform ${openFaq === i ? "rotate-180" : ""}`}>&#9662;</span>
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4">
                    <p className="text-xs text-zinc-500 leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-zinc-100 px-6 py-4 safe-area-pb">
        <div className="max-w-lg mx-auto">
          {error && <p className="text-xs text-red-500 text-center mb-2">{error}</p>}
          <button onClick={handleCTA} disabled={loading}
            className="w-full rounded-full bg-[#7C5CFC] py-4 text-[15px] font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98] disabled:opacity-50 animate-[funnel-glow_2s_ease-in-out_infinite]">
            {loading ? "Loading\u2026" : "Start My Free Trial"}
          </button>
          <p className="text-xs text-zinc-700 font-medium text-center mt-2">Your patterns are already running. The only question is whether you&rsquo;ll see them.</p>
          <p className="text-[10px] text-zinc-400 text-center mt-1">14-day free trial. Cancel anytime. You won&rsquo;t be charged today.</p>
        </div>
      </div>

      {/* Auth slide-up panel */}
      {showAuth && !isAuthenticated && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) setShowAuth(false); }}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-lg bg-white rounded-t-2xl px-6 pt-6 pb-10 safe-area-pb animate-[funnel-slide-up_0.3s_ease-out]">
            <div className="w-10 h-1 rounded-full bg-zinc-200 mx-auto mb-6" />
            <h3 className="text-lg font-bold text-center mb-6">Create your account</h3>

            {isWebView && (
              <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                <p className="text-xs text-amber-700">Open in Safari or Chrome for Google/Apple sign in.</p>
              </div>
            )}

            {/* OAuth */}
            <div className="space-y-3 mb-4">
              <button onClick={handleGoogle} disabled={authLoading !== null || isWebView}
                className="flex w-full items-center justify-center gap-3 rounded-full border border-zinc-200 bg-white px-6 py-3.5 text-[15px] font-semibold text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98] disabled:opacity-50">
                <GoogleLogo />{authLoading === "google" ? "Redirecting\u2026" : "Continue with Google"}
              </button>
              <button onClick={handleApple} disabled={authLoading !== null || isWebView}
                className="flex w-full items-center justify-center gap-3 rounded-full bg-black px-6 py-3.5 text-[15px] font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50">
                <AppleLogo />{authLoading === "apple" ? "Redirecting\u2026" : "Continue with Apple"}
              </button>
            </div>

            {/* Divider */}
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-zinc-200" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">or</span>
              <div className="h-px flex-1 bg-zinc-200" />
            </div>

            {/* Email form */}
            <form onSubmit={handleEmail} className="space-y-3">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" autoComplete="name"
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/20" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/20" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (8+ characters)" autoComplete="new-password" required minLength={8}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/20" />
              {authError && <p className="text-xs text-red-500">{authError}</p>}
              <button type="submit" disabled={authLoading !== null || !email.trim() || password.length < 8}
                className="w-full rounded-full bg-[#7C5CFC] py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98] disabled:opacity-40">
                {authLoading === "email" ? "Creating account\u2026" : "Create Account"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Download Screen (Screen 16) ────────────────────────────────────────────

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
      <div className="max-w-sm w-full text-center funnel-screen">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">Welcome to Acuity.</h2>
        <p className="text-sm text-zinc-500 mb-2">Your 14-day free trial has started.</p>
        <p className="text-sm text-zinc-500 mb-10">Open the app to record your first debrief.</p>

        <a href={APP_STORE_URL} onClick={() => track("funnel_app_store_clicked")}
          className="relative inline-block w-full rounded-full px-8 py-4 text-[15px] font-semibold text-white transition hover:brightness-110 active:scale-[0.98] overflow-hidden funnel-bounce"
          style={{ background: "linear-gradient(135deg, #7C5CFC 0%, #9F7AEA 50%, #6D28D9 100%)", boxShadow: "0 4px 24px rgba(124,92,252,0.4)" }}>
          <span className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)", backgroundSize: "200% 100%", animation: "funnel-shimmer 2s ease-in-out infinite" }} />
          <span className="relative">Download on the App Store</span>
        </a>

        <div className="mt-8 hidden sm:block">
          <p className="text-xs text-zinc-400 mb-3">Or scan with your phone</p>
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(APP_STORE_URL)}&bgcolor=ffffff&color=181614`}
            alt="QR code" width={140} height={140} className="mx-auto rounded-lg" />
        </div>

        <p className="mt-10 text-sm text-[#7C5CFC] font-medium">
          Your 14-day free trial is active. No charge until {formatTrialEndDate()}.
        </p>

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
