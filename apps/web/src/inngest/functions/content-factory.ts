import { inngest } from "@/inngest/client";

export const researchBriefingFn = inngest.createFunction(
  {
    id: "content-factory-research",
    name: "Content Factory — Daily Research Briefing",
    triggers: [{ cron: "0 6 * * *" }],
    retries: 2,
  },
  async ({ logger }) => {
    const { buildDailyBriefing } = await import(
      "@/lib/content-factory/research"
    );
    const briefing = await buildDailyBriefing();
    logger.info("[content-factory] Research briefing created", {
      briefingId: briefing.id,
    });
    return { briefingId: briefing.id };
  }
);

// ─── Helper: update job progress ────────────────────────────────────────────

async function updateJob(
  jobId: string | undefined,
  data: {
    status?: "RUNNING" | "SUCCESS" | "FAILED";
    currentStep?: number;
    stepLabel?: string;
    errorMessage?: string;
    piecesCreated?: number;
    completedAt?: Date;
  }
) {
  if (!jobId) return;
  const { prisma } = await import("@/lib/prisma");
  await prisma.generationJob.update({
    where: { id: jobId },
    data,
  });
  console.log(
    `[GenerationJob ${jobId}] step ${data.currentStep ?? "?"}/${11}: ${data.stepLabel ?? data.status ?? "update"}`
  );
}

export const generateDailyFn = inngest.createFunction(
  {
    id: "content-factory-generate",
    name: "Content Factory — Daily Content Generation",
    triggers: [
      { cron: "0 7 * * *" },
      { event: "content-factory/generate.requested" },
    ],
    retries: 1,
  },
  async ({ event, logger }) => {
    const jobId = (event?.data as { jobId?: string })?.jobId;
    const { prisma } = await import("@/lib/prisma");

    try {
      // Step 1: Research
      await updateJob(jobId, {
        status: "RUNNING",
        currentStep: 1,
        stepLabel: "Researching today's trending topics…",
      });

      const { buildDailyBriefing } = await import(
        "@/lib/content-factory/research"
      );

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      let briefing = await prisma.contentBriefing.findUnique({
        where: { date: today },
      });

      if (!briefing) {
        logger.info("[content-factory] No briefing for today, creating one");
        briefing = await buildDailyBriefing();
      }

      // Blog generation has been moved to the auto-blog pipeline
      // (see inngest/functions/auto-blog.ts). This function now produces
      // 8 pieces: 3 tweets + 2 TikToks + 2 ads + 1 Reddit draft.

      const {
        generateTwitterPosts,
        generateTikTokScripts,
        generateAdCopy,
        generateRedditDraft,
      } = await import("@/lib/content-factory/generate");

      // Steps 2-4: Tweets (one at a time for progress)
      const tweets = [];
      for (let i = 0; i < 3; i++) {
        await updateJob(jobId, {
          currentStep: 2 + i,
          stepLabel: `Writing tweet ${i + 1} of 3…`,
        });
        const batch = await generateTwitterPosts(briefing, 1);
        tweets.push(...batch);
      }

      // Steps 5-6: TikTok scripts
      const tiktoks = [];
      for (let i = 0; i < 2; i++) {
        await updateJob(jobId, {
          currentStep: 5 + i,
          stepLabel: `Writing TikTok script ${i + 1} of 2…`,
        });
        const batch = await generateTikTokScripts(briefing, 1);
        tiktoks.push(...batch);
      }

      // Steps 7-8: Ad copy
      const ads = [];
      for (let i = 0; i < 2; i++) {
        await updateJob(jobId, {
          currentStep: 7 + i,
          stepLabel: `Writing ad copy variant ${i + 1} of 2…`,
        });
        const batch = await generateAdCopy(briefing, 1);
        ads.push(...batch);
      }

      // Step 9: Reddit draft
      await updateJob(jobId, {
        currentStep: 9,
        stepLabel: "Writing Reddit draft…",
      });
      const redditDrafts = await generateRedditDraft(briefing, 1);

      // Step 10: Save to database
      await updateJob(jobId, {
        currentStep: 10,
        stepLabel: "Saving to database…",
      });

      const pieces = [
        ...tweets.map((t) => ({
          type: "TWITTER" as const,
          title: t.hook.slice(0, 80),
          body: t.body,
          hook: t.hook,
          cta: t.cta,
          predictedScore: t.predictedScore,
          sourceBriefingId: briefing.id,
        })),
        ...tiktoks.map((t) => ({
          type: "TIKTOK" as const,
          title: t.hook.slice(0, 80),
          body: t.body,
          hook: t.hook,
          cta: t.cta,
          predictedScore: t.predictedScore,
          sourceBriefingId: briefing.id,
        })),
        ...ads.map((a) => ({
          type: "AD_COPY" as const,
          title: a.hook.slice(0, 80),
          body: a.body,
          hook: a.hook,
          cta: a.cta,
          predictedScore: a.predictedScore,
          sourceBriefingId: briefing.id,
        })),
        ...redditDrafts.map((r) => ({
          type: "REDDIT_DRAFT" as const,
          title: r.title,
          body: r.body,
          hook: r.hook,
          cta: `${r.subreddit} | ${r.angle} | ${r.dontMention}`,
          predictedScore: r.predictedScore,
          sourceBriefingId: briefing.id,
        })),
      ];

      const created = await prisma.$transaction(
        pieces.map((p) => prisma.contentPiece.create({ data: p }))
      );

      // Step 11: Done
      await updateJob(jobId, {
        status: "SUCCESS",
        currentStep: 11,
        stepLabel: `Done! ${created.length} pieces created`,
        piecesCreated: created.length,
        completedAt: new Date(),
      });

      logger.info("[content-factory] Generated content pieces", {
        count: created.length,
      });

      return { briefingId: briefing.id, piecesCreated: created.length };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("[content-factory] Generation failed", { error: message });

      await updateJob(jobId, {
        status: "FAILED",
        errorMessage: message,
        completedAt: new Date(),
      });

      throw error;
    }
  }
);
