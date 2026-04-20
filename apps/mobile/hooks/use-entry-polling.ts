import { useEffect, useRef, useState } from "react";

/**
 * Mobile companion to apps/web/src/hooks/use-entry-polling.ts.
 * Same interface, same backoff schedule, same 3-minute budget —
 * factored into each app for now so Expo + Next can ship without
 * a shared `packages/*` dep. Future cleanup: pull both into
 * packages/shared/hooks once there's a reason beyond two call sites.
 *
 * Expo lifecycle quirk: this component's <ParentScreen> may unmount
 * when the tab navigator switches tabs, which is fine — we clean up
 * via the `cancelled` ref. Don't assume React Navigation focus-loss
 * = full unmount. If the hook needs to pause-on-blur later, swap in
 * useFocusEffect.
 */

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

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
  rawAnalysis: unknown;
}

export interface UseEntryPollingResult {
  status: PollStatus;
  entry: PolledEntry | null;
  error: string | null;
  phase: string | null;
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
        const res = await fetch(`${BASE_URL}/api/entries/${entryId}`, {
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
      } catch {
        if (cancelled.current) return;
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
