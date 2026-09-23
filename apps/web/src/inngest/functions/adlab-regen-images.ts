import { inngest } from "@/inngest/client";

/**
 * Regenerate the ad-creative images for existing weekly-batch experiments
 * (2026-09-23, per Keenan — first batch shipped as plain mood photos with
 * no hook/value-prop/CTA baked in).
 *
 * For each experiment: rebuilds every creative's generationPrompt with the
 * direct-response AD_FORMATS rotation (from the stored copy fields — no new
 * Claude copy generation), force-regenerates each image, then re-runs
 * compliance. Copy, angles, and experiment rows are untouched.
 *
 * MONEY SAFETY: never touches Meta — launch still requires the review-page
 * click.
 *
 * Trigger: event "adlab/regen-images.requested" with
 * data.experimentIds: string[].
 */
export const adlabRegenImagesFn = inngest.createFunction(
  {
    id: "adlab-regen-images",
    name: "AdLab — Regenerate Batch Images",
    retries: 1,
    concurrency: { limit: 1 },
    triggers: [{ event: "adlab/regen-images.requested" }],
  },
  async ({ event, step, logger }) => {
    const experimentIds: string[] = event.data?.experimentIds ?? [];
    if (!experimentIds.length) {
      return { error: "no experimentIds provided" };
    }

    const results: Array<{ experimentId: string; imagesOk: number; total: number; error?: string }> = [];

    for (const experimentId of experimentIds) {
      // 1. Load creatives + group, rebuild prompts (deterministic, no AI)
      const plan = await step.run(`rebuild-prompts-${experimentId}`, async () => {
        const { prisma } = await import("@/lib/prisma");
        const { buildAdImagePrompt, BATCH_GROUPS } = await import("@/lib/adlab/weekly-batch");

        const experiment = await prisma.adLabExperiment.findUnique({
          where: { id: experimentId },
          select: {
            id: true,
            campaignTags: true,
            angles: {
              select: {
                creatives: {
                  select: {
                    id: true,
                    headline: true,
                    description: true,
                    cta: true,
                    generationPrompt: true,
                    createdAt: true,
                  },
                },
              },
            },
          },
        });
        if (!experiment) return { error: `experiment ${experimentId} not found` } as const;

        const groupKey = (Object.keys(BATCH_GROUPS) as Array<keyof typeof BATCH_GROUPS>).find((k) =>
          experiment.campaignTags.includes(k)
        );
        if (!groupKey) return { error: `experiment ${experimentId} has no group tag` } as const;

        const creatives = experiment.angles
          .flatMap((a) => a.creatives)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        for (const [i, c] of creatives.entries()) {
          // Old prompts ended with "Scene: <imageScene>" — recover the scene
          // for photo-background formats; fall back to the group style alone.
          const sceneMatch = c.generationPrompt?.match(/Scene: ([\s\S]+)$/);
          const imageScene = sceneMatch ? sceneMatch[1].trim() : "";
          const prompt = buildAdImagePrompt(
            i,
            { headline: c.headline, description: c.description, cta: c.cta, imageScene },
            groupKey
          );
          await prisma.adLabCreative.update({
            where: { id: c.id },
            data: { generationPrompt: prompt },
          });
        }
        return { creativeIds: creatives.map((c) => c.id) } as const;
      });

      if ("error" in plan) {
        logger.error(`[adlab-regen] ${plan.error}`);
        results.push({ experimentId, imagesOk: 0, total: 0, error: plan.error });
        continue;
      }

      // 2. Force-regenerate each image (one step each — fits Vercel budget)
      let imagesOk = 0;
      for (let i = 0; i < plan.creativeIds.length; i++) {
        const result = await step.run(`image-${experimentId}-${i + 1}`, async () => {
          const { generateBatchImage } = await import("@/lib/adlab/weekly-batch");
          return generateBatchImage(plan.creativeIds[i], { force: true });
        });
        if (result.ok) imagesOk++;
      }

      // 3. Re-run compliance on the (unchanged) copy
      await step.run(`compliance-${experimentId}`, async () => {
        try {
          const { runComplianceForExperiment } = await import("@/lib/adlab/compliance");
          return await runComplianceForExperiment(experimentId);
        } catch (err) {
          logger.warn(
            `[adlab-regen] compliance failed for ${experimentId}: ${err instanceof Error ? err.message : err}`
          );
          return null;
        }
      });

      results.push({ experimentId, imagesOk, total: plan.creativeIds.length });
    }

    logger.info(
      `[adlab-regen] done: ${results
        .map((r) => `${r.experimentId}=${r.error ?? `${r.imagesOk}/${r.total} images`}`)
        .join("; ")}`
    );
    return { results };
  }
);
