import { inngest } from "@/inngest/client";

/**
 * Weekly niche discovery (2026-08-24) — finds NEW accounts to emulate and
 * ranks hashtags by real reach. Sundays 2 UTC (9pm Central Saturday):
 *
 * 1. Collect the hashtags the niche's breakout posts actually use
 *    (frequency weighted by each post's engagementRatio).
 * 2. Sample recent top posts for those hashtags via Apify.
 * 3. Score each hashtag by the median engagement of its top posts
 *    → NicheHashtag rows (ranked hashtag suggestions in the admin).
 * 4. Creators who appear repeatedly in those top posts but aren't
 *    tracked yet → NicheAccount rows with discovered=true, active=false.
 *    Keenan reviews them in the admin and hits Resume to start tracking.
 *
 * Manual trigger: "content-factory/niche.discover" (admin button).
 */
export const nicheDiscoveryFn = inngest.createFunction(
  {
    id: "niche-discovery",
    name: "Niche Lab — Weekly Hashtag & Account Discovery",
    retries: 1,
    triggers: [
      { cron: "0 2 * * 0" },
      { event: "content-factory/niche.discover" },
    ],
  },
  async ({ step, logger }) => {
    const tags = await step.run("pick-hashtags", async () => {
      const { apifyConfigured } = await import(
        "@/lib/content-factory/niche-research"
      );
      if (!apifyConfigured()) return null;

      const { prisma } = await import("@/lib/prisma");
      const posts = await prisma.nichePost.findMany({
        where: {
          postedAt: { gte: new Date(Date.now() - 60 * 86_400_000) },
          hashtags: { isEmpty: false },
        },
        select: { hashtags: true, engagementRatio: true },
      });

      // Weight each tag by the engagement ratio of the posts using it, so
      // tags that ride breakout posts outrank filler tags.
      const weights = new Map<string, number>();
      for (const post of posts) {
        const w = Math.max(post.engagementRatio ?? 1, 0.2);
        for (const tag of post.hashtags) {
          weights.set(tag, (weights.get(tag) ?? 0) + w);
        }
      }
      return [...weights.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag]) => tag);
    });

    if (tags === null) {
      logger.warn("[niche-discovery] APIFY_TOKEN not set — skipping");
      return { skipped: true, reason: "apify not configured" };
    }
    if (tags.length === 0) {
      return { skipped: true, reason: "no niche hashtags yet — scrape accounts first" };
    }

    const result = await step.run("sample-and-score", async () => {
      const { scrapeHashtagPosts, median } = await import(
        "@/lib/content-factory/niche-research"
      );
      const { prisma } = await import("@/lib/prisma");

      const samples = await scrapeHashtagPosts(tags, 20);

      // ── Hashtag scoring ──
      let scoredTags = 0;
      for (const tag of tags) {
        const posts = samples.filter((s) => s.tag === tag);
        if (posts.length === 0) continue;
        const engagements = posts
          .map((p) =>
            p.likes === null && p.comments === null
              ? null
              : (p.likes ?? 0) + (p.comments ?? 0)
          )
          .filter((e): e is number => e !== null);
        const medLikes = median(posts.map((p) => p.likes ?? 0));
        const medViews = median(
          posts.map((p) => p.views).filter((v): v is number => v !== null)
        );
        const score = median(engagements);
        await prisma.nicheHashtag.upsert({
          where: { platform_tag: { platform: "INSTAGRAM", tag } },
          create: {
            platform: "INSTAGRAM",
            tag,
            postCount: posts.length,
            medianLikes: medLikes === null ? null : Math.round(medLikes),
            medianViews: medViews === null ? null : Math.round(medViews),
            score,
            lastCheckedAt: new Date(),
          },
          update: {
            postCount: posts.length,
            medianLikes: medLikes === null ? null : Math.round(medLikes),
            medianViews: medViews === null ? null : Math.round(medViews),
            score,
            lastCheckedAt: new Date(),
          },
        });
        scoredTags++;
      }

      // ── Account discovery ──
      // A creator has to show up at least twice across the sampled top
      // posts to be suggested — one lucky post isn't a pattern.
      const counts = new Map<string, number>();
      for (const s of samples) {
        if (s.ownerUsername) {
          counts.set(s.ownerUsername, (counts.get(s.ownerUsername) ?? 0) + 1);
        }
      }
      let discovered = 0;
      for (const [handle, count] of counts) {
        if (count < 2) continue;
        const existing = await prisma.nicheAccount.findUnique({
          where: { platform_handle: { platform: "INSTAGRAM", handle } },
          select: { id: true },
        });
        if (existing) continue;
        await prisma.nicheAccount.create({
          data: {
            platform: "INSTAGRAM",
            handle,
            discovered: true,
            active: false, // Keenan reviews + resumes to start tracking
            notes: `Discovered ${new Date().toISOString().slice(0, 10)}: appeared in ${count} top posts across niche hashtags`,
          },
        });
        discovered++;
      }

      return { scoredTags, discovered, sampled: samples.length };
    });

    logger.info(
      `[niche-discovery] ${result.scoredTags} hashtags scored, ${result.discovered} accounts discovered from ${result.sampled} sampled posts`
    );
    return result;
  }
);
