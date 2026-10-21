/**
 * Blog visuals (2026-10-21, per Keenan: blog images should match what each
 * post is actually about, with images and visual components through the
 * body to drive engagement).
 *
 * Shared by:
 * - inngest/functions/auto-blog.ts (new posts: writer emits components +
 *   image slots, pipeline renders the images)
 * - inngest/functions/blog-visual-refresh.ts (restyles existing posts)
 * - app/blog/[slug]/page.tsx (heading ids, table of contents, hook cleanup)
 *
 * Component markup is plain HTML with rb-* classes, styled by
 * app/blog/blog-components.css. The sanitizer in blog/[slug]/page.tsx
 * keeps class attributes, so nothing else is needed to render them.
 */

/** House image style: warm, light, editorial, matching the 2026-10 site. */
export const HOUSE_IMAGE_STYLE =
  "Warm editorial photograph, natural daylight, soft film grain, shallow depth of field, calm and lived-in. " +
  "Palette: warm cream and off-white, soft coral and terracotta, muted violet accents. " +
  "No text, letters, numbers, logos, watermarks, app screens or UI anywhere in the frame. " +
  "If people appear, show them from behind, in profile at a distance, or only their hands; no faces looking at camera.";

/** Wraps a scene description in the house style. */
export function buildImagePrompt(scene: string): string {
  return `${HOUSE_IMAGE_STYLE} Scene: ${scene.trim()}`;
}

/**
 * Guide given to the writer (new posts) and the restyler (existing posts).
 * Exact markup so the CSS can style it and the restyler output is checkable.
 */
export const BLOG_COMPONENT_GUIDE = `VISUAL COMPONENTS (use these exact HTML shapes and class names; they are styled on the site):

1. Key takeaways, REQUIRED, placed right after the opening paragraph(s) and before the first <h2>:
<aside class="rb-takeaways"><p class="rb-label">Key takeaways</p><ul><li>…</li><li>…</li><li>…</li></ul></aside>
Three or four bullets, each one concrete sentence a skimmer can act on.

2. Callout, 1 or 2 per post, for a practical tip or a common mistake:
<aside class="rb-callout"><p class="rb-label">Try this</p><p>…</p></aside>
Label is short: "Try this", "Common mistake", "Worth knowing", "Quick example".

3. Pull quote, at most 1, a striking line that already appears in the post (repeat it, do not invent):
<blockquote class="rb-pull"><p>…</p></blockquote>

4. Example card, at most 1, only where the post talks about saying things out loud and Ripple sorting them. Realistic, specific, no invented user names:
<div class="rb-example"><div class="rb-said"><p class="rb-label">You say</p><p>“…”</p></div><div class="rb-caught"><p class="rb-label">Ripple catches</p><ul><li class="rb-task">…</li><li class="rb-task">…</li><li class="rb-mood">Mood: …</li><li class="rb-habit">Habit: …</li><li class="rb-pattern">Pattern: …</li></ul></div></div>
Include only the rows that fit (at least one rb-task).

5. Numbered steps, when the post walks through a method:
<ol class="rb-steps"><li><strong>Short step name.</strong> One or two sentences.</li>…</ol>

6. Image slots, exactly 2, between sections (after a paragraph, never inside a list, table or component). Write the HTML comment <!--rb-image-1--> and <!--rb-image-2--> where each image should go; the images are generated from your imagePrompts and inserted there.

Comparison tables stay as normal <table> markup. Do not use any other classes, inline styles or <img> tags.`;

/** Instructions for writing image scene descriptions (hero + inline). */
export const IMAGE_SCENE_GUIDE = `IMAGE SCENES: describe one concrete, real-life scene taken from THIS post's own situation (the car in the pickup line, a kitchen counter with a phone and a half-written list, a parked car with a phone on the dash, a desk at the end of a workday, a walk with earbuds), 1 to 2 sentences, no style words (the house style is added automatically). No abstract waves, glowing particles, brains, or dark purple moodboards. No text, screens or logos in the scene. People only from behind, at a distance, or hands.`;

export type InlineImage = { url: string; alt: string; caption?: string };

/** Replaces <!--rb-image-N--> slots with figures; leftover slots are removed. */
export function insertInlineImages(html: string, images: InlineImage[]): string {
  let out = html;
  images.forEach((img, i) => {
    const marker = `<!--rb-image-${i + 1}-->`;
    const figure =
      `<figure class="rb-figure"><img src="${escapeAttr(img.url)}" alt="${escapeAttr(img.alt)}" loading="lazy" width="1536" height="1024">` +
      (img.caption ? `<figcaption>${escapeHtml(img.caption)}</figcaption>` : "") +
      `</figure>`;
    out = out.includes(marker) ? out.replace(marker, figure) : out;
  });
  return out.replace(/<!--rb-image-\d+-->/g, "");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Visible text of an HTML fragment, whitespace-collapsed. */
export function htmlText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every href in an HTML fragment. */
export function htmlLinks(html: string): string[] {
  return [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
}

/**
 * Summaries that read like the searcher's request ("Compare online journal
 * tools with Notion to help me understand…"). Some auto-blog topics came
 * from AI-assistant queries in GSC and the summary echoed them.
 */
export function isQueryLikeHook(text: string | null | undefined): boolean {
  if (!text) return true;
  const t = text.trim();
  return (
    /^(explain|recommend|tell me|help me|show me|find me|give me|sign me up|need a|i need|can you)\b/i.test(t) ||
    /\b(help me|for me to|i want to know)\b/i.test(t)
  );
}

/** The hook if it reads like a summary, otherwise the post's first sentences. */
export function cleanHook(hook: string | null | undefined, bodyHtml: string): string {
  if (!isQueryLikeHook(hook)) return hook!.trim();
  const firstP = bodyHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "";
  const text = htmlText(firstP);
  if (!text) return hook?.trim() ?? "";
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  let out = "";
  for (const s of sentences) {
    if ((out + s).length > 170 && out) break;
    out += s;
  }
  return out.trim();
}

export type TocItem = { id: string; text: string };

/** Adds ids to <h2>s (for anchor links) and returns the table of contents. */
export function withHeadingIds(html: string): { html: string; toc: TocItem[] } {
  const toc: TocItem[] = [];
  const used = new Set<string>();
  const out = html.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (whole, attrs: string, inner: string) => {
    const text = htmlText(inner);
    if (!text) return whole;
    const existing = attrs.match(/\bid=["']([^"']+)["']/i)?.[1];
    let id =
      existing ??
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 60);
    if (!id) return whole;
    let n = 2;
    while (used.has(id)) id = `${id}-${n++}`;
    used.add(id);
    toc.push({ id, text });
    return existing ? whole : `<h2${attrs} id="${id}">${inner}</h2>`;
  });
  return { html: out, toc };
}

/**
 * Splits post HTML before the h2 closest to the middle, so a mid-article
 * CTA can sit between sections. Returns [html, ""] when there are fewer
 * than 4 sections.
 */
export function splitAtMiddleH2(html: string): [string, string] {
  const idx = [...html.matchAll(/<h2[\s>]/gi)].map((m) => m.index ?? 0);
  if (idx.length < 4) return [html, ""];
  const at = idx[Math.floor(idx.length / 2)];
  return [html.slice(0, at), html.slice(at)];
}
