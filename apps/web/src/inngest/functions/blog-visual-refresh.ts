/**
 * Blog visual refresh (2026-10-21, per Keenan: "go back through our top 10
 * blogs, redesign them with better images and visuals").
 *
 * For each slug: Claude returns only the new rb-* components and two image
 * slots, each anchored to the first words of an existing element; they are
 * inserted into the untouched original HTML. (The first version asked for
 * the whole restyled body and the model condensed the article.) Then
 * gpt-image-2 renders a new hero and two inline images in the house style
 * (lib/blog-visuals.ts), and the post is saved and pinged to IndexNow.
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

const SYSTEM_PROMPT = `You add visual components to an existing Ripple blog post. You do NOT rewrite or return the article: you return only the new pieces and where each one goes. The article text stays exactly as it is.

${PRODUCT_ONE_LINER}

${BLOG_COMPONENT_GUIDE}

PLACEMENT: each insert says where it goes with "after" (or "before"): the first 6 to 10 words of an existing paragraph, heading, list or table in the post, copied EXACTLY as they appear (same words, same order). The component is placed right after (or before) that element.

WHAT TO RETURN:
- One rb-takeaways, placed after the opening paragraph (before the first heading).
- One or two rb-callout, at most one rb-pull (repeat a line that already appears in the post, word for word), and an rb-example only if the post is about saying things out loud and having them sorted.
- An rb-steps only as an ADDITION (a short recap of a method the post explains), never replacing text.
- Exactly two image slots, as inserts whose html is <!--rb-image-1--> and <!--rb-image-2-->, spread through the post (not next to each other, not inside the first two paragraphs).
New text you write must be consistent with the post, specific, and free of invented statistics, studies or user quotes. No em or en dashes. Never "Acuity" (the product is Ripple), never pin Ripple to a time of day, never claim a recording length, never "no card required". ${CLAIMS_RULE}

ALSO WRITE:
- "hook": a 140 to 165 character summary for the top of the page and the search snippet, written to the reader (never phrased as a request like "Compare… to help me understand"). No dashes.
- "heroScene" and two "images" for the slots.
${IMAGE_SCENE_GUIDE}

Respond with ONE JSON object and nothing else:
{"inserts": [{"after": "first words of an existing element", "html": "<aside class=\\"rb-takeaways\\">…</aside>"}, {"after": "…", "html": "<!--rb-image-1-->"}, {"before": "first words of a heading", "html": "…"}], "hook": "…", "heroScene": "…", "images": [{"scene": "…", "alt": "…", "caption": "…"}, {"scene": "…", "alt": "…", "caption": "…"}]}
Alt text describes the image plainly. Captions are optional, one short sentence tying the image to the section.`;

type Insert = { after?: string; before?: string; html: string };
type Restyle = {
  inserts: Insert[];
  hook: string;
  heroScene: string;
  images: { scene: string; alt: string; caption?: string }[];
};

const BLOCK_RE = /<(p|h2|h3|ul|ol|table|blockquote|aside|figure)\b[^>]*>[\s\S]*?<\/\1>/gi;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9' "]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Block elements with their text, for anchoring inserts. */
function blocks(html: string) {
  return [...html.matchAll(BLOCK_RE)].map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
    tag: m[1].toLowerCase(),
    text: norm(htmlText(m[0])),
  }));
}

/**
 * Places each insert next to the element whose text starts with its anchor.
 * Unmatched takeaways go after the first paragraph; unmatched image slots
 * after paragraphs a third and two thirds of the way through.
 * The original HTML is only added to, never edited.
 */
export function applyInserts(html: string, inserts: Insert[]): { html: string; placed: number } {
  const bs = blocks(html);
  const paras = bs.filter((b) => b.tag === "p");
  const at: { pos: number; html: string }[] = [];
  let placed = 0;
  for (const ins of inserts) {
    if (!ins?.html || typeof ins.html !== "string") continue;
    const anchor = norm(ins.after ?? ins.before ?? "");
    const hit =
      anchor.length >= 12
        ? bs.find((b) => b.text.startsWith(anchor) || b.text.startsWith(anchor.slice(0, 40)))
        : undefined;
    if (hit) {
      at.push({ pos: ins.before ? hit.start : hit.end, html: ins.html });
      placed++;
      continue;
    }
    const slot = ins.html.match(/<!--rb-image-(\d)-->/);
    if (ins.html.includes("rb-takeaways") && paras[0]) {
      at.push({ pos: paras[0].end, html: ins.html });
    } else if (slot && paras.length > 3) {
      at.push({ pos: paras[Math.floor((paras.length * Number(slot[1])) / 3)].end, html: ins.html });
    }
  }
  at.sort((a, b) => b.pos - a.pos);
  let out = html;
  for (const a of at) out = `${out.slice(0, a.pos)}\n${a.html}\n${out.slice(a.pos)}`;
  return { html: out, placed };
}

/** "Acuity" → "Ripple" in visible text only (URLs and slugs untouched). */
function rebrand(html: string): string {
  return html.replace(/>([^<]*)</g, (_m, text: string) => `>${text.replace(/\bAcuity\b/g, "Ripple")}<`);
}

export function validate(original: string, r: Restyle): { errors: string[]; html?: string } {
  const errors: string[] = [];
  if (!Array.isArray(r?.inserts) || r.inserts.length === 0) return { errors: ["missing inserts"] };
  if (r.inserts.some((i) => /<img\b|<script|style=/i.test(i?.html ?? ""))) {
    errors.push("inserts must not contain <img>, <script> or inline styles");
  }
  const joined = r.inserts.map((i) => i?.html ?? "").join("\n");
  if (!joined.includes('class="rb-takeaways"')) errors.push("missing rb-takeaways insert");
  if (!joined.includes("<!--rb-image-1-->") || !joined.includes("<!--rb-image-2-->")) {
    errors.push("missing image slot inserts");
  }
  if (/\bacuity\b/i.test(htmlText(joined))) errors.push('"Acuity" in new text');
  if (/no (credit )?card (required|needed)/i.test(joined)) errors.push('"no card required" in new text');
  if (!r.heroScene || !Array.isArray(r.images) || r.images.length < 2) errors.push("need heroScene and 2 images");
  if (!r.hook || isQueryLikeHook(r.hook) || r.hook.length > 200) {
    errors.push("hook must be a reader-facing summary, 140-165 chars");
  }
  if (errors.length) return { errors };

  const { html, placed } = applyInserts(
    original,
    r.inserts.map((i) => ({ ...i, html: i.html.replace(/[–—]/g, ", ") }))
  );
  if (placed < Math.min(3, r.inserts.length)) {
    return { errors: [`only ${placed} inserts matched an element; copy the first words of existing elements exactly`] };
  }
  const links = new Set(htmlLinks(html));
  if (htmlLinks(original).some((h) => !links.has(h))) return { errors: ["links changed"] };
  return { errors: [], html: rebrand(html) };
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
        if (original.includes('class="rb-takeaways"')) return { ok: false as const, reason: "already restyled" };

        let feedback = "";
        for (let attempt = 1; attempt <= 3; attempt++) {
          const raw = await callClaude({
            purpose: `blog-visual-refresh:${slug}`,
            systemPrompt: SYSTEM_PROMPT,
            userPrompt:
              `TITLE: ${post.title}\n\nPOST HTML (do not return it; anchor your inserts to it):\n${original}` +
              (feedback ? `\n\nYOUR PREVIOUS ATTEMPT FAILED VALIDATION:\n${feedback}\nFix these and output the full JSON again.` : ""),
            maxTokens: 6000,
          });
          let parsed: Restyle;
          try {
            parsed = JSON.parse(extractJson(raw)) as Restyle;
          } catch {
            feedback = "output was not valid JSON";
            continue;
          }
          const { errors, html } = validate(original, parsed);
          if (errors.length || !html) {
            feedback = errors.join("; ");
            continue;
          }
          return { ok: true as const, id: post.id, metaLine, bodyHtml: html, restyle: parsed };
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
        return generateAndStoreBlogImage(slug, restyle.heroScene, { styled: true, fileName: `${slug}-v3.png` });
      });
      const inline: { url: string; alt: string; caption?: string }[] = [];
      for (const [i, img] of restyle.images.slice(0, 2).entries()) {
        const url = await step.run(`inline-${i + 1}:${slug}`, async () => {
          const { generateAndStoreBlogImage } = await import("@/lib/blog-image");
          return generateAndStoreBlogImage(slug, img.scene, { styled: true, fileName: `${slug}-v3-${i + 1}.png` });
        });
        if (url) inline.push({ url, alt: img.alt, caption: img.caption });
      }

      await step.run(`save:${slug}`, async () => {
        const { prisma } = await import("@/lib/prisma");
        const { notifyPublish } = await import("@/lib/google/indexing");
        const body = insertInlineImages(restyled.bodyHtml, inline);
        await prisma.contentPiece.update({
          where: { id: restyled.id },
          data: {
            finalBody: `${restyled.metaLine}${body}`,
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
