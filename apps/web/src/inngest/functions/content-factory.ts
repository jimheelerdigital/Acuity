import { inngest } from "@/inngest/client";

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
    `[GenerationJob ${jobId}] step ${data.currentStep ?? "?"}/${4}: ${data.stepLabel ?? data.status ?? "update"}`
  );
}

/**
 * On-demand content generation — triggered by button clicks in the admin UI.
 *
 * Event data:
 *   - jobId: GenerationJob ID for progress tracking
 *   - types: array of content types to generate, e.g. ["X_POST", "INSTAGRAM", "TIKTOK_SCRIPT"]
 *
 * Generates 1 piece per requested type. No cron — manual only.
 */
export const generateContentFn = inngest.createFunction(
  {
    id: "content-factory-generate",
    name: "Content Factory — On-Demand Generation",
    triggers: [{ event: "content-factory/generate.requested" }],
    retries: 1,
  },
  async ({ event, logger }) => {
    const jobId = (event?.data as { jobId?: string })?.jobId;
    const requestedTypes = (event?.data as { types?: string[] })?.types ?? [
      "X_POST",
      "INSTAGRAM",
      "TIKTOK_SCRIPT",
    ];
    const { prisma } = await import("@/lib/prisma");

    const totalSteps = requestedTypes.length + 1; // +1 for save step

    try {
      await updateJob(jobId, {
        status: "RUNNING",
        currentStep: 0,
        stepLabel: "Starting generation…",
      });

      // Optionally load today's briefing for context (non-blocking)
      let briefing = null;
      try {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        briefing = await prisma.contentBriefing.findUnique({
          where: { date: today },
        });
      } catch {
        // No briefing available — that's fine
      }

      const {
        generateTwitterPosts,
        generateTikTokScripts,
        generateInstagramPost,
      } = await import("@/lib/content-factory/generate");

      const pieces: Array<{
        type: string;
        title: string;
        body: string;
        hook: string;
        cta: string;
        predictedScore: number;
        heroImageUrl?: string;
        sourceBriefingId?: string;
      }> = [];

      let stepNum = 0;

      for (const contentType of requestedTypes) {
        stepNum++;

        if (contentType === "X_POST") {
          await updateJob(jobId, {
            currentStep: stepNum,
            stepLabel: "Writing X post…",
          });
          const tweets = await generateTwitterPosts(briefing, 1);
          if (tweets[0]) {
            pieces.push({
              type: "TWITTER",
              title: tweets[0].hook.slice(0, 80),
              body: tweets[0].body,
              hook: tweets[0].hook,
              cta: tweets[0].cta,
              predictedScore: tweets[0].predictedScore,
              sourceBriefingId: briefing?.id,
            });
          }
        } else if (contentType === "INSTAGRAM") {
          await updateJob(jobId, {
            currentStep: stepNum,
            stepLabel: "Writing Instagram post & generating image…",
          });

          const igPost = await generateInstagramPost(briefing);

          // Generate image with gpt-image-2
          let imageUrl: string | null = null;
          if (process.env.OPENAI_API_KEY) {
            try {
              const OpenAI = (await import("openai")).default;
              const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
                timeout: 120_000,
              });

              const imageResponse = await openai.images.generate({
                model: "gpt-image-2",
                prompt: igPost.imagePrompt,
                n: 1,
                size: "1024x1024",
              });

              const b64 = imageResponse.data?.[0]?.b64_json;
              if (b64) {
                const buffer = Buffer.from(b64, "base64");
                const { supabase } = await import("@/lib/supabase.server");
                const filename = `ig-${Date.now()}.png`;

                const { error } = await supabase.storage
                  .from("content-factory-images")
                  .upload(filename, buffer, {
                    contentType: "image/png",
                    upsert: true,
                  });

                if (!error) {
                  const { data } = supabase.storage
                    .from("content-factory-images")
                    .getPublicUrl(filename);
                  imageUrl = data.publicUrl;
                } else {
                  console.error(
                    "[content-factory] Supabase upload failed:",
                    error.message
                  );
                }
              }
            } catch (imgErr) {
              console.error(
                "[content-factory] Image generation failed:",
                imgErr instanceof Error ? imgErr.message : imgErr
              );
            }
          }

          pieces.push({
            type: "INSTAGRAM",
            title: igPost.hook.slice(0, 80),
            body: igPost.caption,
            hook: igPost.hook,
            cta: igPost.hashtags,
            predictedScore: igPost.predictedScore,
            heroImageUrl: imageUrl ?? undefined,
            sourceBriefingId: briefing?.id,
          });
        } else if (contentType === "TIKTOK_SCRIPT") {
          await updateJob(jobId, {
            currentStep: stepNum,
            stepLabel: "Writing TikTok script…",
          });
          const scripts = await generateTikTokScripts(briefing, 1);
          if (scripts[0]) {
            pieces.push({
              type: "TIKTOK",
              title: scripts[0].hook.slice(0, 80),
              body: scripts[0].body,
              hook: scripts[0].hook,
              cta: scripts[0].cta,
              predictedScore: scripts[0].predictedScore,
              sourceBriefingId: briefing?.id,
            });
          }
        }
      }

      // Save to database
      stepNum++;
      await updateJob(jobId, {
        currentStep: stepNum,
        stepLabel: "Saving to database…",
      });

      const created = await prisma.$transaction(
        pieces.map((p) =>
          prisma.contentPiece.create({
            data: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              type: p.type as any,
              title: p.title,
              body: p.body,
              hook: p.hook,
              cta: p.cta,
              predictedScore: p.predictedScore,
              heroImageUrl: p.heroImageUrl,
              sourceBriefingId: p.sourceBriefingId,
            },
          })
        )
      );

      await updateJob(jobId, {
        status: "SUCCESS",
        currentStep: stepNum,
        stepLabel: `Done! ${created.length} piece${created.length === 1 ? "" : "s"} created`,
        piecesCreated: created.length,
        completedAt: new Date(),
      });

      logger.info("[content-factory] Generated content pieces", {
        count: created.length,
        types: requestedTypes,
      });

      return {
        piecesCreated: created.length,
        pieceIds: created.map((c) => c.id),
      };
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
