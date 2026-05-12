/**
 * Fix outdated year references (2024/2025) in published blog posts.
 *
 * Usage:
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx apps/web/scripts/fix-year-references.ts
 *
 * - Scans all AUTO_PUBLISHED / DISTRIBUTED blog posts
 * - Detects "2024" or "2025" used as the current year
 * - Calls Claude to surgically swap only the year references
 * - Updates the DB record
 * - Idempotent: re-running after fix finds 0 candidates
 */

import { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";

const prisma = new PrismaClient();
const anthropic = new Anthropic();

const CURRENT_YEAR = new Date().getFullYear();

// Patterns that imply the year is being used as "current year"
const CURRENT_YEAR_PATTERNS = [
  /\b(in|for|of|during|best\s+\w+\s+(?:for|in|of)?)\s+(2024|2025)\b/gi,
  /\b(top\s+\d+\s+\w+)\s+(2024|2025)\b/gi,
  /\b(2024|2025)\s+(guide|review|edition|update|trends?|statistics?|tips?)\b/gi,
  /\b(best|top|updated?)\s+.*?(2024|2025)\b/gi,
];

function hasOutdatedYearRef(text: string): boolean {
  return CURRENT_YEAR_PATTERNS.some((p) => {
    p.lastIndex = 0;
    return p.test(text);
  });
}

function extractJson(raw: string): string {
  // Try to find JSON in the response
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  return raw;
}

async function main() {
  console.log(`[fix-years] Current year: ${CURRENT_YEAR}`);
  console.log("[fix-years] Scanning published blog posts...\n");

  const posts = await prisma.contentPiece.findMany({
    where: {
      type: "BLOG",
      status: { in: ["AUTO_PUBLISHED", "DISTRIBUTED"] },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      body: true,
      hook: true,
    },
  });

  console.log(`[fix-years] Found ${posts.length} published posts`);

  const candidates = posts.filter((post) => {
    const text = [post.title, post.hook ?? "", post.body].join(" ");
    return hasOutdatedYearRef(text);
  });

  console.log(`[fix-years] ${candidates.length} posts have outdated year references\n`);

  if (candidates.length === 0) {
    console.log("[fix-years] Nothing to fix!");
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < candidates.length; i++) {
    const post = candidates[i];
    console.log(
      `[fix-years] (${i + 1}/${candidates.length}) Processing: ${post.title}`
    );
    console.log(`            slug: ${post.slug ?? "(no slug)"}`);

    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20241022",
        max_tokens: 8000,
        system: `You fix outdated year references in blog posts. The current year is ${CURRENT_YEAR}.

RULES:
- Replace "2024" or "2025" with "${CURRENT_YEAR}" ONLY when used as the current year (e.g. "best apps in 2024", "top tips for 2025", "2024 guide")
- Do NOT change historical references (e.g. "a 2024 study found" is fine if it refers to an actual past study)
- Do NOT rewrite sentences or change meaning — only swap the year number
- Return the FULL updated text for each field, even if only one character changed
- If a field has no changes needed, return it exactly as-is

Respond with a JSON object:
{
  "title": "updated title",
  "metaDescription": "updated meta description",
  "body": "updated body HTML",
  "changes": "brief description of what was changed"
}`,
        messages: [
          {
            role: "user",
            content: `Fix year references in this blog post:

TITLE: ${post.title}

META DESCRIPTION: ${post.hook ?? ""}

BODY:
${post.body}`,
          },
        ],
      });

      const raw =
        response.content[0].type === "text" ? response.content[0].text : "";
      const parsed = JSON.parse(extractJson(raw)) as {
        title: string;
        metaDescription: string;
        body: string;
        changes: string;
      };

      const titleChanged = parsed.title !== post.title;
      const hookChanged = parsed.metaDescription !== (post.hook ?? "");
      const bodyChanged = parsed.body !== post.body;

      if (titleChanged || hookChanged || bodyChanged) {
        await prisma.contentPiece.update({
          where: { id: post.id },
          data: {
            ...(titleChanged ? { title: parsed.title } : {}),
            ...(hookChanged ? { hook: parsed.metaDescription } : {}),
            ...(bodyChanged ? { body: parsed.body } : {}),
          },
        });

        updated++;
        console.log(`            FIXED: ${parsed.changes}`);
        if (titleChanged) console.log(`            - title: "${post.title}" -> "${parsed.title}"`);
        if (hookChanged) console.log(`            - metaDescription updated`);
        if (bodyChanged) console.log(`            - body HTML updated`);
      } else {
        console.log(
          "            Claude found no current-year references to change (likely historical)"
        );
      }
    } catch (err) {
      failed++;
      console.error(
        `            ERROR: ${err instanceof Error ? err.message : err}`
      );
    }

    console.log();
  }

  console.log("─".repeat(60));
  console.log(
    `[fix-years] Done. ${updated} posts updated, ${failed} failed, ${candidates.length - updated - failed} unchanged.`
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
