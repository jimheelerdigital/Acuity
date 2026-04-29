/**
 * Auto-Blog Pipeline — Generates and publishes one blog post daily
 * on a randomized schedule, and prunes underperformers via GSC data.
 *
 * Separated from the Content Factory (which handles tweets, TikToks,
 * ads, and Reddit drafts with manual review). Blog posts here are
 * auto-published — no human approval gate.
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
  post: AutoBlogResult
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
// AUTO-BLOG GENERATE
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
  async ({ event, step, logger }) => {
    const skipDelay = (event?.data as { skipDelay?: boolean })?.skipDelay;

    // ── Step 0: Random delay for cron-triggered runs ────────────────
    if (!skipDelay) {
      const delayMinutes = Math.floor(Math.random() * 960);
      logger.info(`[auto-blog] Sleeping ${delayMinutes} minutes before generating`);
      await step.sleep("random-delay", `${delayMinutes}m`);
    }

    // ── Step 1: Topic queue health check — refill if low ────────────
    await step.run("topic-queue-health", async () => {
      const { prisma } = await import("@/lib/prisma");
      const queuedCount = await prisma.blogTopicQueue.count({
        where: { status: "QUEUED" },
      });

      if (queuedCount < 30) {
        logger.info(
          `[auto-blog] Only ${queuedCount} topics queued — generating more`
        );
        await refillTopicQueue(prisma);
      }
      return { queuedCount };
    });

    // ── Step 2: Pick the oldest QUEUED topic, mark IN_PROGRESS ──────
    const topic = await step.run("pick-topic", async () => {
      const { prisma } = await import("@/lib/prisma");
      const t = await prisma.blogTopicQueue.findFirst({
        where: { status: "QUEUED" },
        orderBy: { createdAt: "asc" },
      });

      if (!t) return null;

      await prisma.blogTopicQueue.update({
        where: { id: t.id },
        data: { status: "IN_PROGRESS" },
      });

      // Founding member snapshot (cheap query, bundle here)
      const FOUNDING_MEMBER_CAP = 100;
      const foundingCount = await prisma.user.count({
        where: { isFoundingMember: true },
      });

      return {
        id: t.id,
        topic: t.topic,
        persona: t.persona,
        targetKeyword: t.targetKeyword,
        searchIntent: t.searchIntent,
        spotsLeft: Math.max(0, FOUNDING_MEMBER_CAP - foundingCount),
      };
    });

    if (!topic) {
      logger.warn("[auto-blog] No topics in queue — skipping generation");
      return { status: "skipped", reason: "empty_queue" };
    }

    // ── Step 3: Generate content (attempt 1) ────────────────────────
    const attempt1 = await step.run("generate-attempt-1", async () => {
      return generateAttempt(topic, topic.spotsLeft, logger, 1);
    });

    // ── Step 4: Generate content (attempt 2, if needed) ─────────────
    let result = attempt1;
    if (!result.post) {
      result = await step.run("generate-attempt-2", async () => {
        return generateAttempt(topic, topic.spotsLeft, logger, 2);
      });
    }

    // ── Step 5: Generate content (attempt 3, if needed) ─────────────
    if (!result.post) {
      result = await step.run("generate-attempt-3", async () => {
        return generateAttempt(topic, topic.spotsLeft, logger, 3);
      });
    }

    // ── All attempts failed → mark SKIPPED ──────────────────────────
    if (!result.post) {
      await step.run("mark-failed", async () => {
        const { prisma } = await import("@/lib/prisma");
        await prisma.blogTopicQueue.update({
          where: { id: topic.id },
          data: { status: "SKIPPED" },
        });

        await prisma.contentPiece.create({
          data: {
            type: "BLOG",
            title: topic.topic,
            body: `Generation failed after 3 attempts. Errors: ${(result.errors ?? []).join("; ")}`,
            hook: "",
            cta: "",
            targetKeyword: topic.targetKeyword,
            predictedScore: 0,
            status: "GENERATION_FAILED",
          },
        });
      });

      logger.error("[auto-blog] All 3 attempts failed — topic skipped", {
        topicId: topic.id,
        errors: result.errors,
      });

      return { status: "failed", topicId: topic.id, errors: result.errors };
    }

    const post = result.post;

    // ── Step 6: Publish — create ContentPiece + link topic ──────────
    const published = await step.run("publish", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { slugify, uniqueSlug } = await import(
        "@/lib/content-factory/slug"
      );

      const slug = await uniqueSlug(prisma, slugify(post.title));
      const distributedUrl = `https://getacuity.io/blog/${slug}`;

      const piece = await prisma.contentPiece.create({
        data: {
          type: "BLOG",
          title: post.title,
          body: post.body,
          hook: post.metaDescription,
          cta: post.includeCta ? post.ctaPlacementHint : "",
          targetKeyword: post.primaryKeyword,
          predictedScore: 0.7,
          status: "AUTO_PUBLISHED",
          slug,
          distributedAt: new Date(),
          distributedUrl,
          publishedAt: new Date(),
          secondaryKeywords: post.secondaryKeywords,
          faqSchema: post.faqSchema,
          foundingMemberSnapshot: topic.spotsLeft,
        },
      });

      await prisma.blogTopicQueue.update({
        where: { id: topic.id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          contentPieceId: piece.id,
        },
      });

      return { pieceId: piece.id, slug, url: distributedUrl };
    });

    // ── Step 7: Notify Google Indexing API ───────────────────────────
    await step.run("notify-indexing", async () => {
      try {
        const { notifyPublish } = await import("@/lib/google/indexing");
        await notifyPublish(published.url);
      } catch {
        // Indexing module not available — degrade gracefully
      }
    });

    logger.info("[auto-blog] Published", {
      title: post.title,
      slug: published.slug,
      url: published.url,
    });

    return {
      status: "published",
      pieceId: published.pieceId,
      slug: published.slug,
      url: published.url,
    };
  }
);

/** Single Claude generation attempt — extracted for step.run() isolation. */
async function generateAttempt(
  topic: { topic: string; persona: string; targetKeyword: string; searchIntent: string },
  spotsLeft: number,
  logger: { warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
  attemptNum: number
): Promise<{ post: AutoBlogResult | null; errors: string[] }> {
  const { callClaude } = await import("@/lib/content-factory/claude-client");
  const { extractJson } = await import("@/lib/content-factory/generate");

  try {
    const raw = await callClaude({
      purpose: "auto-blog-generate",
      systemPrompt: buildSystemPrompt(topic, spotsLeft),
      userPrompt: buildUserPrompt(topic),
      maxTokens: 8000,
    });

    const parsed = JSON.parse(extractJson(raw)) as AutoBlogResult;
    const validation = validateBlogPost(parsed);

    if (validation.valid) {
      return { post: parsed, errors: [] };
    }

    logger.warn(`[auto-blog] Attempt ${attemptNum} validation failed:`, {
      errors: validation.errors,
    });
    return { post: null, errors: validation.errors };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[auto-blog] Attempt ${attemptNum} generation error:`, {
      error: msg,
    });
    return { post: null, errors: [msg] };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-BLOG PRUNER
// ═══════════════════════════════════════════════════════════════════════════

export const autoBlogPruneFn = inngest.createFunction(
  {
    id: "auto-blog-prune",
    name: "Auto Blog — Performance Pruner",
    triggers: [{ cron: "0 3 * * *" }],
    retries: 1,
  },
  async ({ logger }) => {
    const { prisma } = await import("@/lib/prisma");
    const { getPropertyPerformance } = await import(
      "@/lib/google/search-console"
    );
    const { notifyUnpublish } = await import("@/lib/google/indexing");

    // Step 1: Fetch all published blog posts
    const posts = await prisma.contentPiece.findMany({
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

    if (posts.length === 0) {
      logger.info("[auto-blog-prune] No published posts to check");
      return { synced: 0, pruned: 0 };
    }

    // Step 2: Batch fetch GSC data
    const gscData = await getPropertyPerformance(30);

    if (!gscData) {
      logger.warn(
        "[auto-blog-prune] GSC data unavailable — skipping prune cycle"
      );
      return { synced: 0, pruned: 0, reason: "gsc_unavailable" };
    }

    // Build lookup by URL
    const gscByUrl = new Map(
      gscData.topPages.map((p) => [p.page, p])
    );

    // Step 3: Sync GSC data to each post
    const now = new Date();
    for (const post of posts) {
      const perf = post.distributedUrl
        ? gscByUrl.get(post.distributedUrl)
        : null;

      await prisma.contentPiece.update({
        where: { id: post.id },
        data: {
          impressions: perf?.impressions ?? 0,
          clicks: perf?.clicks ?? 0,
          lastGscSyncAt: now,
        },
      });

      // Update local reference for pruning decisions
      post.impressions = perf?.impressions ?? 0;
      post.clicks = perf?.clicks ?? 0;
    }

    logger.info(`[auto-blog-prune] Synced GSC data for ${posts.length} posts`);

    // Step 4: Apply pruning ladder
    const toPrune: Array<{
      id: string;
      slug: string | null;
      url: string | null;
      reason: string;
      impressions: number;
      clicks: number;
    }> = [];

    for (const post of posts) {
      if (!post.publishedAt) continue;
      const ageDays = Math.floor(
        (now.getTime() - post.publishedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (ageDays < 7) continue;

      let reason: string | null = null;

      if (ageDays >= 7 && post.impressions === 0) {
        reason = "day7";
      } else if (ageDays >= 30 && post.impressions < 50 && post.clicks < 2) {
        reason = "day30";
      } else if (ageDays >= 90 && post.impressions < 200) {
        reason = "day90";
      }

      if (reason) {
        toPrune.push({
          id: post.id,
          slug: post.slug,
          url: post.distributedUrl,
          reason,
          impressions: post.impressions,
          clicks: post.clicks,
        });
      }
    }

    // Step 5: Cap at 5 prunes per run
    const pruneCap = 5;
    const pruneSlice = toPrune.slice(0, pruneCap);

    if (toPrune.length > pruneCap) {
      logger.warn(
        `[auto-blog-prune] ${toPrune.length} posts to prune, capped at ${pruneCap}`
      );
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
        logger.error("[auto-blog-prune] Failed to send overflow email:", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Step 6: Execute prunes
    // Find the best redirect target: highest-clicks live blog post
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

    for (const candidate of pruneSlice) {
      const statusMap: Record<string, string> = {
        day7: "PRUNED_DAY7",
        day30: "PRUNED_DAY30",
        day90: "PRUNED_DAY90",
      };

      // Don't redirect to self
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

      if (candidate.url) {
        notifyUnpublish(candidate.url).catch((err) =>
          console.error("[auto-blog-prune] Indexing notification failed:", err)
        );
      }

      logger.info(`[auto-blog-prune] Pruned ${candidate.slug} — ${candidate.reason}`);
    }

    return {
      synced: posts.length,
      pruned: pruneSlice.length,
      overflow: Math.max(0, toPrune.length - pruneCap),
    };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function buildSystemPrompt(
  topic: { topic: string; persona: string; targetKeyword: string; searchIntent: string },
  spotsLeft: number
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
${topic.searchIntent === "informational" || topic.searchIntent === "problem-solving"
    ? `INCLUDE a CTA around 2/3 of the way down. Phrase as natural next step. Example: "If you've read this far, Acuity is basically what this article describes — a 60-second voice entry that pulls out your tasks and tracks the goals you keep circling. First 100 members get 30 days free. ${spotsLeft} spots left." Never CTA in first 40% of post.`
    : `NO CTA — this topic is a loose tangent. End with 2-3 internal links to related posts.`}

Every post (CTA or not) ends with 2-3 internal links to related posts.

INTERNAL LINKING — use at least 2 of these /for/* pages where relevant:
${PERSONA_SLUGS.map((s) => `/for/${s}`).join(", ")}
Also link to other /blog/* posts if you know of relevant ones.

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
    createMany: (args: { data: Array<{
      topic: string;
      persona: string;
      targetKeyword: string;
      searchIntent: string;
    }> }) => Promise<unknown>;
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
          title.includes(kw) || kw.includes(title.split(" ").slice(0, 3).join(" "))
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
      console.log(`[auto-blog] Refilled topic queue with ${newTopics.length} topics`);
    }
  } catch (err) {
    console.error("[auto-blog] Failed to parse topic generation response:", err);
  }
}
