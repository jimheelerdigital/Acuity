/**
 * Ad-matched first screen (2026-09-30, per Keenan: "Create the ad-matched
 * first screen step").
 *
 * 70–80% of paid visitors left on screen 1 while it showed the same generic
 * intro whatever ad they tapped. Every ad link carries utm_content = the
 * AdLab creative id, so the server looks the creative up and builds screen
 * 1's intro from that ad's own words: its hook as the headline, and its
 * "you say it → Ripple catches it" example (the same said/caught the ad
 * showed) as the How-Ripple-works demo. Anything missing falls back to the
 * funnel's default intro, field by field; an unknown id changes nothing.
 */
import "server-only";

import type { EntryIntro } from "@/lib/funnel-config";
import { prisma } from "@/lib/prisma";
import { decodeAdCopy } from "@/lib/adlab/weekly-batch";

const CUID = /^c[a-z0-9]{20,32}$/;
const PATTERN = /again|came up|in a row|every (week|time|day)|pattern|repeat|keeps|missed|\bweek\b|times\b/i;

const clean = (s: string | undefined | null, max: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};
const sentence = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export interface AdMatch {
  headline: string;
  said?: string;
  caught?: { text: string; kind: "task" | "pattern" }[];
}

/** The tapped ad's hook + say/catch example, or null for unknown/organic. */
export async function findAdMatch(utmContent: string | string[] | undefined): Promise<AdMatch | null> {
  const id = typeof utmContent === "string" ? utmContent.replace(/^video-/, "") : "";
  if (!CUID.test(id)) return null;
  try {
    const c = await prisma.adLabCreative.findUnique({
      where: { id },
      select: { headline: true, generationPrompt: true },
    });
    if (!c) return null;
    const copy = decodeAdCopy(c.generationPrompt);
    const v = copy.video;

    // Headline: what the ad opened with.
    let headline = c.headline;
    if (v?.hook) {
      headline =
        v.hookStyle === "pov" ? `POV: ${v.hook}` : v.hookStyle === "number" && v.bigNumber ? `${v.bigNumber} ${v.hook}` : sentence(v.hook);
    }

    // Demo: the ad's own said → caught. Video templates without a single
    // spoken line get one built from what the video showed.
    let said = v?.said ?? copy.said;
    let caughtRaw = v?.caught ?? copy.caught;
    if (v && !said) {
      if (v.template === "habit_week" && v.quotes?.length) {
        said = v.quotes.map((q) => q.text).join(". ");
        const missed = (v.days ?? []).filter((d) => !d).length;
        caughtRaw = [`${v.habit ?? "Habit"} missed ${missed} days`, ...(v.flag ? [v.flag] : [])];
      } else if (v.template === "pattern_weeks" && v.weeks?.length) {
        said = v.weeks[v.weeks.length - 1];
        caughtRaw = [`Came up ${v.weeks.length} weeks in a row`, ...(v.phrase ? [`“${v.phrase}”`] : [])];
      } else if (v.template === "invisible_list" && v.items?.length) {
        said = v.items.slice(0, 3).map((i) => i.text).join(", ");
        caughtRaw = [...v.items.slice(0, 2).map((i) => i.text), ...(v.total ? [`${v.total} things this week`] : [])];
      } else if (v.template === "weekly_report" && v.stats?.length) {
        said = v.insight;
        caughtRaw = v.stats.map((st) => `${st.value} ${st.label}`);
      }
    }
    const caught = (caughtRaw ?? [])
      .slice(0, 3)
      .map((t) => ({ text: clean(t, 40), kind: PATTERN.test(t) ? ("pattern" as const) : ("task" as const) }))
      .filter((x) => x.text);

    return {
      headline: clean(headline, 70),
      ...(said && caught.length >= 2 ? { said: clean(said, 120), caught } : {}),
    };
  } catch {
    return null;
  }
}

/** Screen-1 intro for /start and /start-bwk, ad-matched where possible. */
export async function adMatchedIntro(
  utmContent: string | string[] | undefined,
  base: EntryIntro
): Promise<EntryIntro> {
  const m = await findAdMatch(utmContent);
  if (!m) return base;
  return {
    ...base,
    headline: m.headline || base.headline,
    ...(m.said && m.caught ? { said: m.said, caught: m.caught } : {}),
  };
}
