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
 * Runs up to TWO attempts (added 2026-08-10 after the first live
 * animateAll run shipped 5/7 videos): each attempt submits jobs only for
 * target slides that still lack a videoUrl, so attempt 2 automatically
 * retries just the slides whose submit or render failed in attempt 1.
 *
 * Uses Inngest steps so the multi-minute Higgsfield renders never hit the
 * 300s Vercel invocation ceiling: submit all → sleep → poll all (short
 * steps with sleeps between) → store each. Any slide that fails both
 * attempts stays static — animation is an enhancement, never a blocker.
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

    const MAX_ATTEMPTS = 2;
    let totalStored = 0;
    let totalSubmitted = 0;
    let firstAttemptSkip: string | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // ── Submit one Higgsfield job per target slide still lacking a
      // video. Attempt 2 naturally picks up only attempt 1's failures. ──
      const submission = await step.run(`submit-video-jobs-a${attempt}`, async () => {
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
          if (slide.videoUrl) continue; // already animated (earlier attempt / retried run)
          // Reason slides act out their own text; the cover has its
          // dedicated emotion-beat prompt.
          const prompt =
            slide.kind === "COVER"
              ? coverPrompt
              : buildSlideVideoPrompt(slide.overlayText);
          try {
            const requestId = await submitCoverVideo({
              startImageUrl: slide.imageUrl,
              prompt,
            });
            jobs.push({ slideId: slide.id, order: slide.order, requestId });
          } catch (submitErr) {
            // Log and keep going — one failed submit shouldn't kill the rest,
            // and even zero submits must still fall through to the email.
            // (Higgsfield caps concurrent jobs at ~4-5; the next attempt
            // resubmits these once the first wave has drained.)
            console.error(
              `[animate-cover] Submit failed for slide ${slide.id} (order ${slide.order}, attempt ${attempt}): ${submitErr instanceof Error ? submitErr.message : submitErr}`
            );
          }
          // Space out submissions to avoid tripping rate limits.
          await new Promise((r) => setTimeout(r, 1500));
        }

        if (jobs.length === 0) {
          return { skipped: "No slides needed animation or all submits failed" } as const;
        }
        return { skipped: null, jobs } as const;
      });

      if (submission.skipped) {
        if (attempt === 1) {
          firstAttemptSkip = submission.skipped;
        }
        // On attempt 2 a skip just means nothing was left to retry
        // (or resubmits failed too) — either way we're done animating.
        logger.info(
          `[animate-cover] Attempt ${attempt} skipped for post ${postId}: ${submission.skipped}`
        );
        break;
      }
      totalSubmitted += submission.jobs.length;

      // ── Give the renders a head start, then poll in short steps ──────
      await step.sleep(`initial-render-wait-a${attempt}`, attempt === 1 ? "2m" : "1m");

      // Attempt 1: 2m head start + 36 × 30s ≈ 20 min. The first live DoP
      // render (2026-08-05) blew past the original ~8 min budget, so the
      // window is wide. Attempt 2 (retries only) gets a shorter window.
      const maxPolls = attempt === 1 ? 36 : 20;
      // requestId -> CDN url for completed jobs; "" = terminal failure
      let pending = submission.jobs.map((j) => j.requestId);
      const completed: Record<string, string> = {};

      for (let i = 0; i < maxPolls && pending.length > 0; i++) {
        const results = await step.run(`poll-status-a${attempt}-${i}`, async () => {
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
              `[animate-cover] Higgsfield job ${r.requestId} ended: ${r.status} (post ${postId}, attempt ${attempt})`
            );
            // Terminal failure — drop it; attempt 2 will resubmit the slide.
            completed[r.requestId] = "";
          }
        }
        pending = pending.filter((id) => !(id in completed));

        if (pending.length > 0) {
          await step.sleep(`poll-wait-a${attempt}-${i}`, "30s");
        }
      }

      if (pending.length > 0) {
        logger.error(
          `[animate-cover] Timed out waiting for ${pending.length} Higgsfield job(s) (post ${postId}, attempt ${attempt})`
        );
      }

      // ── Download, store in Supabase, persist videoUrl per slide ──────
      const succeededJobs = submission.jobs.filter((j) => completed[j.requestId]);
      let stored = 0;
      for (const job of succeededJobs) {
        try {
          await step.run(`store-video-a${attempt}-${job.order}`, async () => {
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
      totalStored += stored;

      // No early break on "all submitted jobs stored" — slides whose
      // SUBMIT failed (Higgsfield concurrency cap) were never in `jobs`,
      // so the next attempt's submit step must re-query and decide.
      // When nothing is left it returns skipped and the loop exits.
    }

    if (firstAttemptSkip) {
      await sendEmailStep();
      return { animated: 0, reason: firstAttemptSkip };
    }

    logger.info(
      `[animate-cover] Post ${postId}: ${totalStored}/${totalSubmitted} submitted job(s) animated across attempts`
    );
    await sendEmailStep(totalStored > 0);
    return { animated: totalStored, submitted: totalSubmitted };
  }
);
