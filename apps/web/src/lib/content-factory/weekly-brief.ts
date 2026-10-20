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
  /**
   * 70/30 distillation (2026-10-13, per Keenan: "make it mostly about HOW it
   * was written, and have WHAT it was written about play a factor as well.
   * 70% how, 30% what"). Opus reads winners vs losers.
   */
  how?: string[];
  whatWinning?: string[];
  whatFlopping?: string[];
  /** Ripple life areas / draft kinds by win score (exploit vs explore steering). */
  areas?: { name: string; n: number; mean: number }[];
  draftKinds?: { name: string; n: number; mean: number }[];
  promptBlock: string;
}

const briefPath = (brand: BriefBrand) => `briefs/${brand}.json`;
const MAX_BLOCK_CHARS = 6000;

export async function readBrief(brand: BriefBrand): Promise<WeeklyBrief | null> {
  return readJson<WeeklyBrief>(briefPath(brand));
}

/**
 * The writer/Jev prompt block for a brand, or "" when there's no brief.
 * Since 2026-10-20 it also carries the weekly Social Brief's plan (hooks,
 * formats, keep / steer away), so every lane that reads this block follows
 * the Saturday-night social sweep (social-brief.ts socialBriefBlock).
 */
export async function readBriefBlock(brand: BriefBrand): Promise<string> {
  let block = "";
  try {
    block = (await readBrief(brand))?.promptBlock ?? "";
  } catch {
    block = "";
  }
  try {
    const { socialBriefBlock } = await import("./social-brief");
    const plan = await socialBriefBlock(brand);
    if (plan) block = block ? `${block}\n\n${plan}` : plan;
  } catch {
    // The plan is extra guidance; never block a writer over it.
  }
  return block;
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
  try {
    const d = await distillHowWhat(brand, winners, losers, competitorHooks);
    brief.how = d.how;
    brief.whatWinning = d.whatWinning;
    brief.whatFlopping = d.whatFlopping;
  } catch (err) {
    console.warn(`[weekly-brief] ${brand} how/what distillation failed — raw brief only:`, err instanceof Error ? err.message : err);
  }
  // Area / draft-kind stats from recipes (what the exploit/explore split learns).
  try {
    const { readRecipe } = await import("./performance-loop");
    const areaAgg = new Map<string, number[]>();
    const kindAgg = new Map<string, number[]>();
    for (const p of scored) {
      const r = (await readRecipe(p.postId)) as { area?: string; draftKind?: string } | null;
      if (r?.area) areaAgg.set(r.area, [...(areaAgg.get(r.area) ?? []), p.score]);
      if (r?.draftKind) kindAgg.set(r.draftKind, [...(kindAgg.get(r.draftKind) ?? []), p.score]);
    }
    const toStats = (m: Map<string, number[]>) =>
      [...m.entries()]
        .map(([name, xs]) => ({ name, n: xs.length, mean: Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 }))
        .sort((a, b) => b.mean - a.mean);
    brief.areas = toStats(areaAgg);
    brief.draftKinds = toStats(kindAgg);
  } catch {
    /* soft */
  }
  brief.promptBlock = promptBlockFor(brief);
  await writeJson(briefPath(brand), brief);
  return brief;
}

function postLine(p: BriefPost): string {
  const nums = `${p.views} views, ${p.likes} likes, ${p.comments} comments, ${p.shares} shares, ${p.saves} saves${p.follows ? `, ${p.follows} follows` : ""}`;
  return `- "${p.title}" (score ${p.score.toFixed(2)}; ${nums})${p.slides.length ? `\n  slides: ${p.slides.join(" / ").slice(0, 260)}` : ""}`;
}

/** Opus: what about HOW the winners were written, and WHAT they were about. */
async function distillHowWhat(
  brand: BriefBrand,
  winners: BriefPost[],
  losers: BriefPost[],
  hooks: CompetitorHook[]
): Promise<{ how: string[]; whatWinning: string[]; whatFlopping: string[] }> {
  if (winners.length < 3) return { how: [], whatWinning: [], whatFlopping: [] };
  const { contentAnthropic, lastJsonText, messageText, VISION_MODEL } = await import("./claude-client");
  const show = (p: BriefPost) =>
    `- "${p.title}" (score ${p.score.toFixed(2)}; ${p.views} views, ${p.comments} comments, ${p.shares} shares, ${p.saves} saves)${p.slides.length ? `\n  slides: ${p.slides.join(" / ").slice(0, 400)}` : ""}`;
  const res = await contentAnthropic.messages.create({
    model: VISION_MODEL,
    max_tokens: 1500,
    effort: "medium",
    system: `You analyze a social account's results for its writers. Compare the WINNERS with the LOSERS and explain what separates them.

Return JSON:
- "how": 6 to 8 lessons about HOW the winners were written, the part that matters most: the hook shape and cover wording, how specific the details are, structure and order, voice and tone, length, how (and whether) a product is mentioned, what the last slide does. Each lesson is one concrete, usable sentence a writer can apply to ANY topic ("names one specific moment, like the permission slip at a red light, instead of a feeling"). Never just restate a topic.
- "whatWinning": 3 to 5 short themes or subjects the winners were about, as themes, not titles.
- "whatFlopping": 2 to 4 themes or subjects the losers were about.
Only use what the data shows.
RULES FOR THE LESSONS (2026-10-13, per Keenan): never recommend opening with "this is how i" (banned on this account; it only shows up because one format repeated it dozens of times). Every "how" lesson must help write ANY subject the writer is assigned; never tell writers to avoid a subject (weak subjects go only in "whatFlopping"). Never suggest a time of day ("9pm", "before bed", "nightly", "at night") in any lesson or example.
Return only the JSON object.`,
    messages: [
      {
        role: "user",
        content: `ACCOUNT: ${brand === "ripple" ? "Ripple (women ~40-50 carrying the mental load)" : "Legendary Mythicals (fantasy fans, 'which would you choose' posts)"}

WINNERS:
${winners.slice(0, 10).map(show).join("\n")}

LOSERS:
${losers.slice(0, 10).map(show).join("\n")}${hooks.length ? `\n\nOUTLIER POSTS FROM OTHER ACCOUNTS IN THE NICHE:\n${hooks.slice(0, 5).map((h) => `- ${h.hook} (${h.whyItWorks})`).join("\n")}` : ""}`,
      },
    ],
  });
  const j = JSON.parse(lastJsonText(messageText(res))) as { how?: unknown; whatWinning?: unknown; whatFlopping?: unknown };
  const list = (x: unknown, n: number) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string").slice(0, n) : []);
  return { how: list(j.how, 8), whatWinning: list(j.whatWinning, 5), whatFlopping: list(j.whatFlopping, 4) };
}

/**
 * Plain-text block for writer prompts and Jev state. 70% HOW (the lessons
 * lead and carry the weight), 30% WHAT (themes as a factor, plus the titles
 * already covered so they aren't repeated).
 */
export function promptBlockFor(b: WeeklyBrief): string {
  const parts: string[] = [];
  // "this is how i" stays banned even if a lesson slips through (2026-10-13).
  // Same for time-of-day examples (Ripple never pins the product to a time).
  const BANNED_LESSON = /this is how i|\b\d{1,2}\s?(am|pm)\b|before bed|bedtime|nightly|at night|tonight/i;
  const how = (b.how ?? []).filter((x) => !BANNED_LESSON.test(x));
  if (how.length) {
    parts.push(
      `WHAT IS WORKING FOR THIS ACCOUNT (weekly brief, ${b.builtAt.slice(0, 10)}; ${b.scoredPosts} posts scored on real results). Weigh it about 70% HOW the post is written and 30% WHAT it is about.\n\nHOW OUR WINNERS ARE WRITTEN (most important; apply to any topic):\n${how.map((x) => `- ${x}`).join("\n")}`
    );
    const what: string[] = [];
    if (b.whatWinning?.length) what.push(`Themes that have won: ${b.whatWinning.join("; ")}.`);
    if (b.whatFlopping?.length)
      what.push(
        `Themes that flopped: ${b.whatFlopping.join("; ")}.${b.brand === "mythicals" ? " (Small samples. Subjects are assigned by rotation on purpose for variety: write the assigned subject the way the winners are written, framed as something the reader would want to be, hold or follow.)" : ""}`
      );
    const covered = b.winners.filter((w) => !/^\s*this is how i\b/i.test(w.title)).slice(0, 6);
    if (covered.length) what.push(`Titles already covered (never repeat or lightly reword): ${covered.map((w) => `"${w.title}"`).join("; ")}.`);
    if (what.length) parts.push(`WHAT IT WAS ABOUT (a factor, not a mandate; lean in when it fits this post's assignment):\n${what.join("\n")}`);
  } else {
    // No distillation yet: the raw winners/losers, as before.
    parts.push(
      `WHAT IS WORKING FOR THIS ACCOUNT (weekly brief, ${b.builtAt.slice(0, 10)}; ${b.scoredPosts} posts scored, 1.0 = a typical post). Learn the PATTERN from the winners (how they're written); never copy their topics or words.`
    );
    if (b.winners.length) parts.push(`OUR WINNERS:\n${b.winners.slice(0, 8).map(postLine).join("\n")}`);
    if (b.losers.length) parts.push(`OUR LOSERS (what flopped):\n${b.losers.slice(0, 6).map(postLine).join("\n")}`);
  }
  if (b.categories.length)
    parts.push(
      `BY CATEGORY / FORMAT: ${b.categories
        .slice(0, 10)
        .map((c) => `${c.name} = ${c.label} (${c.mean}, n=${c.n})`)
        .join("; ")}`
    );
  if (b.audienceLanguage) parts.push(`HOW THE AUDIENCE TALKS THIS WEEK:\n${b.audienceLanguage.slice(0, 800)}`);
  return parts.join("\n\n").slice(0, MAX_BLOCK_CHARS);
}

/** The brief's winning themes (exploit drafts build on these). */
export async function readWinningThemes(brand: BriefBrand): Promise<string[]> {
  try {
    return (await readBrief(brand))?.whatWinning ?? [];
  } catch {
    return [];
  }
}

/** Life-area stats from the brief (explore drafts' steering). */
export async function readAreaStats(brand: BriefBrand): Promise<Record<string, { n: number; mean: number }>> {
  try {
    const b = await readBrief(brand);
    return Object.fromEntries((b?.areas ?? []).map((a) => [a.name, { n: a.n, mean: a.mean }]));
  } catch {
    return {};
  }
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
${b.how?.length ? `<h3 style="margin:18px 0 6px;">How our winners are written (70% of what the writers follow)</h3><ul style="font-size:13px;">${b.how.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
${b.whatWinning?.length ? `<h3 style="margin:18px 0 6px;">What they were about (30%)</h3><p style="font-size:13px;"><strong>Won:</strong> ${esc(b.whatWinning.join("; "))}${b.whatFlopping?.length ? `<br><strong>Flopped:</strong> ${esc(b.whatFlopping.join("; "))}` : ""}</p>` : ""}
${b.areas?.length ? `<h3 style="margin:18px 0 6px;">Life areas (explore drafts steer toward these)</h3><p style="font-size:13px;">${b.areas.map((a) => `${esc(a.name)}: ${a.mean} (n=${a.n})`).join("<br>")}</p>` : ""}
${b.draftKinds?.length ? `<p style="font-size:13px;"><strong>Exploit vs explore:</strong> ${b.draftKinds.map((a) => `${esc(a.name)} ${a.mean} (n=${a.n})`).join(" · ")}</p>` : ""}
<h3 style="margin:18px 0 6px;">Is Jev earning its keep?</h3>
<p style="font-size:13px;">${esc(b.jevSummary || "Not enough scored posts with Jev rankings yet. Needs posts made after 2026-10-14 that are 48h+ old.")}</p>`;
  });
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:860px;margin:0 auto;color:#222;">
<h1 style="font-size:22px;margin:0 0 4px;">Weekly brief: what's working vs what's been tragic</h1>
<p style="color:#666;margin:0;">This is what the writers and Jev read when they make and rank this week's posts.</p>
${sections.join("")}
</div>`;
}
