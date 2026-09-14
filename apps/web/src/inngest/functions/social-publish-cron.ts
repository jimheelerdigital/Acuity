import { inngest } from "@/inngest/client";

/**
 * Social auto-publish cron (2026-09-10) — posts finished photo carousels
 * to Instagram + the Facebook Page via the free Meta Graph API, no
 * middleman. Runs every 30 minutes and does two things:
 *
 * 1. SCAN — find recent DRAFT photo carousels in the auto-eligible lanes
 *    (AUTO_LANES: non-pick-list lanes only, since IG carousels cap at 10
 *    images) that don't have queue rows yet, and enqueue one PENDING
 *    SocialPublish row per platform with staggered scheduledAt times so
 *    posts trickle out instead of dumping all at once.
 *
 * 2. PUBLISH — publish every due PENDING row (max 3 posts per run to stay
 *    inside the 300s Vercel step ceiling; IG container processing alone
 *    can take ~60s per carousel). On IG success the post's instagramUrl
 *    is set to the permalink, which the existing metrics-refresh cron
 *    already treats as the "posted" signal — so engagement numbers start
 *    flowing automatically.
 *
 * HYBRID FORMATS (2026-09-14): REEL_LANES posts get their slides rendered
 *    into a slideshow MP4 with library music (see slideshow-reel.ts) in a
 *    dedicated step (memoized per post, so the IG and FB rows share one
 *    render), then publish as an IG Reel + FB video. If the music library
 *    is empty or the render fails, the post falls back to the silent
 *    photo-carousel path — it always ships one way or the other.
 *
 * DARK BY DEFAULT: everything no-ops unless SOCIAL_AUTOPUBLISH_ENABLED=1.
 * That keeps this cron safe to deploy before the SocialPublish table is
 * pushed and before the Meta env vars exist.
 *
 * Manual trigger: event "content-factory/social.publish".
 */

/** Stagger between consecutive posts entering the queue. */
const STAGGER_MS = 45 * 60_000;
/** Max attempts before a row is marked FAILED. */
const MAX_ATTEMPTS = 3;
/** Max posts published per cron run (IG flow is slow). */
const MAX_POSTS_PER_RUN = 3;

export const socialPublishCronFn = inngest.createFunction(
  {
    id: "social-publish-cron",
    name: "Content Factory — Social Auto-Publish",
    retries: 1,
    triggers: [
      { cron: "*/30 * * * *" },
      { event: "content-factory/social.publish" },
    ],
  },
  async ({ step, logger }) => {
    const enabled = await step.run("check-enabled", async () => {
      const { autoPublishEnabled } = await import(
        "@/lib/content-factory/social-publish"
      );
      return autoPublishEnabled();
    });
    if (!enabled) {
      return { enqueued: 0, published: 0, reason: "SOCIAL_AUTOPUBLISH_ENABLED not set" };
    }

    // ── 1. SCAN: enqueue new eligible posts ─────────────────────────
    const enqueued = await step.run("scan-and-enqueue", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { AUTO_LANES } = await import(
        "@/lib/content-factory/social-publish"
      );

      const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
      const candidates = await prisma.carouselPost.findMany({
        where: {
          status: "DRAFT",
          format: "PHOTO",
          lane: { in: [...AUTO_LANES] },
          generatedFor: { gte: threeDaysAgo },
          socialPublishes: { none: {} },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, lane: true, headline: true },
      });
      if (candidates.length === 0) return 0;

      // Start the stagger after the latest already-pending row so a new
      // batch never front-runs or piles onto the existing queue.
      const latestPending = await prisma.socialPublish.findFirst({
        where: { status: "PENDING" },
        orderBy: { scheduledAt: "desc" },
        select: { scheduledAt: true },
      });
      const base = Math.max(
        Date.now(),
        latestPending ? latestPending.scheduledAt.getTime() + STAGGER_MS : 0
      );

      const { resolveAccount } = await import(
        "@/lib/content-factory/social-publish"
      );
      const rows = candidates.flatMap((post, i) => {
        const account = resolveAccount(post.lane);
        const accountKey = account?.key ?? "ripple";
        const scheduledAt = new Date(base + i * STAGGER_MS);
        return (["instagram", "facebook"] as const).map((platform) => ({
          carouselPostId: post.id,
          platform,
          accountKey,
          scheduledAt,
        }));
      });
      await prisma.socialPublish.createMany({
        data: rows,
        skipDuplicates: true,
      });
      console.log(
        `[social-publish] Enqueued ${candidates.length} post(s): ${candidates
          .map((c) => `${c.lane}/${c.headline}`)
          .join(" | ")}`
      );
      return candidates.length;
    });

    // ── 2. PUBLISH: fire everything that's due ──────────────────────
    const dueRows = await step.run("load-due", async () => {
      const { prisma } = await import("@/lib/prisma");
      return prisma.socialPublish.findMany({
        where: {
          status: "PENDING",
          scheduledAt: { lte: new Date() },
          attempts: { lt: MAX_ATTEMPTS },
        },
        orderBy: { scheduledAt: "asc" },
        take: MAX_POSTS_PER_RUN * 2, // IG + FB rows share a scheduledAt
        select: {
          id: true,
          platform: true,
          accountKey: true,
          carouselPostId: true,
          carouselPost: { select: { lane: true } },
        },
      });
    });

    let published = 0;
    for (const row of dueRows) {
      // ── Reel lanes: render the slideshow video once per post ──────
      // (step id keyed on the post, so the IG and FB rows memoize to
      // the same render). null → fall back to the photo-carousel path.
      let reelUrl: string | null = null;
      const { laneWantsReel } = await import(
        "@/lib/content-factory/social-publish"
      );
      if (laneWantsReel(row.carouselPost.lane)) {
        reelUrl = await step.run(
          `render-reel-${row.carouselPostId}`,
          async (): Promise<string | null> => {
            try {
              const { prisma } = await import("@/lib/prisma");
              const { supabase } = await import("@/lib/supabase.server");
              const post = await prisma.carouselPost.findUnique({
                where: { id: row.carouselPostId },
                select: {
                  lane: true,
                  slides: {
                    where: { kind: { not: "SCENE" } },
                    orderBy: { order: "asc" },
                    select: { imageUrl: true },
                  },
                },
              });
              if (!post || post.slides.length === 0) return null;

              const storagePath = `reels/${row.carouselPostId}.mp4`;
              const publicUrl = supabase.storage
                .from("content-factory")
                .getPublicUrl(storagePath).data.publicUrl;
              // Already rendered (e.g. by a previous attempt)?
              const head = await fetch(publicUrl, { method: "HEAD" });
              if (head.ok) return publicUrl;

              const { pickMusicTrack, renderSlideshowReel } = await import(
                "@/lib/content-factory/slideshow-reel"
              );
              const music = await pickMusicTrack(post.lane);
              if (!music) {
                console.warn(
                  `[social-publish] No music library tracks for lane ${post.lane} — publishing as photo carousel instead (upload MP3s to content-factory/music/ripple or music/bwk)`
                );
                return null;
              }
              const buf = await renderSlideshowReel(
                post.slides.map((s) => s.imageUrl),
                music
              );
              const { error } = await supabase.storage
                .from("content-factory")
                .upload(storagePath, buf, {
                  contentType: "video/mp4",
                  upsert: true,
                });
              if (error) throw new Error(`Reel upload failed: ${error.message}`);
              return publicUrl;
            } catch (err) {
              console.error(
                `[social-publish] Reel render failed for post ${row.carouselPostId} — falling back to photo carousel: ${err instanceof Error ? err.message : err}`
              );
              return null;
            }
          }
        );
      }

      const ok = await step.run(`publish-${row.platform}-${row.id}`, async () => {
        const { prisma } = await import("@/lib/prisma");
        const {
          resolveAccount,
          publishIgCarousel,
          publishFbPhotoPost,
          publishIgReel,
          publishFbVideo,
          IG_MAX_CAROUSEL_IMAGES,
        } = await import("@/lib/content-factory/social-publish");

        const post = await prisma.carouselPost.findUnique({
          where: { id: row.carouselPostId },
          select: {
            lane: true,
            caption: true,
            headline: true,
            instagramUrl: true,
            slides: {
              where: { kind: { not: "SCENE" } },
              orderBy: { order: "asc" },
              select: { imageUrl: true },
            },
          },
        });
        if (!post || post.slides.length === 0) {
          await prisma.socialPublish.update({
            where: { id: row.id },
            data: { status: "FAILED", error: "Post or slides missing" },
          });
          return false;
        }

        const account = resolveAccount(post.lane);
        const missing =
          !account ||
          (row.platform === "instagram" && !account.igUserId) ||
          (row.platform === "facebook" && !account.fbPageId);
        if (missing) {
          await prisma.socialPublish.update({
            where: { id: row.id },
            data: {
              status: "SKIPPED",
              error: `No ${row.platform} credentials configured`,
            },
          });
          return false;
        }

        const imageUrls = post.slides.map((s) => s.imageUrl);
        try {
          const result = reelUrl
            ? row.platform === "instagram"
              ? await publishIgReel(account, reelUrl, post.caption)
              : await publishFbVideo(account, reelUrl, post.caption)
            : row.platform === "instagram"
              ? await publishIgCarousel(
                  account,
                  imageUrls.slice(0, IG_MAX_CAROUSEL_IMAGES),
                  post.caption
                )
              : await publishFbPhotoPost(account, imageUrls, post.caption);

          await prisma.socialPublish.update({
            where: { id: row.id },
            data: {
              status: "POSTED",
              externalId: result.externalId,
              permalink: result.permalink,
              postedAt: new Date(),
              attempts: { increment: 1 },
              error: null,
            },
          });
          // IG permalink feeds the existing metrics-refresh loop, and the
          // post is now live → mark it POSTED like a pasted link would.
          if (row.platform === "instagram") {
            await prisma.carouselPost.update({
              where: { id: row.carouselPostId },
              data: {
                status: "POSTED",
                ...(post.instagramUrl || !result.permalink
                  ? {}
                  : { instagramUrl: result.permalink }),
              },
            });
          }
          console.log(
            `[social-publish] POSTED ${row.platform}/${account.key}: "${post.headline}" → ${result.permalink ?? result.externalId}`
          );
          return true;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const updated = await prisma.socialPublish.update({
            where: { id: row.id },
            data: {
              attempts: { increment: 1 },
              error: message,
            },
          });
          if (updated.attempts >= MAX_ATTEMPTS) {
            await prisma.socialPublish.update({
              where: { id: row.id },
              data: { status: "FAILED" },
            });
          }
          console.error(
            `[social-publish] ${row.platform} failed (attempt ${updated.attempts}) for "${post.headline}": ${message}`
          );
          return false;
        }
      });
      if (ok) published++;
    }

    logger.info(
      `[social-publish] enqueued=${enqueued} due=${dueRows.length} published=${published}`
    );
    return { enqueued, due: dueRows.length, published };
  }
);
