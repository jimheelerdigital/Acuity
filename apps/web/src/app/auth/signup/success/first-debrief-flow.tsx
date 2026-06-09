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
import { trackOnboardingEvent } from "@/lib/track-onboarding";

// ─── Constants ───────────────────────────────────────────────────────────────

const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";
const MAX_SECONDS = 120;
const MIN_SECONDS = 15;
const NUDGE_SECONDS = 30;

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
  { quote: "I just talk. Acuity handles everything else.", name: "Jamie L." },
  { quote: "The weekly reports changed how I see my week.", name: "Marcus T." },
  { quote: "I actually sleep now. Tasks out of my head.", name: "Sarah K." },
];

type Screen = "intro" | "record" | "processing" | "extraction" | "cta";

// ─── Main Component ──────────────────────────────────────────────────────────

export function FirstDebriefFlow({
  skipToDownload,
  userId,
}: {
  skipToDownload: boolean;
  userId: string | null;
}) {
  const [screen, setScreen] = useState<Screen>(
    skipToDownload ? "cta" : "intro"
  );
  const [entryId, setEntryId] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);

  // Shorthand for tracking with userId baked in
  const track = (event: string) => trackOnboardingEvent(event, { userId });

  // Intro screen uses dark bg; record screen uses light bg; others use dark
  // All screens use white theme for seamless flow
  const bgClass = screen === "intro"
    ? "bg-acuity-bg text-[#F5EDE4]"
    : "bg-white text-zinc-900";

  return (
    <div className={`min-h-screen transition-colors duration-1000 ${bgClass}`}>
      {screen === "intro" && (
        <IntroAnimation onComplete={() => setScreen("record")} />
      )}
      {screen === "record" && (
        <RecordScreen
          userId={userId}
          onRecorded={(id) => {
            track("onboarding_recording_completed");
            setEntryId(id);
            setScreen("processing");
          }}
          onSkip={() => {
            track("onboarding_skipped");
            setScreen("cta");
          }}
        />
      )}
      {screen === "processing" && entryId && (
        <ProcessingScreen
          entryId={entryId}
          onComplete={(ext) => {
            track("onboarding_extraction_viewed");
            setExtraction(ext);
            setScreen("extraction");
            // Auto-commit extracted tasks + goals so they appear in
            // the user's task inbox and goal tracker. Fire-and-forget —
            // don't block the extraction reveal screen on this call.
            if (ext.tasks.length > 0 || ext.goals.length > 0) {
              fetch(`/api/entries/${entryId}/extraction`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "commit",
                  tasks: ext.tasks.map((t) => ({
                    title: t.title,
                    description: t.description ?? null,
                    priority: t.priority ?? "MEDIUM",
                    dueDate: t.dueDate ?? null,
                    groupName: t.groupName ?? null,
                  })),
                  goals: ext.goals.map((g) => ({
                    title: g.title,
                    description: g.description ?? null,
                    targetDate: g.targetDate ?? null,
                    lifeArea: null,
                  })),
                }),
              }).catch((err) => {
                // eslint-disable-next-line no-console
                console.error("[first-debrief] auto-commit extraction failed:", err);
              });
            }
          }}
        />
      )}
      {screen === "extraction" && extraction && (
        <ExtractionScreen
          extraction={extraction}
          onContinue={() => setScreen("cta")}
        />
      )}
      {screen === "cta" && <CTAScreen userId={userId} />}
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
          : "bg-acuity-bg"
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
  userId,
}: {
  onRecorded: (entryId: string) => void;
  onSkip: () => void;
  userId: string | null;
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

  // Track screen view
  useEffect(() => {
    trackOnboardingEvent("onboarding_recording_screen_viewed", { userId });
  }, [userId]);

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
    trackOnboardingEvent("onboarding_recording_started", { userId });

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
                mind. We handle the rest.
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
                        background: "var(--acuity-grad-primary)",
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

interface ProcessingSlide {
  label: string;
  text: string;
  testimonial?: { quote: string; name: string };
  comingSoon?: boolean;
  description?: string;
}

const PROCESSING_SLIDES: ProcessingSlide[] = [
  {
    label: "Day 1",
    text: "Tasks extracted. Goals tracked. Mood captured.",
    testimonial: {
      quote: "I used to let tasks pile up in my head until 2 AM. Now I debrief into Acuity and actually sleep.",
      name: "Sarah K.",
    },
  },
  {
    label: "Day 7",
    text: "Your first weekly report \u2014 how your week actually went.",
    testimonial: {
      quote: "The weekly reports changed how I see my week.",
      name: "Marcus T.",
    },
  },
  {
    label: "Day 30",
    text: "Patterns emerge across your life.",
    testimonial: {
      quote: "I didn\u2019t realize I was most productive on Tuesdays until Acuity showed me.",
      name: "Jamie L.",
    },
  },
  {
    label: "Day 90",
    text: "Your quarterly memoir \u2014 a story only you could tell.",
    testimonial: {
      quote: "I shared my quarterly memoir with my therapist. She said it was the most useful thing I\u2019d ever brought in.",
      name: "Alex R.",
    },
  },
  {
    label: "1 Year",
    text: "A living model of your life. Six domains. One debrief at a time.",
    testimonial: {
      quote: "It\u2019s like having a second brain that actually remembers everything.",
      name: "Chris M.",
    },
  },
  {
    label: "Task Management",
    text: "Never forget a task again. Every to-do pulled from your own words.",
    testimonial: {
      quote: "I stopped using my notes app entirely. Acuity catches things I didn\u2019t even realize I committed to.",
      name: "David P.",
    },
  },
  {
    label: "Goal Tracking",
    text: "Real-time progress tracking on the goals that matter to you.",
    testimonial: {
      quote: "I mentioned wanting to run a marathon once. Three weeks later Acuity asked me how training was going.",
      name: "Rachel W.",
    },
  },
  {
    label: "Weekly Report",
    text: "Every Sunday, a personalized report on how your week actually went.",
    testimonial: {
      quote: "Sunday mornings I open my report before I open Instagram. It\u2019s the only app that tells me something real.",
      name: "Jordan K.",
    },
  },
  {
    label: "Life Matrix",
    text: "Your updated \u2018state of you\u2019 \u2014 how have you grown over time?",
    testimonial: {
      quote: "The Life Matrix showed me I was crushing it at work but completely neglecting my relationships. That one insight changed everything.",
      name: "Nina S.",
    },
  },
  {
    label: "Coming Soon",
    text: "Your calendar meets your debrief. See how you spend your time vs. how you feel about it.",
    comingSoon: true,
    description: "Connect Google Calendar and Acuity shows you the gap between what you planned and what actually happened.",
  },
  {
    label: "Coming Soon",
    text: "Search your memory. Ask \u2018What did I say about that project in March?\u2019",
    comingSoon: true,
    description: "Every debrief becomes searchable. Your past self has answers you\u2019ve forgotten.",
  },
  {
    label: "Coming Soon",
    text: "Nudges on tasks and goals you mentioned but haven\u2019t acted on.",
    comingSoon: true,
    description: "Acuity notices when you keep mentioning something but never do it \u2014 and gently calls it out.",
  },
];

// Slide 9 is index 8 (0-based). Slides 0-8 are core, 9-11 are coming soon.
const CORE_SLIDE_COUNT = 9;

const SLIDE_MS = 4000;

// Gradient orb colors per slide (12 + summary)
const SLIDE_ORBS = [
  "radial-gradient(circle, rgba(124,92,252,0.08) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(167,139,250,0.10) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(196,181,253,0.12) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(245,158,11,0.08) 0%, rgba(124,92,252,0.06) 40%, transparent 70%)",
  "radial-gradient(circle, rgba(124,92,252,0.09) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(196,181,253,0.10) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(16,185,129,0.07) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(249,115,22,0.07) 0%, transparent 70%)",
];

function ProcessingScreen({
  entryId,
  onComplete,
}: {
  entryId: string;
  onComplete: (extraction: ExtractionResult) => void;
}) {
  const poll = useEntryPolling(entryId);
  const [slideIndex, setSlideIndex] = useState(0);
  const completedRef = useRef(false);
  const extractionRef = useRef<ExtractionResult | null>(null);
  const maxSlideRef = useRef(0);

  const [subStep, setSubStep] = useState(0);

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

  // Advance slides every 5s. Use a simple counter ref to avoid
  // calling setOnSummary inside setSlideIndex (which React swallows).
  const slideCounterRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const current = slideCounterRef.current;
      const next = current + 1;

      // ISSUE 1 FIX: When processing is done, finish the current slide
      // then go DIRECTLY to extraction — no more slides, no summary gate.
      const processingDone = !!extractionRef.current;
      const hasFailed = poll.status === "failed" || poll.status === "timeout";
      const pastAll = next >= PROCESSING_SLIDES.length;

      if (processingDone || hasFailed || pastAll) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        // Go directly to extraction — skip summary screen
        if (!completedRef.current) {
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
        return;
      }

      // Track coming-soon visibility
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If processing finishes mid-slide, the next interval tick will handle it.
  // But if all slides already played, exit immediately.
  useEffect(() => {
    if (completedRef.current) return;
    if (
      extractionRef.current &&
      slideCounterRef.current >= PROCESSING_SLIDES.length - 1
    ) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      completedRef.current = true;
      onComplete(extractionRef.current);
    }
  }, [poll.status, poll.entry, onComplete]);

  // Sub-step stagger within each slide
  useEffect(() => {
    setSubStep(0);
    const t1 = setTimeout(() => setSubStep(1), 100);
    const t2 = setTimeout(() => setSubStep(2), 700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [slideIndex]);

  const progressPct = getProgressPct(poll.phase, poll.status);
  const processingLabel = getProcessingLabel(poll.phase);

  return (
    <div className="relative flex min-h-screen flex-col px-6 py-8 overflow-hidden">
      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 10 }).map((_, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-acuity-primary/[0.03]"
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
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] sm:w-[500px] sm:h-[500px] transition-all duration-1000 pointer-events-none"
        style={{ background: SLIDE_ORBS[slideIndex % SLIDE_ORBS.length] }}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10">
        <div className="w-full max-w-lg">
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
                          className="text-sm font-bold uppercase tracking-[0.25em] text-acuity-primary sm:text-base"
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
                            <span className="text-acuity-primary/40 text-lg not-italic">&ldquo;</span>
                            {slide.testimonial.quote}
                            <span className="text-acuity-primary/40 text-lg not-italic">&rdquo;</span>
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
                            background: "var(--acuity-grad-primary)",
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
        </div>
      </div>

      {/* Bottom: processing status + progress bar */}
      <div className="flex-none relative z-10 w-full max-w-lg mx-auto mt-6">
        <div className="text-center mb-3">
          <div className="inline-flex items-center gap-2 px-4 py-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-acuity-primary opacity-50" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-acuity-primary" />
            </span>
            <span className="text-xs text-zinc-400">{processingLabel}</span>
          </div>
        </div>
        <div className="h-1 w-full rounded-full bg-zinc-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out"
            style={{
              width: `${progressPct}%`,
              background: "var(--acuity-grad-primary)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function getProgressPct(phase: string | null, status: string): number {
  if (status === "complete" || status === "partial") return 100;
  switch (phase) {
    case "QUEUED":
    case "uploading":
      return 10;
    case "TRANSCRIBING":
      return 35;
    case "EXTRACTING":
      return 65;
    case "PERSISTING":
      return 90;
    case "COMPLETE":
      return 100;
    default:
      return 5;
  }
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

const MOOD_GLOW: Record<string, string> = {
  GREAT: "0 0 24px 4px rgba(34,197,94,0.15)",
  GOOD: "0 0 24px 4px rgba(74,222,128,0.12)",
  NEUTRAL: "0 0 24px 4px rgba(148,163,184,0.10)",
  LOW: "0 0 24px 4px rgba(245,158,11,0.12)",
  ROUGH: "0 0 24px 4px rgba(239,68,68,0.15)",
};

function ExtractionScreen({
  extraction,
  onContinue,
}: {
  extraction: ExtractionResult;
  onContinue: () => void;
}) {
  const [step, setStep] = useState(0);
  // step 0 = nothing, 1 = mood, 2 = tasks header, 3+ = individual tasks,
  // then goals header, individual goals, then themes header, individual themes, then button
  const celebratedRef = useRef(false);

  const hasTasks = extraction.tasks.length > 0;
  const hasGoals = extraction.goals.length > 0;
  const hasThemes = extraction.themes.length > 0;

  // Calculate total steps for stagger
  const taskSteps = hasTasks ? 1 + extraction.tasks.length : 0; // header + items
  const goalSteps = hasGoals ? 1 + extraction.goals.length : 0;
  const themeSteps = hasThemes ? 1 + extraction.themes.length : 0;
  const totalSteps = 1 + taskSteps + goalSteps + themeSteps + 1; // mood + tasks + goals + themes + button

  // Stagger: mood at 400ms, then each subsequent item 150ms apart
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= totalSteps; i++) {
      const delay = i === 1 ? 400 : 400 + (i - 1) * 150;
      timers.push(setTimeout(() => setStep(i), delay));
    }
    return () => timers.forEach(clearTimeout);
  }, [totalSteps]);

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

  // Compute which step each section starts at
  const moodAt = 1;
  const tasksHeaderAt = moodAt + 1;
  const taskItemAt = (i: number) => tasksHeaderAt + 1 + i;
  const goalsHeaderAt = tasksHeaderAt + taskSteps;
  const goalItemAt = (i: number) => goalsHeaderAt + 1 + i;
  const themesHeaderAt = goalsHeaderAt + goalSteps;
  const themeItemAt = (i: number) => themesHeaderAt + 1 + i;
  const buttonAt = totalSteps;

  const vis = (at: number) =>
    step >= at
      ? "opacity-100 translate-y-0"
      : "opacity-0 translate-y-3";

  const scaleVis = (at: number) =>
    step >= at
      ? "opacity-100 scale-100"
      : "opacity-0 scale-75";

  return (
    <div className="flex min-h-screen flex-col items-center px-6 py-12 sm:py-16">
      <div className="w-full max-w-md">
        {/* Headline */}
        <div className="text-center mb-10 animate-fade-in">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            That&rsquo;s what 60 seconds gets&nbsp;you.
          </h2>
          <p className="mt-3 text-base text-zinc-500 leading-relaxed">
            Do this daily and every Sunday you&rsquo;ll get a report showing how
            your life is actually going.
          </p>
        </div>

        {/* Summary + Mood */}
        <div
          className={`mb-5 rounded-2xl bg-white border border-zinc-200 p-5 transition-all duration-500 ${vis(moodAt)}`}
          style={{ boxShadow: step >= moodAt ? (MOOD_GLOW[extraction.mood] ?? MOOD_GLOW.NEUTRAL) : "none" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <MoodDot mood={extraction.mood} />
            <span className="text-sm font-semibold text-zinc-800">
              {MOOD_LABELS[extraction.mood] ?? "Neutral"}
            </span>
            <span className="text-xs text-zinc-400">
              &middot; Energy {extraction.energy}/10
            </span>
          </div>
          {extraction.summary && (
            <p className="text-sm text-zinc-600 leading-relaxed">
              {extraction.summary}
            </p>
          )}
        </div>

        {/* Tasks */}
        {hasTasks && (
          <div className={`mb-5 transition-all duration-500 ${vis(tasksHeaderAt)}`}>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-acuity-primary mb-3">
              Tasks
            </p>
            <div className="space-y-2">
              {extraction.tasks.map((t, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 rounded-xl bg-white border border-zinc-200 px-4 py-3 transition-all duration-400 ${vis(taskItemAt(i))}`}
                  style={{ borderLeft: "3px solid #7C5CFC" }}
                >
                  <CheckboxIcon />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-800">{t.title}</p>
                    {t.description && (
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {t.description}
                      </p>
                    )}
                  </div>
                  <span
                    className="shrink-0 mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                    style={{
                      color: PRIORITY_COLOR[t.priority] ?? PRIORITY_COLOR.MEDIUM,
                      backgroundColor: `${PRIORITY_COLOR[t.priority] ?? PRIORITY_COLOR.MEDIUM}15`,
                    }}
                  >
                    {t.priority}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Goals */}
        {hasGoals && (
          <div className={`mb-5 transition-all duration-500 ${vis(goalsHeaderAt)}`}>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-acuity-primary mb-3">
              Goals
            </p>
            <div className="space-y-2">
              {extraction.goals.map((g, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 rounded-xl bg-white border border-zinc-200 px-4 py-3 transition-all duration-400 ${vis(goalItemAt(i))}`}
                  style={{ borderLeft: "3px solid #A78BFA" }}
                >
                  <FlagIcon />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-800">{g.title}</p>
                    {g.description && (
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {g.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Themes */}
        {hasThemes && (
          <div className={`mb-10 transition-all duration-500 ${vis(themesHeaderAt)}`}>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-acuity-primary mb-3">
              What&rsquo;s on your mind
            </p>
            <div className="flex flex-wrap gap-2">
              {extraction.themes.map((t, i) => (
                <span
                  key={t}
                  className={`rounded-full bg-acuity-primary/8 border border-acuity-primary/15 px-3.5 py-1.5 text-sm font-medium text-acuity-primary transition-all duration-300 ${scaleVis(themeItemAt(i))}`}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Continue button */}
        <div
          className={`text-center transition-all duration-500 ${vis(buttonAt)}`}
        >
          <button
            onClick={onContinue}
            className="animate-mic-glow inline-flex items-center gap-2 rounded-full px-8 py-4 text-base font-semibold text-white transition-all duration-300 hover:scale-105 hover:-translate-y-0.5 active:scale-95"
            style={{
              background: "var(--acuity-grad-primary)",
            }}
          >
            Continue &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckboxIcon() {
  return (
    <svg className="h-5 w-5 shrink-0 mt-0.5 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <rect x="3" y="3" width="18" height="18" rx="4" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg className="h-5 w-5 shrink-0 mt-0.5 text-acuity-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z" />
    </svg>
  );
}

// ─── Screen 4: CTA + Social Proof ────────────────────────────────────────────

const CTA_VALUE_PROPS = [
  { icon: "\uD83D\uDCCB", text: "Tasks extracted automatically" },
  { icon: "\uD83D\uDCCA", text: "Weekly reports every Sunday" },
  { icon: "\uD83D\uDD0D", text: "Patterns detected over time" },
];

const CTA_TESTIMONIALS = STATIC_CAROUSEL_TESTIMONIALS.map((t) => ({
  quote: t.quote,
  name: t.name,
  role: t.role,
}));

function CTAScreen({ userId }: { userId: string | null }) {
  const [showSection, setShowSection] = useState(0);
  const [testimonialIdx, setTestimonialIdx] = useState(0);
  const [counter, setCounter] = useState(0);

  // Scroll to top on mount + track
  useEffect(() => {
    window.scrollTo(0, 0);
    trackOnboardingEvent("onboarding_download_screen_viewed", { userId });
  }, [userId]);

  // Stagger sections
  useEffect(() => {
    const timers = [
      setTimeout(() => setShowSection(1), 200),
      setTimeout(() => setShowSection(2), 500),
      setTimeout(() => setShowSection(3), 800),
      setTimeout(() => setShowSection(4), 1100),
      setTimeout(() => setShowSection(5), 1400),
      setTimeout(() => setShowSection(6), 1700),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // Animated counter: 0 → 127 over 1.5s
  useEffect(() => {
    if (showSection < 4) return;
    const target = 127;
    const duration = 1500;
    const startTime = Date.now();
    const frame = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      setCounter(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, [showSection]);

  // Rotate testimonials every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTestimonialIdx((prev) => (prev + 1) % CTA_TESTIMONIALS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const vis = (at: number) =>
    showSection >= at
      ? "opacity-100 translate-y-0"
      : "opacity-0 translate-y-4";

  return (
    <div className="min-h-screen px-6">
      <div className="mx-auto max-w-md">
        {/* Headline */}
        <div className={`text-center pt-16 pb-10 sm:pt-24 transition-all duration-700 ${vis(1)}`}>
          <img
            src="/AcuityLogo.png"
            alt="Acuity"
            className="mx-auto mb-6"
            style={{ width: 40, height: 40 }}
          />
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            Get Acuity on your phone so you can debrief&nbsp;anywhere.
          </h2>
        </div>

        {/* App Store button with shining ring */}
        <div className={`text-center mb-5 transition-all duration-700 ${vis(2)}`}>
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackOnboardingEvent("onboarding_app_store_clicked", { userId })}
            className="group relative inline-flex items-center gap-3 rounded-full px-8 py-4 text-base font-semibold text-white transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 active:scale-95 overflow-hidden"
            style={{
              background: "var(--acuity-grad-primary)",
              boxShadow: "0 8px 32px rgba(124,92,252,0.3), 0 2px 8px rgba(124,58,237,0.15)",
            }}
          >
            {/* Shining ring overlay */}
            <span
              className="absolute inset-[-2px] rounded-full pointer-events-none"
              style={{
                background: "conic-gradient(from 0deg, transparent 0%, transparent 70%, rgba(255,255,255,0.5) 78%, transparent 86%, transparent 100%)",
                animation: "shine-ring 2.5s linear infinite",
              }}
            />
            {/* Inner mask to show ring only at edges */}
            <span
              className="absolute inset-[2px] rounded-full pointer-events-none"
              style={{
                background: "var(--acuity-grad-primary)",
              }}
            />
            <span className="relative z-10 flex items-center gap-3">
              <AppleLogo />
              Download on the App Store
            </span>
          </a>
        </div>

        {/* Continue in browser with subtle shining ring */}
        <div className={`text-center mb-10 transition-all duration-700 ${vis(2)}`}>
          <a
            href="/home"
            onClick={() => trackOnboardingEvent("onboarding_continue_browser_clicked", { userId })}
            className="group relative inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-zinc-600 transition-all duration-300 hover:scale-[1.02] hover:text-zinc-900 active:scale-95 overflow-hidden"
            style={{
              boxShadow: "0 0 0 1px rgba(0,0,0,0.08)",
            }}
          >
            <span
              className="absolute inset-[-1px] rounded-full pointer-events-none"
              style={{
                background: "conic-gradient(from 0deg, transparent 0%, transparent 75%, rgba(124,92,252,0.25) 82%, transparent 89%, transparent 100%)",
                animation: "shine-ring 3s linear infinite",
              }}
            />
            <span className="absolute inset-[1px] rounded-full bg-white pointer-events-none" />
            <span className="relative z-10">Continue in your browser &rarr;</span>
          </a>
        </div>

        {/* QR Code — desktop only */}
        <div className={`text-center mb-12 hidden sm:block transition-all duration-700 ${vis(2)}`}>
          <p className="text-xs text-zinc-400 mb-3">
            On desktop? Scan to download.
          </p>
          <div className="inline-block rounded-xl border border-zinc-200 p-3">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(APP_STORE_URL)}&bgcolor=ffffff&color=181614`}
              alt="QR code to download Acuity"
              width={140}
              height={140}
            />
          </div>
        </div>

        {/* Value props */}
        <div className="mb-12 space-y-3">
          {CTA_VALUE_PROPS.map((v, i) => (
            <div
              key={v.text}
              className={`flex items-center gap-3 rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3 transition-all duration-500 ${vis(3)}`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <span className="text-xl">{v.icon}</span>
              <span className="text-sm font-medium text-zinc-700">{v.text}</span>
            </div>
          ))}
        </div>

        {/* Social proof counter */}
        <div className={`text-center mb-8 transition-all duration-700 ${vis(4)}`}>
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <span className="text-2xl font-bold text-zinc-900">4.9</span>
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="text-xl text-amber-400"
                style={{
                  animation: `star-twinkle 2s ease-in-out infinite`,
                  animationDelay: `${i * 0.3}s`,
                }}
              >
                &#9733;
              </span>
            ))}
          </div>
          <p className="text-sm text-zinc-500">
            <span className="font-semibold text-zinc-700 tabular-nums">{counter}+</span>{" "}
            users
          </p>
        </div>

        {/* Testimonial carousel — single card, auto-cycling */}
        <div className={`mb-10 transition-all duration-700 ${vis(5)}`}>
          <div className="relative min-h-[120px]">
            {CTA_TESTIMONIALS.map((t, i) => (
              <div
                key={t.name}
                className={`absolute inset-0 rounded-2xl bg-zinc-50 border border-zinc-100 p-5 transition-all duration-500 ${
                  i === testimonialIdx
                    ? "opacity-100 translate-x-0"
                    : "opacity-0 translate-x-8"
                }`}
              >
                <div className="flex gap-0.5 mb-2">
                  {[0, 1, 2, 3, 4].map((s) => (
                    <span key={s} className="text-xs text-amber-400">&#9733;</span>
                  ))}
                </div>
                <p className="text-sm text-zinc-700 leading-relaxed italic mb-3">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <p className="text-xs text-zinc-400">
                  <span className="font-medium text-zinc-600">{t.name}</span>
                  {t.role && <> &middot; {t.role}</>}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Urgency */}
        <div className={`text-center pb-16 sm:pb-24 transition-all duration-700 ${vis(6)}`}>
          <p className="text-sm text-zinc-400">
            Your 14-day free trial has started. Keep the streak going.
          </p>
        </div>
      </div>
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
