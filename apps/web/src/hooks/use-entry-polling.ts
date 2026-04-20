"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Client-side polling for entries processed by the Inngest async
 * pipeline (INNGEST_MIGRATION_PLAN.md §6). The record POST returns
 * 202 with `{ entryId, status: "QUEUED" }`; the client polls
 * GET /api/entries/[id] until the entry reaches a terminal state or
 * the polling budget expires.
 *
 * Exponential backoff: 2s, 2s, 2s, 4s, 8s, 15s, 30s, 30s, ...
 * Budget: 3 minutes wall-clock. After that, the hook returns
 * status=timeout and stops polling (caller can still read the
 * Entry later via the dashboard — the pipeline may finish on its
 * own; we just stop tracking it from this component).
 *
 * Cleans up on unmount. Never polls if entryId is null.
 */

export type PollStatus =
  | "idle"
  | "polling"
  | "complete"
  | "partial"
  | "failed"
  | "timeout";

export interface PolledEntry {
  id: string;
  status: string;
  transcript: string | null;
  summary: string | null;
  mood: string | null;
  moodScore: number | null;
  energy: number | null;
  themes: string[];
  wins: string[];
  blockers: string[];
  errorMessage: string | null;
  partialReason: string | null;
  // rawAnalysis + tasks included in the API response but we narrow
  // what this hook surfaces; consumers that want the full payload
  // should call /api/entries/[id] directly.
  rawAnalysis: unknown;
}

export interface UseEntryPollingResult {
  status: PollStatus;
  entry: PolledEntry | null;
  error: string | null;
  /** Current status string from the server (QUEUED|TRANSCRIBING|…). */
  phase: string | null;
  /** Elapsed polling time in seconds (for UX). */
  elapsedSeconds: number;
}

const MAX_WALL_CLOCK_MS = 3 * 60 * 1000;
const BACKOFF_SCHEDULE_MS = [2000, 2000, 2000, 4000, 8000, 15_000, 30_000];

function nextDelay(attempt: number): number {
  return BACKOFF_SCHEDULE_MS[Math.min(attempt, BACKOFF_SCHEDULE_MS.length - 1)];
}

function isTerminal(status: string): boolean {
  return status === "COMPLETE" || status === "FAILED" || status === "PARTIAL";
}

function mapTerminalToPollStatus(status: string): PollStatus {
  if (status === "COMPLETE") return "complete";
  if (status === "PARTIAL") return "partial";
  if (status === "FAILED") return "failed";
  return "polling";
}

export function useEntryPolling(
  entryId: string | null
): UseEntryPollingResult {
  const [state, setState] = useState<UseEntryPollingResult>({
    status: "idle",
    entry: null,
    error: null,
    phase: null,
    elapsedSeconds: 0,
  });

  const cancelled = useRef(false);

  useEffect(() => {
    if (!entryId) return;
    cancelled.current = false;

    const startedAt = Date.now();
    let attempt = 0;
    let elapsedTickHandle: ReturnType<typeof setInterval> | null = null;
    let nextPollHandle: ReturnType<typeof setTimeout> | null = null;

    // Drive the elapsedSeconds counter independently of poll requests
    // so the UI can show a live timer.
    elapsedTickHandle = setInterval(() => {
      if (cancelled.current) return;
      setState((prev) => ({
        ...prev,
        elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
      }));
    }, 1000);

    const poll = async (): Promise<void> => {
      if (cancelled.current) return;

      if (Date.now() - startedAt > MAX_WALL_CLOCK_MS) {
        setState((prev) => ({ ...prev, status: "timeout" }));
        return;
      }

      try {
        const res = await fetch(`/api/entries/${entryId}`, {
          credentials: "include",
        });
        if (cancelled.current) return;

        if (res.status === 404) {
          setState((prev) => ({
            ...prev,
            status: "failed",
            error: "Entry not found",
          }));
          return;
        }
        if (!res.ok) {
          // Transient server error — back off and retry.
          attempt++;
          nextPollHandle = setTimeout(poll, nextDelay(attempt));
          return;
        }

        const body = (await res.json()) as { entry: PolledEntry };
        const entry = body.entry;

        setState((prev) => ({
          ...prev,
          status: isTerminal(entry.status)
            ? mapTerminalToPollStatus(entry.status)
            : "polling",
          entry,
          phase: entry.status,
        }));

        if (isTerminal(entry.status)) return;
      } catch (err) {
        if (cancelled.current) return;
        // Network error — retry with backoff.
        attempt++;
        const delay = nextDelay(attempt);
        nextPollHandle = setTimeout(poll, delay);
        return;
      }

      attempt++;
      nextPollHandle = setTimeout(poll, nextDelay(attempt));
    };

    setState({
      status: "polling",
      entry: null,
      error: null,
      phase: "QUEUED",
      elapsedSeconds: 0,
    });
    poll();

    return () => {
      cancelled.current = true;
      if (elapsedTickHandle) clearInterval(elapsedTickHandle);
      if (nextPollHandle) clearTimeout(nextPollHandle);
    };
  }, [entryId]);

  return state;
}

export const __internals_for_tests = {
  nextDelay,
  isTerminal,
  mapTerminalToPollStatus,
  BACKOFF_SCHEDULE_MS,
  MAX_WALL_CLOCK_MS,
};
