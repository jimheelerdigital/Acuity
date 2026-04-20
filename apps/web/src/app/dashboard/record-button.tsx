"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  MOOD_EMOJI,
  MOOD_LABELS,
  PRIORITY_COLOR,
  type ExtractionResult,
  type RecordResponse,
} from "@acuity/shared";

import {
  useEntryPolling,
  type PolledEntry,
} from "@/hooks/use-entry-polling";

type Phase =
  | "idle"
  | "recording"
  | "uploading"
  | "processing" // async: waiting on Inngest pipeline
  | "done"
  | "error"
  | "timeout";

const MAX_SECONDS = 120;

/**
 * Progress stepper phases, driven by `Entry.status` transitions from
 * the polling hook. Order matters — the current phase is everything up
 * to and including the server-reported status.
 */
const STEPPER_PHASES: { key: string; label: string }[] = [
  { key: "QUEUED", label: "Saving your recording…" },
  { key: "TRANSCRIBING", label: "Transcribing…" },
  { key: "EXTRACTING", label: "Extracting insights…" },
  { key: "PERSISTING", label: "Almost done…" },
];

export function RecordButton() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecordResponse | null>(null);
  const [polledEntryId, setPolledEntryId] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  // Polling hook — always called; `null` entryId is a no-op idle state.
  const poll = useEntryPolling(polledEntryId);

  // When polling reaches a terminal state, surface it to the main
  // phase state so the UI transitions out of the stepper.
  useEffect(() => {
    if (!polledEntryId) return;
    if (poll.status === "complete" && poll.entry) {
      setResult(polledEntryToRecordResponse(poll.entry));
      setPhase("done");
      router.refresh();
    } else if (poll.status === "partial" && poll.entry) {
      setResult(polledEntryToRecordResponse(poll.entry));
      setPhase("done"); // show the partial result; toast can come later
      router.refresh();
    } else if (poll.status === "failed") {
      setError(poll.entry?.errorMessage ?? "Processing failed");
      setPhase("error");
    } else if (poll.status === "timeout") {
      setPhase("timeout");
    }
  }, [poll.status, poll.entry, polledEntryId, router]);

  const startRecording = async () => {
    setError(null);
    setResult(null);
    setElapsed(0);
    setPolledEntryId(null);
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
        const baseMime = mr.mimeType.split(";")[0] || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: baseMime });
        const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
        upload(blob, duration, baseMime);
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
    mediaRecorderRef.current?.stop();
  };

  const upload = async (blob: Blob, duration: number, mime: string) => {
    setPhase("uploading");

    const fd = new FormData();
    fd.append("audio", blob, `recording.${extFromMime(mime)}`);
    fd.append("durationSeconds", String(duration));

    try {
      const res = await fetch("/api/record", { method: "POST", body: fd });

      // Payment required — trial expired or post-trial-free. Redirect
      // to the upgrade flow with a soft-bannered context.
      if (res.status === 402) {
        window.location.href = "/upgrade?src=paywall_redirect";
        return;
      }

      // Rate-limited (S5) — surface a friendly message + retry hint.
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        const retry = Number(body?.retryAfter ?? 60);
        setError(
          `You're recording too fast — try again in ${Math.ceil(retry / 60)} minute${
            retry > 60 ? "s" : ""
          }.`
        );
        setPhase("error");
        return;
      }

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      // Async path (Inngest pipeline enabled): 202 { entryId, status: "QUEUED" }.
      if (res.status === 202 && body.entryId) {
        setPhase("processing");
        setPolledEntryId(body.entryId as string);
        return;
      }

      // Sync path (legacy): 201 with full RecordResponse.
      setResult(body as RecordResponse);
      setPhase("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setPhase("error");
    }
  };

  const handleClick = async () => {
    if (phase === "recording") return stopRecording();
    if (["idle", "done", "error", "timeout"].includes(phase))
      return startRecording();
  };

  const isProcessing = phase === "uploading" || phase === "processing";

  return (
    <div className="w-full">
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-zinc-200 bg-white px-6 py-8 shadow-sm transition-shadow duration-300 hover:shadow-md">
        {/* Mic button */}
        <button
          onClick={handleClick}
          disabled={isProcessing}
          aria-label={phase === "recording" ? "Stop recording" : "Start recording"}
          className={`relative flex h-20 w-20 items-center justify-center rounded-full transition-all duration-300
            ${phase === "recording"
              ? "bg-red-500 hover:bg-red-400 scale-110 shadow-lg shadow-red-500/30"
              : isProcessing
                ? "bg-zinc-200 cursor-wait"
                : "bg-zinc-900 hover:scale-105 hover:shadow-xl hover:shadow-zinc-900/20 active:scale-95"
            }
          `}
        >
          {phase === "recording" && (
            <>
              <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-20" />
              <span className="absolute -inset-1 rounded-full border-2 border-red-400 animate-pulse" />
            </>
          )}

          {phase === "recording" ? (
            <span className="h-7 w-7 rounded-md bg-white" />
          ) : isProcessing ? (
            <Spinner />
          ) : (
            <MicIcon size={32} />
          )}
        </button>

        {/* Label / timer */}
        {phase === "recording" ? (
          <div className="text-center">
            <p className="text-2xl font-mono font-semibold text-zinc-900 tabular-nums">
              {formatTime(elapsed)}
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              Tap to stop · {MAX_SECONDS - elapsed}s remaining
            </p>
          </div>
        ) : phase === "uploading" ? (
          <div className="w-full max-w-xs text-center space-y-3">
            <p className="text-sm text-zinc-600">Uploading audio…</p>
            <div className="h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden">
              <div className="h-full rounded-full bg-violet-500 animate-pulse w-1/4" />
            </div>
          </div>
        ) : phase === "processing" ? (
          <Stepper currentPhase={poll.phase} elapsedSeconds={poll.elapsedSeconds} />
        ) : phase === "idle" ? (
          <div className="text-center">
            <p className="text-sm font-medium text-zinc-800">
              Start your daily debrief
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              Up to {MAX_SECONDS / 60} minutes
            </p>
          </div>
        ) : phase === "timeout" ? (
          <div className="text-center">
            <p className="text-sm text-zinc-600">This is taking longer than expected.</p>
            <p className="text-xs text-zinc-400 mt-1">
              We&rsquo;ll have it ready when you check back. Tap the mic to record another.
            </p>
          </div>
        ) : phase === "error" ? (
          <div className="text-center">
            <p className="text-sm text-red-500">{error}</p>
            <p className="text-xs text-zinc-400 mt-1">Tap the mic to try again</p>
          </div>
        ) : null}
      </div>

      {/* Result card */}
      {phase === "done" && result && (
        <ResultCard
          extraction={result.extraction}
          tasksCreated={result.tasksCreated}
          partial={(result.status as string) === "PARTIAL"}
          onRecordAgain={() => {
            setResult(null);
            setPolledEntryId(null);
            setPhase("idle");
          }}
        />
      )}
    </div>
  );
}

/**
 * 4-step stepper driven by Entry.status. Current phase highlights;
 * completed phases get a check.
 */
function Stepper({
  currentPhase,
  elapsedSeconds,
}: {
  currentPhase: string | null;
  elapsedSeconds: number;
}) {
  const currentIndex = Math.max(
    0,
    STEPPER_PHASES.findIndex((p) => p.key === currentPhase)
  );

  return (
    <div className="w-full max-w-sm space-y-3">
      <ol className="space-y-2">
        {STEPPER_PHASES.map((step, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <li key={step.key} className="flex items-center gap-3 text-sm">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                  done
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : active
                      ? "border-violet-500 text-violet-500 animate-pulse"
                      : "border-zinc-200 text-zinc-300"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={
                  done
                    ? "text-zinc-500 line-through"
                    : active
                      ? "text-zinc-900 font-medium"
                      : "text-zinc-300"
                }
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-zinc-400 pl-8">
        {elapsedSeconds}s elapsed
      </p>
    </div>
  );
}

/**
 * Adapt the polled Entry shape to the legacy RecordResponse shape so
 * ResultCard can stay unchanged. The async polling path doesn't return
 * the same `tasksCreated` count (that's inside rawAnalysis), so we pull
 * it out of there when present.
 */
function polledEntryToRecordResponse(entry: PolledEntry): RecordResponse {
  const raw = (entry.rawAnalysis ?? {}) as Partial<ExtractionResult>;
  const extraction: ExtractionResult = {
    summary: entry.summary ?? raw.summary ?? "",
    mood: (entry.mood as ExtractionResult["mood"]) ?? raw.mood ?? "NEUTRAL",
    moodScore: entry.moodScore ?? raw.moodScore ?? 5,
    energy: entry.energy ?? raw.energy ?? 5,
    themes: entry.themes ?? raw.themes ?? [],
    wins: entry.wins ?? raw.wins ?? [],
    blockers: entry.blockers ?? raw.blockers ?? [],
    insights: raw.insights ?? [],
    tasks: raw.tasks ?? [],
    goals: raw.goals ?? [],
    lifeAreaMentions: raw.lifeAreaMentions,
  };
  return {
    entryId: entry.id,
    status: entry.status as RecordResponse["status"],
    transcript: entry.transcript ?? null,
    extraction,
    tasksCreated: extraction.tasks.length,
  };
}

function ResultCard({
  extraction,
  tasksCreated,
  partial,
  onRecordAgain,
}: {
  extraction: ExtractionResult;
  tasksCreated: number;
  partial?: boolean;
  onRecordAgain: () => void;
}) {
  const mood = extraction.mood;

  return (
    <div className="mt-4 rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm animate-fade-in">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{MOOD_EMOJI[mood]}</span>
            <span className="text-sm font-medium text-zinc-800">
              {MOOD_LABELS[mood]}
            </span>
            <span className="text-xs text-zinc-400">
              · Energy {extraction.energy}/10
            </span>
          </div>
          <p className="text-sm text-zinc-600 leading-relaxed">
            {extraction.summary}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            partial
              ? "bg-amber-50 border-amber-200 text-amber-600"
              : "bg-emerald-50 border-emerald-200 text-emerald-600"
          }`}
        >
          {partial ? "Partial" : "Done"}
        </span>
      </div>

      {partial && (
        <div className="px-5 pb-3">
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Your entry is saved, but Life Matrix updates will catch up shortly.
          </p>
        </div>
      )}

      {/* Themes */}
      {extraction.themes.length > 0 && (
        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
          {extraction.themes.map((t) => (
            <span
              key={t}
              className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-500"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Tasks */}
      {extraction.tasks.length > 0 && (
        <div className="border-t border-zinc-100 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2.5">
            Extracted tasks ({tasksCreated})
          </p>
          <div className="space-y-2">
            {extraction.tasks.map((t, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 rounded-lg bg-zinc-50 px-3 py-2.5"
              >
                <span
                  className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: PRIORITY_COLOR[t.priority] }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-700">{t.title}</p>
                  {t.description && (
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {t.description}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-zinc-400">
                  {t.priority}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insights */}
      {extraction.insights.length > 0 && (
        <div className="border-t border-zinc-100 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2.5">
            Insights
          </p>
          <ul className="space-y-1.5">
            {extraction.insights.map((ins, i) => (
              <li key={i} className="text-sm text-zinc-500 flex gap-2">
                <span className="text-violet-500 shrink-0">→</span>
                {ins}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-zinc-100 px-5 py-3 flex justify-end">
        <button
          onClick={onRecordAgain}
          className="text-sm text-violet-600 hover:text-violet-500 transition font-medium"
        >
          Record another session
        </button>
      </div>
    </div>
  );
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

function MicIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-white"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="h-7 w-7 animate-spin text-zinc-500"
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
