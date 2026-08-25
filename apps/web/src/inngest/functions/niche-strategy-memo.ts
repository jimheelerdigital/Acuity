import { inngest } from "@/inngest/client";

/**
 * Weekly niche strategy memo (2026-08-24) — the "what should we try next"
 * layer of the Niche Lab. Every Monday, Claude cross-references OUR posts'
 * real engagement against the niche's breakout posts and writes a short
 * markdown memo: what's overperforming in the niche, suggested new post
 * types/formats worth testing, and what to double down on. Saved as a
 * NicheMemo row (shown in the admin Niche Lab) and emailed to Keenan.
 *
 * Manual trigger: "content-factory/niche.memo" (admin button).
 */
export const nicheStrategyMemoFn = inngest.createFunction(
  {
    id: "niche-strategy-memo",
    name: "Niche Lab — Weekly Strategy Memo",
    retries: 1,
    triggers: [
      { cron: "0 11 * * 1" }, // Mondays 6am Central
      { event: "content-factory/niche.memo" },
    ],
  },
  async ({ step, logger }) => {
    const data = await step.run("gather-data", async () => {
      const { prisma } = await import("@/lib/prisma");
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

      const [ourPosts, nichePosts, accounts] = await Promise.all([
        prisma.carouselPost.findMany({
          where: { generatedFor: { gte: thirtyDaysAgo } },
          orderBy: { generatedFor: "desc" },
          select: {
            headline: true,
            format: true,
            views: true,
            likes: true,
            comments: true,
            saves: true,
            shares: true,
            metricsAt: true,
          },
        }),
        prisma.nichePost.findMany({
          where: {
            postedAt: { gte: thirtyDaysAgo },
            engagementRatio: { not: null },
          },
          orderBy: { engagementRatio: "desc" },
          take: 25,
          select: {
            caption: true,
            hashtags: true,
            mediaType: true,
            likes: true,
            comments: true,
            views: true,
            engagementRatio: true,
            account: { select: { handle: true, followers: true } },
          },
        }),
        prisma.nicheAccount.count({ where: { active: true } }),
      ]);

      return { ourPosts, nichePosts, accounts };
    });

    if (data.nichePosts.length === 0) {
      logger.warn("[niche-memo] no scraped niche posts yet — skipping");
      return { skipped: true, reason: "no niche data" };
    }

    const memo = await step.run("write-memo", async () => {
      const { callClaude } = await import(
        "@/lib/content-factory/claude-client"
      );

      const ourBlock = data.ourPosts
        .map((p) => {
          const m = p.metricsAt
            ? ` — views ${p.views ?? "?"}, likes ${p.likes ?? "?"}, comments ${p.comments ?? "?"}, saves ${p.saves ?? "?"}, shares ${p.shares ?? "?"}`
            : " — (no metrics yet)";
          return `- [${p.format}] ${p.headline}${m}`;
        })
        .join("\n");

      const nicheBlock = data.nichePosts
        .map(
          (p) =>
            `- [${p.engagementRatio!.toFixed(1)}x their avg, @${p.account.handle}, ${p.account.followers ?? "?"} followers, ${p.mediaType ?? "?"}] ${(p.caption ?? "").replace(/\s+/g, " ").slice(0, 200)}`
        )
        .join("\n");

      return callClaude({
        purpose: "niche-strategy-memo",
        maxTokens: 2500,
        systemPrompt: `You are the content strategist for Ripple, an AI-powered voice self-reflection app for women aged 40-50 carrying a heavy mental load. Ripple posts 4 pieces daily to Instagram/TikTok: PHOTO (static carousel), VIDEO (animated carousel), STORY (30s narrated story video), AMBIENT (calm looped scene with a reflective voiceover).

You write a weekly strategy memo for the founder (a marketer, not an engineer). Be direct, specific, and practical — no filler, no cheerleading. Every recommendation must be actionable this week with the existing 4-format pipeline, or clearly flagged as a NEW format idea worth building.

Write in markdown with exactly these sections:
## What's working in the niche
## What we should double down on
## New post types worth testing
## What to stop or change
## This week's experiments (max 3, each one sentence)

Ground every claim in the data provided. When you cite a niche post, name the account. Keep the whole memo under 500 words.`,
        userPrompt: `Active tracked accounts: ${data.accounts}

OUR POSTS (last 30 days, with real engagement where entered):
${ourBlock || "(none)"}

NICHE BREAKOUT POSTS (last 30 days, from tracked accounts, ranked by how much they beat their own account's average):
${nicheBlock}

Write this week's strategy memo.`,
      });
    });

    const saved = await step.run("save-and-email", async () => {
      const { prisma } = await import("@/lib/prisma");

      // Monday of the current week (UTC) as the idempotency key.
      const now = new Date();
      const weekOf = new Date(now);
      weekOf.setUTCHours(0, 0, 0, 0);
      weekOf.setUTCDate(weekOf.getUTCDate() - ((weekOf.getUTCDay() + 6) % 7));

      await prisma.nicheMemo.upsert({
        where: { weekOf },
        create: { weekOf, content: memo },
        update: { content: memo },
      });

      try {
        const { getResendClient } = await import("@/lib/resend");
        const resend = getResendClient();
        await resend.emails.send({
          from:
            process.env.CONTENT_FACTORY_EMAIL_FROM ??
            '"Ripple Content" <content@getacuity.io>',
          to: process.env.CONTENT_FACTORY_EMAIL_TO ?? "keenan@heelerdigital.com",
          subject: `Niche strategy memo — week of ${weekOf.toISOString().slice(0, 10)}`,
          text: memo,
        });
        return { emailed: true };
      } catch (err) {
        // The memo is saved and visible in the admin either way.
        return {
          emailed: false,
          error: err instanceof Error ? err.message : "email failed",
        };
      }
    });

    logger.info(`[niche-memo] memo saved, emailed=${saved.emailed}`);
    return { ok: true, ...saved };
  }
);
