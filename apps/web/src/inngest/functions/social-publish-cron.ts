import { inngest } from "@/inngest/client";
import type { PublishResult } from "@/lib/content-factory/social-publish";

/**
 * Social auto-publish cron (2026-09-10) — posts finished photo carousels
 * to Instagram + the Facebook Page via the free Meta Graph API, no
 * middleman. Runs every 30 minutes and does two things:
 *
 * 1. SCAN — find recent DRAFT photo carousels in the auto-eligible lanes
 *    (AUTO_LANES: ALL lanes since 2026-09-14 — the BWK pick-list
 *    downsize keeps every post ≤10 slides) that don't have queue rows
 *    yet, and enqueue one PENDING SocialPublish row per platform.
 *    Scheduling is PRIME-TIME AWARE (2026-09-15, per Keenan): each
 *    platform has an ET window (PLATFORM_WINDOWS in social-publish.ts)
 *    and posts stagger within it — IG 11am-7pm, FB 9am-6pm, TikTok
 *    drafts all first thing in the morning (7-10am ET) so Keenan posts
 *    them by hand through the day. Overflow rolls to the next day's
 *    window; nothing publishes overnight anymore.
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
 * TIKTOK INBOX RETIRED (2026-09-16, per Keenan: "get rid of tiktok
 *    inbox"): the Phase-1 inbox-draft flow (2026-09-14) kept tripping
 *    TikTok's ~5-pending-drafts-per-24h spam cap and jammed both
 *    inboxes. TikTok posting is now fully manual: lanes flagged
 *    spec.tiktokEmail on their ContentLane row get the daily content
 *    email (see sendCarouselEmail's lane gate) and Keenan posts those
 *    natively. No tiktok rows are enqueued anymore; tiktok-publish.ts
 *    and the OAuth connect route stay dormant in case Phase 2
 *    (post-audit DIRECT_POST) ever revives.
 *
 * YOUTUBE SHORTS + THREADS (2026-09-23): posts also queue a "threads" row
 *    (everything IG gets — carousel, or the reel MP4 as a VIDEO) and, for
 *    REEL_LANES only, a "youtube" row that uploads the same reel as a
 *    Short. Rows are created ONLY when that brand's credentials exist
 *    (youtubeAccount / threadsAccount), so both platforms stay invisible
 *    until Keenan adds the env vars. A youtube row whose reel render fell
 *    back to a photo carousel is SKIPPED (Shorts needs a video).
 *
 * DARK BY DEFAULT: everything no-ops unless SOCIAL_AUTOPUBLISH_ENABLED=1.
 * That keeps this cron safe to deploy before the SocialPublish table is
 * pushed and before the Meta env vars exist.
 *
 * Manual trigger: event "content-factory/social.publish".
 */

/** Max attempts before a row is marked FAILED. */
const MAX_ATTEMPTS = 3;
/** Max posts published per cron run (IG flow is slow). */
const MAX_POSTS_PER_RUN = 3;

// First BWK batch that goes to the new bwk.motivation IG + Build with Key
// FB page (2026-09-24). Earlier BWK posts stay email/TikTok-only.
const BWK_META_START = new Date("2026-09-25T00:00:00Z");

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

      // Lanes-as-data (2026-09-15): DB-born lanes are auto-eligible
      // alongside the legacy AUTO_LANES list.
      const laneRows = await prisma.contentLane.findMany({
        select: { key: true },
      });
      const eligibleLanes = [
        ...new Set([...AUTO_LANES, ...laneRows.map((r) => r.key)]),
      ];

      const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
      const candidates = await prisma.carouselPost.findMany({
        where: {
          status: "DRAFT",
          format: "PHOTO",
          lane: { in: eligibleLanes },
          generatedFor: { gte: threeDaysAgo },
          socialPublishes: { none: {} },
          // Never auto-post a slide whose baked-in text failed the vision
          // check (2026-09-24 audit bug): carousel-daily ships the best
          // unverified attempt marked "TEXT-UNVERIFIED … PROOFREAD BEFORE
          // POSTING" and it was going live with possible typos. These
          // still reach Keenan by email to proofread and post by hand.
          slides: { none: { imagePrompt: { contains: "TEXT-UNVERIFIED" } } },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, lane: true, headline: true, generatedFor: true },
      });
      if (candidates.length === 0) return 0;

      const {
        resolveAccount,
        laneBrand,
        laneWantsReel,
        PLATFORM_WINDOWS,
        clampToWindow,
      } = await import("@/lib/content-factory/social-publish");
      const { youtubeAccount } = await import(
        "@/lib/content-factory/youtube-publish"
      );
      const { threadsAccount } = await import(
        "@/lib/content-factory/threads-publish"
      );
      type QueuePlatform = "instagram" | "facebook" | "threads" | "youtube";

      // Prime-time scheduling (2026-09-15, per Keenan): each platform
      // has its own ET window (see PLATFORM_WINDOWS) and its own queue
      // cursor, seeded after the latest already-pending row so a new
      // batch never front-runs or piles onto the existing queue.
      // Per ACCOUNT since 2026-09-24 (BWK got its own IG/FB): one shared
      // cursor per platform made Ripple and BWK compete for ~9 IG slots a
      // day at ~14 posts a day combined, so the queue would grow forever.
      // Each brand now runs its own schedule inside the same window.
      const cursors = new Map<string, number>();
      const nextSlot = async (platform: QueuePlatform, accountKey: string) => {
        const key = `${platform}:${accountKey}`;
        if (!cursors.has(key)) {
          const latest = await prisma.socialPublish.findFirst({
            where: { status: "PENDING", platform, accountKey },
            orderBy: { scheduledAt: "desc" },
            select: { scheduledAt: true },
          });
          cursors.set(
            key,
            Math.max(
              Date.now(),
              latest
                ? latest.scheduledAt.getTime() + PLATFORM_WINDOWS[platform].staggerMs
                : 0
            )
          );
        }
        const slot = clampToWindow(new Date(cursors.get(key)!), platform);
        cursors.set(key, slot.getTime() + PLATFORM_WINDOWS[platform].staggerMs);
        return slot;
      };

      const rows: {
        carouselPostId: string;
        platform: QueuePlatform;
        accountKey: string;
        scheduledAt: Date;
      }[] = [];
      for (const post of candidates) {
        // null for BWK lanes until META_BWK_* creds exist (2026-09-14,
        // per Keenan: "don't post bwk posts across insta/facebook yet").
        // With the TikTok inbox retired (2026-09-16), BWK posts enqueue
        // nothing — they reach Keenan via the daily email only.
        const brand = await laneBrand(post.lane);
        const platforms: QueuePlatform[] = [];
        // BWK IG/FB went live 2026-09-24: start fresh from that night's
        // batch instead of flooding the new account with the unposted
        // backlog (15 posts), which would push new posts back ~a week.
        const bwkBacklog =
          brand === "bwk" && post.generatedFor < BWK_META_START;
        if (!bwkBacklog && (await resolveAccount(post.lane))) {
          platforms.push("instagram", "facebook");
        }
        // Threads + YouTube have their own per-brand creds (2026-09-23)
        // and only get rows when those exist — no SKIPPED noise.
        if (threadsAccount(brand)) platforms.push("threads");
        if (laneWantsReel(post.lane) && youtubeAccount(brand)) {
          platforms.push("youtube");
        }
        for (const platform of platforms) {
          rows.push({
            carouselPostId: post.id,
            platform,
            accountKey: brand,
            scheduledAt: await nextSlot(platform, brand),
          });
        }
      }
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
        // Up to one row per platform per post (IG, FB, Threads, YouTube).
        take: MAX_POSTS_PER_RUN * 4,
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
    const successes: {
      platform: string;
      lane: string | null;
      headline: string;
      permalink: string | null;
    }[] = [];
    for (const row of dueRows) {
      // ── Reel lanes: render the slideshow video once per post ──────
      // (step id keyed on the post, so the IG/FB/Threads/YouTube rows
      // memoize to the same render — and later runs reuse the uploaded
      // MP4 via the HEAD check). null → fall back to the photo-carousel
      // path (YouTube rows SKIP instead).
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
                    select: { imageUrl: true, kind: true },
                  },
                },
              });
              if (!post || post.slides.length === 0) return null;
              const { trimLegacyPickList, laneBrand } = await import(
                "@/lib/content-factory/social-publish"
              );
              const reelSlides = trimLegacyPickList(post.slides);

              // Branded final CTA slide (2026-09-22, per Keenan): every
              // slideshow ends on the Ripple slide for its brand — BWK
              // dark mode, Ripple light orange. Static JPEGs in public/
              // generated by apps/web/scripts/make-cta-slides.ts.
              const brand = await laneBrand(post.lane);
              const ctaSlideUrl = `https://goripple.io/cta-slide-${brand}.jpg`;

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
              const { buf, transition } = await renderSlideshowReel(
                [...reelSlides.map((s) => s.imageUrl), ctaSlideUrl],
                music,
                // Paper reset guides are ~40 words a slide (2026-09-25).
                post.lane?.startsWith("reset-guide") ? 6 : undefined
              );
              const { error } = await supabase.storage
                .from("content-factory")
                .upload(storagePath, buf, {
                  contentType: "video/mp4",
                  upsert: true,
                });
              if (error) throw new Error(`Reel upload failed: ${error.message}`);
              // Record which transition this reel used so engagement
              // metrics can rank transitions (2026-09-15, per Keenan).
              await prisma.carouselPost.update({
                where: { id: row.carouselPostId },
                data: { reelTransition: transition },
              });
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
          laneBrand,
          publishIgCarousel,
          publishFbPhotoPost,
          publishIgReel,
          publishFbReel,
          publishFbVideo,
          IG_MAX_CAROUSEL_IMAGES,
          trimLegacyPickList,
          feedCropUrl,
        } = await import("@/lib/content-factory/social-publish");
        const { youtubeAccount, publishYoutubeShort } = await import(
          "@/lib/content-factory/youtube-publish"
        );
        const { threadsAccount, publishThreadsCarousel, publishThreadsVideo } =
          await import("@/lib/content-factory/threads-publish");
        const video = reelUrl;

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
              select: { imageUrl: true, kind: true },
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

        // Written, search-friendly caption (2026-09-24) — same one the
        // TikTok email used; written here first if the post never emailed.
        const { ensureWrittenCaption } = await import("@/lib/content-factory/caption-writer");
        post.caption = (await ensureWrittenCaption(row.carouselPostId)) ?? post.caption;

        // IG/FB feed posts get the 4:5 rendition so they fill the feed
        // frame (2026-09-22, per Keenan) — TikTok emails/reels keep 9:16.
        // Threads reuses the same 4:5 set.
        const imageUrls = trimLegacyPickList(post.slides).map((s) =>
          feedCropUrl(s.imageUrl)
        );
        const caption = post.caption;

        // Resolve the platform's publisher, or a reason to SKIP the row.
        let publish: (() => Promise<PublishResult>) | null = null;
        let skipReason = `No ${row.platform} credentials configured`;
        if (row.platform === "instagram" || row.platform === "facebook") {
          const account = await resolveAccount(post.lane);
          if (account && row.platform === "instagram" && account.igUserId) {
            publish = () =>
              video
                ? publishIgReel(account, video, caption)
                : publishIgCarousel(
                    account,
                    imageUrls.slice(0, IG_MAX_CAROUSEL_IMAGES),
                    caption
                  );
          } else if (account && row.platform === "facebook" && account.fbPageId) {
            // FB videos go out as Reels since 2026-09-23 (per Keenan: "the
            // fb carousels still look low quality") — the legacy /videos
            // feed endpoint gets Meta's harshest transcode. Fall back to
            // it only if the Reels flow rejects the file.
            publish = async () => {
              if (!video) return publishFbPhotoPost(account, imageUrls, caption);
              try {
                return await publishFbReel(account, video, caption);
              } catch (err) {
                console.warn(
                  `[social-publish] FB Reel publish failed — falling back to feed video: ${err instanceof Error ? err.message : err}`
                );
                return await publishFbVideo(account, video, caption);
              }
            };
          }
        } else if (row.platform === "youtube") {
          const yt = youtubeAccount(await laneBrand(post.lane));
          if (yt && !video) {
            skipReason = "No reel MP4 rendered (render failed or no music) — Shorts need a video";
          } else if (yt && video) {
            publish = () =>
              publishYoutubeShort(yt, video, { headline: post.headline, caption });
          }
        } else if (row.platform === "threads") {
          const th = threadsAccount(await laneBrand(post.lane));
          if (th) {
            publish = () =>
              video
                ? publishThreadsVideo(th, video, caption)
                : publishThreadsCarousel(th, imageUrls, caption);
          }
        }
        if (!publish) {
          await prisma.socialPublish.update({
            where: { id: row.id },
            data: { status: "SKIPPED", error: skipReason },
          });
          return false;
        }

        try {
          const result = await publish();

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
            `[social-publish] POSTED ${row.platform}/${row.accountKey}: "${post.headline}" → ${result.permalink ?? result.externalId}`
          );
          return {
            headline: post.headline ?? "",
            permalink: result.permalink ?? null,
          };
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
      // typeof guard (not just truthiness): the failure paths return
      // `false`, so the step union is object | false.
      if (ok && typeof ok === "object") {
        published++;
        successes.push({
          platform: row.platform,
          lane: row.carouselPost.lane,
          headline: ok.headline,
          permalink: ok.permalink,
        });
      }
    }

    // ── 3. NOTIFY: one summary email per run covering every success ──
    // (2026-09-14, per Keenan: "set up an email notification for every
    // successful post generation on facebook, instagram, or draft sent
    // to tiktok"). Failures never block the run — the email is FYI only.
    if (successes.length > 0) {
      await step.run("email-publish-summary", async () => {
        const { sendPublishNotification } = await import(
          "@/lib/content-factory/email"
        );
        await sendPublishNotification(successes);
        return successes.length;
      });
    }

    logger.info(
      `[social-publish] enqueued=${enqueued} due=${dueRows.length} published=${published}`
    );
    return { enqueued, due: dueRows.length, published };
  }
);
