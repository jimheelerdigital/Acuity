"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Determinate progress bar + per-stage checklist for the recording-
 * processing screen.
 *
 * Driven by real backend events from useEntryPolling (Entry.status
 * transitions: QUEUED → TRANSCRIBING → EXTRACTING → PERSISTING →
 * COMPLETE). Each phase maps to a fixed percentage; CSS transition
 * smooths the visual movement between phase changes.
 *
 * Below the bar sits a vertical checklist of the same five stages
 * (uploading, saving, transcribing, extracting, persisting) with
 * pending / active / complete circles. Active row pulses; completed
 * rows show a checkmark and an inline duration ("0.8s") computed from
 * client-side phase-transition timestamps.
 *
 * Never shows 100% until phase === "COMPLETE".
 *
 * After 30 seconds elapsed without completion, swaps the elapsed
 * counter for a "Still working on this…" subline.
 */

const STAGES = [
  { key: "uploading", label: "Uploading", pct: 20 },
  { key: "QUEUED", label: "Saving", pct: 25 },
  { key: "TRANSCRIBING", label: "Transcribing", pct: 60 },
  { key: "EXTRACTING", label: "Extracting themes and patterns", pct: 90 },
  { key: "PERSISTING", label: "Saving insights", pct: 95 },
] as const;

const PHASE_LABELS: Record<string, string> = {
  uploading: "Uploading your recording…",
  QUEUED: "Saving your recording…",
  TRANSCRIBING: "Transcribing your reflection…",
  EXTRACTING: "Pulling out themes and patterns…",
  PERSISTING: "Almost done…",
  COMPLETE: "Done",
};

const STILL_WORKING_THRESHOLD_SECONDS = 30;

function stageIndex(phase: string | null): number {
  if (!phase) return -1;
  if (phase === "COMPLETE") return STAGES.length;
  return STAGES.findIndex((s) => s.key === phase);
}

export function ProcessingProgressBar({
  phase,
  elapsedSeconds,
}: {
  /** Current pipeline phase. Pass "uploading" while the upload POST is
   *  in-flight; switch to the polling hook's `phase` once the 202 lands. */
  phase: string | null;
  elapsedSeconds: number;
}) {
  const idx = stageIndex(phase);
  const headerLabel =
    (phase && PHASE_LABELS[phase]) ?? "Starting…";
  const fillPct =
    phase === "COMPLETE"
      ? 100
      : idx >= 0
      ? STAGES[idx].pct
      : 5;
  const showStillWorking =
    elapsedSeconds >= STILL_WORKING_THRESHOLD_SECONDS &&
    phase !== "COMPLETE";

  // Track wall-clock time each stage entered so we can render
  // per-stage durations on completed rows. Map keyed by STAGES[i].key.
  const enteredAtRef = useRef<Record<string, number>>({});
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (phase === "COMPLETE") {
      if (!enteredAtRef.current["__complete__"]) {
        enteredAtRef.current["__complete__"] = Date.now();
        forceTick((n) => n + 1);
      }
      return;
    }
    if (idx < 0) return;
    const key = STAGES[Math.min(idx, STAGES.length - 1)].key;
    if (!enteredAtRef.current[key]) {
      enteredAtRef.current[key] = Date.now();
      forceTick((n) => n + 1);
    }
  }, [idx, phase]);

  return (
    <div className="w-full max-w-sm space-y-4">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10"
        role="progressbar"
        aria-valuenow={fillPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={headerLabel}
      >
        <div
          className="h-full rounded-full bg-violet-500 transition-[width] duration-700 ease-out"
          style={{ width: `${fillPct}%` }}
        />
      </div>

      <div className="text-center">
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {headerLabel}
        </p>
        {showStillWorking ? (
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            Still working on this — longer recordings take a bit more.
          </p>
        ) : (
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            {elapsedSeconds}s elapsed
          </p>
        )}
      </div>

      <ol className="space-y-2.5 pt-1">
        {STAGES.map((stage, i) => {
          const done = i < idx;
          const active = i === idx;
          const startedAt = enteredAtRef.current[stage.key];
          const nextKey = STAGES[i + 1]?.key;
          const completedAt = nextKey
            ? enteredAtRef.current[nextKey]
            : enteredAtRef.current["__complete__"];
          const durationMs =
            done && startedAt && completedAt
              ? completedAt - startedAt
              : null;

          return (
            <li
              key={stage.key}
              className="flex items-center gap-3 text-sm"
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                  done
                    ? "bg-violet-500 border-violet-500 text-white"
                    : active
                      ? "border-violet-500 text-violet-500 animate-pulse bg-violet-500/20"
                      : "border-zinc-200 dark:border-white/10 text-zinc-300 dark:text-zinc-600"
                }`}
                aria-label={
                  done ? "complete" : active ? "in progress" : "pending"
                }
              >
                {done ? "✓" : ""}
              </span>
              <span
                className={`flex-1 ${
                  done
                    ? "text-zinc-500 dark:text-zinc-400"
                    : active
                      ? "text-zinc-900 dark:text-zinc-50 font-medium"
                      : "text-zinc-300 dark:text-zinc-600"
                }`}
              >
                {stage.label}
              </span>
              {durationMs != null && (
                <span className="text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
                  {(durationMs / 1000).toFixed(1)}s
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
