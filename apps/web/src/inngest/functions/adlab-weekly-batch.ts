import { inngest } from "@/inngest/client";

import type { GroupBatchSummary } from "@/lib/adlab/weekly-batch";

/**
 * Weekly Reddit→AdLab ad batch (2026-09-23, per Keenan).
 *
 * Runs Sunday 10:00 UTC (5am CDT) — after the Saturday 11:59pm CDT Reddit
 * pulse — so 20 fresh Reddit-grounded ads (10 per audience group: women /
 * men) are waiting for Keenan's Sunday admin session:
 *   create batch (copy) → images (one step each, idempotent) → compliance
 *   → review email.
 *
 * MONEY SAFETY: this function never touches Meta. It only writes DB rows
 * (experiments awaiting_approval, creatives approved=false) and images.
 * Spending requires Keenan's explicit Launch click at /admin/adlab/review.
 *
 * Each group soft-fails independently — a missing digest or Claude error
 * on one group still delivers the other group's batch + email.
 *
 * Manual trigger: "adlab/weekly-batch.requested".
 */
export const adlabWeeklyBatchFn = inngest.createFunction(
  {
    id: "adlab-weekly-batch",
    name: "AdLab — Weekly Reddit Ad Batch",
    retries: 1,
    concurrency: { limit: 1 },
    triggers: [
      { cron: "0 10 * * 0" },
      { event: "adlab/weekly-batch.requested" },
    ],
  },
  async ({ step, logger }) => {
    const groups = ["women", "men"] as const;
    const summaries: GroupBatchSummary[] = [];

    for (const groupKey of groups) {
      // 1. Copy generation (one Claude call → experiment + 10 creatives)
      const batch = await step.run(`create-batch-${groupKey}`, async () => {
        try {
          const { createBatchForGroup } = await import("@/lib/adlab/weekly-batch");
          return await createBatchForGroup(groupKey);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`[adlab-weekly] ${groupKey} batch failed: ${msg}`);
          return { error: msg } as const;
        }
      });

      if ("error" in batch) {
        summaries.push({
          groupKey,
          experimentId: "",
          digestDate: "",
          creativeCount: 0,
          imagesOk: 0,
          compliance: { passCount: 0, warnCount: 0, failCount: 0 },
          headlines: [],
          error: batch.error,
        });
        continue;
      }

      // 2. Images — one step per creative so a single gpt-image-2 call
      // fits Vercel's step budget; generateBatchImage is idempotent
      // (skips if imageUrl set) and soft-fails into complianceNotes.
      let imagesOk = 0;
      for (let i = 0; i < batch.creativeIds.length; i++) {
        const result = await step.run(`image-${groupKey}-${i + 1}`, async () => {
          const { generateBatchImage } = await import("@/lib/adlab/weekly-batch");
          return generateBatchImage(batch.creativeIds[i]);
        });
        if (result.ok) imagesOk++;
      }

      // 3. Compliance (batched Claude review; FAILs auto-unapproved)
      const compliance = await step.run(`compliance-${groupKey}`, async () => {
        try {
          const { runComplianceForExperiment } = await import("@/lib/adlab/compliance");
          const r = await runComplianceForExperiment(batch.experimentId);
          return { passCount: r.passCount, warnCount: r.warnCount, failCount: r.failCount };
        } catch (err) {
          logger.warn(
            `[adlab-weekly] ${groupKey} compliance failed: ${err instanceof Error ? err.message : err}`
          );
          return { passCount: 0, warnCount: 0, failCount: 0 };
        }
      });

      const headlines = await step.run(`headlines-${groupKey}`, async () => {
        const { prisma } = await import("@/lib/prisma");
        const creatives = await prisma.adLabCreative.findMany({
          where: { id: { in: batch.creativeIds } },
          select: { headline: true },
          orderBy: { createdAt: "asc" },
        });
        return creatives.map((c) => c.headline);
      });

      summaries.push({
        groupKey,
        experimentId: batch.experimentId,
        digestDate: batch.digestDate,
        creativeCount: batch.creativeIds.length,
        imagesOk,
        compliance,
        headlines,
      });
    }

    // 4. Review email (soft — never fails the run)
    await step.run("send-review-email", async () => {
      try {
        const { sendWeeklyBatchEmail } = await import("@/lib/adlab/weekly-batch");
        await sendWeeklyBatchEmail(summaries);
      } catch (err) {
        logger.warn(
          `[adlab-weekly] review email failed: ${err instanceof Error ? err.message : err}`
        );
      }
    });

    logger.info(
      `[adlab-weekly] done: ${summaries
        .map((s) => `${s.groupKey}=${s.error ? `ERROR(${s.error.slice(0, 80)})` : `${s.creativeCount} ads, ${s.imagesOk} images`}`)
        .join("; ")}`
    );
    return { summaries };
  }
);
