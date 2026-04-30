/**
 * Auto-Blog Pipeline — Generates and publishes one blog post daily
 * on a randomized schedule, and prunes underperformers via GSC data.
 *
 * CRITICAL: Every long-running operation is wrapped in step.run() or
 * step.sleep() so Inngest can pause/resume across Vercel's 60-second
 * function timeout. Plain setTimeout / inline awaits will be killed.
 *
 * The previous version (commit c93ee17) used plain setTimeout for the
 * random delay and inline awaits for Claude + DB calls. Vercel killed
 * it after 60 seconds on every cron run — it never completed.
 */

import { inngest } from "@/inngest/client";

// ─── Personas for internal linking ──────────────────────────────────────────

const PERSONA_SLUGS = [
  "anxiety",
  "adhd",
  "remote-workers",
  "new-parents",
  "burnout",
  "students",
  "entrepreneurs",
  "creatives",
  "couples",
  "grief",
  "career-change",
  "nurses",
  "teachers",
  "therapists",
  "overthinkers",
  "introverts",
  "managers",
  "freelancers",
  "athletes",
  "chronic-pain",
  "decoded",
  "founders",
  "sleep",
  "therapy",
  "weekly-report",
];

// ─── Banned phrases ─────────────────────────────────────────────────────────

const BANNED_PHRASES = [
  "unlock",
  "elevate",
  "journey",
  "transform",
  "ai-powered",
  "seamless",
  "game-changer",
  "in today's fast-paced world",
  "revolutionize",
  "harness the power of",
  "empower",
  "cutting-edge",
  "leverage",
];

// ─── Blog generation output ─────────────────────────────────────────────────

interface AutoBlogResult {
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  heroH1: string;
  body: string;
  estimatedReadTime: number;
  primaryKeyword: string;
  secondaryKeywords: string[];
  faqSchema: Array<{ question: string; answer: string }>;
  internalLinks: string[];
  includeCta: boolean;
  ctaPlacementHint: string;
}

// ─── Validation ─────────────────────────────────────────────────────────────

function validateBlogPost(
  post: AutoBlogResult,
  validBlogSlugs: string[] = []
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const textBody = post.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const wordCount = textBody.split(/\s+/).filter(Boolean).length;

  if (wordCount < 1400 || wordCount > 2200) {
    errors.push(`Word count ${wordCount} outside 1400-2200 range`);
  }

  const h1Match = post.body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (
    h1Match &&
    !h1Match[1].toLowerCase().includes(post.primaryKeyword.toLowerCase())
  ) {
    errors.push("Primary keyword not in H1");
  }

  const first100Words = textBody.split(/\s+/).slice(0, 100).join(" ");
  if (!first100Words.toLowerCase().includes(post.primaryKeyword.toLowerCase())) {
    errors.push("Primary keyword not in first 100 words");
  }

  const h2Matches = post.body.match(/<h2[^>]*>/gi) ?? [];
  if (h2Matches.length < 3) {
    errors.push(`Only ${h2Matches.length} H2s, need at least 3`);
  }

  const h2KeywordMatch = (post.body.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) ?? [])
    .some((h2) => h2.toLowerCase().includes(post.primaryKeyword.toLowerCase()));
  if (!h2KeywordMatch) {
    errors.push("Primary keyword not in any H2");
  }

  const internalLinkCount = (
    post.body.match(/href=["']\/(?:for|blog)\//gi) ?? []
  ).length;
  if (internalLinkCount < 2) {
    errors.push(`Only ${internalLinkCount} internal links, need at least 2`);
  }

  // Validate that all internal links point to real pages
  const validPersonaSlugs = new Set(PERSONA_SLUGS);
  const validBlogSlugSet = new Set(validBlogSlugs);

  const allInternalLinks =
    post.body.match(/href=["'](\/(?:for|blog)\/[^"']+)["']/gi) ?? [];
  const brokenLinks: string[] = [];

  for (const match of allInternalLinks) {
    const href = match.replace(/^href=["']/, "").replace(/["']$/, "");
    if (href.startsWith("/for/")) {
      const slug = href.replace("/for/", "").replace(/\/$/, "");
      if (!validPersonaSlugs.has(slug)) {
        brokenLinks.push(href);
      }
    } else if (href.startsWith("/blog/")) {
      const slug = href.replace("/blog/", "").replace(/\/$/, "");
      if (!validBlogSlugSet.has(slug)) {
        brokenLinks.push(href);
      }
    }
  }

  if (brokenLinks.length > 0) {
    errors.push(
      `Broken internal links (do not exist): ${brokenLinks.join(", ")}`
    );
  }

  if (!post.faqSchema || post.faqSchema.length < 3) {
    errors.push(
      `FAQ schema has ${post.faqSchema?.length ?? 0} Qs, need at least 3`
    );
  }

  if (post.metaDescription.length < 140 || post.metaDescription.length > 160) {
    errors.push(
      `Meta description ${post.metaDescription.length} chars, need 140-160`
    );
  }

  if (post.metaTitle.length < 50 || post.metaTitle.length > 60) {
    errors.push(`Meta title ${post.metaTitle.length} chars, need 50-60`);
  }

  const bodyLower = post.body.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (bodyLower.includes(phrase.toLowerCase())) {
      errors.push(`Contains banned phrase: "${phrase}"`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-BLOG GENERATE — uses Inngest step.run() + step.sleep()
// ═══════════════════════════════════════════════════════════════════════════

export const autoBlogGenerateFn = inngest.createFunction(
  {
    id: "auto-blog-generate",
    name: "Auto Blog — Daily Generation",
    triggers: [
      { cron: "0 6 * * *" },
      { event: "auto-blog/generate.requested" },
    ],
    retries: 1,
  },
  async ({ event, logger, step }) => {
    const skipDelay = (event?.data as { skipDelay?: boolean })?.skipDelay;

    // ── Step 0: Auto-recover stuck topics from prior failed runs ──
    await step.run("reset-stuck-topics", async () => {
      const { prisma } = await import("@/lib/prisma");
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const result = await prisma.blogTopicQueue.updateMany({
        where: {
          status: "IN_PROGRESS",
          createdAt: { lt: tenMinutesAgo },
        },
        data: { status: "QUEUED" },
      });
      return { resetCount: result.count };
    });

    // ── Step 1: Randomized delay (06:00–22:00 UTC spread) ────────
    if (!skipDelay) {
      const delayMinutes = Math.floor(Math.random() * 960);
      logger.info(
        `[auto-blog] Will sleep ${delayMinutes} minutes before generating`
      );
      if (delayMinutes > 0) {
        await step.sleep("randomized-delay", `${delayMinutes}m`);
      }
    }

    // ── Step 2: Topic queue health check ─────────────────────────
    await step.run("ensure-topic-queue-health", async () => {
      const { prisma } = await import("@/lib/prisma");
      const queuedCount = await prisma.blogTopicQueue.count({
        where: { status: "QUEUED" },
      });
      if (queuedCount < 30) {
        await refillTopicQueue(prisma);
      }
      return { queuedCount };
    });

    // ── Step 3: Pick next topic ─────────────────────────────────
    const topicData = await step.run("pick-next-topic", async () => {
      const { prisma } = await import("@/lib/prisma");
      const topic = await prisma.blogTopicQueue.findFirst({
        where: { status: "QUEUED" },
        orderBy: { createdAt: "asc" },
      });

      if (!topic) {
        throw new Error("No topics in queue — cannot generate blog post");
      }

      await prisma.blogTopicQueue.update({
        where: { id: topic.id },
        data: { status: "IN_PROGRESS" },
      });

      // Bundle founding member count here (cheap query)
      const FOUNDING_MEMBER_CAP = 100;
      const foundingCount = await prisma.user.count({
        where: { isFoundingMember: true },
      });

      // Fetch all published blog slugs so Claude only links to real posts
      const { BLOG_POSTS } = await import("@/lib/blog-posts");
      const staticSlugs = BLOG_POSTS.map((p) => p.slug);
      const dynamicPosts = await prisma.contentPiece.findMany({
        where: {
          type: "BLOG",
          status: { in: ["DISTRIBUTED", "AUTO_PUBLISHED"] },
          slug: { not: null },
        },
        select: { slug: true },
      });
      const dynamicSlugs = dynamicPosts
        .map((p) => p.slug)
        .filter((s): s is string => s !== null);
      const allBlogSlugs = [...new Set([...staticSlugs, ...dynamicSlugs])];

      return {
        id: topic.id,
        topic: topic.topic,
        persona: topic.persona,
        targetKeyword: topic.targetKeyword,
        searchIntent: topic.searchIntent,
        spotsLeft: Math.max(0, FOUNDING_MEMBER_CAP - foundingCount),
        blogSlugs: allBlogSlugs,
      };
    });

    // ── Step 4: Generate content (attempt 1) ────────────────────
    // Each Claude call gets its own step so it has a fresh timeout
    // budget. The call itself takes 30-90s depending on output length.
    const attempt1 = await step.run("generate-attempt-1", async () => {
      return callClaudeForBlog(topicData, topicData.spotsLeft, 1, [], topicData.blogSlugs);
    });

    // ── Step 5: Generate content (attempt 2, if needed) ──────────
    // Feed prior validation errors into the prompt so Claude can
    // self-correct instead of repeating the same mistakes.
    let result = attempt1;
    if (!result.valid) {
      logger.warn("[auto-blog] Attempt 1 failed, trying attempt 2", {
        errors: result.errors,
      });
      const attempt1Errors = result.errors ?? [];
      result = await step.run("generate-attempt-2", async () => {
        return callClaudeForBlog(topicData, topicData.spotsLeft, 2, attempt1Errors, topicData.blogSlugs);
      });
    }

    // ── Step 6: Generate content (attempt 3, if needed) ──────────
    if (!result.valid) {
      logger.warn("[auto-blog] Attempt 2 failed, trying attempt 3", {
        errors: result.errors,
      });
      const attempt2Errors = result.errors ?? [];
      result = await step.run("generate-attempt-3", async () => {
        return callClaudeForBlog(topicData, topicData.spotsLeft, 3, attempt2Errors, topicData.blogSlugs);
      });
    }

    // ── All attempts failed → mark SKIPPED ──────────────────────
    if (!result.valid || !result.pieceId) {
      await step.run("mark-generation-failed", async () => {
        const { prisma } = await import("@/lib/prisma");
        await prisma.blogTopicQueue.update({
          where: { id: topicData.id },
          data: { status: "SKIPPED" },
        });
        // Create a failure record if no pieceId was created yet
        if (!result.pieceId) {
          await prisma.contentPiece.create({
            data: {
              type: "BLOG",
              title: topicData.topic,
              body: `Generation failed after 3 attempts. Errors: ${(result.errors ?? []).join("; ")}`,
              hook: "",
              cta: "",
              targetKeyword: topicData.targetKeyword,
              predictedScore: 0,
              status: "GENERATION_FAILED",
            },
          });
        }
      });

      return {
        status: "failed",
        topicId: topicData.id,
        errors: result.errors,
      };
    }

    // ── Step 7: Publish — flip status + set slug ────────────────
    // The generate step already wrote the ContentPiece with the full
    // body. This step just sets the slug and flips to AUTO_PUBLISHED.
    const publishResult = await step.run(
      "publish-content-piece",
      async () => {
        const { prisma } = await import("@/lib/prisma");
        const { slugify, uniqueSlug } = await import(
          "@/lib/content-factory/slug"
        );

        const piece = await prisma.contentPiece.findUnique({
          where: { id: result.pieceId! },
          select: { title: true },
        });
        if (!piece) throw new Error(`ContentPiece ${result.pieceId} not found`);

        const slug = await uniqueSlug(prisma, slugify(piece.title));
        const distributedUrl = `https://getacuity.io/blog/${slug}`;

        await prisma.contentPiece.update({
          where: { id: result.pieceId! },
          data: {
            status: "AUTO_PUBLISHED",
            slug,
            distributedAt: new Date(),
            distributedUrl,
            publishedAt: new Date(),
          },
        });

        return { pieceId: result.pieceId!, slug, distributedUrl };
      }
    );

    logger.info("[auto-blog] Published", publishResult);

    // ── Step 8: Notify Google Indexing API ───────────────────────
    await step.run("notify-google-indexing", async () => {
      try {
        const { notifyPublish } = await import("@/lib/google/indexing");
        const r = await notifyPublish(publishResult.distributedUrl);
        return { success: r.success, error: r.error };
      } catch (err) {
        console.error(
          "[auto-blog] Indexing notification failed:",
          err instanceof Error ? err.message : err
        );
        return { success: false, error: "indexing_unavailable" };
      }
    });

    // ── Step 9: Mark topic as published ─────────────────────────
    await step.run("mark-topic-published", async () => {
      const { prisma } = await import("@/lib/prisma");
      await prisma.blogTopicQueue.update({
        where: { id: topicData.id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          contentPieceId: publishResult.pieceId,
        },
      });
      return { topicId: topicData.id };
    });

    return {
      status: "published",
      pieceId: publishResult.pieceId,
      slug: publishResult.slug,
      url: publishResult.distributedUrl,
    };
  }
);

// ─── Claude call helper ─────────────────────────────────────────────────────
// Called once per attempt in its own step.run(). Writes the ContentPiece
// to the DB on success (with a staging status) so the HTML body doesn't
// need to pass through Inngest step serialization.

interface GenerateAttemptResult {
  valid: boolean;
  errors: string[];
  pieceId: string | null;
}

async function callClaudeForBlog(
  topic: {
    id: string;
    topic: string;
    persona: string;
    targetKeyword: string;
    searchIntent: string;
  },
  spotsLeft: number,
  attemptNumber: number,
  priorErrors: string[] = [],
  blogSlugs: string[] = []
): Promise<GenerateAttemptResult> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const { callClaude } = await import(
      "@/lib/content-factory/claude-client"
    );
    const { extractJson } = await import("@/lib/content-factory/generate");

    const userPrompt =
      priorErrors.length > 0
        ? buildUserPrompt(topic) +
          `\n\nIMPORTANT — your previous attempt failed validation with these errors:\n${priorErrors.map((e) => `- ${e}`).join("\n")}\nFix every issue listed above. Double-check word count, keyword placement, meta title/description character counts, and internal links before responding.`
        : buildUserPrompt(topic);

    const raw = await callClaude({
      purpose: "auto-blog-generate",
      systemPrompt: buildSystemPrompt(topic, spotsLeft, blogSlugs),
      userPrompt,
      maxTokens: 8000,
    });

    const parsed = JSON.parse(extractJson(raw)) as AutoBlogResult;
    const validation = validateBlogPost(parsed, blogSlugs);

    if (!validation.valid) {
      console.warn(
        `[auto-blog] Attempt ${attemptNumber} validation failed:`,
        validation.errors
      );
      return { valid: false, errors: validation.errors, pieceId: null };
    }

    // Write the full body to a ContentPiece now — the publish step
    // will flip its status and set slug/URL. This avoids passing
    // ~15KB of HTML through Inngest step return serialization.
    const piece = await prisma.contentPiece.create({
      data: {
        type: "BLOG",
        title: parsed.title,
        body: parsed.body,
        hook: parsed.metaDescription,
        cta: parsed.includeCta ? parsed.ctaPlacementHint : "",
        targetKeyword: parsed.primaryKeyword,
        predictedScore: 0.7,
        status: "GENERATION_FAILED", // staging status — publish step flips to AUTO_PUBLISHED
        secondaryKeywords: parsed.secondaryKeywords,
        faqSchema: parsed.faqSchema,
        foundingMemberSnapshot: spotsLeft,
      },
    });

    return { valid: true, errors: [], pieceId: piece.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[auto-blog] Attempt ${attemptNumber} generation error:`,
      msg
    );
    return { valid: false, errors: [msg], pieceId: null };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-BLOG PRUNER — uses Inngest step.run()
// ═══════════════════════════════════════════════════════════════════════════

export const autoBlogPruneFn = inngest.createFunction(
  {
    id: "auto-blog-prune",
    name: "Auto Blog — Performance Pruner",
    triggers: [{ cron: "0 3 * * *" }],
    retries: 1,
  },
  async ({ logger, step }) => {
    // ── Step 1: Fetch published blog posts ────────────────────────
    const posts = await step.run("fetch-published-posts", async () => {
      const { prisma } = await import("@/lib/prisma");
      const rows = await prisma.contentPiece.findMany({
        where: {
          type: "BLOG",
          status: { in: ["DISTRIBUTED", "AUTO_PUBLISHED"] },
          publishedAt: { not: null },
        },
        select: {
          id: true,
          slug: true,
          distributedUrl: true,
          publishedAt: true,
          targetKeyword: true,
          impressions: true,
          clicks: true,
        },
      });
      // Serialize dates for Inngest step return
      return rows.map((r) => ({
        ...r,
        publishedAt: r.publishedAt?.toISOString() ?? null,
      }));
    });

    if (posts.length === 0) {
      logger.info("[auto-blog-prune] No published posts to check");
      return { synced: 0, pruned: 0 };
    }

    // ── Step 2: Fetch GSC data ────────────────────────────────────
    const gscData = await step.run("fetch-gsc-data", async () => {
      const { getPropertyPerformance } = await import(
        "@/lib/google/search-console"
      );
      return await getPropertyPerformance(30);
    });

    if (!gscData) {
      logger.warn(
        "[auto-blog-prune] GSC data unavailable — skipping prune cycle"
      );
      return { synced: 0, pruned: 0, reason: "gsc_unavailable" };
    }

    // ── Step 3: Sync GSC data to posts ────────────────────────────
    const syncResult = await step.run("sync-gsc-data", async () => {
      const { prisma } = await import("@/lib/prisma");
      const gscByUrl = new Map(
        gscData.topPages.map((p) => [p.page, p])
      );

      const now = new Date();
      const updatedPosts: Array<{
        id: string;
        slug: string | null;
        url: string | null;
        publishedAt: string | null;
        impressions: number;
        clicks: number;
      }> = [];

      for (const post of posts) {
        const perf = post.distributedUrl
          ? gscByUrl.get(post.distributedUrl)
          : null;

        const impressions = perf?.impressions ?? 0;
        const clicks = perf?.clicks ?? 0;

        await prisma.contentPiece.update({
          where: { id: post.id },
          data: {
            impressions,
            clicks,
            lastGscSyncAt: now,
          },
        });

        updatedPosts.push({
          id: post.id,
          slug: post.slug,
          url: post.distributedUrl,
          publishedAt: post.publishedAt,
          impressions,
          clicks,
        });
      }

      return { synced: updatedPosts.length, posts: updatedPosts };
    });

    logger.info(
      `[auto-blog-prune] Synced GSC data for ${syncResult.synced} posts`
    );

    // ── Step 4: Compute prune candidates + execute ────────────────
    const pruneResult = await step.run("apply-pruning-ladder", async () => {
      const { prisma } = await import("@/lib/prisma");

      const now = new Date();
      const toPrune: Array<{
        id: string;
        slug: string | null;
        url: string | null;
        reason: string;
        impressions: number;
        clicks: number;
      }> = [];

      for (const post of syncResult.posts) {
        if (!post.publishedAt) continue;
        const publishedAt = new Date(post.publishedAt);
        const ageDays = Math.floor(
          (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (ageDays < 7) continue;

        let reason: string | null = null;

        if (ageDays >= 7 && post.impressions === 0) {
          reason = "day7";
        } else if (
          ageDays >= 30 &&
          post.impressions < 50 &&
          post.clicks < 2
        ) {
          reason = "day30";
        } else if (ageDays >= 90 && post.impressions < 200) {
          reason = "day90";
        }

        if (reason) {
          toPrune.push({
            id: post.id,
            slug: post.slug,
            url: post.url,
            reason,
            impressions: post.impressions,
            clicks: post.clicks,
          });
        }
      }

      // Cap at 5 prunes per run
      const pruneCap = 5;
      const pruneSlice = toPrune.slice(0, pruneCap);

      if (toPrune.length > pruneCap) {
        // Send notification email about overflow
        try {
          const { getResendClient } = await import("@/lib/resend");
          const resend = getResendClient();
          const overflow = toPrune.slice(pruneCap);
          await resend.emails.send({
            from: process.env.EMAIL_FROM ?? "noreply@getacuity.io",
            to: "keenan@getacuity.io",
            subject: `Auto-Blog Pruner: ${overflow.length} additional posts need review`,
            html: `<p>The auto-blog pruner hit its 5-post cap. These ${overflow.length} posts would also be pruned:</p>
              <ul>${overflow.map((p) => `<li>${p.slug} — ${p.reason} (${p.impressions} imp, ${p.clicks} clicks)</li>`).join("")}</ul>
              <p>Review at /admin?tab=auto-blog</p>`,
          });
        } catch (err) {
          console.error(
            "[auto-blog-prune] Failed to send overflow email:",
            err instanceof Error ? err.message : String(err)
          );
        }
      }

      // Find best redirect target
      const bestRedirect = await prisma.contentPiece.findFirst({
        where: {
          type: "BLOG",
          status: { in: ["DISTRIBUTED", "AUTO_PUBLISHED"] },
          slug: { not: null },
        },
        orderBy: { clicks: "desc" },
        select: { slug: true },
      });
      const redirectSlug = bestRedirect?.slug ?? null;

      const statusMap: Record<string, string> = {
        day7: "PRUNED_DAY7",
        day30: "PRUNED_DAY30",
        day90: "PRUNED_DAY90",
      };

      for (const candidate of pruneSlice) {
        const targetSlug =
          redirectSlug && redirectSlug !== candidate.slug
            ? redirectSlug
            : null;

        await prisma.contentPiece.update({
          where: { id: candidate.id },
          data: {
            status: statusMap[candidate.reason] as
              | "PRUNED_DAY7"
              | "PRUNED_DAY30"
              | "PRUNED_DAY90",
            redirectTo: targetSlug,
          },
        });

        await prisma.pruneLog.create({
          data: {
            contentPieceId: candidate.id,
            reason: candidate.reason,
            impressions: candidate.impressions,
            clicks: candidate.clicks,
            redirectedToSlug: targetSlug,
          },
        });

        // Fire-and-forget indexing notification
        if (candidate.url) {
          try {
            const { notifyUnpublish } = await import(
              "@/lib/google/indexing"
            );
            await notifyUnpublish(candidate.url);
          } catch {
            // Non-fatal
          }
        }
      }

      return {
        pruned: pruneSlice.length,
        overflow: Math.max(0, toPrune.length - pruneCap),
      };
    });

    logger.info("[auto-blog-prune] Complete", {
      synced: syncResult.synced,
      ...pruneResult,
    });

    return {
      synced: syncResult.synced,
      pruned: pruneResult.pruned,
      overflow: pruneResult.overflow,
    };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function buildSystemPrompt(
  topic: {
    topic: string;
    persona: string;
    targetKeyword: string;
    searchIntent: string;
  },
  spotsLeft: number,
  blogSlugs: string[] = []
): string {
  return `You are writing a blog post for Acuity — a voice journaling app.

PRODUCT CONTEXT:
- Users do a 60-second voice entry (called a "brain dump" in public copy, "debrief" internally)
- Brain dumps can happen any time of day — never frame as nightly/evening-only
- AI extracts tasks, tracks goals, detects mood patterns
- Weekly report every Sunday: 400-word narrative of the user's week
- Life Matrix: 6 life domains tracked over time
- Monthly memoir PDF
- Pricing: $12.99/month after 30-day free trial, no card required
- First 100 users are Founding Members (${spotsLeft} spots left)

VOICE RULES:
- Direct, specific, zero-fluff. Smart friend explaining, not marketing blog.
- Short paragraphs (max 3 sentences)
- Specifics over abstractions
- No fabricated stats — cite real linkable sources or frame qualitatively

BANNED PHRASES (never use these):
"unlock", "elevate", "journey", "transform", "AI-powered", "seamless", "game-changer",
"in today's fast-paced world", "revolutionize", "harness the power of", "empower",
"cutting-edge", "leverage", "it's not X — it's Y" constructions

NEVER frame Acuity as nightly/evening-only. Brain dumps any time of day.
"Brain dump" in public copy, "debrief" is internal-only.
Don't position the weekly report as the only value. Rotate emphasis across: task recall,
goal tracking, pattern detection, weekly reports, Life Matrix, mood scoring.

CTA POLICY:
${
    topic.searchIntent === "informational" ||
    topic.searchIntent === "problem-solving"
      ? `INCLUDE a CTA around 2/3 of the way down. Phrase as natural next step. Example: "If you've read this far, Acuity is basically what this article describes — a 60-second voice entry that pulls out your tasks and tracks the goals you keep circling. First 100 members get 30 days free. ${spotsLeft} spots left." Never CTA in first 40% of post.`
      : `NO CTA — this topic is a loose tangent. End with 2-3 internal links to related posts.`
  }

Every post (CTA or not) ends with 2-3 internal links to related posts.

INTERNAL LINKING — use at least 2 links from the lists below. ONLY use URLs from these lists. Do NOT invent or guess blog slugs.

/for/* persona pages (all valid):
${PERSONA_SLUGS.map((s) => `/for/${s}`).join(", ")}
${
  blogSlugs.length > 0
    ? `\n/blog/* posts (all valid — pick relevant ones):\n${blogSlugs.map((s) => `/blog/${s}`).join(", ")}`
    : "\nNo /blog/* posts published yet — use /for/* pages only."
}

OUTPUT FORMAT — respond with a single JSON object:
{
  "title": "Blog post title",
  "slug": "url-friendly-slug",
  "metaTitle": "50-60 character SEO title",
  "metaDescription": "140-160 character meta description",
  "heroH1": "H1 heading (include primary keyword)",
  "body": "<full HTML with h2, h3, p tags, FAQ section, internal links>",
  "estimatedReadTime": 7,
  "primaryKeyword": "${topic.targetKeyword}",
  "secondaryKeywords": ["kw1", "kw2", "kw3"],
  "faqSchema": [{"question": "Q1?", "answer": "A1"}, ...],
  "internalLinks": ["/for/slug1", "/blog/slug2"],
  "includeCta": true,
  "ctaPlacementHint": "after section 3"
}

REQUIREMENTS:
- 1,400 to 2,200 words
- Primary keyword in H1, first 100 words, and at least one H2
- At least 3 H2 sections
- At least 2 internal links to /for/* or /blog/* posts
- FAQ section with 3+ questions and answers
- Meta description: exactly 140-160 characters
- Meta title: exactly 50-60 characters
- Include JSON-LD FAQPage schema in the body HTML`;
}

function buildUserPrompt(topic: {
  topic: string;
  persona: string;
  targetKeyword: string;
  searchIntent: string;
}): string {
  return `Write a blog post about: "${topic.topic}"

Target persona: ${topic.persona}
Primary keyword: ${topic.targetKeyword}
Search intent: ${topic.searchIntent}

Write the post now. Output only the JSON object.`;
}

async function refillTopicQueue(prisma: {
  blogTopicQueue: {
    createMany: (args: {
      data: Array<{
        topic: string;
        persona: string;
        targetKeyword: string;
        searchIntent: string;
      }>;
    }) => Promise<unknown>;
  };
  contentPiece: {
    findMany: (args: {
      where: { type: string };
      select: { title: true };
    }) => Promise<Array<{ title: string }>>;
  };
}) {
  const { callClaude } = await import("@/lib/content-factory/claude-client");
  const { extractJson } = await import("@/lib/content-factory/generate");

  // Fetch existing titles to avoid duplicates
  const existingPosts = await prisma.contentPiece.findMany({
    where: { type: "BLOG" },
    select: { title: true },
  });
  const existingTitles = existingPosts.map((p) => p.title.toLowerCase());

  const raw = await callClaude({
    purpose: "auto-blog-topic-generation",
    systemPrompt: `You generate blog topic ideas for Acuity, a voice journaling app.

Each topic must target a long-tail keyword a real person would Google.
Cover diverse personas: founders, therapists, knowledge workers, ADHD, sleep-issues,
parents, students, writers, perfectionists, solopreneurs, creatives, executives,
coaches, freelancers, recovering-addicts.

Respond with a JSON array of 50 objects:
[{
  "topic": "descriptive topic title",
  "persona": "target persona (e.g., founders, adhd, students)",
  "targetKeyword": "long-tail SEO keyword",
  "searchIntent": "informational | comparison | problem-solving"
}]`,
    userPrompt: `Generate 50 unique blog topic ideas. Avoid topics similar to these existing posts:\n${existingTitles.slice(0, 30).join("\n")}`,
    maxTokens: 8000,
  });

  try {
    const topics = JSON.parse(extractJson(raw)) as Array<{
      topic: string;
      persona: string;
      targetKeyword: string;
      searchIntent: string;
    }>;

    // Filter out duplicates by keyword overlap
    const newTopics = topics.filter((t) => {
      const kw = t.targetKeyword.toLowerCase();
      return !existingTitles.some(
        (title) =>
          title.includes(kw) ||
          kw.includes(title.split(" ").slice(0, 3).join(" "))
      );
    });

    if (newTopics.length > 0) {
      await prisma.blogTopicQueue.createMany({
        data: newTopics.map((t) => ({
          topic: t.topic,
          persona: t.persona,
          targetKeyword: t.targetKeyword,
          searchIntent: t.searchIntent,
        })),
      });
      console.log(
        `[auto-blog] Refilled topic queue with ${newTopics.length} topics`
      );
    }
  } catch (err) {
    console.error(
      "[auto-blog] Failed to parse topic generation response:",
      err
    );
  }
}
