"use client";

/**
 * Determinate progress bar for the recording-processing screen.
 *
 * Driven by real backend events from useEntryPolling (Entry.status
 * transitions: QUEUED → TRANSCRIBING → EXTRACTING → PERSISTING →
 * COMPLETE). Each phase maps to a fixed percentage; CSS transition
 * smooths the visual movement between phase changes so it feels like
 * continuous progress rather than discrete jumps.
 *
 * Also handles the client-side "uploading" phase that runs before the
 * server-side polling begins (POST inflight, before the 202 returns),
 * so the bar starts moving the moment the user stops recording.
 *
 * Never animates to 100% until phase === "COMPLETE" (or terminal):
 * the spec is explicit that 100% must mean truly done.
 *
 * After 30 seconds elapsed without completion, appends a "Still working
 * on this…" subline so the user knows they're not stuck.
 */

const PHASE_PROGRESS: Record<string, { pct: number; label: string }> = {
  uploading: { pct: 20, label: "Uploading your recording…" },
  QUEUED: { pct: 25, label: "Saving your recording…" },
  TRANSCRIBING: { pct: 60, label: "Transcribing your reflection…" },
  EXTRACTING: { pct: 90, label: "Pulling out themes and patterns…" },
  PERSISTING: { pct: 95, label: "Almost done…" },
  COMPLETE: { pct: 100, label: "Done" },
};

const STILL_WORKING_THRESHOLD_SECONDS = 30;

export function ProcessingProgressBar({
  phase,
  elapsedSeconds,
}: {
  /** Current pipeline phase. Pass "uploading" while the upload POST is
   *  in-flight; switch to the polling hook's `phase` once the 202 lands. */
  phase: string | null;
  elapsedSeconds: number;
}) {
  const fallback = { pct: 5, label: "Starting…" };
  const config = phase ? PHASE_PROGRESS[phase] ?? fallback : fallback;
  const showStillWorking =
    elapsedSeconds >= STILL_WORKING_THRESHOLD_SECONDS &&
    phase !== "COMPLETE";

  return (
    <div className="w-full max-w-sm space-y-3">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10"
        role="progressbar"
        aria-valuenow={config.pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={config.label}
      >
        <div
          className="h-full rounded-full bg-violet-500 transition-[width] duration-700 ease-out"
          style={{ width: `${config.pct}%` }}
        />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {config.label}
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
    </div>
  );
}
