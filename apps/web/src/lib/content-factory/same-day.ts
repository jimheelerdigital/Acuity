/**
 * Same-day variety for Ripple (2026-10-16, per Keenan: "fix this" — the
 * 06 UTC how-to guide and the 07 UTC list both used "the bake sale" and
 * "can you do pickup thursday?" on the same morning). Writers saw only past
 * titles, never the slides already posted that day.
 *
 * sameDayRippleText() gives each writer the full text of the day's earlier
 * Ripple posts; sameDayRepeat() catches any example or phrase reused from
 * them, so the sense step can send that line to repair.
 */

const STOP = new Set(
  "a an the and or but if so to of in on at for with from by as is it its it's this that these those be been was were are am do does did done you your yours i me my we our he him his she her they them their not no just one two then than too very can will would could should what who when where why how all any each every some more most less up down out over again only also there here now".split(
    " "
  )
);

const words = (t: string) =>
  t
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** 3-word runs with at least two content words ("the bake sale", "pickup thursday ..."). */
function phrases(t: string): Set<string> {
  const w = words(t);
  const out = new Set<string>();
  for (let i = 0; i + 3 <= w.length; i++) {
    const g = w.slice(i, i + 3);
    if (g.filter((x) => !STOP.has(x)).length >= 2) out.add(g.join(" "));
  }
  return out;
}

export interface SameDayPost {
  headline: string;
  text: string;
}

/** The day's Ripple posts so far (title + every slide's text). */
export async function sameDayRippleText(generatedFor: Date): Promise<SameDayPost[]> {
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.carouselPost.findMany({
    // List samples / held lists are APPROVED and never post, so they don't
    // count; the guide is always APPROVED (posted by hand) and does.
    where: {
      generatedFor,
      OR: [{ lane: "reset-guide" }, { lane: "ripple-list", status: { not: "APPROVED" } }],
    },
    orderBy: { createdAt: "asc" },
    select: { headline: true, slides: { orderBy: { order: "asc" }, select: { overlayText: true, imagePrompt: true } } },
  });
  // List slides keep their detail line on a "DETAIL:" line of the prompt.
  return rows.map((r) => ({
    headline: r.headline,
    text: r.slides
      .map((s) => [s.overlayText, s.imagePrompt?.match(/^DETAIL:\s*(.+)$/m)?.[1]].filter(Boolean).join("\n"))
      .join("\n"),
  }));
}

/** Prompt block for a writer; "" when nothing has posted yet today. */
export function sameDayPromptBlock(posts: SameDayPost[]): string {
  if (!posts.length) return "";
  return `\n\nTODAY'S OTHER RIPPLE POSTS (already written for today; the same followers see all of them the same morning). Yours must take a DIFFERENT life area and situation, and must not reuse ANY of their examples, scenarios, quoted lines, objects or phrases (if they mention the bake sale, school pickup or the dishwasher, you don't):\n${posts
    .map((p) => `--- "${p.headline}"\n${p.text}`)
    .join("\n")}`;
}

/** First phrase a draft repeats from today's posts, or null. */
export function sameDayRepeat(draftText: string, posts: SameDayPost[]): string | null {
  if (!posts.length) return null;
  const seen = new Set<string>();
  for (const p of posts) for (const g of phrases(`${p.headline}\n${p.text}`)) seen.add(g);
  for (const g of phrases(draftText)) if (seen.has(g)) return g;
  return null;
}
