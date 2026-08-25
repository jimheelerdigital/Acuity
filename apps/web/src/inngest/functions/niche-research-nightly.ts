import { inngest } from "@/inngest/client";

/**
 * Nightly niche research scrape (2026-08-24) — the data layer of the
 * Niche Research Lab. For every active NicheAccount, pull the profile and
 * its recent posts via Apify, upsert NichePost rows, and recompute each
 * account's engagementRatio baseline. Runs at 2 UTC (9pm Central) so the
 * data is fresh BEFORE the 3 UTC metrics refresh and the 4-10 UTC
 * overnight generation runs that consume it.
 *
 * Manual trigger: "content-factory/niche.scrape" (admin button).
 * Read-only against Instagram — never likes, comments, or follows.
 */
export const nicheResearchNightlyFn = inngest.createFunction(
  {
    id: "niche-research-nightly",
    name: "Niche Lab — Nightly Account Scrape",
    retries: 1,
    triggers: [
      { cron: "0 2 * * *" },
      { event: "content-factory/niche.scrape" },
    ],
  },
  async ({ step, logger }) => {
    const accounts = await step.run("load-accounts", async () => {
      const { apifyConfigured } = await import(
        "@/lib/content-factory/niche-research"
      );
      if (!apifyConfigured()) return null;
      const { prisma } = await import("@/lib/prisma");
      return prisma.nicheAccount.findMany({
        where: { active: true, platform: "INSTAGRAM" },
        select: { id: true, handle: true },
      });
    });

    if (accounts === null) {
      logger.warn("[niche-research] APIFY_TOKEN not set — skipping");
      return { scraped: 0, reason: "apify not configured" };
    }
    if (accounts.length === 0) {
      return { scraped: 0, reason: "no active accounts" };
    }

    // One Apify run per batch of 10 handles keeps each step comfortably
    // inside the route's 300s ceiling even if an account is slow.
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

        for (const profile of profiles) {
          const account = batch.find(
            (a) => a.handle.toLowerCase() === profile.handle
          );
          if (!account) continue;

          for (const post of profile.posts) {
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
                // deliberately untouched.
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
              displayName: profile.displayName ?? undefined,
              followers: profile.followers ?? undefined,
              lastScrapedAt: new Date(),
            },
          });
        }

        return { accounts: profiles.length, posts };
      });

      scrapedAccounts += result.accounts;
      upsertedPosts += result.posts;
    }

    // ── Engagement queue: draft comments for fresh overperformers ──
    // One Claude call drafts a comment (in Keenan's voice) for each new
    // breakout post from the last 7 days. NOTHING is ever auto-posted —
    // the drafts sit in the admin queue until Keenan copies one and
    // comments manually.
    const drafted = await step.run("draft-comments", async () => {
      const { prisma } = await import("@/lib/prisma");
      const candidates = await prisma.nichePost.findMany({
        where: {
          engagementRatio: { gte: 1.3 },
          suggestedComment: null,
          engagedAt: null,
          postedAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
          caption: { not: null },
        },
        orderBy: { engagementRatio: "desc" },
        take: 10,
        select: {
          id: true,
          caption: true,
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
        systemPrompt: `You draft Instagram comments for Ripple, an AI-powered voice self-reflection app for women 40-50 carrying a heavy mental load. The founder will personally post these from the brand account on other creators' posts in the niche.

Rules for every comment:
- Sound like a real woman who genuinely related to the post — warm, specific, human. Reference something concrete from the caption.
- 1-2 sentences, under 150 characters. No hashtags, no links, NEVER mention or promote Ripple, no emojis beyond at most one.
- Never generic ("Love this!", "So true 🙌") — a comment that could sit under any post is a failure.
- US English.

Output strict JSON, no markdown: [{"id": "...", "comment": "..."}, ...] — one entry per input post, same ids.`,
        userPrompt: JSON.stringify(
          candidates.map((c) => ({
            id: c.id,
            account: c.account.handle,
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

    logger.info(
      `[niche-research] scraped ${scrapedAccounts}/${accounts.length} accounts, ${upsertedPosts} posts, ${drafted} comments drafted`
    );
    return { scraped: scrapedAccounts, posts: upsertedPosts, drafted };
  }
);
