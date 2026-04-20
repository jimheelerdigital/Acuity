import { inngest } from "@/inngest/client";

export const researchBriefingFn = inngest.createFunction(
  {
    id: "content-factory-research",
    name: "Content Factory — Daily Research Briefing",
    triggers: [{ cron: "0 6 * * *" }],
    retries: 2,
  },
  async ({ logger }) => {
    const { buildDailyBriefing } = await import(
      "@/lib/content-factory/research"
    );
    const briefing = await buildDailyBriefing();
    logger.info("[content-factory] Research briefing created", {
      briefingId: briefing.id,
    });
    return { briefingId: briefing.id };
  }
);

export const generateDailyFn = inngest.createFunction(
  {
    id: "content-factory-generate",
    name: "Content Factory — Daily Content Generation",
    triggers: [
      { cron: "0 7 * * *" },
      { event: "content-factory/generate.requested" },
    ],
    retries: 1,
  },
  async ({ logger }) => {
    const { prisma } = await import("@/lib/prisma");
    const { buildDailyBriefing } = await import(
      "@/lib/content-factory/research"
    );
    const {
      generateBlogPost,
      generateTwitterPosts,
      generateTikTokScripts,
      generateAdCopy,
    } = await import("@/lib/content-factory/generate");

    // Load today's briefing or create one as fallback
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    let briefing = await prisma.contentBriefing.findUnique({
      where: { date: today },
    });

    if (!briefing) {
      logger.info("[content-factory] No briefing for today, creating one");
      briefing = await buildDailyBriefing();
    }

    // Generate all content types in parallel
    const [blog, tweets, tiktoks, ads] = await Promise.all([
      generateBlogPost(briefing),
      generateTwitterPosts(briefing, 3),
      generateTikTokScripts(briefing, 2),
      generateAdCopy(briefing, 2),
    ]);

    // Build all ContentPiece rows
    const pieces = [
      {
        type: "BLOG" as const,
        title: blog.title,
        body: blog.body,
        hook: blog.hook,
        cta: blog.cta,
        targetKeyword: blog.targetKeyword,
        predictedScore: blog.predictedScore,
        sourceBriefingId: briefing.id,
      },
      ...tweets.map((t) => ({
        type: "TWITTER" as const,
        title: t.hook.slice(0, 80),
        body: t.body,
        hook: t.hook,
        cta: t.cta,
        predictedScore: t.predictedScore,
        sourceBriefingId: briefing.id,
      })),
      ...tiktoks.map((t) => ({
        type: "TIKTOK" as const,
        title: t.hook.slice(0, 80),
        body: t.body,
        hook: t.hook,
        cta: t.cta,
        predictedScore: t.predictedScore,
        sourceBriefingId: briefing.id,
      })),
      ...ads.map((a) => ({
        type: "AD_COPY" as const,
        title: a.hook.slice(0, 80),
        body: a.body,
        hook: a.hook,
        cta: a.cta,
        predictedScore: a.predictedScore,
        sourceBriefingId: briefing.id,
      })),
    ];

    // Write all pieces to DB
    const created = await prisma.$transaction(
      pieces.map((p) => prisma.contentPiece.create({ data: p }))
    );

    logger.info("[content-factory] Generated content pieces", {
      count: created.length,
    });

    return { briefingId: briefing.id, piecesCreated: created.length };
  }
);
