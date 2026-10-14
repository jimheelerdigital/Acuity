import { inngest } from "@/inngest/client";

import type { GroupBatchSummary } from "@/lib/adlab/weekly-batch";

/**
 * Weekly Reddit→AdLab ad batch (2026-09-23, per Keenan).
 *
 * Runs Saturday 21:00 UTC (4pm CDT), three hours after the Saturday
 * competitor research (2026-10-14, per Keenan: "push the sunday ad drafts to
 * saturday and then batch it for Monday"). The ad copy goes out as an
 * Anthropic Message Batch at half price: both lanes' requests are sent, the
 * run checks every 10 minutes for up to 12 hours, then builds the ads from
 * the replies. Any lane or request the batch didn't return is written with a
 * live call, so the drafts are always waiting by Sunday morning:
 *   learning snapshot → create batch (copy, informed by learning + the
 *   Saturday competitor brief) → images (one step each, idempotent) →
 *   compliance → review email.
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
      { cron: "0 21 * * 6" },
      { event: "adlab/weekly-batch.requested" },
    ],
  },
  async ({ event, step, logger }) => {
    // On-demand runs can target one group (2026-09-24): remaking the
    // women's batch shouldn't replace the men's ads Keenan already liked.
    const requested = ((event?.data as { groups?: string[] } | undefined)?.groups ?? []).filter(
      (g): g is "women" | "men" => g === "women" || g === "men"
    );
    const groups = requested.length ? requested : (["women", "men"] as const);
    const summaries: GroupBatchSummary[] = [];
    // The scheduled run batches the copy; a manual run stays live (someone is
    // waiting on it) unless it asks for { batch: true }.
    const useBatch = event?.name !== "adlab/weekly-batch.requested" || (event?.data as { batch?: boolean } | undefined)?.batch === true;
    // Same seed for the collect pass and the build pass, so the looks (and
    // therefore the prompts) match and the batch replies can be used.
    const seed = await step.run("seed", () => Date.now() % 2_147_483_647);

    for (const groupKey of groups) {
      // 0. Learning loop — refresh this group's first-party performance
      // snapshot (spend → signups → trial starts per creative) + Claude
      // brief, so the copy call below writes with last week's results.
      // Soft: on failure the batch falls back to the freshest older
      // snapshot (≤14 days) or runs without one.
      await step.run(`learning-${groupKey}`, async () => {
        try {
          const { runWeeklyLearning } = await import("@/lib/adlab/learning");
          return await runWeeklyLearning(groupKey);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`[adlab-weekly] ${groupKey} learning failed: ${msg}`);
          return { error: msg };
        }
      });
    }

    // 0b. Send every lane's copy requests as one Message Batch (half price).
    // Soft: if this fails, the build step below writes the copy live.
    const sent = useBatch
      ? await step.run("batch-submit", async () => {
          try {
            const { SUBMIT_ADS_TOOL, collectBatchCopyRequests } = await import("@/lib/adlab/weekly-batch");
            const { AD_COPY_MODELS, submitAdLabBatch } = await import("@/lib/adlab/claude");
            const items = [];
            for (const groupKey of groups) {
              for (const r of await collectBatchCopyRequests(groupKey, seed)) {
                items.push({ ...r, customId: r.purpose, model: AD_COPY_MODELS[0], outputTool: SUBMIT_ADS_TOOL });
              }
            }
            if (!items.length) return null;
            return { batchId: await submitAdLabBatch(items), items };
          } catch (err) {
            logger.warn(`[adlab-weekly] batch submit failed, writing copy live: ${err instanceof Error ? err.message : err}`);
            return null;
          }
        })
      : null;

    // 0c. Wait for it: check every 10 minutes, for up to 12 hours.
    let prefetched: import("@/lib/adlab/weekly-batch").PrefetchedCopy = {};
    if (sent) {
      let status = "in_progress";
      for (let round = 0; round < 72 && status !== "ended"; round++) {
        await step.sleep(`batch-wait-${round}`, "10m");
        status = await step.run(`batch-status-${round}`, async () => {
          const { adLabBatchStatus } = await import("@/lib/adlab/claude");
          return adLabBatchStatus(sent.batchId).catch(() => "in_progress");
        });
      }
      if (status === "ended") {
        prefetched = await step.run("batch-results", async () => {
          try {
            const { adLabBatchResults } = await import("@/lib/adlab/claude");
            const text = await adLabBatchResults(sent.batchId, sent.items);
            const out: import("@/lib/adlab/weekly-batch").PrefetchedCopy = {};
            for (const i of sent.items) if (text[i.customId]) out[i.purpose] = { promptHash: i.promptHash, raw: text[i.customId] };
            return out;
          } catch (err) {
            logger.warn(`[adlab-weekly] batch results failed, writing copy live: ${err instanceof Error ? err.message : err}`);
            return {};
          }
        });
      } else {
        logger.warn(`[adlab-weekly] batch ${sent.batchId} not done after 12h, writing copy live`);
      }
    }

    for (const groupKey of groups) {
      // 1. Copy generation → experiment + 10 creatives (from the batch
      // replies when they match; live calls otherwise)
      const batch = await step.run(`create-batch-${groupKey}`, async () => {
        try {
          const { createBatchForGroup } = await import("@/lib/adlab/weekly-batch");
          return await createBatchForGroup(groupKey, { seed, prefetched });
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

      // 1b. Higgsfield openers for the video ads (2026-09-29, per Keenan:
      // "an initial hook via higgsfield for the first few seconds followed
      // by the animation"). Submit all, then check every 30s for up to
      // ~12 min. Anything not back in time renders with the animation-only
      // intro, so Higgsfield can slow the batch but never break it.
      const videoIds = batch.videoCreativeIds ?? [];
      let pendingOpeners: string[] = [];
      for (let i = 0; i < videoIds.length; i++) {
        const r = await step.run(`opener-submit-${groupKey}-${i + 1}`, async () => {
          const { submitVideoOpener } = await import("@/lib/adlab/weekly-batch");
          return submitVideoOpener(videoIds[i]);
        });
        if (r.submitted) pendingOpeners.push(videoIds[i]);
      }
      for (let round = 0; round < 24 && pendingOpeners.length; round++) {
        await step.sleep(`opener-wait-${groupKey}-${round}`, "30s");
        const waiting = pendingOpeners;
        pendingOpeners = await step.run(`opener-check-${groupKey}-${round}`, async () => {
          const { checkVideoOpener } = await import("@/lib/adlab/weekly-batch");
          const still: string[] = [];
          for (const id of waiting) if ((await checkVideoOpener(id)) === "pending") still.push(id);
          return still;
        });
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

      // 2b. Variety check (2026-10-05, per Keenan: "the more variance the
      // better"): Opus compares the batch's images side by side; look-alikes,
      // obvious-AI renders and broken text (max 3) move to a new look and
      // re-render. Fails open.
      const variety = await step.run(`variety-${groupKey}`, async () => {
        const { runVarietyCheck } = await import("@/lib/adlab/variety-check");
        return runVarietyCheck(batch.experimentId, groupKey);
      });
      logger.info(`[adlab-weekly] ${groupKey} variety: ${variety.note}`);
      for (let i = 0; i < variety.redo.length; i++) {
        await step.run(`variety-redo-${groupKey}-${i + 1}`, async () => {
          const { generateBatchImage } = await import("@/lib/adlab/weekly-batch");
          return generateBatchImage(variety.redo[i], { force: true });
        });
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
