"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import confetti from "canvas-confetti";
import { signIn } from "next-auth/react";
import {
  type ExtractionResult,
  MOOD_LABELS,
  PRIORITY_COLOR,
} from "@acuity/shared";
import {
  MINI_TESTIMONIALS,
  SUGGESTED_PROMPTS,
  MAX_SECONDS,
  MIN_SECONDS,
  NUDGE_SECONDS,
  PROCESSING_SLIDES,
  SUMMARY_CORE,
  SUMMARY_COMING_SOON,
  CORE_SLIDE_COUNT,
  SLIDE_MS,
  SLIDE_ORBS,
  MOOD_GLOW,
  formatTime,
  bestMimeType,
  extFromMime,
  MoodDot,
  MicIcon,
  CheckboxIcon,
  FlagIcon,
  LockIcon,
  Spinner,
  AppleLogo,
  GoogleLogo,
} from "@/components/debrief-shared";

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen = "record" | "processing" | "extraction" | "celebrating";

interface TryApiResult {
  sessionToken: string;
  extraction: ExtractionResult;
  expiresAt: Date;
}

// ─── Simulated progress config ──────────────────────────────────────────────

const SIMULATED_LABELS = [
  { at: 0, label: "Transcribing..." },
  { at: 8000, label: "Extracting tasks and goals..." },
  { at: 16000, label: "Analyzing mood and themes..." },
  { at: 24000, label: "Building your first snapshot..." },
];

// ─── Main Component ──────────────────────────────────────────────────────────

export function TryDebriefFlow({ onClose }: { onClose?: () => void }) {
  const [screen, setScreen] = useState<Screen>("record");
  const [apiResult, setApiResult] = useState<TryApiResult | null>(null);
  // Ref holds the in-flight API promise so the processing screen can await it
  const apiPromiseRef = useRef<Promise<TryApiResult> | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const handleUploaded = useCallback((promise: Promise<TryApiResult>) => {
    apiPromiseRef.current = promise;
    setScreen("processing");

    // When the promise resolves, store the result. The processing screen
    // checks apiResult to know when extraction is ready.
    promise
      .then((result) => setApiResult(result))
      .catch((err) => {
        setApiError(err instanceof Error ? err.message : "Processing failed");
      });
  }, []);

  const bgClass = "bg-white text-zinc-900";

  return (
    <div className={`min-h-screen transition-colors duration-1000 ${bgClass}`}>
      {screen === "record" && (
        <TryRecordScreen
          onUploaded={handleUploaded}
          onClose={onClose}
        />
      )}
      {screen === "processing" && (
        <TryProcessingScreen
          apiResult={apiResult}
          apiError={apiError}
          onComplete={(result) => {
            setApiResult(result);
            setScreen("extraction");
          }}
          onError={() => setScreen("record")}
        />
      )}
      {screen === "extraction" && apiResult && (
        <TryExtractionScreen
          extraction={apiResult.extraction}
          expiresAt={apiResult.expiresAt}
          onSignedUp={() => setScreen("celebrating")}
        />
      )}
      {screen === "celebrating" && <CelebrationScreen />}
    </div>
  );
}

// ─── Screen 1: Record (no auth, different copy) ─────────────────────────────

function TryRecordScreen({
  onUploaded,
  onClose,
}: {
  onUploaded: (promise: Promise<TryApiResult>) => void;
  onClose?: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "recording" | "error">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showPrompts, setShowPrompts] = useState(false);
  const [testimonialIdx, setTestimonialIdx] = useState(0);

  // Entrance animation stagger
  const [showHeadline, setShowHeadline] = useState(false);
  const [showSubhead, setShowSubhead] = useState(false);
  const [showMic, setShowMic] = useState(false);
  const [showExtra, setShowExtra] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const promptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t1 = setTimeout(() => setShowHeadline(true), 200);
    const t2 = setTimeout(() => setShowSubhead(true), 600);
    const t3 = setTimeout(() => setShowMic(true), 1000);
    const t4 = setTimeout(() => setShowExtra(true), 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTestimonialIdx((prev) => (prev + 1) % MINI_TESTIMONIALS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (phase === "recording") {
      promptTimerRef.current = setTimeout(() => setShowPrompts(true), 10_000);
    } else {
      setShowPrompts(false);
    }
    return () => { if (promptTimerRef.current) clearTimeout(promptTimerRef.current); };
  }, [phase]);

  const startRecording = async () => {
    setError(null);
    setElapsed(0);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: bestMimeType() });
      mediaRecorderRef.current = mr;
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
      setError("Microphone access denied. Check your browser permissions.");
      setPhase("error");
    }
  };

  const stopRecording = () => {
    const secs = Math.round((Date.now() - startTimeRef.current) / 1000);
    if (secs < MIN_SECONDS) return;
    mediaRecorderRef.current?.stop();
  };

  const upload = (blob: Blob, mime: string) => {
    const fd = new FormData();
    fd.append("audio", blob, `recording.${extFromMime(mime)}`);

    // Create the API promise and hand it to the parent — the parent
    // immediately transitions to the processing slides screen.
    const promise = fetch("/api/try-recording", { method: "POST", body: fd })
      .then(async (res) => {
        if (res.status === 403) {
          throw new Error("You\u2019ve already tried a recording. Sign up to continue.");
        }
        if (res.status === 429) {
          throw new Error("Too many tries. Sign up for unlimited access.");
        }
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        return {
          sessionToken: body.sessionToken as string,
          extraction: body.extraction as ExtractionResult,
          expiresAt: new Date(body.expiresAt as string),
        };
      });

    onUploaded(promise);
  };

  const handleMicClick = () => {
    if (phase === "recording") return stopRecording();
    if (phase === "idle" || phase === "error") return startRecording();
  };

  const tooShort = phase === "recording" && elapsed < MIN_SECONDS;
  const showNudge = phase === "recording" && elapsed > 0 && elapsed < NUDGE_SECONDS;
  const isIdle = phase === "idle" || phase === "error";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-8 sm:py-12">
      <div className="w-full max-w-md text-center">
        {/* Headline + subhead — idle only */}
        {isIdle && (
          <div className="mb-12 sm:mb-16">
            <div className={`transition-all duration-700 ${showHeadline ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
                Try your first debrief.
              </h1>
            </div>
            <div className={`transition-all duration-700 delay-100 ${showSubhead ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              <p className="mt-4 text-base text-zinc-500 leading-relaxed max-w-sm mx-auto">
                Just talk. About your day, your goals, whatever&rsquo;s on your mind. We handle the rest.
              </p>
            </div>
          </div>
        )}

        {/* Recording timer */}
        {phase === "recording" && (
          <div className="mb-10 animate-fade-in">
            <p className="text-4xl font-mono font-semibold tabular-nums text-zinc-900 sm:text-5xl">
              {formatTime(elapsed)}
            </p>
            {tooShort && <p className="mt-3 text-sm text-zinc-400">Keep going... {MIN_SECONDS - elapsed}s minimum</p>}
            {!tooShort && showNudge && <p className="mt-3 text-sm text-zinc-400">You&rsquo;re doing great. Keep going or tap to stop.</p>}
            {!tooShort && !showNudge && <p className="mt-3 text-sm text-zinc-400">Tap the stop button when you&rsquo;re done</p>}
          </div>
        )}

        {/* Mic button */}
        <div
          className={`flex justify-center mb-10 sm:mb-12 transition-all duration-700 ${showMic ? "opacity-100 scale-100" : "opacity-0 scale-50"}`}
          style={{ transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        >
          <div className="relative flex items-center justify-center">
            {phase === "idle" && (
              <>
                <span className="absolute h-32 w-32 rounded-full animate-mic-ripple sm:h-36 sm:w-36" style={{ background: "radial-gradient(circle, rgba(124,92,252,0.25) 0%, rgba(167,139,250,0.08) 70%, transparent 100%)" }} />
                <span className="absolute h-32 w-32 rounded-full animate-mic-ripple sm:h-36 sm:w-36" style={{ animationDelay: "1s", background: "radial-gradient(circle, rgba(124,92,252,0.18) 0%, rgba(196,181,253,0.05) 70%, transparent 100%)" }} />
                <span className="absolute h-32 w-32 rounded-full animate-mic-ripple sm:h-36 sm:w-36" style={{ animationDelay: "2s", background: "radial-gradient(circle, rgba(124,92,252,0.12) 0%, rgba(221,214,254,0.03) 70%, transparent 100%)" }} />
              </>
            )}
            <button
              onClick={handleMicClick}
              aria-label={phase === "recording" ? "Stop recording" : "Start recording"}
              className={`relative z-10 flex items-center justify-center rounded-full transition-all duration-300 ${
                phase === "recording"
                  ? "h-32 w-32 scale-110 sm:h-36 sm:w-36"
                  : "h-32 w-32 hover:scale-105 active:scale-95 sm:h-36 sm:w-36 animate-mic-glow"
              }`}
              style={
                phase === "recording"
                  ? { background: "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)", boxShadow: "0 8px 32px rgba(239,68,68,0.35), 0 2px 8px rgba(239,68,68,0.2)" }
                  : { background: "linear-gradient(135deg, #7C5CFC 0%, #9F7AEA 50%, #7C3AED 100%)", boxShadow: "0 8px 40px rgba(124,92,252,0.3), 0 2px 12px rgba(124,58,237,0.2)" }
              }
            >
              {phase === "recording" && (
                <>
                  <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-15" />
                  <span className="absolute -inset-2 rounded-full border-2 border-red-300/50 animate-pulse" />
                </>
              )}
              {phase === "recording" ? (
                tooShort ? (
                  <div className="flex items-center gap-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span key={i} className="wave-bar w-1.5 rounded-full bg-white" style={{ height: 24 + Math.random() * 14, animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                ) : (
                  <span className="h-11 w-11 rounded-lg bg-white" />
                )
              ) : (
                <MicIcon size={48} />
              )}
            </button>
          </div>
        </div>

        {/* Prompt text */}
        {isIdle && (
          <p className="text-sm text-zinc-400 mb-10">
            No wrong answers. Most people start with &ldquo;Today I...&rdquo;
          </p>
        )}

        {phase === "error" && (
          <div className="animate-fade-in mb-10">
            <p className="text-sm text-red-500">{error}</p>
            <p className="mt-1 text-xs text-zinc-400">Tap the mic to try again</p>
          </div>
        )}

        {showPrompts && phase === "recording" && (
          <div className="space-y-2 animate-fade-in mb-10">
            <p className="text-xs text-zinc-300 uppercase tracking-widest">Need a prompt?</p>
            {SUGGESTED_PROMPTS.map((p) => (
              <p key={p} className="text-sm text-zinc-400 italic">&ldquo;{p}&rdquo;</p>
            ))}
          </div>
        )}

        {/* Social proof + escape hatch */}
        {isIdle && (
          <div className={`transition-all duration-700 ${showExtra ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            <div className="mb-6">
              <p className="text-sm font-medium text-zinc-400 mb-2">
                4.9 <span className="text-amber-400">&#9733;&#9733;&#9733;&#9733;&#9733;</span> from 127+ users
              </p>
              <div className="relative h-10 overflow-hidden">
                {MINI_TESTIMONIALS.map((t, i) => (
                  <p
                    key={t.name}
                    className={`absolute inset-x-0 text-sm italic text-zinc-400 transition-all duration-500 ${i === testimonialIdx ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                  >
                    &ldquo;{t.quote}&rdquo; <span className="not-italic text-zinc-300">&mdash; {t.name}</span>
                  </p>
                ))}
              </div>
            </div>
            <a
              href="/auth/signup"
              className="text-sm text-[#7C5CFC] hover:text-[#6B4FE0] transition font-medium"
            >
              Or start your free trial &rarr;
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Screen 2: Processing Slides (same as post-signup, simulated progress) ──

function TryProcessingScreen({
  apiResult,
  apiError,
  onComplete,
  onError,
}: {
  apiResult: TryApiResult | null;
  apiError: string | null;
  onComplete: (result: TryApiResult) => void;
  onError: () => void;
}) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [onSummary, setOnSummary] = useState(false);
  const [summaryStep, setSummaryStep] = useState(0);
  const [showedComingSoon, setShowedComingSoon] = useState(false);
  const completedRef = useRef(false);
  const apiResultRef = useRef<TryApiResult | null>(null);
  const maxSlideRef = useRef(0);

  const [subStep, setSubStep] = useState(0);

  // Simulated progress bar — creeps to ~80% over 30s, jumps to 100% on API response
  const [simElapsed, setSimElapsed] = useState(0);
  const simStartRef = useRef(Date.now());

  // Simulated processing label
  const [processingLabel, setProcessingLabel] = useState("Transcribing...");

  // Track API result via ref so interval callbacks can read it
  useEffect(() => {
    apiResultRef.current = apiResult;
  }, [apiResult]);

  // Simulated elapsed timer for progress bar + labels
  useEffect(() => {
    simStartRef.current = Date.now();
    const interval = setInterval(() => {
      setSimElapsed(Date.now() - simStartRef.current);
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // Simulated processing label progression
  useEffect(() => {
    // Find the latest label whose threshold has been passed
    let current = SIMULATED_LABELS[0].label;
    for (const entry of SIMULATED_LABELS) {
      if (simElapsed >= entry.at) current = entry.label;
    }
    if (apiResultRef.current) current = "Done!";
    setProcessingLabel(current);
  }, [simElapsed]);

  // Simulated progress percentage
  const simProgressPct = (() => {
    if (apiResultRef.current) return 100;
    // Ease from 0 to ~80% over 30 seconds using a log curve
    const t = Math.min(simElapsed / 30000, 1);
    return Math.round(t * 80);
  })();

  // ── Slide advancement (same logic as post-signup flow) ────────────
  const slideCounterRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const current = slideCounterRef.current;
      const next = current + 1;

      const processingDone = !!apiResultRef.current;
      const pastCore = next >= CORE_SLIDE_COUNT;
      const pastAll = next >= PROCESSING_SLIDES.length;

      if ((processingDone && pastCore) || pastAll) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (maxSlideRef.current >= CORE_SLIDE_COUNT) {
          setShowedComingSoon(true);
        }
        setOnSummary(true);
        return;
      }

      if (next >= CORE_SLIDE_COUNT) {
        maxSlideRef.current = next;
      }

      slideCounterRef.current = next;
      setSlideIndex(next);
      setSubStep(0);
    }, SLIDE_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // If API finishes mid-slide after core slides, trigger summary
  useEffect(() => {
    if (
      !onSummary &&
      apiResultRef.current &&
      slideCounterRef.current >= CORE_SLIDE_COUNT
    ) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (maxSlideRef.current >= CORE_SLIDE_COUNT) {
        setShowedComingSoon(true);
      }
      setOnSummary(true);
    }
  }, [apiResult, slideIndex, onSummary]);

  // Sub-step stagger within each slide
  useEffect(() => {
    if (onSummary) return;
    setSubStep(0);
    const t1 = setTimeout(() => setSubStep(1), 100);
    const t2 = setTimeout(() => setSubStep(2), 700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [slideIndex, onSummary]);

  // Stagger summary items
  const summaryItems = showedComingSoon
    ? SUMMARY_CORE.length + SUMMARY_COMING_SOON.length + 1
    : SUMMARY_CORE.length;

  useEffect(() => {
    if (!onSummary) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= summaryItems; i++) {
      timers.push(setTimeout(() => setSummaryStep(i), 300 + i * 300));
    }
    return () => timers.forEach(clearTimeout);
  }, [onSummary, summaryItems]);

  // Transition: on summary + API done + summary items all shown → 3s hold → exit
  useEffect(() => {
    if (completedRef.current) return;
    const result = apiResultRef.current;
    if (onSummary && result && summaryStep >= summaryItems) {
      const t = setTimeout(() => {
        completedRef.current = true;
        onComplete(result);
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [onSummary, summaryStep, summaryItems, apiResult, onComplete]);

  // Handle API errors on summary
  useEffect(() => {
    if (completedRef.current) return;
    if (apiError && onSummary && summaryStep >= summaryItems) {
      const t = setTimeout(() => {
        completedRef.current = true;
        onError();
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [apiError, onSummary, summaryStep, summaryItems, onError]);

  return (
    <div className="relative flex min-h-screen flex-col px-6 py-8 overflow-hidden">
      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 10 }).map((_, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-[#7C5CFC]/[0.03]"
            style={{
              width: 3 + (i % 3) * 3,
              height: 3 + (i % 3) * 3,
              left: `${10 + (i * 8) % 80}%`,
              top: `${15 + ((i * 11) % 65)}%`,
              animation: `float ${6 + (i % 3) * 2}s ease-in-out infinite`,
              animationDelay: `${(i * 0.8) % 5}s`,
            }}
          />
        ))}
      </div>

      {/* Gradient orb */}
      {!onSummary && (
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] sm:w-[500px] sm:h-[500px] transition-all duration-1000 pointer-events-none"
          style={{ background: SLIDE_ORBS[slideIndex % SLIDE_ORBS.length] }}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10">
        <div className="w-full max-w-lg">
          {!onSummary ? (
            <>
              {/* Slide content */}
              <div className="relative min-h-[280px] sm:min-h-[320px] flex items-center justify-center">
                {PROCESSING_SLIDES.map((slide, i) => (
                  <div
                    key={i}
                    className="absolute inset-0 flex flex-col items-center justify-center text-center px-2"
                    style={{
                      transition: "opacity 0.5s ease, transform 0.5s ease",
                      opacity: i === slideIndex ? 1 : 0,
                      transform:
                        i === slideIndex
                          ? "translateY(0)"
                          : i < slideIndex
                            ? "translateY(-20px)"
                            : "translateY(20px)",
                      pointerEvents: i === slideIndex ? "auto" : "none",
                    }}
                  >
                    <div
                      className="mb-4"
                      style={{
                        transition: "opacity 0.3s ease, transform 0.3s ease",
                        opacity: i === slideIndex && subStep >= 1 ? 1 : 0,
                        transform: i === slideIndex && subStep >= 1 ? "translateY(0)" : "translateY(8px)",
                      }}
                    >
                      {slide.comingSoon ? (
                        <span
                          className="inline-block text-xs font-bold uppercase tracking-[0.2em] text-blue-500 bg-blue-50 border border-blue-100 rounded-full px-3 py-1"
                          style={{ animation: "mic-glow 3s ease-in-out infinite" }}
                        >
                          Coming Soon
                        </span>
                      ) : (
                        <span
                          className="text-sm font-bold uppercase tracking-[0.25em] text-[#7C5CFC] sm:text-base"
                          style={{ textShadow: "0 0 20px rgba(124,92,252,0.3)" }}
                        >
                          {slide.label}
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        transition: "opacity 0.3s ease 0.1s, transform 0.3s ease 0.1s",
                        opacity: i === slideIndex && subStep >= 1 ? 1 : 0,
                        transform: i === slideIndex && subStep >= 1 ? "translateY(0)" : "translateY(8px)",
                      }}
                    >
                      <p className="text-2xl font-bold text-zinc-800 leading-relaxed sm:text-3xl mb-6">
                        {slide.text}
                      </p>
                    </div>

                    <div
                      style={{
                        transition: "opacity 0.3s ease, transform 0.3s ease",
                        opacity: i === slideIndex && subStep >= 2 ? 1 : 0,
                        transform: i === slideIndex && subStep >= 2 ? "translateY(0)" : "translateY(12px)",
                      }}
                    >
                      {slide.testimonial && (
                        <div className="max-w-sm mx-auto">
                          <p className="text-sm text-zinc-500 italic leading-relaxed">
                            <span className="text-[#7C5CFC]/40 text-lg not-italic">&ldquo;</span>
                            {slide.testimonial.quote}
                            <span className="text-[#7C5CFC]/40 text-lg not-italic">&rdquo;</span>
                          </p>
                          <p className="mt-2 text-xs text-zinc-400">
                            &mdash; {slide.testimonial.name}
                          </p>
                        </div>
                      )}
                      {slide.description && (
                        <p className="max-w-sm mx-auto text-sm text-zinc-500 leading-relaxed">
                          {slide.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Progress dots */}
              <div className="mt-8 flex items-center justify-center gap-1.5 flex-wrap">
                {PROCESSING_SLIDES.map((_, i) => (
                  <div
                    key={i}
                    className="rounded-full transition-all duration-500"
                    style={
                      i === slideIndex
                        ? {
                            width: 20,
                            height: 5,
                            background: "linear-gradient(90deg, #7C5CFC, #9F7AEA)",
                            boxShadow: "0 0 8px 2px rgba(124,92,252,0.3)",
                          }
                        : i < slideIndex
                          ? {
                              width: 5,
                              height: 5,
                              backgroundColor: "rgba(124,92,252,0.3)",
                            }
                          : {
                              width: 5,
                              height: 5,
                              backgroundColor: "rgba(0,0,0,0.07)",
                            }
                    }
                  />
                ))}
              </div>
            </>
          ) : (
            /* Summary screen — clean text list, no emojis */
            <div>
              <h2 className="text-2xl font-bold text-zinc-900 mb-8 sm:text-3xl animate-fade-in text-center">
                Everything Acuity does for you.
              </h2>
              <div className="space-y-3 max-w-xs mx-auto">
                {SUMMARY_CORE.map((item, i) => (
                  <div
                    key={item}
                    className={`flex items-center gap-3 transition-all duration-500 ${
                      summaryStep > i
                        ? "opacity-100 translate-y-0"
                        : "opacity-0 translate-y-3"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[#7C5CFC] shrink-0" />
                    <span className="text-sm font-medium text-zinc-700">
                      {item}
                    </span>
                  </div>
                ))}

                {showedComingSoon && (
                  <>
                    <div
                      className={`pt-3 transition-all duration-500 ${
                        summaryStep > SUMMARY_CORE.length
                          ? "opacity-100 translate-y-0"
                          : "opacity-0 translate-y-3"
                      }`}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400">
                        Coming soon
                      </p>
                    </div>
                    {SUMMARY_COMING_SOON.map((item, i) => (
                      <div
                        key={item}
                        className={`flex items-center gap-3 transition-all duration-500 ${
                          summaryStep > SUMMARY_CORE.length + 1 + i
                            ? "opacity-100 translate-y-0"
                            : "opacity-0 translate-y-3"
                        }`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-300 shrink-0" />
                        <span className="text-sm font-medium text-zinc-400">
                          {item}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom: simulated processing status + progress bar */}
      <div className="flex-none relative z-10 w-full max-w-lg mx-auto mt-6">
        <div className="text-center mb-3">
          <div className="inline-flex items-center gap-2 px-4 py-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#7C5CFC] opacity-50" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#7C5CFC]" />
            </span>
            <span className="text-xs text-zinc-400">{processingLabel}</span>
          </div>
        </div>
        <div className="h-1 w-full rounded-full bg-zinc-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out"
            style={{
              width: `${simProgressPct}%`,
              background: "linear-gradient(90deg, #7C5CFC, #9F7AEA, #7C3AED)",
            }}
          />
        </div>
        {apiError && (
          <p className="mt-3 text-center text-sm text-red-500">{apiError}</p>
        )}
      </div>
    </div>
  );
}

// ─── Screen 3: Extraction Reveal with Lock Icons + Signup CTA ───────────────

function TryExtractionScreen({
  extraction,
  expiresAt,
  onSignedUp,
}: {
  extraction: ExtractionResult;
  expiresAt: Date;
  onSignedUp: () => void;
}) {
  const [step, setStep] = useState(0);
  const [countdown, setCountdown] = useState("");
  const [signupLoading, setSignupLoading] = useState<"google" | "apple" | null>(null);
  const celebratedRef = useRef(false);

  const hasTasks = extraction.tasks.length > 0;
  const hasGoals = extraction.goals.length > 0;
  const hasThemes = extraction.themes.length > 0;

  const taskSteps = hasTasks ? 1 + extraction.tasks.length : 0;
  const goalSteps = hasGoals ? 1 + extraction.goals.length : 0;
  const themeSteps = hasThemes ? 1 + extraction.themes.length : 0;
  const totalSteps = 1 + taskSteps + goalSteps + themeSteps + 1;

  // Stagger animations
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= totalSteps; i++) {
      const delay = i === 1 ? 400 : 400 + (i - 1) * 150;
      timers.push(setTimeout(() => setStep(i), delay));
    }
    return () => timers.forEach(clearTimeout);
  }, [totalSteps]);

  // Countdown timer
  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, expiresAt.getTime() - Date.now());
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setCountdown(`${mins}:${secs.toString().padStart(2, "0")}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  // Mini confetti when all sections loaded
  useEffect(() => {
    if (step >= totalSteps && !celebratedRef.current) {
      celebratedRef.current = true;
      confetti({
        particleCount: 40,
        spread: 70,
        origin: { x: 0.5, y: 0.3 },
        colors: ["#7C5CFC", "#A78BFA", "#C4B5FD", "#F59E0B", "#22C55E"],
        zIndex: 9999,
        startVelocity: 20,
        gravity: 1.2,
      });
    }
  }, [step, totalSteps]);

  const handleOAuthSignup = async (provider: "google" | "apple") => {
    setSignupLoading(provider);
    await signIn(provider, { callbackUrl: "/auth/signup/success?from_try=1" });
  };

  // Step calculation helpers
  const moodAt = 1;
  const tasksHeaderAt = moodAt + 1;
  const taskItemAt = (i: number) => tasksHeaderAt + 1 + i;
  const goalsHeaderAt = tasksHeaderAt + taskSteps;
  const goalItemAt = (i: number) => goalsHeaderAt + 1 + i;
  const themesHeaderAt = goalsHeaderAt + goalSteps;
  const themeItemAt = (i: number) => themesHeaderAt + 1 + i;
  const buttonAt = totalSteps;

  const vis = (at: number) => step >= at ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3";
  const scaleVis = (at: number) => step >= at ? "opacity-100 scale-100" : "opacity-0 scale-75";

  return (
    <div className="flex min-h-screen flex-col items-center px-6 py-12 sm:py-16">
      <div className="w-full max-w-md">
        {/* Headline */}
        <div className="text-center mb-10 animate-fade-in">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            That&rsquo;s what 60 seconds gets&nbsp;you.
          </h2>
          <p className="mt-3 text-base text-zinc-500 leading-relaxed">
            Do this daily and every Sunday you&rsquo;ll get a report showing how your life is actually going.
          </p>
        </div>

        {/* Summary + Mood */}
        <div
          className={`mb-5 rounded-2xl bg-white border border-zinc-200 p-5 transition-all duration-500 ${vis(moodAt)}`}
          style={{ boxShadow: step >= moodAt ? (MOOD_GLOW[extraction.mood] ?? MOOD_GLOW.NEUTRAL) : "none" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <MoodDot mood={extraction.mood} />
            <span className="text-sm font-semibold text-zinc-800">{MOOD_LABELS[extraction.mood] ?? "Neutral"}</span>
            <span className="text-xs text-zinc-400">&middot; Energy {extraction.energy}/10</span>
          </div>
          {extraction.summary && <p className="text-sm text-zinc-600 leading-relaxed">{extraction.summary}</p>}
          <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-400">
            <LockIcon />
            <span>Sign up to start building your mood history</span>
          </div>
        </div>

        {/* Tasks */}
        {hasTasks && (
          <div className={`mb-5 transition-all duration-500 ${vis(tasksHeaderAt)}`}>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#7C5CFC] mb-3">Tasks</p>
            <div className="space-y-2">
              {extraction.tasks.map((t, i) => (
                <div
                  key={i}
                  className={`rounded-xl bg-white border border-zinc-200 px-4 py-3 transition-all duration-400 ${vis(taskItemAt(i))}`}
                  style={{ borderLeft: "3px solid #7C5CFC" }}
                >
                  <div className="flex items-start gap-3">
                    <CheckboxIcon />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-800">{t.title}</p>
                      {t.description && <p className="text-xs text-zinc-400 mt-0.5">{t.description}</p>}
                    </div>
                    <span
                      className="shrink-0 mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                      style={{ color: PRIORITY_COLOR[t.priority] ?? PRIORITY_COLOR.MEDIUM, backgroundColor: `${PRIORITY_COLOR[t.priority] ?? PRIORITY_COLOR.MEDIUM}15` }}
                    >
                      {t.priority}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400">
                    <LockIcon />
                    <span>Sign up to save to your task inbox</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Goals */}
        {hasGoals && (
          <div className={`mb-5 transition-all duration-500 ${vis(goalsHeaderAt)}`}>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#7C5CFC] mb-3">Goals</p>
            <div className="space-y-2">
              {extraction.goals.map((g, i) => (
                <div
                  key={i}
                  className={`rounded-xl bg-white border border-zinc-200 px-4 py-3 transition-all duration-400 ${vis(goalItemAt(i))}`}
                  style={{ borderLeft: "3px solid #A78BFA" }}
                >
                  <div className="flex items-start gap-3">
                    <FlagIcon />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-800">{g.title}</p>
                      {g.description && <p className="text-xs text-zinc-400 mt-0.5">{g.description}</p>}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400">
                    <LockIcon />
                    <span>Sign up to start tracking this goal</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Themes */}
        {hasThemes && (
          <div className={`mb-8 transition-all duration-500 ${vis(themesHeaderAt)}`}>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#7C5CFC] mb-3">What&rsquo;s on your mind</p>
            <div className="flex flex-wrap gap-2">
              {extraction.themes.map((t, i) => (
                <span
                  key={t}
                  className={`rounded-full bg-[#7C5CFC]/8 border border-[#7C5CFC]/15 px-3.5 py-1.5 text-sm font-medium text-[#7C5CFC] transition-all duration-300 ${scaleVis(themeItemAt(i))}`}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Save CTA Section ─────────────────────────────────────── */}
        <div className={`transition-all duration-500 ${vis(buttonAt)}`}>
          {/* Countdown timer */}
          <div className="text-center mb-6">
            <p className="text-xs text-zinc-400">
              Debrief expires in{" "}
              <span className="font-mono font-semibold text-zinc-600 tabular-nums">{countdown}</span>
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 sm:p-8">
            <h3 className="text-xl font-bold text-zinc-900 text-center mb-2">
              Your debrief is ready. Create an account to keep it forever.
            </h3>
            <p className="text-sm text-zinc-500 text-center mb-6">
              This debrief will be deleted in {countdown}. Don&rsquo;t lose your progress.
            </p>

            {/* OAuth buttons */}
            <div className="space-y-3 mb-4">
              <button
                onClick={() => handleOAuthSignup("google")}
                disabled={signupLoading !== null}
                className="w-full flex items-center justify-center gap-3 rounded-xl bg-white border border-zinc-200 px-4 py-3.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 hover:border-zinc-300 active:scale-[0.98] disabled:opacity-50"
              >
                {signupLoading === "google" ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
                ) : (
                  <GoogleLogo />
                )}
                Continue with Google
              </button>

              <button
                onClick={() => handleOAuthSignup("apple")}
                disabled={signupLoading !== null}
                className="w-full flex items-center justify-center gap-3 rounded-xl bg-zinc-900 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
              >
                {signupLoading === "apple" ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
                ) : (
                  <AppleLogo />
                )}
                Continue with Apple
              </button>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-zinc-200" />
              <span className="text-xs text-zinc-400">or</span>
              <div className="flex-1 h-px bg-zinc-200" />
            </div>

            {/* Email signup link */}
            <a
              href="/auth/signup"
              className="block w-full text-center rounded-xl border border-[#7C5CFC]/30 bg-[#7C5CFC]/5 px-4 py-3.5 text-sm font-semibold text-[#7C5CFC] transition hover:bg-[#7C5CFC]/10 active:scale-[0.98]"
            >
              Sign up with email
            </a>

            <p className="mt-4 text-xs text-zinc-400 text-center">
              Your tasks, goals, and insights will be waiting for you.
            </p>
          </div>

          {/* Social proof below CTA */}
          <div className="mt-6 text-center">
            <p className="text-sm font-medium text-zinc-400 mb-1">
              4.9 <span className="text-amber-400">&#9733;&#9733;&#9733;&#9733;&#9733;</span> from 127+ users
            </p>
            <p className="text-xs text-zinc-400">
              30-day free trial. No credit card.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Post-Signup Celebration ────────────────────────────────────────────────

function CelebrationScreen() {
  const [stage, setStage] = useState<"dark" | "text" | "confetti" | "redirect">("dark");

  useEffect(() => {
    const t1 = setTimeout(() => setStage("text"), 500);
    const t2 = setTimeout(() => {
      setStage("confetti");
      const colors = ["#7C5CFC", "#A78BFA", "#C4B5FD", "#F59E0B", "#22C55E", "#60A5FA", "#F472B6"];
      const duration = 1500;
      const end = Date.now() + duration;
      (function frame() {
        confetti({ particleCount: 4, angle: 60, spread: 65, origin: { x: 0, y: 0.6 }, colors, zIndex: 9999 });
        confetti({ particleCount: 4, angle: 120, spread: 65, origin: { x: 1, y: 0.6 }, colors, zIndex: 9999 });
        if (Date.now() < end) requestAnimationFrame(frame);
      })();
      confetti({ particleCount: 80, spread: 100, origin: { x: 0.5, y: 0.45 }, colors, zIndex: 9999, startVelocity: 35 });
    }, 1500);
    const t3 = setTimeout(() => {
      setStage("redirect");
      window.location.href = "/auth/signup/success?from_try=1";
    }, 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-1000 ${
        stage === "confetti" || stage === "redirect" ? "bg-white" : "bg-[#181614]"
      }`}
    >
      <h1
        className={`text-4xl font-bold tracking-tight sm:text-5xl transition-all duration-700 ${
          stage === "dark"
            ? "opacity-0 scale-95"
            : stage === "confetti" || stage === "redirect"
              ? "opacity-0 scale-110 text-zinc-900"
              : "opacity-100 scale-100 text-white"
        }`}
      >
        You&rsquo;re in.
      </h1>
    </div>
  );
}
