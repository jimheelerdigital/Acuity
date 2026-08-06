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
 *
 * When the event carries `sendEmail: true` (the generation pipelines set
 * this), the Resend email is sent from HERE — after animation — on every
 * exit path. Pipeline order: carousel gen → cover animation → email.
 * Animation failure degrades to the static-cover email, never silence.
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
    const shouldEmail = Boolean(event.data.sendEmail);
    // "crazy" = spin-in attention-grab intro (one post/day); default smooth.
    const animationStyle =
      event.data.animationStyle === "crazy" ? "crazy" : "smooth";

    // Email sender used at every exit path. Its own step so a Resend
    // hiccup gets Inngest's retry, and it never throws past logging.
    // `force` bypasses the emailedAt guard — used on the SUCCESS path so
    // that if a previous failed/timed-out run already sent a static email,
    // the animated version still goes out.
    const sendEmailStep = async (force = false) => {
      if (!shouldEmail) return;
      const stepName = force ? "send-carousel-email-with-video" : "send-carousel-email";
      await step.run(stepName, async () => {
        try {
          const { sendCarouselEmail } = await import("@/lib/content-factory/email");
          await sendCarouselEmail(postId, force);
        } catch (emailErr) {
          logger.error(
            `[animate-cover] Email failed for post ${postId}: ${emailErr instanceof Error ? emailErr.message : emailErr}`
          );
        }
      });
    };

    // ── Step 1: validate + submit ─────────────────────────────────────
    const submission = await step.run("submit-video-job", async () => {
      const {
        higgsfieldConfigured,
        buildCoverVideoPrompt,
        buildCrazyCoverVideoPrompt,
        submitCoverVideo,
      } = await import("@/lib/content-factory/animate-cover");

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
      if (!cover.imageUrl) {
        return {
          skipped: `Cover ${cover.id} has no imageUrl`,
        } as const;
      }
      if (cover.videoUrl) return { skipped: `Cover ${cover.id} already animated` } as const;

      const topic = CAROUSEL_TOPICS.find((t) => t.slug === cover.carouselPost.topicSlug);
      const fallback = {
        emotionBeat:
          "a small tired shrug — shoulders lifting then dropping with a slow exhale — followed by a soft, knowing half-smile to camera",
      };
      const prompt =
        animationStyle === "crazy"
          ? buildCrazyCoverVideoPrompt(topic ?? fallback)
          : buildCoverVideoPrompt(topic ?? fallback);

      try {
        const requestId = await submitCoverVideo({
          startImageUrl: cover.imageUrl,
          prompt,
        });
        return { skipped: null, requestId, slideId: cover.id } as const;
      } catch (submitErr) {
        // Don't throw — a failed submit must still fall through to the
        // static-cover email instead of killing the function run.
        return {
          skipped: `Higgsfield submit failed: ${submitErr instanceof Error ? submitErr.message : submitErr}`,
        } as const;
      }
    });

    if (submission.skipped) {
      logger.info(`[animate-cover] Skipped for post ${postId}: ${submission.skipped}`);
      await sendEmailStep();
      return { animated: false, reason: submission.skipped };
    }

    // ── Step 2: give the render a head start, then poll in short steps ──
    await step.sleep("initial-render-wait", "2m");

    let videoUrl: string | null = null;
    // 2m head start + 36 × 30s = up to ~20 min total. The first live DoP
    // render (2026-08-05) blew past the original ~8 min budget and the
    // email fell back to the static cover, so the window was widened.
    const MAX_POLLS = 36;
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
        await sendEmailStep();
        return { animated: false, reason: `Higgsfield status: ${check.status}` };
      }
      await step.sleep(`poll-wait-${i}`, "30s");
    }

    if (!videoUrl) {
      logger.error(
        `[animate-cover] Timed out waiting for Higgsfield job ${submission.requestId} (post ${postId})`
      );
      await sendEmailStep();
      return { animated: false, reason: "timeout" };
    }

    // ── Step 3: download, store in Supabase, persist videoUrl ──────────
    const storedUrl = await step.run("store-video", async () => {
      const { storeCoverVideo } = await import("@/lib/content-factory/animate-cover");
      return storeCoverVideo(submission.slideId, videoUrl!);
    });

    logger.info(`[animate-cover] Post ${postId} cover animated: ${storedUrl}`);
    await sendEmailStep(true);
    return { animated: true, videoUrl: storedUrl };
  }
);
