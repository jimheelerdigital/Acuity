"use client";

import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import {
  type ExtractionResult,
  MOOD_LABELS,
  PRIORITY_COLOR,
} from "@acuity/shared";
import {
  TestimonialCarousel,
  STATIC_CAROUSEL_TESTIMONIALS,
} from "@/components/testimonial-carousel";
import {
  useEntryPolling,
  type PolledEntry,
} from "@/hooks/use-entry-polling";

// ─── Constants ───────────────────────────────────────────────────────────────

const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";
const MAX_SECONDS = 120;
const MIN_SECONDS = 15;
const NUDGE_SECONDS = 30;

const TIMELINE_STAGES = [
  { day: "Day 1", text: "Tasks extracted. Goals tracked. Mood captured." },
  { day: "Day 7", text: "Your first weekly report \u2014 how your week actually went." },
  { day: "Day 30", text: "Patterns emerge across your life." },
  { day: "Day 90", text: "Your quarterly memoir \u2014 a story only you could tell." },
  { day: "1 Year", text: "A living model of your life. Six domains. One debrief at a time." },
];

const SUGGESTED_PROMPTS = [
  "What happened today?",
  "What\u2019s taking up your mental space?",
  "What do you want to get done this week?",
];

const VALUE_PROPS = [
  "Daily debriefs",
  "Weekly reports every Sunday",
  "Pattern detection",
  "Life Matrix across 6 domains",
  "Quarterly memoir PDF",
];

// Short punchy quotes for rotating social proof on record screen
const MINI_TESTIMONIALS = [
  { quote: "I just talk. The AI handles everything else.", name: "Jamie L." },
  { quote: "The weekly reports changed how I see my week.", name: "Marcus T." },
  { quote: "I actually sleep now. Tasks out of my head.", name: "Sarah K." },
];

type Screen = "intro" | "record" | "processing" | "extraction" | "cta";

// ─── Main Component ──────────────────────────────────────────────────────────

export function FirstDebriefFlow({
  skipToDownload,
}: {
  skipToDownload: boolean;
}) {
  const [screen, setScreen] = useState<Screen>(
    skipToDownload ? "cta" : "intro"
  );
  const [entryId, setEntryId] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);

  // Intro screen uses dark bg; record screen uses light bg; others use dark
  const bgClass =
    screen === "record" || screen === "processing"
      ? "bg-white text-zinc-900"
      : "bg-[#181614] text-[#F5EDE4]";

  return (
    <div className={`min-h-screen transition-colors duration-1000 ${bgClass}`}>
      {screen === "intro" && (
        <IntroAnimation onComplete={() => setScreen("record")} />
      )}
      {screen === "record" && (
        <RecordScreen
          onRecorded={(id) => {
            setEntryId(id);
            setScreen("processing");
          }}
          onSkip={() => setScreen("cta")}
        />
      )}
      {screen === "processing" && entryId && (
        <ProcessingScreen
          entryId={entryId}
          onComplete={(ext) => {
            setExtraction(ext);
            setScreen("extraction");
          }}
        />
      )}
      {screen === "extraction" && extraction && (
        <ExtractionScreen
          extraction={extraction}
          onContinue={() => setScreen("cta")}
        />
      )}
      {screen === "cta" && <CTAScreen />}
    </div>
  );
}

// ─── Intro Animation ─────────────────────────────────────────────────────────

function IntroAnimation({ onComplete }: { onComplete: () => void }) {
  const [stage, setStage] = useState<"pause" | "text" | "confetti" | "done">(
    "pause"
  );

  useEffect(() => {
    // 0ms: dark screen
    // 500ms: "You're in." appears
    // 1500ms: confetti + bg brightens
    // 3500ms: transition to record screen
    const t1 = setTimeout(() => setStage("text"), 500);
    const t2 = setTimeout(() => {
      setStage("confetti");
      // Fire confetti burst
      const duration = 1500;
      const end = Date.now() + duration;
      const colors = ["#7C5CFC", "#A78BFA", "#C4B5FD", "#F59E0B", "#22C55E", "#60A5FA", "#F472B6"];

      (function frame() {
        confetti({
          particleCount: 4,
          angle: 60,
          spread: 65,
          origin: { x: 0, y: 0.6 },
          colors,
          zIndex: 9999,
        });
        confetti({
          particleCount: 4,
          angle: 120,
          spread: 65,
          origin: { x: 1, y: 0.6 },
          colors,
          zIndex: 9999,
        });
        if (Date.now() < end) requestAnimationFrame(frame);
      })();

      // Also fire a center burst
      confetti({
        particleCount: 80,
        spread: 100,
        origin: { x: 0.5, y: 0.45 },
        colors,
        zIndex: 9999,
        startVelocity: 35,
      });
    }, 1500);
    const t3 = setTimeout(() => {
      setStage("done");
      onComplete();
    }, 3500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-1000 ${
        stage === "confetti" || stage === "done"
          ? "bg-white"
          : "bg-[#181614]"
      }`}
    >
      <h1
        className={`text-4xl font-bold tracking-tight sm:text-5xl transition-all duration-700 ${
          stage === "pause"
            ? "opacity-0 scale-95"
            : stage === "confetti" || stage === "done"
              ? "opacity-0 scale-110 text-zinc-900"
              : "opacity-100 scale-100 text-white"
        }`}
      >
        You&rsquo;re in.
      </h1>
    </div>
  );
}

// ─── Screen 1: Record ────────────────────────────────────────────────────────

function RecordScreen({
  onRecorded,
  onSkip,
}: {
  onRecorded: (entryId: string) => void;
  onSkip: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "recording" | "uploading" | "error">("idle");
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

  // Stagger entrance animation
  useEffect(() => {
    const t1 = setTimeout(() => setShowHeadline(true), 200);
    const t2 = setTimeout(() => setShowSubhead(true), 600);
    const t3 = setTimeout(() => setShowMic(true), 1000);
    const t4 = setTimeout(() => setShowExtra(true), 1400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  // Rotate testimonials every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTestimonialIdx((prev) => (prev + 1) % MINI_TESTIMONIALS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Show suggested prompts after 10 seconds of recording
  useEffect(() => {
    if (phase === "recording") {
      promptTimerRef.current = setTimeout(() => setShowPrompts(true), 10_000);
    } else {
      setShowPrompts(false);
    }
    return () => {
      if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
    };
  }, [phase]);

  const startRecording = async () => {
    setError(null);
    setElapsed(0);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: bestMimeType() });
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        const baseMime = mr.mimeType.split(";")[0] || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: baseMime });
        const duration = Math.round(
          (Date.now() - startTimeRef.current) / 1000
        );
        upload(blob, duration, baseMime);
      };

      mr.start(1000);
      startTimeRef.current = Date.now();
      setPhase("recording");

      timerRef.current = setInterval(() => {
        const secs = Math.round(
          (Date.now() - startTimeRef.current) / 1000
        );
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
    if (secs < MIN_SECONDS) return; // ignore, too short
    mediaRecorderRef.current?.stop();
  };

  const upload = async (blob: Blob, duration: number, mime: string) => {
    setPhase("uploading");
    const fd = new FormData();
    fd.append("audio", blob, `recording.${extFromMime(mime)}`);
    fd.append("durationSeconds", String(duration));

    try {
      const res = await fetch("/api/record", { method: "POST", body: fd });

      if (res.status === 402) {
        window.location.href = "/upgrade?src=paywall_redirect";
        return;
      }
      if (res.status === 429) {
        setError("You\u2019re recording too fast \u2014 try again in a minute.");
        setPhase("error");
        return;
      }

      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

      // Async path: 202 { entryId, status: "QUEUED" }
      if (res.status === 202 && body.entryId) {
        onRecorded(body.entryId as string);
        return;
      }

      // Sync path fallback — still transition to processing
      if (body.entryId) {
        onRecorded(body.entryId as string);
        return;
      }

      throw new Error("No entryId in response");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setPhase("error");
    }
  };

  const handleMicClick = () => {
    if (phase === "recording") return stopRecording();
    if (phase === "idle" || phase === "error") return startRecording();
  };

  const tooShort = phase === "recording" && elapsed < MIN_SECONDS;
  const showNudge = phase === "recording" && elapsed > 0 && elapsed < NUDGE_SECONDS;
  const isIdle = phase === "idle" || phase === "error";
  const currentTestimonial = MINI_TESTIMONIALS[testimonialIdx];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-8 sm:py-12">
      <div className="w-full max-w-md text-center">
        {/* Headline + subhead — above mic */}
        {isIdle && (
          <div className="mb-12 sm:mb-16">
            <div
              className={`transition-all duration-700 ${
                showHeadline
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4"
              }`}
            >
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
                Let&rsquo;s do your first debrief.
              </h1>
            </div>
            <div
              className={`transition-all duration-700 delay-100 ${
                showSubhead
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4"
              }`}
            >
              <p className="mt-4 text-base text-zinc-500 leading-relaxed max-w-sm mx-auto">
                Just talk. About your day, your goals, whatever&rsquo;s on your
                mind. The AI handles the rest.
              </p>
            </div>
          </div>
        )}

        {/* Recording timer — above mic when recording */}
        {phase === "recording" && (
          <div className="mb-10 animate-fade-in">
            <p className="text-4xl font-mono font-semibold tabular-nums text-zinc-900 sm:text-5xl">
              {formatTime(elapsed)}
            </p>
            {tooShort && (
              <p className="mt-3 text-sm text-zinc-400">
                Keep going... {MIN_SECONDS - elapsed}s minimum
              </p>
            )}
            {!tooShort && showNudge && (
              <p className="mt-3 text-sm text-zinc-400">
                You&rsquo;re doing great. Keep going or tap to stop.
              </p>
            )}
            {!tooShort && !showNudge && (
              <p className="mt-3 text-sm text-zinc-400">
                Tap the stop button when you&rsquo;re done
              </p>
            )}
          </div>
        )}

        {phase === "uploading" && (
          <div className="mb-10">
            <p className="text-sm text-zinc-400 animate-pulse">
              Uploading your recording...
            </p>
          </div>
        )}

        {/* Mic button — dead center */}
        <div
          className={`flex justify-center mb-10 sm:mb-12 transition-all duration-700 ${
            showMic
              ? "opacity-100 scale-100"
              : "opacity-0 scale-50"
          }`}
          style={{
            transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          <div className="relative flex items-center justify-center">
            {/* Ripple rings — idle state, expanding outward */}
            {phase === "idle" && (
              <>
                <span
                  className="absolute h-32 w-32 rounded-full animate-mic-ripple sm:h-36 sm:w-36"
                  style={{
                    background: "radial-gradient(circle, rgba(124,92,252,0.25) 0%, rgba(167,139,250,0.08) 70%, transparent 100%)",
                  }}
                />
                <span
                  className="absolute h-32 w-32 rounded-full animate-mic-ripple sm:h-36 sm:w-36"
                  style={{
                    animationDelay: "1s",
                    background: "radial-gradient(circle, rgba(124,92,252,0.18) 0%, rgba(196,181,253,0.05) 70%, transparent 100%)",
                  }}
                />
                <span
                  className="absolute h-32 w-32 rounded-full animate-mic-ripple sm:h-36 sm:w-36"
                  style={{
                    animationDelay: "2s",
                    background: "radial-gradient(circle, rgba(124,92,252,0.12) 0%, rgba(221,214,254,0.03) 70%, transparent 100%)",
                  }}
                />
              </>
            )}

            <button
              onClick={handleMicClick}
              disabled={phase === "uploading"}
              aria-label={
                phase === "recording" ? "Stop recording" : "Start recording"
              }
              className={`relative z-10 flex items-center justify-center rounded-full transition-all duration-300 ${
                phase === "recording"
                  ? "h-32 w-32 scale-110 sm:h-36 sm:w-36"
                  : phase === "uploading"
                    ? "h-32 w-32 bg-zinc-200 cursor-wait sm:h-36 sm:w-36"
                    : "h-32 w-32 hover:scale-105 active:scale-95 sm:h-36 sm:w-36 animate-mic-glow"
              }`}
              style={
                phase === "recording"
                  ? {
                      background: "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)",
                      boxShadow: "0 8px 32px rgba(239,68,68,0.35), 0 2px 8px rgba(239,68,68,0.2)",
                    }
                  : phase === "uploading"
                    ? undefined
                    : {
                        background: "linear-gradient(135deg, #7C5CFC 0%, #9F7AEA 50%, #7C3AED 100%)",
                        boxShadow: "0 8px 40px rgba(124,92,252,0.3), 0 2px 12px rgba(124,58,237,0.2)",
                      }
              }
            >
              {/* Recording pulse */}
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
                      <span
                        key={i}
                        className="wave-bar w-1.5 rounded-full bg-white"
                        style={{
                          height: 24 + Math.random() * 14,
                          animationDelay: `${i * 0.15}s`,
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="h-11 w-11 rounded-lg bg-white" />
                )
              ) : phase === "uploading" ? (
                <Spinner />
              ) : (
                <MicIcon size={48} />
              )}
            </button>
          </div>
        </div>

        {/* Prompt text below mic */}
        {isIdle && (
          <p className="text-sm text-zinc-400 mb-10">
            No wrong answers. Most people start with &ldquo;Today I...&rdquo;
          </p>
        )}

        {phase === "error" && (
          <div className="animate-fade-in mb-10">
            <p className="text-sm text-red-500">{error}</p>
            <p className="mt-1 text-xs text-zinc-400">
              Tap the mic to try again
            </p>
          </div>
        )}

        {/* Suggested prompts — appear after 10s of recording */}
        {showPrompts && phase === "recording" && (
          <div className="space-y-2 animate-fade-in mb-10">
            <p className="text-xs text-zinc-300 uppercase tracking-widest">
              Need a prompt?
            </p>
            {SUGGESTED_PROMPTS.map((p) => (
              <p key={p} className="text-sm text-zinc-400 italic">
                &ldquo;{p}&rdquo;
              </p>
            ))}
          </div>
        )}

        {/* Social proof + skip — below mic */}
        {isIdle && (
          <div
            className={`transition-all duration-700 ${
              showExtra
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4"
            }`}
          >
            <div className="mb-6">
              <p className="text-sm font-medium text-zinc-400 mb-2">
                4.9{" "}
                <span className="text-amber-400">
                  &#9733;&#9733;&#9733;&#9733;&#9733;
                </span>{" "}
                from 127+ users
              </p>
              <div className="relative h-10 overflow-hidden">
                {MINI_TESTIMONIALS.map((t, i) => (
                  <p
                    key={t.name}
                    className={`absolute inset-x-0 text-sm italic text-zinc-400 transition-all duration-500 ${
                      i === testimonialIdx
                        ? "opacity-100 translate-y-0"
                        : "opacity-0 translate-y-4"
                    }`}
                  >
                    &ldquo;{t.quote}&rdquo;{" "}
                    <span className="not-italic text-zinc-300">&mdash; {t.name}</span>
                  </p>
                ))}
              </div>
            </div>

            <button
              onClick={onSkip}
              className="text-sm text-zinc-300 hover:text-zinc-500 transition underline underline-offset-4"
            >
              I&rsquo;ll do this later
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Screen 2: Processing + Timeline ─────────────────────────────────────────

// Gradient orb colors per stage — subtle background bloom
const STAGE_ORBS = [
  "radial-gradient(circle, rgba(124,92,252,0.08) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(167,139,250,0.10) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(196,181,253,0.12) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(245,158,11,0.08) 0%, rgba(124,92,252,0.06) 40%, transparent 70%)",
];

const STAGE_MS = 3500;

function ProcessingScreen({
  entryId,
  onComplete,
}: {
  entryId: string;
  onComplete: (extraction: ExtractionResult) => void;
}) {
  const poll = useEntryPolling(entryId);
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [animationDone, setAnimationDone] = useState(false);
  const completedRef = useRef(false);
  const extractionRef = useRef<ExtractionResult | null>(null);

  // Timeline animation — 3.5 seconds per stage, 17.5 seconds total
  useEffect(() => {
    const interval = setInterval(() => {
      setTimelineIndex((prev) => {
        if (prev >= TIMELINE_STAGES.length - 1) {
          clearInterval(interval);
          setAnimationDone(true);
          return prev;
        }
        return prev + 1;
      });
    }, STAGE_MS);
    return () => clearInterval(interval);
  }, []);

  // Build extraction from polled entry when complete
  useEffect(() => {
    if (completedRef.current) return;
    if (
      (poll.status === "complete" || poll.status === "partial") &&
      poll.entry
    ) {
      extractionRef.current = polledEntryToExtraction(poll.entry);
    }
  }, [poll.status, poll.entry]);

  // Transition when BOTH animation is done AND processing is done
  useEffect(() => {
    if (completedRef.current) return;
    const ext = extractionRef.current;
    if (animationDone && ext) {
      completedRef.current = true;
      onComplete(ext);
    }
  }, [animationDone, poll.status, onComplete]);

  // Handle failures
  useEffect(() => {
    if (poll.status === "failed" || poll.status === "timeout") {
      if (animationDone) {
        completedRef.current = true;
        onComplete(
          extractionRef.current ?? {
            summary: "Your recording has been saved.",
            mood: "NEUTRAL",
            moodScore: 5,
            energy: 5,
            themes: [],
            themesDetailed: [],
            wins: [],
            blockers: [],
            insights: [],
            tasks: [],
            goals: [],
          }
        );
      }
    }
  }, [poll.status, animationDone, onComplete]);

  const processingLabel = getProcessingLabel(poll.phase);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 py-12 overflow-hidden">
      {/* Floating particles background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-[#7C5CFC]/[0.04]"
            style={{
              width: 4 + (i % 3) * 3,
              height: 4 + (i % 3) * 3,
              left: `${8 + (i * 7.5) % 85}%`,
              top: `${10 + ((i * 13) % 75)}%`,
              animation: `float ${5 + (i % 4) * 2}s ease-in-out infinite`,
              animationDelay: `${(i * 0.7) % 4}s`,
            }}
          />
        ))}
      </div>

      {/* Gradient orb behind text — shifts per stage */}
      <div
        className="absolute w-[400px] h-[400px] sm:w-[500px] sm:h-[500px] transition-all duration-1000 pointer-events-none"
        style={{ background: STAGE_ORBS[timelineIndex] ?? STAGE_ORBS[0] }}
      />

      <div className="relative z-10 w-full max-w-lg">
        {/* Timeline animation */}
        <div className="mb-20">
          <div className="relative min-h-[160px] sm:min-h-[180px] flex items-center justify-center">
            {TIMELINE_STAGES.map((stage, i) => (
              <div
                key={i}
                className="absolute inset-0 flex flex-col items-center justify-center text-center"
                style={{
                  transition: "opacity 0.5s ease, transform 0.5s ease",
                  opacity: i === timelineIndex ? 1 : 0,
                  transform:
                    i === timelineIndex
                      ? "translateY(0)"
                      : i < timelineIndex
                        ? "translateY(-24px)"
                        : "translateY(24px)",
                }}
              >
                <span
                  className="text-sm font-bold uppercase tracking-[0.25em] text-[#7C5CFC] mb-4 sm:text-base"
                  style={{
                    textShadow: i === timelineIndex ? "0 0 20px rgba(124,92,252,0.3)" : "none",
                  }}
                >
                  {stage.day}
                </span>
                <p className="text-2xl font-bold text-zinc-800 leading-relaxed sm:text-3xl">
                  {stage.text}
                </p>
              </div>
            ))}
          </div>

          {/* Timeline dots — active dot glows and expands */}
          <div className="mt-10 flex items-center justify-center gap-2.5">
            {TIMELINE_STAGES.map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-700"
                style={
                  i === timelineIndex
                    ? {
                        width: 28,
                        height: 6,
                        background: "linear-gradient(90deg, #7C5CFC, #9F7AEA)",
                        boxShadow: "0 0 12px 2px rgba(124,92,252,0.4)",
                      }
                    : i < timelineIndex
                      ? {
                          width: 6,
                          height: 6,
                          backgroundColor: "rgba(124,92,252,0.35)",
                        }
                      : {
                          width: 6,
                          height: 6,
                          backgroundColor: "rgba(0,0,0,0.08)",
                        }
                }
              />
            ))}
          </div>
        </div>

        {/* Processing status */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2.5 rounded-full bg-zinc-100 px-5 py-2.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#7C5CFC] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#7C5CFC]" />
            </span>
            <span className="text-sm text-zinc-500">{processingLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function getProcessingLabel(phase: string | null): string {
  switch (phase) {
    case "QUEUED":
    case "uploading":
      return "Transcribing...";
    case "TRANSCRIBING":
      return "Transcribing...";
    case "EXTRACTING":
      return "Extracting tasks and goals...";
    case "PERSISTING":
      return "Building your first snapshot...";
    case "COMPLETE":
      return "Done!";
    case "PARTIAL":
      return "Almost there...";
    default:
      return "Transcribing...";
  }
}

// ─── Screen 3: Extraction Reveal ─────────────────────────────────────────────

function ExtractionScreen({
  extraction,
  onContinue,
}: {
  extraction: ExtractionResult;
  onContinue: () => void;
}) {
  const [visibleSections, setVisibleSections] = useState(0);

  // Stagger sections appearing: 0→1→2→3→4 over ~3 seconds
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const totalSections = 4; // mood, tasks, goals, themes
    for (let i = 1; i <= totalSections; i++) {
      timers.push(setTimeout(() => setVisibleSections(i), i * 600));
    }
    return () => timers.forEach(clearTimeout);
  }, []);

  const hasTasks = extraction.tasks.length > 0;
  const hasGoals = extraction.goals.length > 0;
  const hasThemes = extraction.themes.length > 0;

  return (
    <div className="flex min-h-screen flex-col items-center px-6 py-12">
      <div className="w-full max-w-md">
        {/* Headline */}
        <div className="text-center mb-10 animate-fade-in">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            That&rsquo;s what 60 seconds gets&nbsp;you.
          </h2>
          <p className="mt-2 text-sm text-[#F5EDE4]/50">
            Do this daily and every Sunday you&rsquo;ll get a report showing how
            your life is actually going.
          </p>
        </div>

        {/* Summary + Mood */}
        <div
          className={`mb-4 rounded-2xl bg-[#1E1C1A] border border-white/5 p-5 transition-all duration-700 ${
            visibleSections >= 1
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4"
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            <MoodDot mood={extraction.mood} />
            <span className="text-sm font-medium text-white">
              {MOOD_LABELS[extraction.mood] ?? "Neutral"}
            </span>
            <span className="text-xs text-[#F5EDE4]/40">
              &middot; Energy {extraction.energy}/10
            </span>
          </div>
          <p className="text-sm text-[#F5EDE4]/70 leading-relaxed">
            {extraction.summary}
          </p>
        </div>

        {/* Tasks */}
        {hasTasks && (
          <div
            className={`mb-4 rounded-2xl bg-[#1E1C1A] border border-white/5 p-5 transition-all duration-700 ${
              visibleSections >= 2
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4"
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7C5CFC] mb-3">
              Tasks found
            </p>
            <ul className="space-y-2">
              {extraction.tasks.map((t, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 rounded-lg bg-[#252220] px-3 py-2.5"
                >
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        PRIORITY_COLOR[t.priority] ?? PRIORITY_COLOR.MEDIUM,
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white">{t.title}</p>
                    {t.description && (
                      <p className="text-xs text-[#F5EDE4]/40 mt-0.5">
                        {t.description}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Goals */}
        {hasGoals && (
          <div
            className={`mb-4 rounded-2xl bg-[#1E1C1A] border border-white/5 p-5 transition-all duration-700 ${
              visibleSections >= 3
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4"
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7C5CFC] mb-3">
              Goals detected
            </p>
            <ul className="space-y-2">
              {extraction.goals.map((g, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 rounded-lg bg-[#252220] px-3 py-2.5"
                >
                  <span className="mt-1 text-[#7C5CFC]">&rarr;</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white">{g.title}</p>
                    {g.description && (
                      <p className="text-xs text-[#F5EDE4]/40 mt-0.5">
                        {g.description}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Themes */}
        {hasThemes && (
          <div
            className={`mb-8 transition-all duration-700 ${
              visibleSections >= 4
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4"
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7C5CFC] mb-3">
              What&rsquo;s on your mind
            </p>
            <div className="flex flex-wrap gap-2">
              {extraction.themes.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-[#7C5CFC]/10 border border-[#7C5CFC]/20 px-3 py-1 text-sm text-[#F5EDE4]/80"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Continue button */}
        <div
          className={`text-center transition-all duration-700 ${
            visibleSections >= 4
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4"
          }`}
        >
          <button
            onClick={onContinue}
            className="inline-flex items-center gap-2 rounded-full bg-[#7C5CFC] px-8 py-4 text-base font-semibold text-white transition-all duration-300 hover:bg-[#6B4FE0] hover:shadow-xl hover:shadow-[#7C5CFC]/25 hover:-translate-y-0.5 active:scale-95"
          >
            Continue &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 4: CTA + Social Proof ────────────────────────────────────────────

function CTAScreen() {
  return (
    <div className="min-h-screen">
      {/* Hero CTA */}
      <div className="flex flex-col items-center justify-center px-6 pt-16 pb-10 sm:pt-24 sm:pb-14">
        <div className="w-full max-w-md text-center">
          <img
            src="/AcuityLogo.png"
            alt="Acuity"
            className="mx-auto mb-6"
            style={{ width: 40, height: 40 }}
          />

          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Get Acuity on your phone so you can debrief&nbsp;anywhere.
          </h2>

          {/* App Store button */}
          <div className="mt-8">
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative inline-flex items-center gap-3 rounded-full bg-[#7C5CFC] px-8 py-4 text-base font-semibold text-white transition-all duration-300 hover:bg-[#6B4FE0] hover:shadow-xl hover:shadow-[#7C5CFC]/25 hover:-translate-y-0.5 active:scale-95"
            >
              <span className="absolute inset-0 rounded-full bg-[#7C5CFC]/30 animate-pulse-ring" />
              <AppleLogo />
              Download on the App Store
            </a>
          </div>

          {/* Continue in browser */}
          <div className="mt-6">
            <a
              href="/home"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-[#F5EDE4]/80 transition hover:border-white/40 hover:text-white active:scale-95"
            >
              Continue in your browser &rarr;
            </a>
          </div>

          {/* QR Code — desktop only */}
          <div className="mt-6 hidden sm:block">
            <p className="text-xs text-[#F5EDE4]/40 mb-3">
              On desktop? Scan to download.
            </p>
            <div className="inline-block rounded-xl bg-white p-3">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(APP_STORE_URL)}&bgcolor=ffffff&color=181614`}
                alt="QR code to download Acuity"
                width={140}
                height={140}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Social proof */}
      <section className="px-6 pb-8">
        <div className="mx-auto max-w-md text-center">
          <p className="text-lg font-semibold text-white mb-1">
            4.9 stars &middot; 127+ users
          </p>
        </div>
      </section>

      {/* Testimonials */}
      <section className="pb-10">
        <TestimonialCarousel testimonials={STATIC_CAROUSEL_TESTIMONIALS} />
      </section>

      {/* Value props */}
      <section className="px-6 pb-10">
        <div className="mx-auto max-w-md">
          <div className="flex flex-wrap justify-center gap-2">
            {VALUE_PROPS.map((v) => (
              <span
                key={v}
                className="rounded-full bg-[#7C5CFC]/10 border border-[#7C5CFC]/20 px-3 py-1.5 text-xs font-medium text-[#F5EDE4]/70"
              >
                {v}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Urgency */}
      <section className="px-6 pb-16 sm:pb-24">
        <div className="mx-auto max-w-md text-center">
          <p className="text-sm text-amber-400/80">
            Your 30-day free trial has started. Your first debrief is done.
            Keep the streak going.
          </p>
        </div>
      </section>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function polledEntryToExtraction(entry: PolledEntry): ExtractionResult {
  const raw = (entry.rawAnalysis ?? {}) as Partial<ExtractionResult>;
  return {
    summary: entry.summary ?? raw.summary ?? "",
    mood: (entry.mood as ExtractionResult["mood"]) ?? raw.mood ?? "NEUTRAL",
    moodScore: entry.moodScore ?? raw.moodScore ?? 5,
    energy: entry.energy ?? raw.energy ?? 5,
    themes: entry.themes ?? raw.themes ?? [],
    themesDetailed:
      raw.themesDetailed ??
      (entry.themes ?? raw.themes ?? []).map((label: string) => ({
        label,
        sentiment: "NEUTRAL" as const,
      })),
    wins: entry.wins ?? raw.wins ?? [],
    blockers: entry.blockers ?? raw.blockers ?? [],
    insights: raw.insights ?? [],
    tasks: raw.tasks ?? [],
    goals: raw.goals ?? [],
    lifeAreaMentions: raw.lifeAreaMentions,
  };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function bestMimeType(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

function extFromMime(mime: string): string {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

function MoodDot({ mood }: { mood: string }) {
  const colors: Record<string, string> = {
    GREAT: "#22C55E",
    GOOD: "#4ADE80",
    NEUTRAL: "#94A3B8",
    LOW: "#F59E0B",
    ROUGH: "#EF4444",
  };
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ backgroundColor: colors[mood] ?? colors.NEUTRAL }}
    />
  );
}

function MicIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 18 18"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M14.94 13.5c-.37.82-.55 1.19-.97 1.91-.59.99-1.42 2.24-2.45 2.25-.92.01-1.16-.6-2.41-.59-1.25.01-1.51.6-2.43.59-1.03-.01-1.81-1.13-2.4-2.12C2.92 13.39 2.8 10.77 3.68 9.39c.63-1 1.63-1.58 2.57-1.58.96 0 1.56.6 2.35.6.77 0 1.24-.6 2.35-.6.84 0 1.73.46 2.35 1.24-2.06 1.13-1.73 4.07.37 4.85-.29.7-.43.99-.73 1.6zM11.37 3c.47-.6.83-1.45.7-2.32-.77.05-1.67.54-2.2 1.17-.48.57-.88 1.43-.73 2.26.84.03 1.72-.47 2.23-1.11z" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="h-10 w-10 animate-spin text-white/40"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
