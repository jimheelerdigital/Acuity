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
import type { PrismaClient } from "@prisma/client";

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
  // Positioning rules (docs/acuity-positioning.md): "debrief" not
  // "brain dump", no fixed-time framing, no duration claims
  "brain dump",
  "brain-dump",
  "60-second",
  "90-second",
  "nightly",
  "before bed",
  // Statistical AI tells (humanizer skill) — these mark a post as
  // machine-written to both readers and search quality systems
  "delve",
  "tapestry",
  "testament to",
  "let's dive",
  "let's explore",
  "in the heart of",
  "isn't just",
  "is not just",
  "it's not about",
  // Old product name — the product is Ripple (rebrand, Phase 1 2026-09)
  "acuity",
];

/**
 * Replace em/en dashes with ordinary punctuation. Em dashes are the
 * single strongest statistical marker of machine-written prose, and the
 * model slips them in even when told not to. Cheaper to fix than to
 * burn a retry attempt on it.
 */
function stripAiDashes(html: string): string {
  return html
    .replace(/\s+[—–]\s+/g, ", ")
    .replace(/[—–]/g, ", ");
}

// ─── Blog generation output ─────────────────────────────────────────────────

interface AutoBlogResult {
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  heroH1: string;
  body: string;
  heroImagePrompt?: string;
  estimatedReadTime: number;
  primaryKeyword: string;
  secondaryKeywords: string[];
  faqSchema: Array<{ question: string; answer: string }>;
  internalLinks: string[];
  includeCta: boolean;
  ctaPlacementHint: string;
}

// ─── Wrong-domain blocklist ────────────────────────────────────────────────

const BLOCKED_ACUITY_DOMAINS = [
  "acuity.how",
  "acuity.app",
  "acuityapp.com",
  "acuity.com",
  "useacuity.com",
  "acuityapp.io",
  "acuity.io",        // missing "get" prefix
  "www.acuity.com",
  "tryacuity.com",
];

// ─── External link verification ────────────────────────────────────────────

async function checkUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "AcuityBot/1.0 (link-check)" },
    });
    clearTimeout(timeout);
    // 405: some sites block HEAD but page exists
    // 403: auth-gated but page exists (e.g., paywalled articles)
    // 429: rate-limited but page exists
    return res.ok || res.status === 405 || res.status === 403 || res.status === 429;
  } catch {
    // Timeout or network error — treat as valid to avoid false positives
    return true;
  }
}

/**
 * Verifies external links in the post body via HEAD requests.
 * Returns the body with dead links stripped (anchor text preserved)
 * and a list of removed URLs for logging.
 */
async function verifyExternalLinks(
  body: string
): Promise<{ body: string; removedUrls: string[] }> {
  const externalLinkRegex =
    /<a\s+[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const matches = [...body.matchAll(externalLinkRegex)];

  if (matches.length === 0) return { body, removedUrls: [] };

  // Deduplicate URLs to avoid checking the same one twice
  const uniqueUrls = [...new Set(matches.map((m) => m[1]))];

  // Check all URLs in parallel (max 8 concurrent to avoid hammering)
  const results = new Map<string, boolean>();
  const batchSize = 8;
  for (let i = 0; i < uniqueUrls.length; i += batchSize) {
    const batch = uniqueUrls.slice(i, i + batchSize);
    const checks = await Promise.all(
      batch.map(async (url) => ({
        url,
        alive: await checkUrl(url),
      }))
    );
    for (const { url, alive } of checks) {
      results.set(url, alive);
    }
  }

  let cleanBody = body;
  const removedUrls: string[] = [];

  for (const match of matches) {
    const [fullTag, url, anchorText] = match;
    if (!results.get(url)) {
      // Replace the dead <a> tag with just the anchor text
      cleanBody = cleanBody.replace(fullTag, anchorText);
      removedUrls.push(url);
    }
  }

  return { body: cleanBody, removedUrls: [...new Set(removedUrls)] };
}

// ─── Validation ─────────────────────────────────────────────────────────────

function validateBlogPost(
  post: AutoBlogResult,
  validBlogSlugs: string[] = [],
  searchIntent: string = "informational"
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const textBody = post.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const wordCount = textBody.split(/\s+/).filter(Boolean).length;

  // Comparison posts need more words (feature table + multiple sections).
  // Floor raised from 540: sub-800-word templated posts were sitting in
  // "crawled - currently not indexed" — thin content at scale.
  const minWords = searchIntent === "comparison" ? 900 : 810;
  const maxWords = searchIntent === "comparison" ? 2200 : 1600;
  if (wordCount < minWords || wordCount > maxWords) {
    errors.push(`Word count ${wordCount} outside ${minWords}-${maxWords} range`);
  }

  // Keyword in H1 — soft warning, not a hard failure
  const h1Match = post.body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (
    h1Match &&
    !h1Match[1].toLowerCase().includes(post.primaryKeyword.toLowerCase())
  ) {
    warnings.push(`[soft] Primary keyword "${post.primaryKeyword}" not in H1`);
  }

  // Keyword in first 100 words — soft warning
  const first100Words = textBody.split(/\s+/).slice(0, 100).join(" ");
  if (!first100Words.toLowerCase().includes(post.primaryKeyword.toLowerCase())) {
    warnings.push(`[soft] Primary keyword "${post.primaryKeyword}" not in first 100 words`);
  }

  // At least 2 H2s — hard requirement (structural)
  const h2Matches = post.body.match(/<h2[^>]*>/gi) ?? [];
  if (h2Matches.length < 2) {
    errors.push(`Only ${h2Matches.length} H2s, need at least 2`);
  }

  // Keyword in an H2 — soft warning
  const h2KeywordMatch = (post.body.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) ?? [])
    .some((h2) => h2.toLowerCase().includes(post.primaryKeyword.toLowerCase()));
  if (!h2KeywordMatch) {
    warnings.push(`[soft] Primary keyword "${post.primaryKeyword}" not in any H2`);
  }

  // Internal links — at least 1 required (relaxed from 2)
  const internalLinkCount = (
    post.body.match(/href=["']\/(?:for|blog)\//gi) ?? []
  ).length;
  if (internalLinkCount < 1) {
    errors.push(`No internal links found, need at least 1`);
  }

  // Validate internal links against real pages
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
    // Soft warning — Claude sometimes invents plausible blog slugs
    warnings.push(
      `[soft] Internal links to non-existent pages: ${brokenLinks.join(", ")}`
    );
  }

  // Wrong-domain Ripple links — hard failure (these are always wrong)
  const allExternalLinks =
    post.body.match(/href=["'](https?:\/\/[^"']+)["']/gi) ?? [];
  const wrongDomainLinks: string[] = [];
  for (const match of allExternalLinks) {
    const href = match.replace(/^href=["']/, "").replace(/["']$/, "");
    try {
      const hostname = new URL(href).hostname.replace(/^www\./, "");
      if (BLOCKED_ACUITY_DOMAINS.some((d) => hostname === d || hostname === `www.${d}`)) {
        wrongDomainLinks.push(href);
      }
    } catch {
      // malformed URL — will be caught by external link verification
    }
  }

  if (wrongDomainLinks.length > 0) {
    errors.push(
      `Wrong Ripple domain (use internal /for/* or /blog/* paths instead): ${wrongDomainLinks.join(", ")}`
    );
  }

  // FAQ schema — soft warning (nice to have, not required)
  if (!post.faqSchema || post.faqSchema.length < 3) {
    warnings.push(
      `[soft] FAQ schema has ${post.faqSchema?.length ?? 0} Qs (target: 3+)`
    );
  }

  // Meta description — widen tolerance to 120-170 chars
  if (post.metaDescription.length < 120 || post.metaDescription.length > 170) {
    errors.push(
      `Meta description ${post.metaDescription.length} chars, need 120-170`
    );
  }

  // Meta title — widen tolerance to 40-65 chars
  if (post.metaTitle.length < 40 || post.metaTitle.length > 65) {
    errors.push(`Meta title ${post.metaTitle.length} chars, need 40-65`);
  }

  // Banned phrases — hard failure
  const bodyLower = post.body.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (bodyLower.includes(phrase.toLowerCase())) {
      errors.push(`Contains banned phrase: "${phrase}"`);
    }
  }

  // Log soft warnings for debugging (don't fail the post)
  if (warnings.length > 0) {
    console.warn("[auto-blog] Validation warnings (non-blocking):", warnings);
  }

  return { valid: errors.length === 0, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-BLOG GENERATE — uses Inngest step.run() + step.sleep()
// ═══════════════════════════════════════════════════════════════════════════

export const autoBlogGenerateFn = inngest.createFunction(
  {
    id: "auto-blog-generate",
    name: "Auto Blog — Mon/Wed/Fri Generation",
    triggers: [
      // Phase 2 (2026-09-23): 3 posts/week instead of 7. Volume without
      // demand data buried the blog in zero-impression posts (Phase 1
      // pruned 50 of them); fewer, GSC-grounded posts rank better.
      { cron: "0 6 * * 1,3,5" },
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
      // Phase 2: 3 posts/week — refill when under ~3 weeks of runway.
      // (Was 30 when we published daily; a GSC-grounded refill yields
      // ~25 topics, so a 30 threshold would refire every run.)
      if (queuedCount < 10) {
        await refillTopicQueue(prisma);
      }
      return { queuedCount };
    });

    // ── Step 3: Pick next topic ─────────────────────────────────
    const topicData = await step.run("pick-next-topic", async () => {
      const { prisma } = await import("@/lib/prisma");
      // Prefer topics with scheduledFor <= now, then fall back to oldest queued
      const topic = await prisma.blogTopicQueue.findFirst({
        where: {
          status: "QUEUED",
          scheduledFor: { lte: new Date() },
        },
        orderBy: { scheduledFor: "asc" },
      }) ?? await prisma.blogTopicQueue.findFirst({
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
        const distributedUrl = `https://goripple.io/blog/${slug}`;

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

    // ── Step 7b: Generate hero image via DALL-E + Supabase ──────
    // Runs after publish so the post goes live immediately even if
    // image generation is slow or fails. heroImageUrl is backfilled.
    const heroImagePrompt = result.heroImagePrompt;
    if (heroImagePrompt) {
      await step.run("generate-hero-image", async () => {
        const { generateAndStoreBlogImage } = await import(
          "@/lib/blog-image"
        );
        const imageUrl = await generateAndStoreBlogImage(
          publishResult.slug,
          heroImagePrompt
        );
        if (imageUrl) {
          const { prisma } = await import("@/lib/prisma");
          await prisma.contentPiece.update({
            where: { id: publishResult.pieceId },
            data: { heroImageUrl: imageUrl },
          });
          logger.info("[auto-blog] Hero image saved", { imageUrl });
        } else {
          logger.warn("[auto-blog] Hero image generation failed — post published without image");
        }
        return { imageUrl };
      });
    }

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
  heroImagePrompt?: string;
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
    // Safety net: the prompt bans em/en dashes, but strip any that slip
    // through before validation so published HTML never carries them.
    parsed.body = stripAiDashes(parsed.body);
    parsed.title = stripAiDashes(parsed.title);
    parsed.heroH1 = stripAiDashes(parsed.heroH1);
    parsed.metaTitle = stripAiDashes(parsed.metaTitle);
    parsed.metaDescription = stripAiDashes(parsed.metaDescription);
    const validation = validateBlogPost(parsed, blogSlugs, topic.searchIntent);

    if (!validation.valid) {
      console.warn(
        `[auto-blog] Attempt ${attemptNumber} validation failed:`,
        validation.errors
      );
      return { valid: false, errors: validation.errors, pieceId: null };
    }

    // Verify external links — strip any dead ones rather than failing
    const { body: verifiedBody, removedUrls } = await verifyExternalLinks(
      parsed.body
    );
    if (removedUrls.length > 0) {
      console.warn(
        `[auto-blog] Attempt ${attemptNumber}: stripped ${removedUrls.length} dead external links:`,
        removedUrls
      );
    }

    // Write the full body to a ContentPiece now — the publish step
    // will flip its status and set slug/URL. This avoids passing
    // ~15KB of HTML through Inngest step return serialization.
    const piece = await prisma.contentPiece.create({
      data: {
        type: "BLOG",
        title: parsed.title,
        body: verifiedBody,
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

    return {
      valid: true,
      errors: [],
      pieceId: piece.id,
      heroImagePrompt: parsed.heroImagePrompt,
    };
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
//
// Evaluates published blog posts for trimming based on:
// 1. Age threshold: 56+ days since publish (8 weeks gives Google ample
//    time to crawl, index, and surface impressions before we evaluate)
// 2. URL Inspection API: only trim posts confirmed as "crawled_not_indexed"
// 3. Three-tier action: improve / consolidate / trim
// 4. Dry-run mode (default for first 14 days): logs what it WOULD do
//    without taking any action on posts
// ═══════════════════════════════════════════════════════════════════════════

// ─── ICP keywords for "improve" classification ────────────────────────────
// Posts matching these keywords target Ripple's ideal customer profiles and
// should be flagged for manual rewrite rather than trimmed.
const ICP_KEYWORDS = [
  "founder", "founders", "entrepreneur", "startup",
  "knowledge worker", "remote work", "productivity",
  "adhd", "anxiety", "mental health", "burnout", "stress",
  "journaling", "journal", "voice journal", "brain dump",
  "reflection", "self-awareness", "mindfulness",
  "therapist", "therapy", "counseling",
  "goal", "goals", "goal tracking", "habit",
  "creative", "creatives", "writer", "writing",
  "freelancer", "solopreneur", "manager",
  "student", "nurse", "teacher", "coach",
  "sleep", "insomnia", "mood", "mood tracking",
  "weekly review", "weekly report", "life review",
];

/**
 * Check if a post's content matches Ripple's ICP topics.
 * Uses a simple keyword heuristic against title, slug, and targetKeyword.
 */
function matchesIcp(post: {
  slug: string | null;
  title?: string;
  targetKeyword?: string | null;
}): boolean {
  const text = [
    post.slug ?? "",
    post.title ?? "",
    post.targetKeyword ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return ICP_KEYWORDS.some((kw) => text.includes(kw));
}

export const autoBlogPruneFn = inngest.createFunction(
  {
    id: "auto-blog-prune",
    name: "Auto Blog — Performance Pruner (v2)",
    triggers: [{ cron: "0 3 * * *" }],
    retries: 1,
  },
  async ({ logger, step }) => {
    const isDryRun = process.env.BLOG_PRUNER_DRY_RUN !== "false";

    // ── Step 0: Auth pre-check ────────────────────────────────────
    const authCheck = await step.run("auth-precheck", async () => {
      const raw = process.env.GA4_SERVICE_ACCOUNT_KEY;
      if (!raw) {
        return { ok: false as const, error: "GA4_SERVICE_ACCOUNT_KEY env var not set", email: "" };
      }
      try {
        const creds = JSON.parse(raw);
        if (!creds.client_email || !creds.private_key) {
          return { ok: false as const, error: "GA4_SERVICE_ACCOUNT_KEY missing client_email or private_key", email: "" };
        }
        return { ok: true as const, error: "", email: creds.client_email as string };
      } catch {
        return { ok: false as const, error: "GA4_SERVICE_ACCOUNT_KEY is not valid JSON", email: "" };
      }
    });

    if (!authCheck.ok) {
      const authError = authCheck.error;
      // Log auth failure to BlogPrunerRun and alert
      await step.run("log-auth-failure", async () => {
        const { prisma } = await import("@/lib/prisma");
        await prisma.blogPrunerRun.create({
          data: {
            postId: "N/A",
            postUrl: null,
            daysSincePublish: 0,
            coverageState: null,
            recommendedAction: "none",
            actualActionTaken: null,
            isDryRun,
            runStatus: "auth_failure",
          },
        });

        // Alert via webhook or email if configured
        const webhookUrl = process.env.SLACK_WEBHOOK_URL;
        const alertEmail = process.env.ALERT_EMAIL;

        if (webhookUrl) {
          try {
            await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: `🚨 Blog Pruner auth failure: ${authError}. The pruner cannot run until this is fixed. Check Vercel env vars.`,
              }),
            });
          } catch {
            // Non-fatal
          }
        }

        if (alertEmail) {
          try {
            const { sendEmailOrThrow } = await import("@/lib/resend");
            await sendEmailOrThrow({
              from: process.env.EMAIL_FROM ?? "noreply@goripple.io",
              to: alertEmail,
              subject: "Blog Pruner: Auth Failure — cannot run",
              html: `<p>The blog pruner failed its auth pre-check:</p><p><strong>${authError}</strong></p><p>Fix: ensure GA4_SERVICE_ACCOUNT_KEY is set in Vercel env vars with valid JSON containing client_email and private_key. The service account must be added as Owner in Google Search Console for sc-domain:goripple.io.</p>`,
            });
          } catch {
            // Non-fatal
          }
        }
      });

      logger.error("[auto-blog-prune] Auth pre-check failed", {
        error: authError,
      });
      return { status: "auth_failure", error: authError };
    }

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
          title: true,
          distributedUrl: true,
          publishedAt: true,
          targetKeyword: true,
          impressions: true,
          clicks: true,
        },
      });
      return rows.map((r) => ({
        ...r,
        publishedAt: r.publishedAt?.toISOString() ?? null,
      }));
    });

    if (posts.length === 0) {
      logger.info("[auto-blog-prune] No published posts to check");
      return { synced: 0, evaluated: 0, actions: {} };
    }

    // ── Step 2: Fetch GSC performance data ────────────────────────
    const gscData = await step.run("fetch-gsc-data", async () => {
      const { getPropertyPerformance } = await import(
        "@/lib/google/search-console"
      );
      try {
        return await getPropertyPerformance(30);
      } catch (err) {
        console.error("[auto-blog-prune] GSC fetch failed:", err);
        return null;
      }
    });

    if (!gscData) {
      // Log as auth failure — GSC returned null means credentials aren't working
      await step.run("log-gsc-failure", async () => {
        const { prisma } = await import("@/lib/prisma");
        await prisma.blogPrunerRun.create({
          data: {
            postId: "N/A",
            postUrl: null,
            daysSincePublish: 0,
            coverageState: null,
            recommendedAction: "none",
            actualActionTaken: null,
            isDryRun,
            runStatus: "auth_failure",
          },
        });
      });
      logger.warn(
        "[auto-blog-prune] GSC data unavailable — skipping prune cycle"
      );
      return { synced: 0, evaluated: 0, reason: "gsc_unavailable" };
    }

    // ── Step 3: Sync GSC data to posts ────────────────────────────
    const syncResult = await step.run("sync-gsc-data", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { normalizeGscUrl } = await import("@/lib/google/search-console");
      const gscByUrl = new Map(
        gscData.topPages.map((p) => [normalizeGscUrl(p.page), p])
      );

      const now = new Date();
      const updatedPosts: Array<{
        id: string;
        slug: string | null;
        title: string;
        url: string | null;
        publishedAt: string | null;
        targetKeyword: string | null;
        impressions: number;
        clicks: number;
      }> = [];

      for (const post of posts) {
        const normalizedUrl = post.distributedUrl
          ? normalizeGscUrl(post.distributedUrl)
          : null;
        const perf = normalizedUrl
          ? gscByUrl.get(normalizedUrl)
          : null;

        const impressions = perf?.impressions ?? 0;
        const clicks = perf?.clicks ?? 0;
        const ctr = perf?.ctr ?? 0;
        const avgPosition = perf?.position ?? 0;

        await prisma.contentPiece.update({
          where: { id: post.id },
          data: {
            impressions,
            clicks,
            ctr,
            avgPosition,
            lastGscSyncAt: now,
          },
        });

        updatedPosts.push({
          id: post.id,
          slug: post.slug,
          title: post.title,
          url: post.distributedUrl,
          publishedAt: post.publishedAt,
          targetKeyword: post.targetKeyword,
          impressions,
          clicks,
        });
      }

      return { synced: updatedPosts.length, posts: updatedPosts };
    });

    logger.info(
      `[auto-blog-prune] Synced GSC data for ${syncResult.synced} posts`
    );

    // ── Step 4: Filter to candidates (56+ days, low impressions) ──
    const candidates = await step.run("identify-candidates", async () => {
      const now = new Date();
      // Minimum age: 56 days (8 weeks). Gives Google ample time to crawl,
      // index, and surface impressions before we evaluate for pruning.
      const MIN_AGE_DAYS = 56;

      return syncResult.posts
        .filter((post) => {
          if (!post.publishedAt) return false;
          const publishedAt = new Date(post.publishedAt);
          const ageDays = Math.floor(
            (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24)
          );
          // Only evaluate posts that are 56+ days old AND have < 5 impressions
          return ageDays >= MIN_AGE_DAYS && post.impressions < 5;
        })
        .map((post) => {
          const publishedAt = new Date(post.publishedAt!);
          const ageDays = Math.floor(
            (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24)
          );
          return { ...post, ageDays };
        });
    });

    if (candidates.length === 0) {
      logger.info("[auto-blog-prune] No trim candidates (all posts healthy or < 56 days old)");
      return { synced: syncResult.synced, evaluated: 0, actions: {} };
    }

    // ── Step 5: URL Inspection API — check coverage state ─────────
    const inspectionResults = await step.run(
      "inspect-candidate-urls",
      async () => {
        const { batchInspectUrls } = await import(
          "@/lib/google/url-inspection"
        );
        const urls = candidates
          .map((c) => c.url)
          .filter((u): u is string => u !== null);

        if (urls.length === 0) return {};

        const results = await batchInspectUrls(urls);
        // Serialize Map for Inngest step return
        const serialized: Record<
          string,
          { coverageState: string; error?: string }
        > = {};
        for (const [url, result] of results) {
          serialized[url] = {
            coverageState: result.coverageState,
            error: result.error,
          };
        }
        return serialized;
      }
    );

    // ── Step 6: Classify actions + log to BlogPrunerRun ───────────
    const evaluationResult = await step.run(
      "evaluate-and-log",
      async () => {
        const { prisma } = await import("@/lib/prisma");

        const actions = {
          improve: 0,
          consolidate: 0,
          trim: 0,
          keep: 0,
          unknown: 0,
        };

        const trimCandidates: Array<{
          id: string;
          slug: string | null;
          url: string | null;
          ageDays: number;
          impressions: number;
          clicks: number;
        }> = [];

        for (const candidate of candidates) {
          const inspection = candidate.url
            ? inspectionResults[candidate.url]
            : null;
          const coverageState = inspection?.coverageState ?? "unknown";

          let recommendedAction: string;

          if (coverageState === "indexed") {
            // Google has it indexed — keep regardless of low impressions
            recommendedAction = "keep";
            actions.keep++;
          } else if (coverageState === "discovered_not_indexed") {
            // Not yet crawled — just wait
            recommendedAction = "keep";
            actions.keep++;
          } else if (coverageState === "crawled_not_indexed") {
            // THE trim signal — Google saw it and rejected it.
            // Decide: improve, consolidate, or trim
            if (matchesIcp(candidate)) {
              // Targets our ICP — worth rewriting, not deleting
              recommendedAction = "improve";
              actions.improve++;
            } else {
              // Off-topic or low quality — eligible for trim
              recommendedAction = "trim";
              actions.trim++;
              trimCandidates.push(candidate);
            }
          } else if (coverageState === "excluded") {
            // Already excluded by policy — no action needed
            recommendedAction = "keep";
            actions.keep++;
          } else {
            // Unknown state — flag for manual review
            recommendedAction = "unknown";
            actions.unknown++;
          }

          // Log every evaluated candidate to BlogPrunerRun
          await prisma.blogPrunerRun.create({
            data: {
              postId: candidate.id,
              postUrl: candidate.url,
              postSlug: candidate.slug,
              daysSincePublish: candidate.ageDays,
              coverageState,
              impressions: candidate.impressions,
              clicks: candidate.clicks,
              recommendedAction,
              wouldTrimAt: recommendedAction === "trim" ? new Date() : null,
              actualActionTaken: isDryRun ? null : undefined,
              isDryRun,
              runStatus: "evaluated",
            },
          });
        }

        return { actions, trimCandidates };
      }
    );

    logger.info("[auto-blog-prune] Evaluation complete", {
      isDryRun,
      ...evaluationResult.actions,
    });

    // ── Step 7: Execute trim actions (skipped in dry-run mode) ────
    if (isDryRun) {
      logger.info(
        "[auto-blog-prune] DRY RUN — no actions taken. Set BLOG_PRUNER_DRY_RUN=false to enable."
      );
      return {
        synced: syncResult.synced,
        evaluated: candidates.length,
        isDryRun: true,
        actions: evaluationResult.actions,
      };
    }

    // Live mode — execute trims (cap at 5 per run)
    const trimResult = await step.run("execute-trims", async () => {
      const { prisma } = await import("@/lib/prisma");

      const pruneCap = 5;
      const toTrim = evaluationResult.trimCandidates.slice(0, pruneCap);

      if (evaluationResult.trimCandidates.length > pruneCap) {
        // Overflow notification
        try {
          const { sendEmailOrThrow } = await import("@/lib/resend");
          const overflow = evaluationResult.trimCandidates.slice(pruneCap);
          await sendEmailOrThrow({
            from: process.env.EMAIL_FROM ?? "noreply@goripple.io",
            to: process.env.ALERT_EMAIL ?? "keenan@getacuity.io",
            subject: `Blog Pruner: ${overflow.length} additional posts need review`,
            html: `<p>The blog pruner hit its 5-post cap. These ${overflow.length} posts would also be trimmed:</p>
              <ul>${overflow.map((p) => `<li>${p.slug} — ${p.ageDays} days old (${p.impressions} imp, ${p.clicks} clicks)</li>`).join("")}</ul>
              <p>Review at /admin/blog-pruner-log</p>`,
          });
        } catch (err) {
          console.error(
            "[auto-blog-prune] Failed to send overflow email:",
            err instanceof Error ? err.message : String(err)
          );
        }
      }

      let trimmed = 0;

      for (const candidate of toTrim) {
        // Mark as TRIMMED — the blog route will return 410 Gone
        await prisma.contentPiece.update({
          where: { id: candidate.id },
          data: {
            status: "TRIMMED",
            redirectTo: null, // No redirect — 410 Gone instead
          },
        });

        await prisma.pruneLog.create({
          data: {
            contentPieceId: candidate.id,
            reason: `trim_crawled_not_indexed_day${candidate.ageDays}`,
            impressions: candidate.impressions,
            clicks: candidate.clicks,
            redirectedToSlug: null,
          },
        });

        // Update the BlogPrunerRun record with actual action
        await prisma.blogPrunerRun.updateMany({
          where: {
            postId: candidate.id,
            isDryRun: false,
            actualActionTaken: null,
          },
          data: { actualActionTaken: "trimmed_410" },
        });

        // Notify Google Indexing API
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

        trimmed++;
      }

      return {
        trimmed,
        overflow: Math.max(
          0,
          evaluationResult.trimCandidates.length - pruneCap
        ),
      };
    });

    logger.info("[auto-blog-prune] Complete", {
      synced: syncResult.synced,
      evaluated: candidates.length,
      ...trimResult,
      actions: evaluationResult.actions,
    });

    return {
      synced: syncResult.synced,
      evaluated: candidates.length,
      isDryRun: false,
      trimmed: trimResult.trimmed,
      overflow: trimResult.overflow,
      actions: evaluationResult.actions,
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
  const currentYear = new Date().getFullYear();

  return `You are writing a blog post for Ripple, a voice self-reflection app, published under the byline of Keenan Assaraf (cofounder). Write it the way a sharp, busy founder writes on his own blog: direct, specific, occasionally first person, with real opinions.

CURRENT YEAR: ${currentYear}. Never reference ${currentYear - 1} or ${currentYear - 2} as the current year. All "best of" or "top X in [year]" content must use ${currentYear}. Do not use outdated years in titles, headings, or body copy.

PRODUCT CONTEXT:
- Users record a "debrief": they talk, out loud, any time of day, about whatever is in their head
- Ripple transcribes it, pulls out the to-dos, quietly tracks goals they mention, scores mood, and surfaces patterns across weeks
- Life Matrix: six life domains tracked over time
- Weekly report every Sunday: a written narrative of the user's week
- Ripple is a mirror, not a coach. It reflects the user back to themselves. It never advises or lectures. Copy about Ripple must do the same: describe, never preach.
- Call the voice entry a "debrief". NEVER call it a "brain dump".
- Never claim a recording length ("60-second", "two-minute"). Never frame it as a night or bedtime habit. Any time of day.
- Do not state pricing or "founding member" scarcity in the post body. Evergreen posts outlive prices and promos, and stale claims read as neglect.

WHO READS THIS:
The paying audience is mostly women around 40 to 50 carrying a heavy mental load: work, family, aging parents, the invisible labor of running other people's lives. They have tried journaling and quit because typing felt like one more chore. Write to a specific person with a full head, not to "users" or "professionals". If the assigned persona differs (a therapist, a founder, a student), keep the same register: capable, busy, tired of tracking everything in their head.

HOW TO WRITE LIKE A PERSON (hard rules, checked by an editor):
- No em dashes or en dashes anywhere. Use commas, periods, colons, or parentheses.
- Vary sentence length. Some short. Some that run longer because the thought needs the room. A uniform mid-length cadence is the fastest way to sound like a machine.
- Vary paragraph shape. Some one sentence, some three or four. Do not cap every paragraph at two sentences.
- No "It's not X, it's Y" or "not just X but Y" constructions.
- No forced groups of three ("clarity, calm, and control").
- Use plain verbs. "Is", "has", "does". Not "serves as", "boasts", "represents".
- No -ing analysis tails ("...highlighting the importance of self-reflection").
- No section that just restates its heading in the first sentence.
- No generic hopeful endings ("The future looks bright"). End on the last concrete, useful point.
- Sentence-case headings ("Why your to-do list keeps failing"), never Title Case.
- At least one concrete, specific scenario per post: a named situation with real details (the car pickup line, the 6:40am kitchen, the inbox at 9pm), not "imagine a busy professional".
- One first-person aside is welcome where it fits ("I resisted this for a year", "this is the part I got wrong"). Zero is fine too. More than two is forced.
- An opinion is allowed and encouraged. Take a side. Say what does not work and why.
- No fabricated stats, no "studies show" without a real linked source, no invented user quotes.

BANNED PHRASES (never use these):
"unlock", "elevate", "journey", "transform", "AI-powered", "seamless", "game-changer",
"in today's fast-paced world", "revolutionize", "harness the power of", "empower",
"cutting-edge", "leverage", "brain dump", "delve", "tapestry", "testament to",
"let's dive", "let's explore", "in the heart of", "nightly", "before bed", "Acuity"
(The product's old name was "Acuity". It must never appear; the product is Ripple.)

TITLE RULES:
- Do NOT use the template "How [persona] can use [thing] to [outcome]". Half the archive already looks like that, and Google reads a wall of same-shaped titles as machine output.
- Match the title to the search intent: a question people type, a claim you defend, a specific list, a mistake and its fix. Examples of shapes (do not copy verbatim): "Why your...", "The [x] that...", "[Thing] vs [thing]:...", "What actually happens when...", "Stop [doing x]. Do [y] instead."
- Title case is fine for titles; keep headings inside the post sentence case.

Don't position the weekly report as the only value. Rotate emphasis across: task recall,
goal tracking, pattern detection, weekly reports, Life Matrix, mood scoring.

CTA POLICY:
${
    topic.searchIntent === "comparison"
      ? `This is a COMPARISON post. Follow this exact structure:
1. Short intro (2-3 sentences: who both apps are for)
2. Feature comparison TABLE in HTML: side-by-side columns comparing voice input, AI extraction, task tracking, mood tracking, pattern detection, weekly reports, free trial, platforms. Use <table> with clear headers. Do not put prices in the table; prices go stale.
3. Section "Where [competitor] wins": be honest and fair. Never trash them. This builds trust.
4. Section "Where Ripple wins": talking instead of typing, automatic task extraction from a debrief, the weekly narrative report, Life Matrix, pattern detection.
5. Section "Who should choose [competitor]": be genuine about their strengths
6. Section "Who should choose Ripple": people who quit journaling because writing felt like work, people who want patterns surfaced automatically
7. CTA at bottom: a plain sentence linking to /start, e.g. "Try Ripple free for 7 days. No card required."
8. FAQ section with 3-4 comparison questions
IMPORTANT: Do NOT fabricate competitor features or pricing. If unsure, say "check their website for current pricing." Be fair and honest. Readers respect balanced comparisons.`
      : topic.searchIntent === "informational" ||
        topic.searchIntent === "problem-solving"
        ? `INCLUDE one CTA around 2/3 of the way down, phrased as a natural next step in the writer's own words. Something like: "This is roughly what Ripple does: you talk for a bit, it pulls out the tasks and tracks the goals you keep circling. There's a 7-day free trial, no card required." Link to /start. No urgency, no scarcity, no member counts. Never place the CTA in the first 40% of the post.`
        : `NO CTA. This topic is a loose tangent. End with 2-3 internal links to related posts.`
  }

Every post (CTA or not) ends with 2-3 internal links to related posts.

INTERNAL LINKING — use at least 2 links from the lists below. ONLY use URLs from these lists. Do NOT invent or guess internal link paths.

/for/* persona pages (all valid):
${PERSONA_SLUGS.map((s) => `/for/${s}`).join(", ")}
${
  blogSlugs.length > 0
    ? `\n/blog/* posts (all valid — pick relevant ones):\n${blogSlugs.map((s) => `/blog/${s}`).join(", ")}`
    : "\nNo /blog/* posts published yet — use /for/* pages only."
}

EXTERNAL CITATIONS — link to 2-4 authoritative external sources per post to support claims. Good sources: peer-reviewed studies, university pages (.edu), government health sites (.gov), established publications (NYT, HBR, Psychology Today, etc.), official documentation.
Rules for external links:
- Every external link must use the EXACT, full URL you are confident exists (e.g., https://www.apa.org/monitor/2023/06/cover-story-expressive-writing)
- Prefer homepage-level or well-known permalink URLs that are unlikely to break (e.g., https://www.psychologytoday.com rather than a deeply nested article you are not sure exists)
- NEVER link to goripple.io as an external link — all Ripple links must be internal (/for/*, /blog/*)
- NEVER use these wrong domains for Ripple: acuity.how, acuity.app, acuityapp.com, acuity.com, useacuity.com
- All external links must open in a new tab: target="_blank" rel="noopener noreferrer"
- If you are not 100% certain a URL exists, do NOT include it. A post with zero external links is better than a post with broken external links.

OUTPUT FORMAT — respond with a single JSON object:
{
  "title": "Blog post title",
  "slug": "url-friendly-slug",
  "metaTitle": "50-60 character SEO title",
  "metaDescription": "140-160 character meta description",
  "heroH1": "H1 heading (include primary keyword)",
  "body": "<full HTML with h2, h3, p tags, FAQ section, internal links>",
  "heroImagePrompt": "A concise image prompt (1-2 sentences) for a hero image. Abstract, editorial style — no text, no logos, no faces. Moody lighting, muted purple/indigo tones on dark background. Should evoke the post's theme visually.",
  "estimatedReadTime": 7,
  "primaryKeyword": "${topic.targetKeyword}",
  "secondaryKeywords": ["kw1", "kw2", "kw3"],
  "faqSchema": [{"question": "Q1?", "answer": "A1"}, ...],
  "internalLinks": ["/for/slug1", "/blog/slug2"],
  "includeCta": true,
  "ctaPlacementHint": "after section 3"
}

REQUIREMENTS:
- 900 to 1,400 words. Thin posts get crawled and skipped; padded posts get skipped too. Every section has to earn its place.
- Primary keyword in H1, first 100 words, and at least one H2
- At least 3 H2 sections, sentence case
- At least 2 internal links to /for/* or /blog/* posts (from the lists above ONLY)
- 2-4 external citations to authoritative sources (with target="_blank" rel="noopener noreferrer")
- FAQ section with 3+ questions and answers (visible HTML in the body; the schema goes ONLY in the faqSchema JSON field, never as a script tag in the body)
- Meta description: exactly 140-160 characters
- Meta title: exactly 50-60 characters`;
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

/**
 * Phase 2 (2026-09-23): topics are grounded in real GSC demand, not pure
 * brainstorm. Phase 1 pruned 50 zero-impression posts whose topics were
 * Claude-invented with no demand data; this prevents regrowing that tail.
 *
 * 1. Pull 90d queries from both GSC properties, aggregate impressions.
 * 2. Drop branded queries and queries an existing post already targets.
 * 3. Feed the top uncovered real queries to Claude; each topic must
 *    anchor to one of them (sourceQuery is recorded in searchIntent-
 *    adjacent metadata via targetKeyword).
 * 4. If GSC fails or demand is thin, fall back to the old brainstorm.
 */
async function pullUncoveredQueries(
  prisma: PrismaClient
): Promise<Array<{ query: string; impressions: number; clicks: number; position: number }>> {
  const { google } = await import("googleapis");
  const { getGoogleAuthClient } = await import("@/lib/google/auth");
  const auth = getGoogleAuthClient([
    "https://www.googleapis.com/auth/webmasters.readonly",
  ]);
  if (!auth) throw new Error("No Google auth client (GA4_SERVICE_ACCOUNT_KEY)");
  const sc = google.searchconsole({ version: "v1", auth });
  const end = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  const start = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);

  const agg = new Map<string, { impressions: number; clicks: number; posW: number }>();
  for (const prop of ["sc-domain:goripple.io", "sc-domain:getacuity.io"]) {
    try {
      const res = await sc.searchanalytics.query({
        siteUrl: prop,
        requestBody: { startDate: start, endDate: end, dimensions: ["query"], rowLimit: 1000 },
      });
      for (const row of res.data.rows ?? []) {
        const query = row.keys?.[0]?.toLowerCase().trim();
        if (!query) continue;
        const cur = agg.get(query) ?? { impressions: 0, clicks: 0, posW: 0 };
        cur.impressions += row.impressions ?? 0;
        cur.clicks += row.clicks ?? 0;
        cur.posW += (row.position ?? 0) * (row.impressions ?? 0);
        agg.set(query, cur);
      }
    } catch (err) {
      console.warn(`[auto-blog] GSC pull failed for ${prop}:`, err);
    }
  }

  // Queries an existing post already targets (keyword or title overlap)
  const existing = await prisma.contentPiece.findMany({
    where: { type: "BLOG", status: { in: ["DISTRIBUTED", "AUTO_PUBLISHED"] } },
    select: { title: true, targetKeyword: true },
  });
  const covered = existing.flatMap((p) =>
    [p.title, p.targetKeyword].filter((s): s is string => !!s).map((s) => s.toLowerCase())
  );
  const branded = /\b(ripple|goripple|acuity|getacuity)\b/;

  return [...agg.entries()]
    .filter(([query]) => {
      if (branded.test(query)) return false;
      if (query.split(/\s+/).length < 3) return false; // head terms: 12-month play, not topic fodder
      return !covered.some((c) => c.includes(query) || query.includes(c));
    })
    .map(([query, v]) => ({
      query,
      impressions: v.impressions,
      clicks: v.clicks,
      position: v.impressions ? v.posW / v.impressions : 0,
    }))
    .filter((q) => q.impressions >= 2)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 60);
}

async function refillTopicQueue(prisma: PrismaClient) {
  const { callClaude } = await import("@/lib/content-factory/claude-client");
  const { extractJson } = await import("@/lib/content-factory/generate");

  // Fetch existing titles to avoid duplicates
  const existingPosts = await prisma.contentPiece.findMany({
    where: { type: "BLOG" },
    select: { title: true },
  });
  const existingTitles = existingPosts.map((p) => p.title.toLowerCase());

  // ── Demand-first path: ground topics in real uncovered GSC queries ──
  let demandQueries: Awaited<ReturnType<typeof pullUncoveredQueries>> = [];
  try {
    demandQueries = await pullUncoveredQueries(prisma);
  } catch (err) {
    console.warn("[auto-blog] GSC demand pull failed, falling back to brainstorm:", err);
  }
  const demandGrounded = demandQueries.length >= 10;

  const demandBlock = demandGrounded
    ? `REAL GOOGLE QUERIES the site already earns impressions for but has NO post targeting (90 days, both current and legacy domains). These are proven demand. EVERY topic must anchor to one of these queries (or a close variant a searcher would also type):
${demandQueries.map((q) => `- "${q.query}" — ${q.impressions} impressions, ${q.clicks} clicks, avg position ${q.position.toFixed(0)}`).join("\n")}

For each topic, set "targetKeyword" to the exact real query it targets (or the closest natural phrasing). Prioritize higher-impression queries. Generate ${Math.min(25, demandQueries.length)} topics, one per distinct query cluster; do not force weak queries into topics.`
    : "";

  const raw = await callClaude({
    purpose: demandGrounded
      ? "auto-blog-topic-generation-gsc"
      : "auto-blog-topic-generation",
    systemPrompt: `You generate blog topic ideas for Ripple, a voice self-reflection app. You talk instead of typing; it pulls out your tasks, tracks your goals and mood, and writes a weekly report on your patterns.

PRIMARY AUDIENCE (at least 60% of topics): women roughly 40 to 50 carrying a heavy mental load. Work, kids' schedules, aging parents, the invisible labor of remembering everything for everyone. They have tried journaling and quit because typing felt like one more chore. Topics for them live in mental load, overwhelm, dropped balls, journaling that never sticks, remembering commitments, feeling scattered.

SECONDARY (the rest): ADHD adults, burned-out professionals, new parents, caregivers, therapists recommending tools to clients. Same register: capable, busy, tired of tracking life in their head.

TOPIC RULES:
- Each topic targets a long-tail keyword a real person would type into Google. Think questions ("why do I forget things I said I'd do"), specific problems ("journaling apps for people who hate writing"), and comparisons.
- Vary the title shape. Questions, claims, mistakes-and-fixes, "X vs Y", "what actually happens when...". Do NOT produce a list of 50 titles shaped "How [persona] can use [thing] to [outcome]".
- No topic should require fabricating statistics or medical claims to write well.
- Mix search intents: mostly informational and problem-solving, a few comparisons against real journaling/notes apps (Day One, Reflectly, Notion, Apple Notes, voice memos).

Respond with a JSON array of objects:
[{
  "topic": "descriptive topic title",
  "persona": "target persona (e.g., mental-load, adhd, new-parents, caregivers)",
  "targetKeyword": "long-tail SEO keyword",
  "searchIntent": "informational | comparison | problem-solving"
}]`,
    userPrompt: demandGrounded
      ? `${demandBlock}\n\nAvoid topics similar to these existing posts:\n${existingTitles.slice(0, 30).join("\n")}`
      : `Generate 25 unique blog topic ideas. Avoid topics similar to these existing posts:\n${existingTitles.slice(0, 30).join("\n")}`,
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
