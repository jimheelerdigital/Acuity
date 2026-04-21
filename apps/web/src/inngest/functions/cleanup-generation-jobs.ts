import { inngest } from "@/inngest/client";

export const cleanupGenerationJobsFn = inngest.createFunction(
  {
    id: "cleanup-generation-jobs",
    name: "Cleanup — Stale Generation Jobs",
    triggers: [{ cron: "0 3 * * *" }],
    retries: 1,
  },
  async ({ logger }) => {
    const { prisma } = await import("@/lib/prisma");
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const { count } = await prisma.generationJob.deleteMany({
      where: {
        status: { in: ["SUCCESS", "FAILED"] },
        completedAt: { lt: cutoff },
      },
    });

    logger.info("[cleanup] Deleted old GenerationJob rows", { count });
    return { deleted: count };
  }
);
