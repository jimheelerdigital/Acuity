import { inngest } from "@/inngest/client";
import type { NichePlatform } from "@prisma/client";

/**
 * Weekly niche discovery — finds NEW accounts to emulate and ranks
 * hashtags by real reach. Sundays 2 UTC (9pm Central Saturday).
 *
 * Reworked 2026-08-25: bootstraps from the auto-inferred NicheProfile
 * hashtags (works with ZERO tracked accounts), covers both Instagram
 * and TikTok, and suggests creators on both platforms.
 *
 * 1. Take the profile's IG + TikTok hashtags, blended with the tags of
 *    recent breakout posts (frequency weighted by engagementRatio).
 * 2. Sample recent top posts for those hashtags via Apify.
 * 3. Score each hashtag by the median engagement of its top posts
 *    → NicheHashtag rows (ranked hashtag suggestions in the admin).
 * 4. Creators who appear repeatedly in those top posts but aren't
 *    tracked yet → NicheAccount rows with discovered=true, active=false.
 *    Keenan reviews them in the admin and hits Track to follow them.
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
      const { apifyConfigured, inferNiche } = await import(
        "@/lib/content-factory/niche-research"
      );
      if (!apifyConfigured()) return null;

      const { prisma } = await import("@/lib/prisma");

      // Base set: the auto-inferred niche profile (inferred on the spot
      // if it doesn't exist yet — discovery must work with zero setup).
      let profile = await prisma.nicheProfile.findUnique({
        where: { id: "singleton" },
      });
      if (!profile) {
        const inferred = await inferNiche();
        if (inferred) {
          profile = await prisma.nicheProfile.upsert({
            where: { id: "singleton" },
            create: { id: "singleton", ...inferred },
            update: inferred,
          });
        }
      }

      // Boost set: tags riding recent breakout posts, weighted by each
      // post's engagement so filler tags don't outrank winners.
      const posts = await prisma.nichePost.findMany({
        where: {
          postedAt: { gte: new Date(Date.now() - 60 * 86_400_000) },
          hashtags: { isEmpty: false },
        },
        select: { hashtags: true, engagementRatio: true, viralScore: true },
      });
      const weights = new Map<string, number>();
      for (const post of posts) {
        const w = Math.max(post.viralScore ?? post.engagementRatio ?? 1, 0.2);
        for (const tag of post.hashtags) {
          weights.set(tag, (weights.get(tag) ?? 0) + w);
        }
      }
      const breakoutTags = [...weights.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag);

      const blend = (profileTags: string[]) => {
        const out: string[] = [];
        for (const t of [...profileTags, ...breakoutTags]) {
          const tag = t.toLowerCase();
          if (!out.includes(tag)) out.push(tag);
          if (out.length >= 10) break;
        }
        return out;
      };

      return {
        instagram: blend(profile?.igHashtags ?? []),
        tiktok: blend(profile?.tiktokHashtags ?? []),
      };
    });

    if (tags === null) {
      logger.warn("[niche-discovery] APIFY_TOKEN not set — skipping");
      return { skipped: true, reason: "apify not configured" };
    }
    if (tags.instagram.length === 0 && tags.tiktok.length === 0) {
      return {
        skipped: true,
        reason: "no niche hashtags yet — post some carousels first",
      };
    }

    const igResult = await step.run("discover-instagram", async () => {
      if (tags.instagram.length === 0) {
        return { scoredTags: 0, discovered: 0, sampled: 0 };
      }
      const { scrapeHashtagPosts } = await import(
        "@/lib/content-factory/niche-research"
      );
      const samples = await scrapeHashtagPosts(tags.instagram, 20);
      return ingestDiscovery("INSTAGRAM", tags.instagram, samples);
    });

    const ttResult = await step.run("discover-tiktok", async () => {
      if (tags.tiktok.length === 0) {
        return { scoredTags: 0, discovered: 0, sampled: 0 };
      }
      const { scrapeTikTokHashtags } = await import(
        "@/lib/content-factory/niche-research"
      );
      const samples = await scrapeTikTokHashtags(tags.tiktok, 20);
      return ingestDiscovery("TIKTOK", tags.tiktok, samples);
    });

    const result = {
      scoredTags: igResult.scoredTags + ttResult.scoredTags,
      discovered: igResult.discovered + ttResult.discovered,
      sampled: igResult.sampled + ttResult.sampled,
    };
    logger.info(
      `[niche-discovery] ${result.scoredTags} hashtags scored, ${result.discovered} accounts discovered from ${result.sampled} sampled posts (IG ${igResult.sampled}, TT ${ttResult.sampled})`
    );
    return result;
  }
);

/**
 * Shared per-platform ingestion: score hashtags by median engagement of
 * their sampled top posts, and suggest creators that appear ≥2 times.
 */
async function ingestDiscovery(
  platform: NichePlatform,
  tags: string[],
  samples: import("@/lib/content-factory/niche-research").HashtagPost[]
) {
  const { median } = await import("@/lib/content-factory/niche-research");
  const { prisma } = await import("@/lib/prisma");

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
      where: { platform_tag: { platform, tag } },
      create: {
        platform,
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
      where: { platform_handle: { platform, handle } },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.nicheAccount.create({
      data: {
        platform,
        handle,
        discovered: true,
        active: false, // Keenan reviews + tracks from the admin
        notes: `Discovered ${new Date().toISOString().slice(0, 10)}: appeared in ${count} top posts across niche hashtags`,
      },
    });
    discovered++;
  }

  return { scoredTags, discovered, sampled: samples.length };
}
