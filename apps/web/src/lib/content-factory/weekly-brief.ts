/**
 * Weekly "what's working" brief (2026-10-13, per Keenan: "build the weekly
 * brief and send to me on sunday along with jev so it knows what's working
 * vs what's been tragic").
 *
 * One brief per brand (Ripple, Legendary Mythicals), built Sundays from:
 *   - our top 10 and bottom 10 posts of the last 30 days by the brand's win
 *     metric (performance-loop.ts BRAND_METRIC_WEIGHTS), with each post's
 *     full slide text and raw numbers;
 *   - Ripple: the top competitor outlier hooks (CompetitorPost briefs) and
 *     this week's Reddit audience language;
 *   - Mythicals: the per-category / per-post-type scoreboard labels;
 *   - how well Jev's candidate rankings predicted real results
 *     (candidate-calibration.ts).
 *
 * The brief's promptBlock is read by the writers (candidate drafting) and
 * passed to Jev's ranking state. Stored at briefs/<brand>.json. Every reader
 * fails open: no brief → "" and the lanes run as before.
 */

import { readJson, writeJson, type LoopBrand } from "./performance-loop";

export type BriefBrand = "ripple" | "mythicals";
export const BRIEF_BRANDS: BriefBrand[] = ["ripple", "mythicals"];

export interface BriefPost {
  postId: string;
  lane: string;
  title: string;
  slides: string[];
  score: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  follows: number;
  permalink: string | null;
  postedAt: string;
}

export interface CompetitorHook {
  handle: string;
  url: string;
  views: number;
  hook: string;
  whyItWorks: string;
  phrases: string[];
}

export interface WeeklyBrief {
  brand: BriefBrand;
  builtAt: string;
  scoredPosts: number;
  winners: BriefPost[];
  losers: BriefPost[];
  competitorHooks: CompetitorHook[];
  audienceLanguage: string;
  categories: { name: string; label: string; n: number; mean: number }[];
  jevSummary: string;
  promptBlock: string;
}

const briefPath = (brand: BriefBrand) => `briefs/${brand}.json`;
const MAX_BLOCK_CHARS = 6000;

export async function readBrief(brand: BriefBrand): Promise<WeeklyBrief | null> {
  return readJson<WeeklyBrief>(briefPath(brand));
}

/** The writer/Jev prompt block for a brand, or "" when there's no brief. */
export async function readBriefBlock(brand: BriefBrand): Promise<string> {
  try {
    return (await readBrief(brand))?.promptBlock ?? "";
  } catch {
    return "";
  }
}

export async function buildWeeklyBrief(brand: BriefBrand): Promise<WeeklyBrief> {
  const { prisma } = await import("@/lib/prisma");
  const { scorePosts, readScoreboard } = await import("./performance-loop");

  const scored = (await scorePosts({ allLanes: true })).filter((p) => p.brand === brand);
  const ranked = [...scored].sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, 10);
  const bottom = ranked.length > 10 ? ranked.slice(-10).reverse() : [];
  const ids = [...top, ...bottom].map((p) => p.postId);

  const [slideRows, metricRows] = await Promise.all([
    prisma.carouselPost.findMany({
      where: { id: { in: ids } },
      select: { id: true, slides: { orderBy: { order: "asc" }, select: { overlayText: true, kind: true } } },
    }),
    prisma.socialPublish.findMany({
      where: { carouselPostId: { in: ids }, status: "POSTED" },
      select: { carouselPostId: true, views: true, likes: true, comments: true, shares: true, saves: true, follows: true },
    }),
  ]);
  const slidesOf = new Map(
    slideRows.map((r) => [r.id, r.slides.filter((s) => s.kind !== "COVER").map((s) => s.overlayText.replace(/\s+/g, " ").trim())])
  );
  const sum = new Map<string, { views: number; likes: number; comments: number; shares: number; saves: number; follows: number }>();
  for (const m of metricRows) {
    const t = sum.get(m.carouselPostId) ?? { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, follows: 0 };
    t.views += m.views ?? 0;
    t.likes += m.likes ?? 0;
    t.comments += m.comments ?? 0;
    t.shares += m.shares ?? 0;
    t.saves += m.saves ?? 0;
    t.follows += m.follows ?? 0;
    sum.set(m.carouselPostId, t);
  }
  const toBrief = (p: (typeof scored)[number]): BriefPost => ({
    postId: p.postId,
    lane: p.lane,
    title: p.title,
    slides: (slidesOf.get(p.postId) ?? []).slice(0, 6),
    score: p.score,
    ...(sum.get(p.postId) ?? { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, follows: 0 }),
    permalink: p.permalink,
    postedAt: p.postedAt,
  });
  const winners = top.map(toBrief);
  const losers = bottom.map(toBrief);

  // Competitor outliers (Ripple only — no Mythicals competitors are tracked).
  let competitorHooks: CompetitorHook[] = [];
  if (brand === "ripple") {
    const rows = await prisma.competitorPost.findMany({
      where: {
        isOutlier: true,
        briefAt: { not: null },
        scrapedAt: { gte: new Date(Date.now() - 21 * 86_400_000) },
        account: { brand: "ripple" },
      },
      orderBy: { outlierScore: "desc" },
      take: 8,
      select: { url: true, views: true, brief: true, account: { select: { handle: true } } },
    });
    competitorHooks = rows
      .map((r) => {
        const b = (r.brief ?? {}) as { hook?: string; whyItWorks?: string; phrases?: string[] };
        return {
          handle: r.account.handle,
          url: r.url,
          views: r.views,
          hook: b.hook ?? "",
          whyItWorks: b.whyItWorks ?? "",
          phrases: Array.isArray(b.phrases) ? b.phrases.slice(0, 4) : [],
        };
      })
      .filter((h) => h.hook);
  }

  let audienceLanguage = "";
  if (brand === "ripple") {
    try {
      const { getAudiencePulse } = await import("./reddit-trends");
      audienceLanguage = (await getAudiencePulse("ripple")).trim().slice(0, 1500);
    } catch {
      /* soft */
    }
  }

  const board = await readScoreboard(brand as LoopBrand);
  const categories = board
    ? Object.entries({ ...board.postTypes, ...board.categories })
        .map(([name, st]) => ({ name, label: st.label, n: st.n, mean: Math.round(st.mean * 100) / 100 }))
        .filter((c) => c.n >= 2)
        .sort((a, b) => b.mean - a.mean)
        .slice(0, 16)
    : [];

  let jevSummary = "";
  try {
    const { readCandidateCalibration, calibrationSummary } = await import("./candidate-calibration");
    jevSummary = calibrationSummary(await readCandidateCalibration(brand));
  } catch {
    /* soft */
  }

  const brief: WeeklyBrief = {
    brand,
    builtAt: new Date().toISOString(),
    scoredPosts: scored.length,
    winners,
    losers,
    competitorHooks,
    audienceLanguage,
    categories,
    jevSummary,
    promptBlock: "",
  };
  brief.promptBlock = promptBlockFor(brief);
  await writeJson(briefPath(brand), brief);
  return brief;
}

function postLine(p: BriefPost): string {
  const nums = `${p.views} views, ${p.likes} likes, ${p.comments} comments, ${p.shares} shares, ${p.saves} saves${p.follows ? `, ${p.follows} follows` : ""}`;
  return `- "${p.title}" (score ${p.score.toFixed(2)}; ${nums})${p.slides.length ? `\n  slides: ${p.slides.join(" / ").slice(0, 260)}` : ""}`;
}

/** Plain-text block for writer prompts and Jev state. */
export function promptBlockFor(b: WeeklyBrief): string {
  const parts: string[] = [
    `WHAT IS WORKING FOR THIS ACCOUNT (weekly brief, ${b.builtAt.slice(0, 10)}; ${b.scoredPosts} posts scored on our win metric, 1.0 = a typical post). Learn the PATTERN from the winners (the situation named, the kind of detail, the structure); never copy their words. Avoid what the losers have in common.`,
  ];
  if (b.winners.length) parts.push(`OUR WINNERS:\n${b.winners.slice(0, 8).map(postLine).join("\n")}`);
  if (b.losers.length) parts.push(`OUR LOSERS (what flopped):\n${b.losers.slice(0, 6).map(postLine).join("\n")}`);
  if (b.categories.length)
    parts.push(
      `BY CATEGORY / FORMAT: ${b.categories
        .slice(0, 10)
        .map((c) => `${c.name} = ${c.label} (${c.mean}, n=${c.n})`)
        .join("; ")}`
    );
  if (b.competitorHooks.length)
    parts.push(
      `OUTLIER POSTS IN OUR NICHE (other accounts, far above their usual views):\n${b.competitorHooks
        .slice(0, 5)
        .map((h) => `- ${h.hook}${h.whyItWorks ? ` Why it worked: ${h.whyItWorks}` : ""}`)
        .join("\n")}`
    );
  if (b.audienceLanguage) parts.push(`HOW THE AUDIENCE TALKS THIS WEEK:\n${b.audienceLanguage}`);
  return parts.join("\n\n").slice(0, MAX_BLOCK_CHARS);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const BRAND_NAME: Record<BriefBrand, string> = { ripple: "Ripple", mythicals: "Legendary Mythicals" };

function postRows(posts: BriefPost[]): string {
  return posts
    .map(
      (p) => `<tr>
  <td style="padding:6px 8px;border-bottom:1px solid #eee;">${p.permalink ? `<a href="${esc(p.permalink)}">${esc(p.title)}</a>` : esc(p.title)}<div style="color:#888;font-size:12px;">${esc(p.slides.join(" / ").slice(0, 200))}</div></td>
  <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;"><strong>${p.score.toFixed(2)}</strong></td>
  <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">${p.views} views · ${p.likes} likes · ${p.comments} comments · ${p.shares} shares · ${p.saves} saves${p.follows ? ` · ${p.follows} follows` : ""}</td>
</tr>`
    )
    .join("");
}

export function briefEmailHtml(briefs: WeeklyBrief[]): string {
  const sections = briefs.map((b) => {
    const table = (title: string, posts: BriefPost[]) =>
      posts.length
        ? `<h3 style="margin:18px 0 6px;">${title}</h3><table style="border-collapse:collapse;width:100%;font-size:13px;">${postRows(posts)}</table>`
        : "";
    return `<h2 style="margin:28px 0 4px;">${BRAND_NAME[b.brand]}</h2>
<p style="color:#666;margin:0 0 8px;">${b.scoredPosts} posts scored over the last 30 days. Score 1.0 = a typical post for this account.</p>
${b.scoredPosts === 0 ? `<p><strong>No scored posts yet.</strong> Posts are scored 48 hours after they go up.</p>` : ""}
${table("What's working (top 10)", b.winners)}
${table("What's been tragic (bottom 10)", b.losers)}
${b.categories.length ? `<h3 style="margin:18px 0 6px;">By category / format</h3><p style="font-size:13px;">${b.categories.map((c) => `${esc(c.name)}: <strong>${esc(c.label)}</strong> (${c.mean}, n=${c.n})`).join("<br>")}</p>` : ""}
${b.competitorHooks.length ? `<h3 style="margin:18px 0 6px;">Outliers in our niche</h3><ul style="font-size:13px;">${b.competitorHooks.map((h) => `<li><a href="${esc(h.url)}">@${esc(h.handle)}</a> (${h.views.toLocaleString()} views): ${esc(h.hook)}</li>`).join("")}</ul>` : ""}
<h3 style="margin:18px 0 6px;">Is Jev earning its keep?</h3>
<p style="font-size:13px;">${esc(b.jevSummary || "Not enough scored posts with Jev rankings yet. Needs posts made after 2026-10-14 that are 48h+ old.")}</p>`;
  });
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:860px;margin:0 auto;color:#222;">
<h1 style="font-size:22px;margin:0 0 4px;">Weekly brief: what's working vs what's been tragic</h1>
<p style="color:#666;margin:0;">This is what the writers and Jev read when they make and rank this week's posts.</p>
${sections.join("")}
</div>`;
}
