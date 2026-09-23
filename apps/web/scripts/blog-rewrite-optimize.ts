/**
 * Phase 1 approved rewrite queue (Keenan sign-off 2026-09-23): 41 posts
 * with real GSC demand but weak targeting. For each post, Claude Opus
 * rewrites the title/meta to target the queries the post ACTUALLY gets
 * impressions for, and restructures the body: clean h2/h3 hierarchy,
 * comparison tables where the content compares things, short paragraphs,
 * house voice, Ripple branding, FAQ block.
 *
 * Writes to finalBody (original body preserved). Meta description is
 * embedded as a <meta name="description"> tag at the top of finalBody —
 * that is what extractMetaDescription() on the blog page reads first.
 * Pings IndexNow per rewritten URL. Highest-impression posts first.
 *
 * Run: npx dotenv -e apps/web/.env.local -- tsx apps/web/scripts/blog-rewrite-optimize.ts [--only=slug] [--limit=N]
 */
import { google } from "googleapis";
import { getGoogleAuthClient } from "../src/lib/google/auth";
import { prisma } from "../src/lib/prisma";
import { notifyPublish } from "../src/lib/google/indexing";
import { callClaude } from "../src/lib/content-factory/claude-client";

// NOTE: this local script cannot run against prod Claude (local
// ANTHROPIC_API_KEY is invalid) — the live engine is the Inngest
// function below, which also owns the authoritative slug list.
import { REWRITE_SLUGS } from "../src/inngest/functions/blog-rewrite-triage";

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
- Pricing: $4.99/month, $39.99/year, 7-day free trial, no credit card required.

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

interface QueryRow { query: string; impressions: number; clicks: number; position: number }

async function pullQueries(): Promise<Map<string, QueryRow[]>> {
  const auth = getGoogleAuthClient(["https://www.googleapis.com/auth/webmasters.readonly"]);
  if (!auth) throw new Error("No auth client");
  const sc = google.searchconsole({ version: "v1", auth });
  const end = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const start = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);

  const bySlug = new Map<string, QueryRow[]>();
  for (const prop of ["sc-domain:goripple.io", "sc-domain:getacuity.io"]) {
    const res = await sc.searchanalytics.query({
      siteUrl: prop,
      requestBody: { startDate: start, endDate: end, dimensions: ["page", "query"], rowLimit: 5000 },
    });
    for (const row of res.data.rows ?? []) {
      const [pageUrl, query] = row.keys ?? [];
      if (!pageUrl || !query) continue;
      const slug = pageUrl.replace(/^https?:\/\/[^/]+\/blog\//, "").replace(/\/$/, "");
      if (!REWRITE_SLUGS.includes(slug)) continue;
      const list = bySlug.get(slug) ?? [];
      list.push({ query, impressions: row.impressions ?? 0, clicks: row.clicks ?? 0, position: row.position ?? 0 });
      bySlug.set(slug, list);
    }
  }
  for (const list of bySlug.values()) list.sort((a, b) => b.impressions - a.impressions);
  return bySlug;
}

function validate(parsed: {
  title?: unknown; metaDescription?: unknown; targetKeyword?: unknown; bodyHtml?: unknown; faq?: unknown;
}): string[] {
  const errors: string[] = [];
  const { title, metaDescription, bodyHtml, faq } = parsed;
  if (typeof title !== "string" || title.length < 25 || title.length > 70)
    errors.push(`title must be 25-70 chars (got ${typeof title === "string" ? title.length : typeof title})`);
  if (typeof metaDescription !== "string" || metaDescription.length < 120 || metaDescription.length > 175)
    errors.push(`metaDescription must be 120-175 chars`);
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

async function rewriteOne(
  post: { id: string; slug: string; title: string; body: string; targetKeyword: string | null },
  queries: QueryRow[]
): Promise<boolean> {
  const queryLines = queries.length
    ? queries.slice(0, 15).map((q) => `- "${q.query}" — ${q.impressions} impressions, ${q.clicks} clicks, avg position ${q.position.toFixed(0)}`).join("\n")
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
      purpose: `blog-rewrite-triage:${post.slug}`,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: feedback ? `${userPrompt}\n\nYOUR PREVIOUS ATTEMPT FAILED VALIDATION:\n${feedback}\nFix these issues and output the full JSON again.` : userPrompt,
      maxTokens: 8000,
    });

    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, ""));
    } catch {
      feedback = "output was not valid JSON";
      continue;
    }
    const errors = validate(parsed);
    if (errors.length) {
      feedback = errors.join("; ");
      console.log(`  attempt ${attempt} invalid: ${feedback}`);
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
    await notifyPublish(`https://goripple.io/blog/${post.slug}`);
    console.log(`  OK: "${parsed.title}" (kw: ${parsed.targetKeyword})`);
    return true;
  }
  console.log(`  FAILED after 2 attempts: ${feedback}`);
  return false;
}

async function main() {
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
  const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8) ?? Infinity);

  const queryMap = await pullQueries();
  const slugs = (only ? [only] : REWRITE_SLUGS)
    .sort((a, b) => (queryMap.get(b)?.reduce((s, q) => s + q.impressions, 0) ?? 0) - (queryMap.get(a)?.reduce((s, q) => s + q.impressions, 0) ?? 0))
    .slice(0, limit);

  let ok = 0, failed = 0, skipped = 0;
  for (const [i, slug] of slugs.entries()) {
    const post = await prisma.contentPiece.findFirst({
      where: { slug, type: "BLOG", status: { in: ["DISTRIBUTED", "AUTO_PUBLISHED"] } },
      select: { id: true, slug: true, title: true, body: true, finalBody: true, targetKeyword: true },
    });
    if (!post) { console.log(`[${i + 1}/${slugs.length}] SKIP (not live): ${slug}`); skipped++; continue; }
    console.log(`[${i + 1}/${slugs.length}] ${slug}`);
    try {
      (await rewriteOne({ ...post, slug: post.slug! }, queryMap.get(slug) ?? [])) ? ok++ : failed++;
    } catch (err) {
      console.log(`  ERROR: ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }
  console.log(`\nDone: ${ok} rewritten, ${failed} failed, ${skipped} skipped`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
