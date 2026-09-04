import { inngest } from "@/inngest/client";

/**
 * Nightly niche research (2026-08-24, reworked 2026-08-25) — the data
 * layer of the Niche Research Lab. Runs at 2 UTC (9pm Central):
 *
 * 1. ensure-profile — Claude infers the niche from OUR OWN posted
 *    carousels (refreshed weekly). Keenan never defines the niche.
 * 2. viral-instagram / viral-tiktok — scrape the profile's hashtags on
 *    both platforms, score each sampled post against its hashtag
 *    sample's median (viralScore), and store the fresh ones. The admin's
 *    "viral today" feed reads these.
 * 3. scrape-batch-N — tracked/approved NicheAccounts still get their
 *    recent posts pulled and engagement ratios computed.
 * 4. draft-comments — one Claude call drafts a comment (in Keenan's
 *    voice) for today's viral posts. NOTHING is auto-posted; drafts sit
 *    in the admin until Keenan copies one manually.
 * 5. suggest-topics — Claude turns today's viral posts into carousel
 *    topic SUGGESTIONS (NicheTopicSuggestion rows). These are only ever
 *    generated when Keenan presses Generate in the admin — niche data no
 *    longer feeds the automatic daily posts.
 *
 * Manual trigger: "content-factory/niche.scrape" (admin button).
 * Read-only against Instagram/TikTok — never likes, comments, or follows.
 */
export const nicheResearchNightlyFn = inngest.createFunction(
  {
    id: "niche-research-nightly",
    name: "Niche Lab — Nightly Research",
    retries: 1,
    triggers: [
      { cron: "0 2 * * *" },
      { event: "content-factory/niche.scrape" },
    ],
  },
  async ({ step, logger }) => {
    // ── Step 1: niche profile (auto-inferred, refreshed weekly) ──────
    const profile = await step.run("ensure-profile", async () => {
      const { apifyConfigured, inferNiche } = await import(
        "@/lib/content-factory/niche-research"
      );
      if (!apifyConfigured()) return null;

      const { prisma } = await import("@/lib/prisma");
      const existing = await prisma.nicheProfile.findUnique({
        where: { id: "singleton" },
      });
      const stale =
        !existing ||
        existing.updatedAt < new Date(Date.now() - 7 * 86_400_000);
      if (!stale) return existing;

      const inferred = await inferNiche();
      if (!inferred) return existing; // no posts yet / bad JSON — retry next night
      return prisma.nicheProfile.upsert({
        where: { id: "singleton" },
        create: { id: "singleton", ...inferred },
        update: inferred,
      });
    });

    if (profile === null) {
      logger.warn("[niche-research] APIFY_TOKEN not set — skipping");
      return { skipped: true, reason: "apify not configured" };
    }
    if (!profile) {
      return { skipped: true, reason: "niche not inferable yet (no posted carousels)" };
    }

    // ── Step 2: today's viral posts, per platform ────────────────────
    // A post makes the feed when its engagement is a clear multiple of
    // the median of the sample it was scraped with, and it's recent.
    const ingestViral = async (
      platform: "INSTAGRAM" | "TIKTOK",
      samples: import("@/lib/content-factory/niche-research").HashtagPost[]
    ) => {
      const { median } = await import(
        "@/lib/content-factory/niche-research"
      );
      const { prisma } = await import("@/lib/prisma");

      // Median engagement per tag → each post's viralScore
      const byTag = new Map<string, number[]>();
      for (const s of samples) {
        const eng =
          s.likes === null && s.comments === null
            ? null
            : (s.likes ?? 0) + (s.comments ?? 0);
        if (eng === null || !s.tag) continue;
        byTag.set(s.tag, [...(byTag.get(s.tag) ?? []), eng]);
      }
      const medians = new Map<string, number>();
      for (const [tag, engs] of byTag) {
        const m = median(engs);
        if (m !== null && m > 0) medians.set(tag, m);
      }

      const freshCutoff = new Date(Date.now() - 3 * 86_400_000);
      let stored = 0;
      for (const s of samples) {
        if (!s.shortCode || !s.postedAt || s.postedAt < freshCutoff) continue;
        const med = medians.get(s.tag);
        const eng =
          s.likes === null && s.comments === null
            ? null
            : (s.likes ?? 0) + (s.comments ?? 0);
        const viralScore =
          med && eng !== null ? Number((eng / med).toFixed(2)) : null;

        await prisma.nichePost.upsert({
          where: {
            platform_externalId: { platform, externalId: s.shortCode },
          },
          create: {
            platform,
            externalId: s.shortCode,
            url:
              s.webUrl ||
              (platform === "INSTAGRAM"
                ? `https://www.instagram.com/p/${s.shortCode}/`
                : `https://www.tiktok.com/@${s.ownerUsername ?? ""}/video/${s.shortCode}`),
            authorHandle: s.ownerUsername,
            caption: s.caption,
            hashtags: s.tag ? [s.tag] : [],
            likes: s.likes,
            comments: s.comments,
            views: s.views,
            postedAt: s.postedAt,
            viralScore,
          },
          update: {
            likes: s.likes,
            comments: s.comments,
            views: s.views,
            viralScore,
            scrapedAt: new Date(),
          },
        });
        stored++;
      }
      return stored;
    };

    const igViral = await step.run("viral-instagram", async () => {
      if (profile.igHashtags.length === 0) return 0;
      const { scrapeHashtagPosts } = await import(
        "@/lib/content-factory/niche-research"
      );
      const samples = await scrapeHashtagPosts(
        profile.igHashtags.slice(0, 10),
        15
      );
      return ingestViral("INSTAGRAM", samples);
    });

    const ttViral = await step.run("viral-tiktok", async () => {
      if (profile.tiktokHashtags.length === 0) return 0;
      const { scrapeTikTokHashtags } = await import(
        "@/lib/content-factory/niche-research"
      );
      const samples = await scrapeTikTokHashtags(
        profile.tiktokHashtags.slice(0, 10),
        15
      );
      return ingestViral("TIKTOK", samples);
    });

    // ── Step 3: tracked accounts (approved by Keenan) ────────────────
    const accounts = await step.run("load-accounts", async () => {
      const { prisma } = await import("@/lib/prisma");
      return prisma.nicheAccount.findMany({
        where: { active: true, platform: "INSTAGRAM" },
        select: { id: true, handle: true },
      });
    });

    const BATCH = 10;
    let scrapedAccounts = 0;
    let upsertedPosts = 0;

    for (let i = 0; i < accounts.length; i += BATCH) {
      const batch = accounts.slice(i, i + BATCH);
      const result = await step.run(`scrape-batch-${i / BATCH}`, async () => {
        const { scrapeInstagramProfiles, computeEngagementRatios } =
          await import("@/lib/content-factory/niche-research");
        const { prisma } = await import("@/lib/prisma");

        const profiles = await scrapeInstagramProfiles(
          batch.map((a) => a.handle)
        );
        let posts = 0;

        for (const scraped of profiles) {
          const account = batch.find(
            (a) => a.handle.toLowerCase() === scraped.handle
          );
          if (!account) continue;

          for (const post of scraped.posts) {
            await prisma.nichePost.upsert({
              where: {
                platform_externalId: {
                  platform: "INSTAGRAM",
                  externalId: post.externalId,
                },
              },
              create: {
                accountId: account.id,
                platform: "INSTAGRAM",
                ...post,
              },
              update: {
                // Numbers keep climbing while a post is live; captions and
                // thumbnails can be edited. suggestedComment/engagedAt are
                // deliberately untouched. accountId claims a post that was
                // first seen via a hashtag scrape.
                accountId: account.id,
                views: post.views,
                likes: post.likes,
                comments: post.comments,
                caption: post.caption,
                thumbnailUrl: post.thumbnailUrl,
                scrapedAt: new Date(),
              },
            });
            posts++;
          }

          // Recompute the account's engagement baseline over its recent
          // posts (last 60 days, up to 36 posts) and write ratios back.
          const recent = await prisma.nichePost.findMany({
            where: {
              accountId: account.id,
              postedAt: { gte: new Date(Date.now() - 60 * 86_400_000) },
            },
            orderBy: { postedAt: "desc" },
            take: 36,
            select: { id: true, likes: true, comments: true },
          });
          const ratios = computeEngagementRatios(recent);
          for (let j = 0; j < recent.length; j++) {
            if (ratios[j] !== null) {
              await prisma.nichePost.update({
                where: { id: recent[j].id },
                data: { engagementRatio: ratios[j] },
              });
            }
          }

          await prisma.nicheAccount.update({
            where: { id: account.id },
            data: {
              displayName: scraped.displayName ?? undefined,
              followers: scraped.followers ?? undefined,
              lastScrapedAt: new Date(),
            },
          });
        }

        return { accounts: profiles.length, posts };
      });

      scrapedAccounts += result.accounts;
      upsertedPosts += result.posts;
    }

    // ── Step 4: draft comments for today's viral posts ──────────────
    // One Claude call drafts a comment (in Keenan's voice) per post.
    // NOTHING is ever auto-posted — the drafts sit in the admin queue
    // until Keenan copies one and comments manually.
    const drafted = await step.run("draft-comments", async () => {
      const { prisma } = await import("@/lib/prisma");
      const candidates = await prisma.nichePost.findMany({
        where: {
          suggestedComment: null,
          engagedAt: null,
          caption: { not: null },
          postedAt: { gte: new Date(Date.now() - 2 * 86_400_000) },
          OR: [
            { viralScore: { gte: 2 } },
            { engagementRatio: { gte: 1.3 } },
          ],
        },
        orderBy: [{ viralScore: "desc" }, { engagementRatio: "desc" }],
        take: 10,
        select: {
          id: true,
          caption: true,
          authorHandle: true,
          account: { select: { handle: true } },
        },
      });
      if (candidates.length === 0) return 0;

      const { callClaude } = await import(
        "@/lib/content-factory/claude-client"
      );
      const raw = await callClaude({
        purpose: "niche-engagement-comments",
        maxTokens: 1500,
        systemPrompt: `You draft Instagram/TikTok comments for Ripple, an AI-powered voice self-reflection app for women 40-50 carrying a heavy mental load. The founder will personally post these from the brand account on other creators' posts in the niche.

Rules for every comment:
- Sound like a real woman who genuinely related to the post — warm, specific, human. Reference something concrete from the caption.
- 1-2 sentences, under 150 characters. No hashtags, no links, NEVER mention or promote Ripple, no emojis beyond at most one.
- Never generic ("Love this!", "So true 🙌") — a comment that could sit under any post is a failure.
- US English.

Output strict JSON, no markdown: [{"id": "...", "comment": "..."}, ...] — one entry per input post, same ids.`,
        userPrompt: JSON.stringify(
          candidates.map((c) => ({
            id: c.id,
            account: c.account?.handle ?? c.authorHandle ?? "unknown",
            caption: (c.caption ?? "").slice(0, 400),
          }))
        ),
      });

      let parsed: { id: string; comment: string }[] = [];
      try {
        parsed = JSON.parse(
          raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
        );
      } catch {
        return 0; // bad JSON → skip silently, next night retries
      }
      let saved = 0;
      for (const item of parsed) {
        if (!item?.id || typeof item.comment !== "string" || !item.comment.trim())
          continue;
        if (!candidates.some((c) => c.id === item.id)) continue;
        await prisma.nichePost.update({
          where: { id: item.id },
          data: { suggestedComment: item.comment.trim().slice(0, 300) },
        });
        saved++;
      }
      return saved;
    });

    // ── Step 5: carousel topic suggestions (NEVER auto-generated) ───
    const suggested = await step.run("suggest-topics", async () => {
      const { prisma } = await import("@/lib/prisma");
      const viral = await prisma.nichePost.findMany({
        where: {
          caption: { not: null },
          postedAt: { gte: new Date(Date.now() - 2 * 86_400_000) },
          OR: [
            { viralScore: { gte: 2 } },
            { engagementRatio: { gte: 1.5 } },
          ],
        },
        orderBy: [{ viralScore: "desc" }, { engagementRatio: "desc" }],
        take: 12,
        select: {
          caption: true,
          platform: true,
          viralScore: true,
          engagementRatio: true,
        },
      });
      if (viral.length < 3) return 0; // not enough signal today

      const [pendingSuggestions, recentPosts] = await Promise.all([
        prisma.nicheTopicSuggestion.findMany({
          where: { status: "SUGGESTED" },
          select: { headline: true },
        }),
        prisma.carouselPost.findMany({
          where: {
            generatedFor: { gte: new Date(Date.now() - 30 * 86_400_000) },
          },
          select: { headline: true },
        }),
      ]);
      if (pendingSuggestions.length >= 9) return 0; // queue is full — review first

      const { callClaude } = await import(
        "@/lib/content-factory/claude-client"
      );
      const raw = await callClaude({
        purpose: "niche-topic-suggestions",
        maxTokens: 1200,
        systemPrompt: `You suggest Instagram/TikTok carousel topics for Ripple, an AI-powered voice self-reflection app for women 40-50 carrying a heavy mental load. Topics are numbered-list carousels ("7 signs...", "5 ways...").

You are given captions from posts that went VIRAL in this niche in the last 48 hours. Extract WHY each landed — the emotional angle, hook structure, specificity — and propose fresh topics that ride the same underlying appeal. NEVER copy, translate, or lightly rephrase a viral caption.

Output strict JSON, no markdown: [{"headline": "...", "angle": "...", "source": "..."}] with exactly 3 entries.
- headline: the carousel cover line, with a number ("7 signs the mental load is running your life")
- angle: 1-2 sentences on why this should land, citing the viral evidence
- source: which viral post(s) inspired it, briefly`,
        userPrompt: `Viral posts today:\n${viral
          .map(
            (v) =>
              `- [${v.platform}${v.viralScore ? `, ${v.viralScore}x` : ""}] ${(v.caption ?? "").replace(/\s+/g, " ").slice(0, 260)}`
          )
          .join("\n")}\n\nDo NOT suggest anything resembling these existing headlines:\n${[
          ...pendingSuggestions.map((s) => s.headline),
          ...recentPosts.map((p) => p.headline),
        ]
          .map((h) => `- ${h}`)
          .join("\n")}`,
      });

      let parsed: { headline: string; angle: string; source?: string }[] = [];
      try {
        parsed = JSON.parse(
          raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
        );
      } catch {
        return 0;
      }
      let created = 0;
      for (const item of parsed.slice(0, 3)) {
        if (!item?.headline || !item?.angle) continue;
        await prisma.nicheTopicSuggestion.create({
          data: {
            headline: String(item.headline).slice(0, 200),
            angle: String(item.angle).slice(0, 1000),
            sourceSummary: item.source ? String(item.source).slice(0, 500) : null,
          },
        });
        created++;
      }
      return created;
    });

    logger.info(
      `[niche-research] viral: ${igViral} IG + ${ttViral} TikTok, accounts: ${scrapedAccounts}/${accounts.length} (${upsertedPosts} posts), ${drafted} comments drafted, ${suggested} topics suggested`
    );
    return {
      viralIg: igViral,
      viralTiktok: ttViral,
      scraped: scrapedAccounts,
      posts: upsertedPosts,
      drafted,
      suggested,
    };
  }
);
