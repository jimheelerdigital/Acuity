import { compressMemory } from "@/lib/memory";

import { inngest } from "@/inngest/client";

/**
 * Async wrapper around lib/memory.ts::compressMemory. Triggered every
 * 10 entries from the recording-completion path so the inline-Claude
 * call no longer blocks the user's recording response.
 *
 * Before this function existed, `await compressMemory(userId)` ran
 * inside the recording handler and added 5-20 seconds to the
 * response on every 10th recording. Audit item #1 from the
 * 2026-04-28 perf+polish pass.
 *
 * Idempotent: compressMemory itself is safe to re-run; the only
 * side effect is rewriting the UserMemory.compressedSummary field
 * with a fresh Claude synthesis. Inngest's at-least-once delivery
 * means we may compress twice for a given trigger; that's harmless.
 */

type CompressMemoryEventData = { userId: string };

export const compressMemoryFn = inngest.createFunction(
  {
    id: "compress-memory",
    name: "Compress Memory",
    triggers: [{ event: "memory/compress" }],
    // Single retry — this is best-effort. If it fails twice, the
    // memory just doesn't get compressed this cycle; the user's
    // experience is unaffected because the Entry + UserMemory
    // increment already wrote synchronously upstream.
    retries: 1,
  },
  async ({ event, step }: { event: { data: CompressMemoryEventData }; step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const { userId } = event.data as CompressMemoryEventData;
    if (!userId || typeof userId !== "string") {
      throw new Error("compress-memory: missing or invalid userId");
    }

    await step.run("compress", async () => {
      await compressMemory(userId);
      return { ok: true };
    });

    return { userId, compressed: true };
  }
);
