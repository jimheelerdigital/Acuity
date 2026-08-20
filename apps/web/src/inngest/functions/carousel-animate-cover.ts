import { inngest } from "@/inngest/client";

/**
 * Carousel slide animation — triggered per carousel post by
 * "content-factory/cover.animate" (sent by the daily cron and by the
 * admin "animate cover" action).
 *
 * Two modes (2026-08-10):
 * - default: animate the cover only (admin action, one-off pipeline)
 * - `animateAll: true`: animate EVERY non-CTA slide (cover + all reasons)
 *   — used by the animated daily post. Each video is 4s on the current
 *   (dop/lite) model.
 *
 * Submits in WAVES of at most 4 jobs (2026-08-10): Higgsfield silently
 * drops submits beyond ~4 concurrent jobs per account — the first two
 * live animateAll runs shipped 5/7 and 4/7 videos with zero submit
 * errors logged, and resubmitting the missing 3 alone succeeded
 * immediately. Each wave submits only target slides that still lack a
 * videoUrl, so later waves also double as retries for failed renders.
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
    // Per-slide emotion directions from the daily cron (indexed by slide
    // order: 0 = cover). Absent on admin/one-off triggers — the prompt
    // builders then fall back to curated topic beats / mood pools.
    const slideEmotions = (
      Array.isArray(event.data.slideEmotions) ? event.data.slideEmotions : []
    ) as { mood?: string; motion?: string }[];

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

    // 3 waves × 4 jobs covers the 8-slide max (cover + 7 reasons) plus a
    // retry wave for render failures. Higgsfield silently drops submits
    // past ~4 concurrent jobs, so never submit more than 4 per wave.
    const MAX_ATTEMPTS = 3;
    const MAX_CONCURRENT_JOBS = 4;
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

        // animateAll: EVERY non-CTA slide (2026-08-13, per Keenan: the old
        // slice(0, -1) assumed a trailing CTA slide, but daily posts
        // dropped the CTA on 2026-08-12 — so it was silently chopping the
        // last reason off the slideshow). Filter by kind, not position.
        // Hard cap 8 (cover + 7 reasons) as a cost ceiling. Default: cover only.
        const targets = animateAll
          ? slides.filter((s) => s.kind !== "CTA").slice(0, 8)
          : slides.filter((s) => s.kind === "COVER");

        const topic = CAROUSEL_TOPICS.find(
          (t) => t.slug === slides[0].carouselPost.topicSlug
        );
        const jobs: { slideId: string; order: number; requestId: string }[] = [];
        for (const slide of targets) {
          if (jobs.length >= MAX_CONCURRENT_JOBS) break; // Higgsfield drops submits past ~4 concurrent
          if (!slide.imageUrl) continue;
          if (slide.videoUrl) continue; // already animated (earlier wave / retried run)
          // Prefer the raw (text-free) artwork as the start frame — the
          // model then has no text pixels to warp; the words get burned
          // onto the finished video in storeSlideVideo.
          const startImageUrl = slide.rawImageUrl ?? slide.imageUrl;
          const textFree = Boolean(slide.rawImageUrl);
          // Bespoke emotion for this slide (from the topic generator);
          // undefined on admin/one-off runs → builders use pools.
          const emotion = slideEmotions[slide.order];
          const prompt =
            slide.kind === "COVER"
              ? animationStyle === "crazy"
                ? buildCrazyCoverVideoPrompt(topic, { emotion })
                : buildCoverVideoPrompt(topic, {
                    textFree,
                    seed: slides[0].carouselPost.topicSlug.length,
                    emotion,
                  })
              : buildSlideVideoPrompt({ textFree, seed: slide.order, emotion });
          try {
            const requestId = await submitCoverVideo({
              startImageUrl,
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
      await step.sleep(`initial-render-wait-a${attempt}`, "2m");

      // 2m head start + 36 × 30s ≈ 20 min for wave 1. The first live DoP
      // render (2026-08-05) blew past the original ~8 min budget, so the
      // window is wide. Later waves render fresh jobs too, so they get a
      // slightly shorter but still full-render-length window.
      const maxPolls = attempt === 1 ? 36 : 24;
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
