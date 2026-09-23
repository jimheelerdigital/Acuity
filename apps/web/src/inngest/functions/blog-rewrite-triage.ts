/**
 * Phase 1 approved rewrite queue (Keenan sign-off 2026-09-23): 41 posts
 * with real GSC demand but weak targeting. Runs in prod via Inngest
 * because the working ANTHROPIC_API_KEY only exists in Vercel.
 *
 * For each post, Claude Opus rewrites the title/meta to target the
 * queries the post ACTUALLY gets impressions for, and restructures the
 * body: clean h2/h3 hierarchy, comparison tables, short paragraphs,
 * house voice, Ripple branding, FAQ block.
 *
 * Writes to finalBody (original body preserved in `body`). Meta
 * description is embedded as a <meta name="description"> tag at the
 * top of finalBody — extractMetaDescription() on the blog page reads
 * it first. Pings IndexNow per rewritten URL.
 *
 * One step.run per slug so each Claude call fits Vercel's window and
 * the run survives pauses/resumes. Trigger:
 *   POST /api/admin/blog/rewrite-triage  (Bearer CRON_SECRET or admin)
 * Event data: { only?: string; limit?: number; force?: boolean }
 * By default posts that already have a finalBody are skipped, so the
 * run is resumable — pass force:true to redo them.
 */

import { inngest } from "@/inngest/client";
import { displayAnnual, displayMonthly } from "@/lib/pricing";

// Authoritative list from .tmp/rewrite-slugs.txt (blog-triage.ts output,
// Keenan sign-off 2026-09-23) — all 41 verified live in prod DB.
export const REWRITE_SLUGS = [
  "acuity-vs-stoic-which-journal-app-is-right-for-you-in-2026",
  "day-one-vs-acuity-vs-rosebud-best-journaling-app-for-self-re",
  "acuity-vs-finch-which-self-care-app-is-right-for-you-in-2026",
  "acuity-vs-rosebud-which-ai-journal-app-is-right-for-you-in-2",
  "acuity-vs-mindsera-which-ai-journal-app-is-right-for-you-in-",
  "acuity-vs-daylio-which-journal-app-is-right-for-you-in-2026",
  "the-best-voice-journaling-apps-in-2026-no-typing-required",
  "how-recovering-addicts-use-daily-journaling-to-identify-trig",
  "acuity-vs-reflectly-which-journal-app-is-right-for-you-in-20",
  "how-to-use-journaling-to-prepare-for-difficult-conversations",
  "how-to-use-voice-journaling-as-a-pre-writing-brainstorming-t",
  "weekly-review-ritual-how-top-executives-reflect-on-their-wee",
  "how-to-stop-overthinking-at-night-with-a-5-minute-voice-dump",
  "how-sober-curious-people-use-reflection-apps-to-track-their-",
  "creative-process-documentation-voice-vs-video-vs-written-met",
  "the-best-journaling-prompts-for-life-coaches-to-use-with-cli",
  "how-to-debrief-yourself-after-a-hard-day-as-a-startup-founde",
  "how-therapists-can-recommend-journaling-without-overwhelming",
  "stream-of-consciousness-journaling-for-creative-blocks-a-pra",
  "morning-routine-apps-voice-journaling-vs-meditation-an-hones",
  "why-solopreneurs-who-journal-make-better-business-decisions",
  "coaching-session-prep-voice-notes-for-client-progress-tracki",
  "acuity-vs-day-one-which-journal-app-is-right-for-you-in-2026",
  "how-creative-directors-use-voice-memos-to-capture-fleeting-i",
  "perfectionism-and-procrastination-breaking-the-cycle-with-im",
  "adhd-task-management-voice-recording-your-daily-to-do-list",
  "the-executive-s-guide-to-reflective-leadership-through-journ",
  "how-therapists-can-use-voice-notes-between-sessions-to-track",
  "the-founder-s-emotional-toolkit-processing-loneliness-at-the",
  "why-solopreneurs-need-weekly-reflection-reports-for-growth",
  "addiction-recovery-check-ins-benefits-of-daily-voice-account",
  "how-life-coaches-can-model-reflective-practice-for-their-cli",
  "freelancer-time-blocking-voice-planning-your-weekly-schedule",
  "how-to-track-writing-goals-without-overwhelming-yourself",
  "recovery-journaling-why-voice-recording-beats-writing-for-ad",
  "remote-work-burnout-how-voice-journaling-prevents-mental-exh",
  "how-to-capture-book-ideas-on-the-go-as-a-nonfiction-writer",
  "creative-process-documentation-voice-vs-video-vs-written-2",
  "acuity-vs-stoic-app-which-mental-health-journaling-app-offer",
  "how-college-students-can-use-voice-journaling-to-reduce-exam",
  "how-to-use-voice-journaling-as-a-pre-therapy-warm-up",
];

const BANNED = [
  "unlock", "elevate", "journey", "transform", "ai-powered", "seamless",
  "game-changer", "in today's fast-paced world", "revolutionize",
  "harness the power of", "empower", "cutting-edge", "leverage",
  "brain dump", "delve", "tapestry", "testament to", "let's dive",
  "let's explore", "in the heart of", "nightly", "before bed", "acuity",
];

const SYSTEM_PROMPT = `You are the SEO editor for Ripple (goripple.io), an AI voice journaling app. Your job: rewrite an existing blog post so it targets the search queries it ALREADY earns impressions for, and reads like a sharp human editor cleaned it up.

PRODUCT FACTS (never contradict):
- The product is called Ripple. It is a voice journaling app: you talk through your day, Ripple pulls out tasks, tracks goals, detects mood and life patterns, and sends a weekly report.
- Ripple is a mirror, not a coach — it reflects, it does not advise.
- Users can record any time of day. NEVER frame it as a night-time/bedtime habit and NEVER claim a specific recording duration.
- Pricing: ${displayMonthly()}/month, ${displayAnnual()}/year, 7-day free trial, no credit card required.

BANNED WORDS/PHRASES (never output any of these, any casing): ${BANNED.join(", ")}. The old product name "Acuity" must never appear — the product is Ripple.

TITLE RULES:
- 40-65 characters. Target the highest-impression real query provided, phrased for click-through.
- Do NOT use the template "How [persona] can use [thing] to [outcome]".
- Good shapes: a question people type, a claim you defend, a specific list, "[X] vs [Y]:", "Stop [x]. Do [y] instead."

BODY RULES:
- Valid HTML fragments only: <h2>, <h3>, <p>, <ul>/<ol>/<li>, <strong>, <em>, <a>, <table>/<thead>/<tbody>/<tr>/<th>/<td>, <blockquote>. No <h1>, no <script>, no <img>, no markdown.
- Keep the post's existing topic, persona, and factual claims. Reorganize and tighten; do not invent statistics or studies. Keep real citations if present.
- Headings in sentence case. Short paragraphs (2-4 sentences). No em dashes.
- Include at least one clean comparison or summary <table> where the content compares options, steps, or trade-offs (with <thead> header row). If the post is a "X vs Y" comparison, the table is mandatory and should compare concrete dimensions (price, input method, AI features, platforms, best for).
- Weave the primary query naturally into the first <h2> or first paragraph.
- Exactly one Ripple paragraph near the end: a natural, low-key description of what Ripple does for this reader, mentioning the 7-day free trial. Not salesy, no other product plugs mid-article.
- End with an <h2>FAQ</h2> section: 3-5 questions phrased the way people search, each answered in 2-4 sentences.

OUTPUT: a single JSON object, no markdown fences, exactly these keys:
{"title": "...", "metaDescription": "140-160 chars, no double quotes", "targetKeyword": "the primary query you targeted", "bodyHtml": "...", "faq": [{"question": "...", "answer": "..."}]}
The faq array must mirror the FAQ section in bodyHtml.`;

interface QueryRow {
  query: string;
  impressions: number;
  clicks: number;
  position: number;
}

function validate(parsed: {
  title?: unknown; metaDescription?: unknown; targetKeyword?: unknown; bodyHtml?: unknown; faq?: unknown;
}): string[] {
  const errors: string[] = [];
  const { title, metaDescription, bodyHtml, faq } = parsed;
  if (typeof title !== "string" || title.length < 25 || title.length > 70)
    errors.push(`title must be 25-70 chars (got ${typeof title === "string" ? title.length : typeof title})`);
  if (typeof metaDescription !== "string" || metaDescription.length < 120 || metaDescription.length > 175)
    errors.push("metaDescription must be 120-175 chars");
  if (typeof metaDescription === "string" && metaDescription.includes('"'))
    errors.push("metaDescription must not contain double quotes");
  if (typeof bodyHtml !== "string" || !bodyHtml.includes("<h2"))
    errors.push("bodyHtml must contain <h2> sections");
  if (typeof bodyHtml === "string" && bodyHtml.replace(/<[^>]+>/g, " ").split(/\s+/).length < 500)
    errors.push("bodyHtml too short (<500 words)");
  if (typeof bodyHtml === "string" && /<script|<img|<h1/i.test(bodyHtml))
    errors.push("bodyHtml contains forbidden tags");
  if (!Array.isArray(faq) || faq.length < 3) errors.push("faq must have 3+ entries");
  const text = `${title} ${metaDescription} ${bodyHtml}`.toLowerCase();
  for (const b of BANNED) if (text.includes(b)) errors.push(`contains banned phrase: "${b}"`);
  return errors;
}

export const blogRewriteTriageFn = inngest.createFunction(
  {
    id: "blog-rewrite-triage",
    name: "Blog — Phase 1 Rewrite Queue (triage 2026-09)",
    retries: 0,
    concurrency: { limit: 1 },
    triggers: [{ event: "admin/blog-rewrite-triage.requested" }],
  },
  async ({ event, logger, step }) => {
    const only = typeof event.data?.only === "string" ? event.data.only : undefined;
    const limit = typeof event.data?.limit === "number" ? event.data.limit : Infinity;
    const force = event.data?.force === true;

    // ── Step 1: pull real 90d queries per slug from both GSC properties ──
    const queryMap = await step.run("pull-gsc-queries", async () => {
      const { google } = await import("googleapis");
      const { getGoogleAuthClient } = await import("@/lib/google/auth");
      const auth = getGoogleAuthClient([
        "https://www.googleapis.com/auth/webmasters.readonly",
      ]);
      if (!auth) throw new Error("No Google auth client (GA4_SERVICE_ACCOUNT_KEY)");
      const sc = google.searchconsole({ version: "v1", auth });
      const end = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      const start = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);

      const bySlug: Record<string, QueryRow[]> = {};
      for (const prop of ["sc-domain:goripple.io", "sc-domain:getacuity.io"]) {
        try {
          const res = await sc.searchanalytics.query({
            siteUrl: prop,
            requestBody: {
              startDate: start,
              endDate: end,
              dimensions: ["page", "query"],
              rowLimit: 5000,
            },
          });
          for (const row of res.data.rows ?? []) {
            const [pageUrl, query] = row.keys ?? [];
            if (!pageUrl || !query) continue;
            const slug = pageUrl
              .replace(/^https?:\/\/[^/]+\/blog\//, "")
              .replace(/\/$/, "");
            if (!REWRITE_SLUGS.includes(slug)) continue;
            (bySlug[slug] ??= []).push({
              query,
              impressions: row.impressions ?? 0,
              clicks: row.clicks ?? 0,
              position: row.position ?? 0,
            });
          }
        } catch (err) {
          logger.warn(`GSC query failed for ${prop}: ${err instanceof Error ? err.message : err}`);
        }
      }
      for (const list of Object.values(bySlug)) {
        list.sort((a, b) => b.impressions - a.impressions);
      }
      return bySlug;
    });

    // Highest-impression posts first
    const slugs = (only ? [only] : [...REWRITE_SLUGS])
      .sort(
        (a, b) =>
          (queryMap[b]?.reduce((s, q) => s + q.impressions, 0) ?? 0) -
          (queryMap[a]?.reduce((s, q) => s + q.impressions, 0) ?? 0)
      )
      .slice(0, limit === Infinity ? undefined : limit);

    // ── One step per slug: rewrite with Claude, validate, save, ping ──
    let ok = 0, failed = 0, skipped = 0;
    const failures: string[] = [];
    for (const slug of slugs) {
      const result = await step.run(`rewrite:${slug}`, async () => {
        const { prisma } = await import("@/lib/prisma");
        const { callClaude } = await import("@/lib/content-factory/claude-client");
        const { notifyPublish } = await import("@/lib/google/indexing");

        const post = await prisma.contentPiece.findFirst({
          where: { slug, type: "BLOG", status: { in: ["DISTRIBUTED", "AUTO_PUBLISHED"] } },
          select: { id: true, title: true, body: true, finalBody: true, targetKeyword: true },
        });
        if (!post) return { status: "skipped" as const, reason: "not live" };
        if (post.finalBody && !force) return { status: "skipped" as const, reason: "already rewritten" };

        const queries = queryMap[slug] ?? [];
        const queryLines = queries.length
          ? queries
              .slice(0, 15)
              .map((q) => `- "${q.query}" — ${q.impressions} impressions, ${q.clicks} clicks, avg position ${q.position.toFixed(0)}`)
              .join("\n")
          : "(no query data — optimize for the stated target keyword and title intent)";

        const userPrompt = `CURRENT TITLE: ${post.title}
CURRENT TARGET KEYWORD: ${post.targetKeyword ?? "(none)"}

REAL GOOGLE QUERIES THIS POST GETS IMPRESSIONS FOR (90 days — target the biggest ones):
${queryLines}

CURRENT BODY HTML:
${post.body}`;

        let feedback = "";
        for (let attempt = 1; attempt <= 2; attempt++) {
          const raw = await callClaude({
            purpose: `blog-rewrite-triage:${slug}`,
            systemPrompt: SYSTEM_PROMPT,
            userPrompt: feedback
              ? `${userPrompt}\n\nYOUR PREVIOUS ATTEMPT FAILED VALIDATION:\n${feedback}\nFix these issues and output the full JSON again.`
              : userPrompt,
            maxTokens: 8000,
          });

          let parsed;
          try {
            parsed = JSON.parse(
              raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "")
            );
          } catch {
            feedback = "output was not valid JSON";
            continue;
          }
          const errors = validate(parsed);
          if (errors.length) {
            feedback = errors.join("; ");
            continue;
          }

          const metaTag = `<meta name="description" content="${(parsed.metaDescription as string).replace(/"/g, "&quot;")}">`;
          await prisma.contentPiece.update({
            where: { id: post.id },
            data: {
              title: parsed.title as string,
              hook: parsed.metaDescription as string,
              targetKeyword: (parsed.targetKeyword as string) || post.targetKeyword,
              finalBody: `${metaTag}\n${parsed.bodyHtml as string}`,
              faqSchema: parsed.faq,
            },
          });
          await notifyPublish(`https://goripple.io/blog/${slug}`);
          return { status: "ok" as const, title: parsed.title as string };
        }
        return { status: "failed" as const, reason: feedback };
      });

      if (result.status === "ok") ok++;
      else if (result.status === "skipped") skipped++;
      else {
        failed++;
        failures.push(`${slug}: ${result.reason}`);
      }
    }

    logger.info(`blog-rewrite-triage done: ${ok} rewritten, ${failed} failed, ${skipped} skipped`);
    return { ok, failed, skipped, failures };
  }
);
