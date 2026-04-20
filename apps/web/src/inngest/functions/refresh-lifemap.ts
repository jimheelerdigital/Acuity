import { inngest } from "@/inngest/client";

type RefreshLifeMapEventData = { userId: string };

export const refreshLifeMapFn = inngest.createFunction(
  {
    id: "refresh-life-map",
    name: "Refresh Life Map",
    triggers: [{ event: "lifemap/refresh.requested" }],
    // USER-INTERACTIVE (Decisions Made 2026-04-19): the user tapped a
    // refresh button and is watching the LifeMap UI.
    retries: 2,
    // One in-flight refresh per user.
    concurrency: { key: "event.data.userId", limit: 1 },
    // Coalesce button-mashing — back-to-back refresh requests within
    // 10 minutes collapse to one Claude pair (compression + insights).
    debounce: { key: "event.data.userId", period: "10m" },
    onFailure: async ({ event, error }) => {
      // Refresh failures are non-disruptive — the user's existing Life
      // Map remains in place; nothing to surface in the UI. Log only;
      // they can retry from the same button.
      const originalData = (event.data as { event?: { data?: unknown } })?.event
        ?.data as RefreshLifeMapEventData | undefined;
      console.error("[refresh-life-map] exhausted retries", {
        userId: originalData?.userId,
        error: error?.message,
      });
    },
  },
  async ({ event, step }) => {
    const { userId } = event.data as RefreshLifeMapEventData;

    // Step 1: compress UserMemory if stale (>7d since last compression).
    // Both sub-actions live in this one step because they share the
    // same getOrCreateUserMemory read and either both are needed or
    // neither is. The compress branch only fires conditionally inside.
    await step.run("maybe-compress-memory", async () => {
      const { compressMemory, getOrCreateUserMemory } = await import(
        "@/lib/memory"
      );
      const memory = await getOrCreateUserMemory(userId);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      if (!memory.lastCompressed || memory.lastCompressed < sevenDaysAgo) {
        await compressMemory(userId);
        return { compressed: true };
      }
      return { compressed: false };
    });

    // Step 2: regenerate per-area insight summaries via Claude.
    await step.run("generate-insights", async () => {
      const { generateLifeMapInsights } = await import("@/lib/memory");
      await generateLifeMapInsights(userId);
    });

    return { userId, refreshed: true };
  }
);
