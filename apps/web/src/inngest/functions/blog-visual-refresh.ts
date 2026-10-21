/**
 * Blog visual refresh (2026-10-21, per Keenan: "go back through our top 10
 * blogs, redesign them with better images and visuals").
 *
 * For each slug: Claude adds the rb-* visual components and two image slots
 * WITHOUT rewriting the article (validated: every original link kept, ≥85%
 * of original sentences kept verbatim), then gpt-image-2 renders a new hero
 * and two inline images in the house style (lib/blog-visuals.ts), and the
 * post is saved and pinged to IndexNow.
 *
 * Runs in prod only (the working ANTHROPIC/OPENAI keys live in Vercel).
 * Trigger: POST /api/admin/blog/visual-refresh { slugs: string[] }
 * (Bearer CRON_SECRET or admin session).
 */
import { inngest } from "@/inngest/client";
import {
  BLOG_COMPONENT_GUIDE,
  IMAGE_SCENE_GUIDE,
  htmlLinks,
  htmlText,
  insertInlineImages,
  isQueryLikeHook,
} from "@/lib/blog-visuals";
import { CLAIMS_RULE, PRODUCT_ONE_LINER } from "@/lib/positioning";

const SYSTEM_PROMPT = `You restyle an existing Ripple blog post so it is easier to skim and more visual. You do NOT rewrite it.

${PRODUCT_ONE_LINER}

KEEP:
- Every existing sentence, heading and link, in the same order. You may move a paragraph by at most one position if a component needs the space. Do not paraphrase.
- Every <a href> exactly as it is.
- Tables, FAQ sections and lists as they are.

ONLY CHANGE, where present (these break brand rules):
- The old brand name "Acuity" → "Ripple".
- Ripple pinned to a time of day ("nightly", "every night", "before bed", "tonight") → time-neutral wording. General advice about sleep or evenings may stay.
- Recording-length claims about Ripple ("60-second", "two-minute debrief") → drop the length.
- "No credit card required" / "no card required" → "7-day free trial, cancel anytime".
- ${CLAIMS_RULE}

ADD:
${BLOG_COMPONENT_GUIDE}

Takeaways, callouts, steps and the example card are NEW text you write; keep them consistent with what the post says, specific, and free of invented statistics, studies or user quotes. No em or en dashes.

ALSO WRITE:
- "hook": a 140 to 165 character summary for the top of the page and the search snippet, written to the reader (never phrased as a request like "Compare… to help me understand"). No dashes.
- "heroScene" and two "images" for the slots.
${IMAGE_SCENE_GUIDE}

Respond with ONE JSON object and nothing else:
{"bodyHtml": "<full restyled HTML>", "hook": "…", "heroScene": "…", "images": [{"scene": "…", "alt": "…", "caption": "…"}, {"scene": "…", "alt": "…", "caption": "…"}]}
Alt text describes the image plainly. Captions are optional, one short sentence that ties the image to the section.`;

type Restyle = {
  bodyHtml: string;
  hook: string;
  heroScene: string;
  images: { scene: string; alt: string; caption?: string }[];
};

/** Sentences of 40+ chars, for the "did it keep the article" check. */
function sentences(html: string): string[] {
  return (htmlText(html).match(/[^.!?]{40,}[.!?]/g) ?? []).map((s) =>
    s.trim().toLowerCase().replace(/acuity/g, "ripple")
  );
}

function validate(original: string, r: Restyle): string[] {
  const errors: string[] = [];
  if (!r?.bodyHtml || typeof r.bodyHtml !== "string") return ["missing bodyHtml"];
  const newText = htmlText(r.bodyHtml).toLowerCase();
  const orig = sentences(original);
  const kept = orig.filter((s) => newText.includes(s)).length;
  if (orig.length && kept / orig.length < 0.85) {
    errors.push(`only ${kept}/${orig.length} original sentences kept verbatim; keep the article text as it is`);
  }
  const newLinks = new Set(htmlLinks(r.bodyHtml));
  const lost = htmlLinks(original).filter((h) => !newLinks.has(h));
  if (lost.length) errors.push(`links removed: ${lost.slice(0, 5).join(", ")}`);
  if (!r.bodyHtml.includes('class="rb-takeaways"')) errors.push("missing rb-takeaways");
  if (!r.bodyHtml.includes("<!--rb-image-1-->") || !r.bodyHtml.includes("<!--rb-image-2-->")) {
    errors.push("missing <!--rb-image-1--> / <!--rb-image-2--> slots");
  }
  if (/\bacuity\b/i.test(htmlText(r.bodyHtml))) errors.push('"Acuity" still appears');
  if (/no (credit )?card (required|needed)/i.test(r.bodyHtml)) errors.push('"no card required" still appears');
  if (/<img\b/i.test(r.bodyHtml)) errors.push("do not add <img> tags; use the image slots");
  if (!r.heroScene || !Array.isArray(r.images) || r.images.length < 2) errors.push("need heroScene and 2 images");
  if (!r.hook || isQueryLikeHook(r.hook) || r.hook.length > 200) errors.push("hook must be a reader-facing summary, 140-165 chars");
  return errors;
}

export const blogVisualRefreshFn = inngest.createFunction(
  {
    id: "blog-visual-refresh",
    name: "Blog — visual refresh (components + house-style images)",
    retries: 0,
    concurrency: { limit: 1 },
    triggers: [{ event: "admin/blog-visual-refresh.requested" }],
  },
  async ({ event, logger, step }) => {
    const slugs: string[] = Array.isArray(event.data?.slugs)
      ? event.data.slugs.filter((s: unknown): s is string => typeof s === "string")
      : [];
    const results: { slug: string; status: string; reason?: string }[] = [];

    for (const slug of slugs) {
      const restyled = await step.run(`restyle:${slug}`, async () => {
        const { prisma } = await import("@/lib/prisma");
        const { callClaude } = await import("@/lib/content-factory/claude-client");
        const { extractJson } = await import("@/lib/content-factory/generate");

        const post = await prisma.contentPiece.findFirst({
          where: { slug, type: "BLOG", status: { in: ["DISTRIBUTED", "AUTO_PUBLISHED"] } },
          select: { id: true, title: true, body: true, finalBody: true },
        });
        if (!post) return { ok: false as const, reason: "not live" };

        const full = post.finalBody ?? post.body;
        // finalBody starts with a <meta name="description"> line; keep it out of the restyle.
        const metaLine = full.match(/^\s*<meta[^>]*>\s*/i)?.[0] ?? "";
        const original = full.slice(metaLine.length);

        let feedback = "";
        for (let attempt = 1; attempt <= 3; attempt++) {
          const raw = await callClaude({
            purpose: `blog-visual-refresh:${slug}`,
            systemPrompt: SYSTEM_PROMPT,
            userPrompt:
              `TITLE: ${post.title}\n\nCURRENT BODY HTML:\n${original}` +
              (feedback ? `\n\nYOUR PREVIOUS ATTEMPT FAILED VALIDATION:\n${feedback}\nFix these and output the full JSON again.` : ""),
            maxTokens: 12000,
          });
          let parsed: Restyle;
          try {
            parsed = JSON.parse(extractJson(raw)) as Restyle;
          } catch {
            feedback = "output was not valid JSON";
            continue;
          }
          parsed.bodyHtml = parsed.bodyHtml?.replace(/[–—]/g, ", ") ?? "";
          const errors = validate(original, parsed);
          if (errors.length) {
            feedback = errors.join("; ");
            continue;
          }
          return { ok: true as const, id: post.id, metaLine, restyle: parsed };
        }
        return { ok: false as const, reason: feedback };
      });

      if (!restyled.ok) {
        results.push({ slug, status: "failed", reason: restyled.reason });
        continue;
      }

      const { restyle } = restyled;
      const heroUrl = await step.run(`hero:${slug}`, async () => {
        const { generateAndStoreBlogImage } = await import("@/lib/blog-image");
        return generateAndStoreBlogImage(slug, restyle.heroScene, { styled: true, fileName: `${slug}-v2.png` });
      });
      const inline: { url: string; alt: string; caption?: string }[] = [];
      for (const [i, img] of restyle.images.slice(0, 2).entries()) {
        const url = await step.run(`inline-${i + 1}:${slug}`, async () => {
          const { generateAndStoreBlogImage } = await import("@/lib/blog-image");
          return generateAndStoreBlogImage(slug, img.scene, { styled: true, fileName: `${slug}-v2-${i + 1}.png` });
        });
        if (url) inline.push({ url, alt: img.alt, caption: img.caption });
      }

      await step.run(`save:${slug}`, async () => {
        const { prisma } = await import("@/lib/prisma");
        const { notifyPublish } = await import("@/lib/google/indexing");
        const body = insertInlineImages(restyle.bodyHtml, inline);
        const metaLine = restyled.metaLine || "";
        await prisma.contentPiece.update({
          where: { id: restyled.id },
          data: {
            finalBody: `${metaLine}${body}`,
            hook: restyle.hook,
            ...(heroUrl ? { heroImageUrl: heroUrl } : {}),
          },
        });
        await notifyPublish(`https://goripple.io/blog/${slug}`);
      });
      results.push({ slug, status: heroUrl ? "ok" : "ok-no-hero", reason: `${inline.length} inline images` });
    }

    logger.info(`blog-visual-refresh: ${JSON.stringify(results)}`);
    return { results };
  }
);
