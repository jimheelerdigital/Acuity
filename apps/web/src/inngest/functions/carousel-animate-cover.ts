import { inngest } from "@/inngest/client";

/**
 * Carousel slide animation — triggered per carousel post by
 * "content-factory/cover.animate" (sent by the daily cron and by the
 * admin "animate cover" action).
 *
 * Two modes (2026-08-10):
 * - default: animate the cover only (admin action, one-off pipeline)
 * - `animateAll: true`: animate EVERY slide except the last one (the CTA)
 *   — used by the second daily post. Each video is 4s on the current
 *   (dop/lite) model.
 *
 * Uses Inngest steps so the multi-minute Higgsfield renders never hit the
 * 300s Vercel invocation ceiling: submit all → sleep → poll all (short
 * steps with sleeps between) → store each. Any failure leaves the affected
 * slide static — animation is an enhancement, never a blocker.
 *
 * When the event carries `sendEmail: true`, the Resend email is sent from
 * HERE — after animation — on every exit path. Pipeline order: carousel
 * gen → animation → email. Animation failure degrades to the static email,
 * never silence.
 */
export const carouselAnimateCoverFn = inngest.createFunction(
  {
    id: "carousel-animate-cover",
    name: "Content Factory — Animate Carousel Slides",
    retries: 1,
    concurrency: { limit: 2 }, // be gentle on Higgsfield rate limits
    triggers: [{ event: "content-factory/cover.animate" }],
  },
  async ({ event, step, logger }) => {
    const postId = event.data.postId as string;
    const shouldEmail = Boolean(event.data.sendEmail);
    const animateAll = Boolean(event.data.animateAll);
    // "crazy" = high-energy intro treatment for the cover; default smooth.
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

    // ── Step 1: validate + submit one Higgsfield job per slide ────────
    const submission = await step.run("submit-video-jobs", async () => {
      const {
        higgsfieldConfigured,
        buildCoverVideoPrompt,
        buildCrazyCoverVideoPrompt,
        buildSlideVideoPrompt,
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

      const slides = await prisma.carouselSlide.findMany({
        where: { carouselPostId: postId },
        orderBy: { order: "asc" },
        include: { carouselPost: { select: { topicSlug: true } } },
      });
      if (slides.length === 0) {
        return { skipped: `No slides for post ${postId}` } as const;
      }

      // animateAll: every slide except the last (the CTA), hard-capped at
      // 7 videos (cover + 6 reasons) as a cost ceiling. Default: cover only.
      const targets = animateAll
        ? slides.slice(0, -1).slice(0, 7)
        : slides.filter((s) => s.kind === "COVER");

      const topic = CAROUSEL_TOPICS.find(
        (t) => t.slug === slides[0].carouselPost.topicSlug
      );
      const fallback = {
        emotionBeat:
          "a small tired shrug — shoulders lifting then dropping with a slow exhale — followed by a soft, knowing half-smile to camera",
      };
      const coverPrompt =
        animationStyle === "crazy"
          ? buildCrazyCoverVideoPrompt(topic ?? fallback)
          : buildCoverVideoPrompt(topic ?? fallback);

      const jobs: { slideId: string; order: number; requestId: string }[] = [];
      for (const slide of targets) {
        if (!slide.imageUrl) continue;
        if (slide.videoUrl) continue; // already animated (retried run)
        const prompt =
          slide.kind === "COVER" ? coverPrompt : buildSlideVideoPrompt();
        try {
          const requestId = await submitCoverVideo({
            startImageUrl: slide.imageUrl,
            prompt,
          });
          jobs.push({ slideId: slide.id, order: slide.order, requestId });
        } catch (submitErr) {
          // Log and keep going — one failed submit shouldn't kill the rest,
          // and even zero submits must still fall through to the email.
          console.error(
            `[animate-cover] Submit failed for slide ${slide.id} (order ${slide.order}): ${submitErr instanceof Error ? submitErr.message : submitErr}`
          );
        }
      }

      if (jobs.length === 0) {
        return { skipped: "No slides needed animation or all submits failed" } as const;
      }
      return { skipped: null, jobs } as const;
    });

    if (submission.skipped) {
      logger.info(`[animate-cover] Skipped for post ${postId}: ${submission.skipped}`);
      await sendEmailStep();
      return { animated: 0, reason: submission.skipped };
    }

    // ── Step 2: give the renders a head start, then poll in short steps ──
    await step.sleep("initial-render-wait", "2m");

    // 2m head start + 36 × 30s = up to ~20 min total. The first live DoP
    // render (2026-08-05) blew past the original ~8 min budget and the
    // email fell back to the static cover, so the window was widened.
    const MAX_POLLS = 36;
    // requestId -> Higgsfield CDN url for completed jobs; null = still pending
    let pending = submission.jobs.map((j) => j.requestId);
    const completed: Record<string, string> = {};

    for (let i = 0; i < MAX_POLLS && pending.length > 0; i++) {
      const results = await step.run(`poll-status-${i}`, async () => {
        const { checkCoverVideo } = await import("@/lib/content-factory/animate-cover");
        const out: { requestId: string; status: string; videoUrl: string | null }[] = [];
        for (const requestId of pending) {
          try {
            const check = await checkCoverVideo(requestId);
            out.push({ requestId, ...check });
          } catch (checkErr) {
            // Transient status error — keep the job pending for the next poll.
            console.warn(
              `[animate-cover] Status check failed for ${requestId}: ${checkErr instanceof Error ? checkErr.message : checkErr}`
            );
            out.push({ requestId, status: "in_progress", videoUrl: null });
          }
        }
        return out;
      });

      for (const r of results) {
        if (r.status === "completed" && r.videoUrl) {
          completed[r.requestId] = r.videoUrl;
        } else if (r.status === "failed" || r.status === "nsfw") {
          logger.error(
            `[animate-cover] Higgsfield job ${r.requestId} ended: ${r.status} (post ${postId})`
          );
          // Terminal failure — drop it; the slide stays static.
          completed[r.requestId] = "";
        }
      }
      pending = pending.filter((id) => !(id in completed));

      if (pending.length > 0) {
        await step.sleep(`poll-wait-${i}`, "30s");
      }
    }

    if (pending.length > 0) {
      logger.error(
        `[animate-cover] Timed out waiting for ${pending.length} Higgsfield job(s) (post ${postId})`
      );
    }

    // ── Step 3: download, store in Supabase, persist videoUrl per slide ──
    const succeededJobs = submission.jobs.filter((j) => completed[j.requestId]);
    let stored = 0;
    for (const job of succeededJobs) {
      try {
        await step.run(`store-video-${job.order}`, async () => {
          const { storeSlideVideo } = await import("@/lib/content-factory/animate-cover");
          return storeSlideVideo(job.slideId, completed[job.requestId]);
        });
        stored++;
      } catch (storeErr) {
        logger.error(
          `[animate-cover] Store failed for slide ${job.slideId}: ${storeErr instanceof Error ? storeErr.message : storeErr}`
        );
      }
    }

    logger.info(
      `[animate-cover] Post ${postId}: ${stored}/${submission.jobs.length} slide(s) animated`
    );
    await sendEmailStep(stored > 0);
    return { animated: stored, submitted: submission.jobs.length };
  }
);
