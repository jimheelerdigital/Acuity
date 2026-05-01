"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useEntryPolling } from "@/hooks/use-entry-polling";
import { ProcessingProgressBar } from "@/components/processing-progress-bar";

/**
 * Client-side gate for the /entries/[id] page when the entry isn't
 * COMPLETE. Three states:
 *
 *   non-terminal (PENDING / QUEUED / TRANSCRIBING / EXTRACTING /
 *     PERSISTING / PROCESSING) — render the same ProcessingProgressBar
 *     used by /home, polling the same endpoint as the home flow.
 *     When polling lands on COMPLETE, call router.refresh() so the
 *     server component re-renders with the full extraction layout.
 *
 *   PARTIAL — pipeline got past transcript but failed to extract.
 *     Audio is preserved. Show a friendly summary, the (sanitized)
 *     reason, and a Retry button that POSTs /reprocess and re-enters
 *     the polling state.
 *
 *   FAILED — pipeline never produced a transcript. Same retry shape
 *     as PARTIAL; the upload is in storage so a fresh extract attempt
 *     starts from step 1 (download-audio → transcribe → extract).
 *
 * The page header (date, mood, BackButton, delete) renders from the
 * server component; this component only renders the body slot.
 */

type Status =
  | "PENDING"
  | "QUEUED"
  | "PROCESSING"
  | "TRANSCRIBING"
  | "EXTRACTING"
  | "PERSISTING"
  | "COMPLETE"
  | "PARTIAL"
  | "FAILED";

const NON_TERMINAL = new Set<Status>([
  "PENDING",
  "QUEUED",
  "PROCESSING",
  "TRANSCRIBING",
  "EXTRACTING",
  "PERSISTING",
]);

/**
 * Map the raw errorMessage / partialReason into a short user-facing
 * line. Server errors carry request_ids and JSON bodies that mean
 * nothing to the user — the goal here is to acknowledge the failure
 * without leaking provider internals.
 */
function sanitizeError(
  errorMessage: string | null,
  partialReason: string | null
): string {
  const reason = partialReason ?? "";
  if (reason === "memory-update-failed" || reason === "lifemap-update-failed") {
    return "Most of your entry processed, but a follow-up step didn't finish. Try reprocessing — your audio and transcript are saved.";
  }
  if (reason === "backfill-extract-failed") {
    return "We couldn't run the extraction during backfill. Try reprocessing.";
  }
  const msg = (errorMessage ?? "").toLowerCase();
  if (msg.includes("401") || msg.includes("authentication_error")) {
    return "We had trouble reaching the AI service. Try again in a moment.";
  }
  if (msg.includes("429") || msg.includes("rate")) {
    return "Rate limited by the AI service. Try again in a moment.";
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return "Processing took too long. Try reprocessing.";
  }
  return "Processing didn't finish. Your audio is saved — you can retry.";
}

export function EntryStatusGate({
  entryId,
  initialStatus,
  initialErrorMessage,
  initialPartialReason,
}: {
  entryId: string;
  initialStatus: Status;
  initialErrorMessage: string | null;
  initialPartialReason: string | null;
}) {
  const router = useRouter();
  // Track the live status. We seed from server props; if the entry is
  // non-terminal we hand off to useEntryPolling which streams updates.
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const polledStatus: Status = NON_TERMINAL.has(initialStatus)
    ? initialStatus
    : retrying
      ? "QUEUED" // optimistic — actual transition lands on next poll
      : initialStatus;
  const shouldPoll = NON_TERMINAL.has(polledStatus);

  // useEntryPolling is a no-op when entryId is null — pass null when
  // we're not actively polling so the hook doesn't fire requests on
  // the PARTIAL / FAILED views.
  const poll = useEntryPolling(shouldPoll ? entryId : null);

  // When polling resolves to ANY terminal state (complete | partial |
  // failed | timeout), refresh so the server component re-reads the
  // entry and renders the correct view. complete → SSR detail layout;
  // partial/failed → re-renders this gate with the now-populated
  // errorMessage / partialReason from the server.
  useEffect(() => {
    if (
      poll.status === "complete" ||
      poll.status === "partial" ||
      poll.status === "failed" ||
      poll.status === "timeout"
    ) {
      router.refresh();
    }
  }, [poll.status, router]);

  // Effective phase the progress bar should display: the live polled
  // phase if we have one, otherwise the initial server-render status.
  const phase = poll.phase ?? polledStatus;

  async function handleRetry(): Promise<void> {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(`/api/entries/${entryId}/reprocess`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}`
        );
      }
      // Server re-emits the Inngest event and resets status to QUEUED.
      // Trigger a server refresh so the gate re-mounts in non-terminal
      // mode and the polling hook starts streaming again.
      router.refresh();
    } catch (err) {
      setRetrying(false);
      setRetryError(
        err instanceof Error ? err.message : "Couldn't kick off retry"
      );
    }
  }

  // ── PROCESSING (non-terminal) ─────────────────────────────────────
  if (shouldPoll || poll.status === "polling") {
    return (
      <section className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center dark:border-white/10 dark:bg-[#13131F]">
        <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Processing your recording…
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Usually takes 30–60 seconds. This page updates automatically.
        </p>
        <ProcessingProgressBar
          phase={phase}
          elapsedSeconds={poll.elapsedSeconds}
        />
      </section>
    );
  }

  // ── PARTIAL / FAILED ──────────────────────────────────────────────
  const isPartial = polledStatus === "PARTIAL";
  const heading = isPartial
    ? "Processing didn't finish"
    : "We couldn't process this entry";
  const message = sanitizeError(initialErrorMessage, initialPartialReason);

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/60 px-6 py-6 dark:border-amber-900/40 dark:bg-amber-950/20">
      <div className="flex items-start gap-3">
        <span className="text-lg leading-none">⚠️</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            {heading}
          </p>
          <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-100/80">
            {message}
          </p>
          {initialPartialReason && (
            <p className="mt-2 font-mono text-xs text-amber-900/50 dark:text-amber-100/40">
              {initialPartialReason}
            </p>
          )}
          {retryError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              {retryError}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {retrying ? "Retrying…" : "Retry"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
