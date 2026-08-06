import { inngest } from "@/inngest/client";

/**
 * Animated cover generation — triggered per carousel post by
 * "content-factory/cover.animate" (sent by the daily cron and by the
 * admin "animate cover" action).
 *
 * Uses Inngest steps so the 3-6 minute Higgsfield render never hits the
 * 300s Vercel invocation ceiling: submit → sleep → poll (short steps with
 * sleeps between) → store. Any failure leaves the carousel with its static
 * cover — animation is an enhancement, never a blocker.
 */
export const carouselAnimateCoverFn = inngest.createFunction(
  {
    id: "carousel-animate-cover",
    name: "Content Factory — Animate Carousel Cover",
    retries: 1,
    concurrency: { limit: 2 }, // be gentle on Higgsfield rate limits
    triggers: [{ event: "content-factory/cover.animate" }],
  },
  async ({ event, step, logger }) => {
    const postId = event.data.postId as string;

    // ── Step 1: validate + submit ─────────────────────────────────────
    const submission = await step.run("submit-video-job", async () => {
      const { higgsfieldConfigured, buildCoverVideoPrompt, submitCoverVideo } =
        await import("@/lib/content-factory/animate-cover");

      if (!higgsfieldConfigured()) {
        return {
          skipped:
            "Higgsfield not configured — set HIGGSFIELD_API_KEY, HIGGSFIELD_API_SECRET and HIGGSFIELD_VIDEO_MODEL",
        } as const;
      }

      const { prisma } = await import("@/lib/prisma");
      const { CAROUSEL_TOPICS } = await import("@/lib/content-factory/topics");

      const cover = await prisma.carouselSlide.findFirst({
        where: { carouselPostId: postId, kind: "COVER" },
        include: { carouselPost: { select: { topicSlug: true } } },
      });
      if (!cover) return { skipped: `No cover slide for post ${postId}` } as const;
      if (!cover.rawImageUrl) {
        return {
          skipped: `Cover ${cover.id} has no rawImageUrl (generated before animation support)`,
        } as const;
      }
      if (cover.videoUrl) return { skipped: `Cover ${cover.id} already animated` } as const;

      const topic = CAROUSEL_TOPICS.find((t) => t.slug === cover.carouselPost.topicSlug);
      const prompt = buildCoverVideoPrompt(
        topic ?? {
          emotionBeat:
            "a small tired shrug — shoulders lifting then dropping with a slow exhale — followed by a soft, knowing half-smile to camera",
        }
      );

      const requestId = await submitCoverVideo({
        startImageUrl: cover.rawImageUrl,
        endImageUrl: cover.imageUrl,
        prompt,
      });
      return { skipped: null, requestId, slideId: cover.id } as const;
    });

    if (submission.skipped) {
      logger.info(`[animate-cover] Skipped for post ${postId}: ${submission.skipped}`);
      return { animated: false, reason: submission.skipped };
    }

    // ── Step 2: give the render a head start, then poll in short steps ──
    await step.sleep("initial-render-wait", "2m");

    let videoUrl: string | null = null;
    const MAX_POLLS = 12; // 2m head start + 12 × 30s = up to ~8 min total
    for (let i = 0; i < MAX_POLLS; i++) {
      const check = await step.run(`poll-status-${i}`, async () => {
        const { checkCoverVideo } = await import("@/lib/content-factory/animate-cover");
        return checkCoverVideo(submission.requestId);
      });

      if (check.status === "completed" && check.videoUrl) {
        videoUrl = check.videoUrl;
        break;
      }
      if (check.status === "failed" || check.status === "nsfw") {
        logger.error(
          `[animate-cover] Higgsfield job ${submission.requestId} ended: ${check.status} (post ${postId})`
        );
        return { animated: false, reason: `Higgsfield status: ${check.status}` };
      }
      await step.sleep(`poll-wait-${i}`, "30s");
    }

    if (!videoUrl) {
      logger.error(
        `[animate-cover] Timed out waiting for Higgsfield job ${submission.requestId} (post ${postId})`
      );
      return { animated: false, reason: "timeout" };
    }

    // ── Step 3: download, store in Supabase, persist videoUrl ──────────
    const storedUrl = await step.run("store-video", async () => {
      const { storeCoverVideo } = await import("@/lib/content-factory/animate-cover");
      return storeCoverVideo(submission.slideId, videoUrl!);
    });

    logger.info(`[animate-cover] Post ${postId} cover animated: ${storedUrl}`);
    return { animated: true, videoUrl: storedUrl };
  }
);
