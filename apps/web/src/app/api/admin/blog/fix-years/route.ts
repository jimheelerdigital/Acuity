/**
 * POST /api/admin/blog/fix-years — fix outdated year references in published blog posts
 *
 * Scans AUTO_PUBLISHED and DISTRIBUTED blog posts for "2024" or "2025" used in
 * a current-year context (e.g. "in 2024", "best X for 2025") and rewrites only
 * the year references to the current year using Claude.
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

interface PostToFix {
  id: string;
  title: string;
  slug: string | null;
  body: string;
  hook: string | null; // metaDescription is stored as hook
}

export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const currentYear = new Date().getFullYear();

  // Find all published blog posts
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
      hook: true, // metaDescription
    },
  });

  const postsToFix: PostToFix[] = [];

  for (const post of posts) {
    const textToCheck = [
      post.title,
      post.hook ?? "",
      post.body,
    ].join(" ");

    if (hasOutdatedYearRef(textToCheck)) {
      postsToFix.push(post);
    }
  }

  if (postsToFix.length === 0) {
    return NextResponse.json({
      updated: 0,
      message: "No posts with outdated year references found.",
    });
  }

  const { callClaude } = await import("@/lib/content-factory/claude-client");
  const results: Array<{ id: string; slug: string | null; changes: string }> = [];

  for (const post of postsToFix) {
    try {
      const raw = await callClaude({
        purpose: "auto-blog-fix-years",
        systemPrompt: `You fix outdated year references in blog posts. The current year is ${currentYear}.

RULES:
- Replace "2024" or "2025" with "${currentYear}" ONLY when used as the current year (e.g. "best apps in 2024", "top tips for 2025", "2024 guide")
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
        userPrompt: `Fix year references in this blog post:

TITLE: ${post.title}

META DESCRIPTION: ${post.hook ?? ""}

BODY:
${post.body}`,
        maxTokens: 8000,
      });

      const { extractJson } = await import("@/lib/content-factory/generate");
      const parsed = JSON.parse(extractJson(raw)) as {
        title: string;
        metaDescription: string;
        body: string;
        changes: string;
      };

      // Only update if something actually changed
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

        results.push({
          id: post.id,
          slug: post.slug,
          changes: parsed.changes,
        });
      }
    } catch (err) {
      console.error(
        `[fix-years] Failed to fix post ${post.id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return NextResponse.json({
    scanned: posts.length,
    candidates: postsToFix.length,
    updated: results.length,
    results,
  });
}
