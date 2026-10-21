import "server-only";

import { safeLog } from "@/lib/safe-log";

/**
 * Hand a NEW entry to the processing pipeline (2026-10-20).
 *
 * Why this exists: /api/record created the Entry, then awaited
 * `inngest.send`. On 2026-10-20 15:30 UTC Inngest's event API closed the
 * connection from Vercel without answering (~30s, "other side closed")
 * three times in a row. The send threw, the route returned 500, the app
 * retried the upload (three Entries for one recording), and every Entry
 * sat in QUEUED forever because nothing ever dispatched it again.
 *
 * Now:
 *   - each attempt is bounded (6s) and retried twice with a short backoff;
 *   - the event carries a deterministic id (`entry-process:<entryId>`), so
 *     Inngest drops a duplicate if an attempt we THOUGHT failed actually
 *     landed, and the queued-entry sweeper can resend safely;
 *   - it never throws. On final failure the Entry stays QUEUED with no
 *     run attached and `entry-queued-sweeper` dispatches it within minutes.
 *     The caller still answers 202, because the recording IS saved.
 *
 * Only for an entry's FIRST run. Reprocess / edit flows send their own
 * events without this id (they must not be deduped against the first run).
 */

export type EntryProcessData = {
  entryId: string;
  userId: string;
  transcriptProvided?: boolean;
};

const ATTEMPT_TIMEOUT_MS = 6_000;
const BACKOFF_MS = [500, 1_500];

export function entryProcessEventId(entryId: string): string {
  return `entry-process:${entryId}`;
}

type Sender = (payload: { id: string; name: string; data: EntryProcessData }) => Promise<unknown>;

export async function dispatchEntryProcessing(
  data: EntryProcessData,
  deps?: { send?: Sender; sleep?: (ms: number) => Promise<void>; timeoutMs?: number }
): Promise<boolean> {
  const send: Sender =
    deps?.send ??
    (async (payload) => {
      const { inngest } = await import("@/inngest/client");
      return inngest.send(payload);
    });
  const sleep = deps?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const timeoutMs = deps?.timeoutMs ?? ATTEMPT_TIMEOUT_MS;
  const payload = { id: entryProcessEventId(data.entryId), name: "entry/process.requested", data };

  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      await Promise.race([
        send(payload),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs)),
      ]);
      if (attempt > 0) safeLog.info("entry-dispatch.recovered", { entryId: data.entryId, attempt });
      return true;
    } catch (err) {
      safeLog.error("entry-dispatch.attempt_failed", err, { entryId: data.entryId, attempt });
      if (attempt < BACKOFF_MS.length) await sleep(BACKOFF_MS[attempt]);
    }
  }
  safeLog.error("entry-dispatch.gave_up", "all attempts failed", {
    entryId: data.entryId,
    fallback: "entry-queued-sweeper",
  });
  return false;
}
