"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useOnboarding } from "../onboarding-context";

/**
 * Step 4 — Practice recording.
 *
 * A live 10-second practice recording, discarded immediately. The
 * point isn't to collect data — it's to make sure the user's first
 * real recording isn't the first time they've touched a record
 * button. Builds muscle memory + verifies their mic actually works
 * end-to-end before we set expectations in step 7.
 *
 * Nothing is persisted: the audio chunks are released when the blob
 * is dropped from scope. The Entry table never sees any of it. The
 * only state we care about is "did they successfully record something
 * longer than 2 seconds", surfaced as a soft confirmation.
 *
 * State machine:
 *   idle      — explainer + Start button
 *   recording — live countdown + Stop button; timer auto-stops at 10s
 *   done      — "we heard you" + waveform-ish confirmation; shell
 *                Continue enabled
 *   failed    — couldn't open the mic (permission revoked, no hardware)
 *                — still let them proceed
 *
 * If step 3 was skipped and permission is missing, the Start button
 * still calls getUserMedia — that's a second chance at the OS prompt
 * inside the onboarding context. If it fails, we land in the `failed`
 * state with friendly recovery copy.
 */
type State = "idle" | "recording" | "done" | "failed";

const MAX_SECONDS = 10;
const MIN_SECONDS = 2;

export function Step4PracticeRecording() {
  const { setCanContinue } = useOnboarding();
  const [state, setState] = useState<State>("idle");
  const [elapsed, setElapsed] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Continue is disabled until the user either finishes a recording or
  // hits the inline skip-to-failed branch. See step 3 for the same
  // pattern — onboarding steps are soft-blocking by default.
  useEffect(() => {
    setCanContinue(state === "done" || state === "failed");
  }, [setCanContinue, state]);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  // Unmount safety: if the user navigates back mid-recording, release
  // the mic. Otherwise the red recording indicator sticks in the
  // browser UI.
  useEffect(() => cleanup, [cleanup]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: bestMimeType() });
      recorderRef.current = recorder;

      // Chunks land here and die with the component. Never uploaded,
      // never persisted. A future version could pipe this to a local
      // VU-meter visualizer but v1 is just "prove your mic works".
      recorder.ondataavailable = () => {};
      recorder.onstop = () => {
        cleanup();
        const seconds = Math.round((Date.now() - startedAtRef.current) / 1000);
        setElapsed(seconds);
        setState(seconds >= MIN_SECONDS ? "done" : "done");
        // ^ We don't currently differentiate < MIN_SECONDS from a
        //   longer recording in the UX — the whole step is fluff and
        //   forcing a retry on a 1-second tap feels punitive. Keep
        //   the `seconds >= MIN_SECONDS` guard here anyway so we can
        //   wire a "that was quick, want to try again?" toast later
        //   without rewiring state.
      };

      recorder.start();
      startedAtRef.current = Date.now();
      setElapsed(0);
      setState("recording");
      timerRef.current = setInterval(() => {
        const secs = Math.round((Date.now() - startedAtRef.current) / 1000);
        setElapsed(secs);
        if (secs >= MAX_SECONDS) stop();
      }, 200);
    } catch {
      cleanup();
      setState("failed");
    }
  }

  function stop() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    } else {
      cleanup();
    }
  }

  return (
    <div className="flex flex-col">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
        Let&rsquo;s make sure it works.
      </h1>

      <p className="mt-4 text-base leading-relaxed text-zinc-600">
        Ten seconds. Say anything — count to five, describe your morning,
        whatever. We&rsquo;re just testing the microphone. Nothing gets
        saved.
      </p>

      <div className="mt-10 flex flex-col items-center">
        {state === "idle" && (
          <>
            <RecordButtonVisual onClick={start} />
            <p className="mt-4 text-sm text-zinc-400">
              Tap the circle when you&rsquo;re ready.
            </p>
          </>
        )}

        {state === "recording" && (
          <>
            <StopButtonVisual
              onClick={stop}
              progress={Math.min(elapsed / MAX_SECONDS, 1)}
            />
            <p className="mt-4 font-mono text-sm text-zinc-600">
              {String(elapsed).padStart(2, "0")} / {MAX_SECONDS}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Tap to stop. Auto-stops at {MAX_SECONDS} seconds.
            </p>
          </>
        )}

        {state === "done" && (
          <div className="w-full">
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <BigCheckIcon />
              <div>
                <p className="text-sm font-semibold text-emerald-900">
                  We heard you.
                </p>
                <p className="mt-1 text-xs text-emerald-700">
                  That&rsquo;s the same mechanic you&rsquo;ll use every night.
                  Recording was not saved.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setState("idle");
                setElapsed(0);
              }}
              className="mt-4 text-sm text-zinc-500 underline-offset-2 hover:underline"
            >
              Try once more
            </button>
          </div>
        )}

        {state === "failed" && (
          <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">
              We couldn&rsquo;t open your microphone.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-amber-900">
              Either permission was denied or no microphone is connected.
              You can finish onboarding anyway — recording will prompt
              you again the first time you try it for real.
            </p>
            <button
              onClick={() => {
                setState("idle");
                setElapsed(0);
              }}
              className="mt-4 rounded-full border border-amber-300 bg-white px-5 py-2 text-sm font-semibold text-amber-900 transition hover:border-amber-400 hover:bg-amber-50"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RecordButtonVisual({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative flex h-28 w-28 items-center justify-center rounded-full bg-[#7C5CFC] shadow-lg transition hover:bg-[#6B4FE0] hover:shadow-xl active:scale-95"
      aria-label="Start practice recording"
    >
      <span className="absolute inset-0 animate-ping rounded-full bg-[#7C5CFC] opacity-25" />
      <MicIcon />
    </button>
  );
}

function StopButtonVisual({
  onClick,
  progress,
}: {
  onClick: () => void;
  progress: number;
}) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);
  return (
    <button
      onClick={onClick}
      className="relative flex h-28 w-28 items-center justify-center rounded-full bg-red-500 shadow-lg transition hover:bg-red-600 active:scale-95"
      aria-label="Stop practice recording"
    >
      <svg
        className="absolute inset-0 h-full w-full -rotate-90"
        viewBox="0 0 112 112"
        aria-hidden="true"
      >
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="4"
        />
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="white"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 200ms linear" }}
        />
      </svg>
      <span className="h-8 w-8 rounded-sm bg-white" />
    </button>
  );
}

function MicIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function BigCheckIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#10B981" />
      <path
        d="M7 12l3.5 3.5L17 9"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function bestMimeType(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}
