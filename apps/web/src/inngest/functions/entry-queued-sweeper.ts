/**
 * Queued-entry sweeper (2026-10-20).
 *
 * Safety net for lib/entry-dispatch.ts. If handing a new entry to the
 * pipeline fails (Inngest's event API refused Vercel's connections on
 * 2026-10-20 15:30 UTC and three recordings sat in QUEUED with no run),
 * the entry stays QUEUED with no `inngestRunId`. Every 2 minutes this
 * finds those and dispatches them again.
 *
 * Safe to resend: the dispatch uses the deterministic event id
 * `entry-process:<entryId>`, so if the first send actually landed (e.g.
 * the run is just waiting behind the per-user concurrency limit), Inngest
 * drops the duplicate. process-entry stamps `inngestRunId` as its very
 * first step, so "QUEUED + no run id + older than 90s" means "never
 * started".
 *
 * Only entries created after SWEEP_EPOCH: older ones were sent WITHOUT the
 * dedupe id, so resending one that is merely waiting in Inngest's queue
 * could process it twice.
 */

import { inngest } from "@/inngest/client";
import { dispatchEntryProcessing } from "@/lib/entry-dispatch";
import { safeLog } from "@/lib/safe-log";

/** Deploy of the dedupe id (fix/record-dispatch-resilience). */
export const SWEEP_EPOCH = new Date("2026-10-20T16:00:00Z");
const MIN_AGE_MS = 90_000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BATCH = 50;

export function sweepWindow(now: Date): { gt: Date; lt: Date } {
  const oldest = new Date(now.getTime() - MAX_AGE_MS);
  return {
    gt: oldest > SWEEP_EPOCH ? oldest : SWEEP_EPOCH,
    lt: new Date(now.getTime() - MIN_AGE_MS),
  };
}

export const entryQueuedSweeperFn = inngest.createFunction(
  {
    id: "entry-queued-sweeper",
    name: "Entries — dispatch any stuck in QUEUED",
    retries: 1,
    // Never two sweeps at once.
    concurrency: { limit: 1 },
    triggers: [{ cron: "*/2 * * * *" }],
  },
  async ({ step }) => {
    const stuck = await step.run("find-stuck", async () => {
      const { prisma } = await import("@/lib/prisma");
      const rows = await prisma.entry.findMany({
        where: {
          status: "QUEUED",
          inngestRunId: null,
          createdAt: sweepWindow(new Date()),
          OR: [{ audioPath: { not: null } }, { transcript: { not: null } }],
        },
        select: { id: true, userId: true, inputMode: true },
        orderBy: { createdAt: "asc" },
        take: BATCH,
      });
      return rows;
    });
    if (stuck.length === 0) return { dispatched: 0 };

    const results = await step.run("dispatch", async () => {
      let ok = 0;
      for (const e of stuck) {
        const sent = await dispatchEntryProcessing({
          entryId: e.id,
          userId: e.userId,
          ...(e.inputMode === "typed" ? { transcriptProvided: true } : {}),
        });
        if (sent) ok++;
      }
      return { ok, total: stuck.length };
    });
    safeLog.warn("entry-queued-sweeper.dispatched", results);
    return { dispatched: results.ok, found: results.total };
  }
);
