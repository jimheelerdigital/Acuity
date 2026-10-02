/**
 * Performance loop (2026-09-30, per Keenan: "I want our analysis to see
 * what does well and give it to jev to make decisions on what we post
 * daily" → "start building everything now").
 *
 * Code does the numbers; Jev makes judgment calls (Jev is weak at math):
 *
 *   1. RECIPES — every post from the loop lanes saves what it was made of
 *      (`recipes/<postId>.json`): brand, post type, category, title,
 *      option names, slot hour. Older posts are backfilled (post type from
 *      the slug, category classified by Jev from the title).
 *   2. SCORING — each posted post 48h–30d old gets a normalized score:
 *      its metrics relative to that brand's typical post over the trailing
 *      14 days (1.0 = typical). See scorePlatform() for the weights.
 *   3. SCOREBOARD — per brand × post type and brand × category: n, mean
 *      score, label (proven winner / solid / weak / untested). Stored at
 *      `scoreboard/<brand>.json`, refreshed daily at 04:30 UTC, before the
 *      05:00 generation runs.
 *   4. DECISIONS — chooseArm() is a bandit in code (Thompson sampling
 *      plus a 25% exploration share) that picks the post type / category /
 *      theme family; Jev then picks the concrete concept with the
 *      scoreboard labels as context (whatWorksContext()).
 *   5. REPORT — weekly email (Mondays 14:00 UTC) with winners, losers, the
 *      scoreboard and what the loop will do more / less of.
 *
 * No schema change: everything lives in the `content-factory` bucket.
 * Every reader fails open (no scoreboard → the lanes behave as before).
 */

export type LoopBrand = "ripple" | "bwk" | "mythicals";

/** Lanes the loop learns from and steers. */
export const LOOP_LANES: Record<string, LoopBrand> = {
  "mythic-picks": "mythicals",
  "pick-ripple": "ripple",
  "pick-bwk": "bwk",
};

const BUCKET = "content-factory";

// ─── Storage helpers ─────────────────────────────────────────────────

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const { supabase } = await import("@/lib/supabase.server");
    const { data } = await supabase.storage.from(BUCKET).download(path);
    if (!data) return null;
    return JSON.parse(await data.text()) as T;
  } catch {
    return null;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const { supabase } = await import("@/lib/supabase.server");
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, Buffer.from(JSON.stringify(value, null, 1)), { contentType: "application/json", upsert: true });
  if (error) throw new Error(`[performance-loop] write ${path} failed: ${error.message}`);
}

// ─── 1. Recipes ──────────────────────────────────────────────────────

export interface PostRecipe {
  version: 1;
  postId: string;
  brand: LoopBrand;
  lane: string;
  /** Mythicals: choice | duo | place | know | scenario. Pick lanes: "pick". */
  postType: string;
  /** Mythicals: the catalog category. Pick lanes: the theme family. */
  category: string;
  title: string;
  options: string[];
  coverScene?: string;
  generatedFor: string;
  slotHourUtc?: number;
  /** CompetitorPost id when the post was built on a research brief (2026-10-01). */
  researchSeed?: string;
  createdAt: string;
  backfilled?: boolean;
}

export const recipePath = (postId: string) => `recipes/${postId}.json`;

export async function writeRecipe(r: Omit<PostRecipe, "version" | "createdAt">): Promise<void> {
  await writeJson(recipePath(r.postId), { version: 1, createdAt: new Date().toISOString(), ...r });
}

export async function readRecipe(postId: string): Promise<PostRecipe | null> {
  return readJson<PostRecipe>(recipePath(postId));
}

/** Post type from a Mythicals slug ("mythic-know-…" → know). */
export function mythicModeFromSlug(slug: string): string {
  return slug.match(/^mythic-(duo|place|know|scenario|size|versus)-/)?.[1] ?? "choice";
}

/**
 * Write recipes for loop-lane posts that don't have one yet. The category
 * isn't stored on older posts, so Jev classifies the title against the
 * catalog (a Choice question — what Jev is good at). Fails soft per post.
 */
export async function backfillRecipes(opts: { days?: number } = {}): Promise<number> {
  const { prisma } = await import("@/lib/prisma");
  const since = new Date(Date.now() - (opts.days ?? 30) * 86_400_000);
  const posts = await prisma.carouselPost.findMany({
    where: { lane: { in: Object.keys(LOOP_LANES) }, createdAt: { gte: since } },
    select: {
      id: true,
      lane: true,
      topicSlug: true,
      headline: true,
      generatedFor: true,
      createdAt: true,
      slides: { select: { order: true, kind: true, overlayText: true } },
    },
  });
  let written = 0;
  for (const p of posts) {
    if (await readRecipe(p.id)) continue;
    const brand = LOOP_LANES[p.lane ?? ""];
    const options = p.slides
      .filter((s) => s.kind === "REASON" && /^\d+\./.test(s.overlayText))
      .sort((a, b) => a.order - b.order)
      .map((s) => s.overlayText.split("\n")[0].replace(/^\d+\.\s*/, ""));
    const postType = brand === "mythicals" ? mythicModeFromSlug(p.topicSlug) : "pick";
    const catalog = await categoryCatalog(brand, postType);
    const category = await classifyCategory(p.headline, options, catalog);
    try {
      await writeRecipe({
        postId: p.id,
        brand,
        lane: p.lane!,
        postType,
        category,
        title: p.headline,
        options,
        generatedFor: p.generatedFor.toISOString().slice(0, 10),
        slotHourUtc: p.createdAt.getUTCHours(),
        backfilled: true,
      });
      written++;
    } catch (err) {
      console.warn(`[performance-loop] recipe backfill failed for ${p.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return written;
}

/** The arm list for a brand + post type (Mythicals categories / pick theme families). */
export async function categoryCatalog(brand: LoopBrand, postType: string): Promise<string[]> {
  if (brand !== "mythicals") {
    const { PICK_FAMILIES } = await import("./pick-lane");
    return PICK_FAMILIES[brand];
  }
  const c = await import("./choice-lane");
  return postType === "duo"
    ? c.DUO_CATEGORIES
    : postType === "place"
      ? c.PLACE_CATEGORIES
      : postType === "know"
        ? c.KNOW_CATEGORIES
        : postType === "scenario"
          ? c.SCENARIO_CATEGORIES
          : postType === "size"
            ? c.SIZE_CATEGORIES
            : postType === "versus"
              ? c.VERSUS_CATEGORIES
              : c.CHOICE_CATEGORIES;
}

async function classifyCategory(title: string, options: string[], catalog: string[]): Promise<string> {
  if (catalog.length === 0) return "unknown";
  const { askJev, choiceOf } = await import("./jev");
  const criteria: Record<string, string | null> = {};
  catalog.forEach((c, i) => (criteria[`c${i}`] = c));
  const r = await askJev(
    "loop-classify",
    { post: { cover: title, options } },
    { cat: { type: "choice", instructions: "Which category best describes `post`?", criteria } }
  );
  const c = choiceOf(r, "cat");
  return c ? (catalog[Number(c.choice.slice(1))] ?? "unknown") : "unknown";
}

// ─── 2. Scoring ──────────────────────────────────────────────────────

type MetricKey = "views" | "reach" | "shares" | "saves" | "follows" | "comments" | "likes" | "profileVisits";

/**
 * Weights (sum 1). Sends/shares and saves are the strongest reach signals
 * on Instagram, follows are the goal, views/reach anchor distribution,
 * comments are partly inflated on these accounts (pods), likes are cheap.
 */
export const METRIC_WEIGHTS: Record<MetricKey, number> = {
  views: 0.15,
  reach: 0.15,
  shares: 0.2,
  saves: 0.2,
  follows: 0.1,
  comments: 0.1,
  likes: 0.05,
  profileVisits: 0.05,
};
/** One viral outlier shouldn't own the scoreboard. */
const RATIO_CAP = 10;
const MAX_AGE_MS = 30 * 86_400_000;
const BASELINE_DAYS = 14;

type Metrics = Partial<Record<MetricKey, number | null>>;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Score of one platform's metrics against that brand/platform baseline
 * medians: Σ w·min(cap, (m+1)/(median+1)) over the metrics present on the
 * row, renormalized by the weights used. +1 smoothing keeps zero-median
 * metrics (shares, follows) from exploding. 1.0 ≈ a typical post.
 */
export function scorePlatform(m: Metrics, baseline: Record<MetricKey, number>): number | null {
  let num = 0;
  let den = 0;
  for (const k of Object.keys(METRIC_WEIGHTS) as MetricKey[]) {
    const v = m[k];
    if (v == null) continue;
    const ratio = Math.min(RATIO_CAP, (v + 1) / ((baseline[k] ?? 0) + 1));
    num += METRIC_WEIGHTS[k] * ratio;
    den += METRIC_WEIGHTS[k];
  }
  // Require an anchor (views or reach): likes+comments alone (Facebook
  // without read_insights) is too thin to rank on.
  if (den === 0 || (m.views == null && m.reach == null)) return null;
  return num / den;
}

export interface ScoredPost {
  postId: string;
  brand: LoopBrand;
  lane: string;
  postType: string;
  category: string;
  /** "research" when built on a competitor brief, else "own". */
  source?: "research" | "own";
  title: string;
  score: number;
  /** Instagram views, for the report. */
  views: number | null;
  permalink: string | null;
  postedAt: string;
}

/**
 * Score every loop-lane post 48h–30d old. Instagram is the anchor; once
 * Facebook views/reach exist (read_insights), FB blends in at 30%.
 */
export async function scorePosts(opts: { minAgeHours?: number } = {}): Promise<ScoredPost[]> {
  const { prisma } = await import("@/lib/prisma");
  const now = Date.now();
  const minAgeMs = (opts.minAgeHours ?? 48) * 3_600_000;
  const rows = await prisma.socialPublish.findMany({
    where: {
      status: "POSTED",
      accountKey: { in: ["ripple", "bwk", "mythicals"] },
      platform: { in: ["instagram", "facebook"] },
      postedAt: { gte: new Date(now - MAX_AGE_MS - BASELINE_DAYS * 86_400_000) },
    },
    select: {
      carouselPostId: true,
      accountKey: true,
      platform: true,
      postedAt: true,
      permalink: true,
      views: true,
      reach: true,
      shares: true,
      saves: true,
      follows: true,
      comments: true,
      likes: true,
      profileVisits: true,
      carouselPost: { select: { lane: true, headline: true, topicSlug: true } },
    },
  });
  const old = (r: (typeof rows)[number]) => !!r.postedAt && now - r.postedAt.getTime() >= minAgeMs;
  const keys = Object.keys(METRIC_WEIGHTS) as MetricKey[];

  // Baselines per brand + platform over the trailing 14 days. Prefer the
  // loop lanes' own posts (the format we're steering) when there are ≥5;
  // otherwise the whole account.
  const baselines = new Map<string, Record<MetricKey, number>>();
  const baselineFor = (brand: string, platform: string) => {
    const k = `${brand}:${platform}`;
    if (baselines.has(k)) return baselines.get(k)!;
    const pool = rows.filter(
      (r) => r.accountKey === brand && r.platform === platform && old(r) && now - r.postedAt!.getTime() <= (BASELINE_DAYS + 2) * 86_400_000
    );
    const loopPool = pool.filter((r) => LOOP_LANES[r.carouselPost.lane ?? ""]);
    const use = loopPool.length >= 5 ? loopPool : pool;
    const b = {} as Record<MetricKey, number>;
    for (const m of keys) b[m] = median(use.map((r) => r[m]).filter((x): x is number => typeof x === "number"));
    baselines.set(k, b);
    return b;
  };

  const byPost = new Map<string, { ig?: (typeof rows)[number]; fb?: (typeof rows)[number] }>();
  for (const r of rows) {
    const lane = r.carouselPost.lane ?? "";
    if (!LOOP_LANES[lane] || !old(r) || now - r.postedAt!.getTime() > MAX_AGE_MS) continue;
    const e = byPost.get(r.carouselPostId) ?? {};
    if (r.platform === "instagram") e.ig = r;
    else e.fb = r;
    byPost.set(r.carouselPostId, e);
  }

  const out: ScoredPost[] = [];
  for (const [postId, e] of byPost) {
    const any = (e.ig ?? e.fb)!;
    const brand = LOOP_LANES[any.carouselPost.lane ?? ""];
    const ig = e.ig ? scorePlatform(e.ig, baselineFor(brand, "instagram")) : null;
    const fb = e.fb ? scorePlatform(e.fb, baselineFor(brand, "facebook")) : null;
    const score = ig != null && fb != null ? 0.7 * ig + 0.3 * fb : ig ?? fb;
    if (score == null) continue;
    const recipe = await readRecipe(postId);
    out.push({
      postId,
      brand,
      lane: any.carouselPost.lane ?? "",
      postType: recipe?.postType ?? (brand === "mythicals" ? mythicModeFromSlug(any.carouselPost.topicSlug) : "pick"),
      category: recipe?.category ?? "unknown",
      source: recipe?.researchSeed ? "research" : "own",
      title: any.carouselPost.headline,
      score: Math.round(score * 1000) / 1000,
      views: e.ig?.views ?? null,
      permalink: e.ig?.permalink ?? e.fb?.permalink ?? null,
      postedAt: any.postedAt!.toISOString(),
    });
  }
  return out;
}

// ─── 3. Scoreboard ───────────────────────────────────────────────────

export type ArmLabel = "proven winner" | "solid" | "weak" | "untested";

/** n<3 → untested; mean ≥1.25 → proven winner; ≥0.85 → solid; else weak. */
export const LABEL_RULES = { minN: 3, winner: 1.25, solid: 0.85 };

export function labelFor(n: number, mean: number): ArmLabel {
  if (n < LABEL_RULES.minN) return "untested";
  if (mean >= LABEL_RULES.winner) return "proven winner";
  if (mean >= LABEL_RULES.solid) return "solid";
  return "weak";
}

export interface ArmStat {
  n: number;
  mean: number;
  label: ArmLabel;
}

export interface Scoreboard {
  brand: LoopBrand;
  updatedAt: string;
  posts: number;
  /** Key: post type. */
  postTypes: Record<string, ArmStat>;
  /** Key: `${postType}::${category}`. */
  categories: Record<string, ArmStat>;
  /** Key: "research" (built on a competitor brief) | "own" (2026-10-01). */
  sources?: Record<string, ArmStat>;
  top: ScoredPost[];
  bottom: ScoredPost[];
}

function aggregate(items: ScoredPost[], key: (p: ScoredPost) => string): Record<string, ArmStat> {
  const groups = new Map<string, number[]>();
  for (const p of items) groups.set(key(p), [...(groups.get(key(p)) ?? []), p.score]);
  const out: Record<string, ArmStat> = {};
  for (const [k, xs] of groups) {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    out[k] = { n: xs.length, mean: Math.round(mean * 1000) / 1000, label: labelFor(xs.length, mean) };
  }
  return out;
}

export function buildScoreboard(brand: LoopBrand, scored: ScoredPost[]): Scoreboard {
  const mine = scored.filter((p) => p.brand === brand);
  const sorted = [...mine].sort((a, b) => b.score - a.score);
  return {
    brand,
    updatedAt: new Date().toISOString(),
    posts: mine.length,
    postTypes: aggregate(mine, (p) => p.postType),
    categories: aggregate(mine, (p) => `${p.postType}::${p.category}`),
    sources: aggregate(mine, (p) => p.source ?? "own"),
    top: sorted.slice(0, 3),
    bottom: sorted.length > 3 ? sorted.slice(-3).reverse() : [],
  };
}

export const scoreboardPath = (brand: LoopBrand) => `scoreboard/${brand}.json`;

export async function readScoreboard(brand: LoopBrand): Promise<Scoreboard | null> {
  return readJson<Scoreboard>(scoreboardPath(brand));
}

/** Backfill recipes, score, and write all three scoreboards. */
export async function refreshScoreboards(): Promise<Scoreboard[]> {
  const backfilled = await backfillRecipes().catch((err) => {
    console.warn("[performance-loop] backfill failed:", err instanceof Error ? err.message : err);
    return 0;
  });
  const scored = await scorePosts();
  const boards = (["mythicals", "ripple", "bwk"] as LoopBrand[]).map((b) => buildScoreboard(b, scored));
  for (const b of boards) await writeJson(scoreboardPath(b.brand), b);
  console.log(`[performance-loop] backfilled ${backfilled} recipes; scored ${scored.length} posts`);
  return boards;
}

// ─── 4. Decisions ────────────────────────────────────────────────────

/** Share of decisions spent deliberately on the least-tried arms. */
export const EXPLORE_RATE = 0.25;
/** Thompson prior: mean 1.0 (a typical post) worth 2 observations, sd 0.5. */
const PRIOR_MEAN = 1;
const PRIOR_N = 2;
const PRIOR_SD = 0.5;

function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

export interface ArmChoice {
  arm: string;
  reason: "explore" | "thompson" | "only-option";
  /** The sampled value per arm (Thompson) for logging. */
  samples?: Record<string, number>;
}

/**
 * Bandit over `arms` using `stats` (keyed by arm). With EXPLORE_RATE
 * probability: pick uniformly among the least-tried arms (untested ones
 * first). Otherwise Thompson sampling: draw from each arm's posterior
 * N((n·mean + PRIOR_N·1)/(n+PRIOR_N), PRIOR_SD/√(n+PRIOR_N)) and take the
 * max. Untested arms sit at the prior (1.0 ± 0.35), so they keep winning
 * draws now and then even outside the explore share.
 */
export function chooseArm(
  arms: string[],
  stats: Record<string, { n: number; mean: number }>,
  opts: { explore?: number; rng?: () => number } = {}
): ArmChoice {
  const rng = opts.rng ?? Math.random;
  if (arms.length === 0) throw new Error("chooseArm: no arms");
  if (arms.length === 1) return { arm: arms[0], reason: "only-option" };
  if (rng() < (opts.explore ?? EXPLORE_RATE)) {
    const minN = Math.min(...arms.map((a) => stats[a]?.n ?? 0));
    const least = arms.filter((a) => (stats[a]?.n ?? 0) === minN);
    return { arm: least[Math.floor(rng() * least.length)], reason: "explore" };
  }
  const samples: Record<string, number> = {};
  let best = arms[0];
  for (const a of arms) {
    const s = stats[a] ?? { n: 0, mean: PRIOR_MEAN };
    const mu = (s.n * s.mean + PRIOR_N * PRIOR_MEAN) / (s.n + PRIOR_N);
    const sd = PRIOR_SD / Math.sqrt(s.n + PRIOR_N);
    samples[a] = Math.round((mu + sd * gaussian(rng)) * 1000) / 1000;
    if (samples[a] > samples[best]) best = a;
  }
  return { arm: best, reason: "thompson", samples };
}

/**
 * Mythicals post type for this run. Types already posted today are
 * skipped, unless a used type is a proven winner that beats every fresh
 * type's mean by ≥0.3 (a strong, measured preference). No scoreboard →
 * uniform random among fresh types (the pre-loop behavior).
 */
export function chooseMythicPostType(
  board: Scoreboard | null,
  usedToday: Set<string>,
  rng: () => number = Math.random
): ArmChoice {
  // "size" is a daily series the cron schedules itself (2026-10-01), so
  // it never comes out of the draw; "versus" joined the draw the same day.
  const MODES = ["choice", "duo", "place", "know", "scenario", "versus"];
  const fresh = MODES.filter((m) => !usedToday.has(m));
  const pool = fresh.length ? fresh : MODES;
  if (!board) return { arm: pool[Math.floor(rng() * pool.length)], reason: "explore" };
  const stats = board.postTypes;
  const bestFresh = Math.max(0, ...pool.map((m) => stats[m]?.mean ?? 0));
  const strong = MODES.filter(
    (m) => usedToday.has(m) && stats[m]?.label === "proven winner" && stats[m].mean >= bestFresh + 0.3
  );
  return chooseArm([...pool, ...strong.filter((m) => !pool.includes(m))], stats, { rng });
}

/** Category within a post type (or pick theme family), avoiding `recent`. */
export function chooseCategory(
  board: Scoreboard | null,
  postType: string,
  catalog: string[],
  recent: string[],
  rng: () => number = Math.random
): ArmChoice {
  const fresh = catalog.filter((c) => !recent.includes(c));
  const pool = fresh.length ? fresh : catalog;
  const stats: Record<string, { n: number; mean: number }> = {};
  if (board) for (const c of pool) if (board.categories[`${postType}::${c}`]) stats[c] = board.categories[`${postType}::${c}`];
  return chooseArm(pool, stats, { rng });
}

/**
 * Plain-words scoreboard context for Jev and the writers: what has worked
 * and what hasn't on this account. Empty strings when there's no data.
 */
export function whatWorksContext(board: Scoreboard | null): { whatWorks: string; whatDoesnt: string } {
  if (!board) return { whatWorks: "", whatDoesnt: "" };
  const fmt = (k: string) => k.replace("::", ": ");
  const entries = [
    ...Object.entries(board.postTypes).map(([k, v]) => [`${k} posts`, v] as const),
    ...Object.entries(board.categories).map(([k, v]) => [fmt(k), v] as const),
  ];
  const works = entries.filter(([, v]) => v.label === "proven winner" || v.label === "solid");
  const doesnt = entries.filter(([, v]) => v.label === "weak");
  return {
    whatWorks: works.map(([k, v]) => `${k} (${v.label}, ${v.n} posts)`).join("; "),
    whatDoesnt: doesnt.map(([k, v]) => `${k} (weak, ${v.n} posts)`).join("; "),
  };
}

/** Small code nudge for a theme by its label (used on top of Jev's score). */
export function labelBonus(label: ArmLabel | undefined): number {
  return label === "proven winner" ? 0.05 : label === "weak" ? -0.05 : 0;
}

// ─── 5. Weekly report ────────────────────────────────────────────────

const BRAND_NAME: Record<LoopBrand, string> = {
  mythicals: "Legendary Mythicals",
  ripple: "Ripple",
  bwk: "Build With Key",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function reportHtml(boards: Scoreboard[]): string {
  const postRow = (p: ScoredPost) =>
    `<tr><td style="padding:4px 8px">${p.permalink ? `<a href="${esc(p.permalink)}">${esc(p.title)}</a>` : esc(p.title)}</td><td style="padding:4px 8px">${esc(p.postType)}</td><td style="padding:4px 8px;text-align:right">${p.score.toFixed(2)}</td><td style="padding:4px 8px;text-align:right">${p.views ?? "–"}</td></tr>`;
  const table = (rows: string, head: string[]) =>
    `<table style="border-collapse:collapse;font-size:13px;margin:6px 0 14px"><tr>${head.map((h) => `<th style="text-align:left;padding:4px 8px;border-bottom:1px solid #ddd">${h}</th>`).join("")}</tr>${rows}</table>`;
  const armRows = (stats: Record<string, ArmStat>) =>
    Object.entries(stats)
      .sort((a, b) => b[1].mean - a[1].mean)
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 8px">${esc(k.replace("::", " · "))}</td><td style="padding:4px 8px">${v.label}</td><td style="padding:4px 8px;text-align:right">${v.n}</td><td style="padding:4px 8px;text-align:right">${v.mean.toFixed(2)}</td></tr>`
      )
      .join("");
  const sections = boards.map((b) => {
    const more = Object.entries({ ...b.postTypes, ...b.categories }).filter(([, v]) => v.label === "proven winner").map(([k]) => k.replace("::", " · "));
    const less = Object.entries({ ...b.postTypes, ...b.categories }).filter(([, v]) => v.label === "weak").map(([k]) => k.replace("::", " · "));
    const testing = Object.entries({ ...b.postTypes, ...b.categories }).filter(([, v]) => v.label === "untested").length;
    return `<h2 style="font-size:17px;margin:22px 0 4px">${BRAND_NAME[b.brand]}</h2>
<p style="margin:0 0 8px;color:#555">${b.posts} posts scored (48 hours to 30 days old). Score 1.00 = a typical post for this account; 2.00 = twice as strong.</p>
${b.posts === 0 ? `<p>No posts old enough to score yet.</p>` : `
<b>Top posts</b>${table(b.top.map(postRow).join(""), ["Post", "Type", "Score", "IG views"])}
${b.bottom.length ? `<b>Bottom posts</b>${table(b.bottom.map(postRow).join(""), ["Post", "Type", "Score", "IG views"])}` : ""}
<b>By post type</b>${table(armRows(b.postTypes), ["Type", "Label", "Posts", "Avg score"])}
<b>By topic</b>${table(armRows(b.categories), ["Topic", "Label", "Posts", "Avg score"])}
${b.sources?.research ? `<b>Built on competitor research vs our own ideas</b>${table(armRows(b.sources), ["Source", "Label", "Posts", "Avg score"])}` : ""}`}
<p style="margin:4px 0"><b>Doing more of:</b> ${more.length ? esc(more.join(", ")) : "nothing proven yet"}</p>
<p style="margin:4px 0"><b>Doing less of:</b> ${less.length ? esc(less.join(", ")) : "nothing flagged weak yet"}</p>
<p style="margin:4px 0"><b>Testing:</b> ${testing} untested types/topics in rotation; about 1 in 4 posts goes to the least-tried ones.</p>`;
  });
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;max-width:760px">
<h1 style="font-size:20px;margin:0 0 6px">Weekly content performance</h1>
<p style="margin:0;color:#555">What won, what lost, and what the loop will post more and less of next week. Instagram numbers only until Facebook insights are connected.</p>
${sections.join("\n")}
</div>`;
}

export async function sendPerformanceReport(boards?: Scoreboard[]): Promise<{ sent: boolean; id?: string }> {
  const use =
    boards ??
    ((await Promise.all((["mythicals", "ripple", "bwk"] as LoopBrand[]).map(readScoreboard))).filter(Boolean) as Scoreboard[]);
  const { sendEmailOrThrow } = await import("@/lib/resend");
  const res = await sendEmailOrThrow({
    from: process.env.CONTENT_FACTORY_EMAIL_FROM ?? '"Ripple Content" <content@getacuity.io>',
    to: process.env.CONTENT_FACTORY_EMAIL_TO ?? "keenan@heelerdigital.com",
    subject: `Weekly content performance — ${new Date().toISOString().slice(0, 10)}`,
    html: reportHtml(use),
  });
  return { sent: true, id: res?.id };
}

// ─── Mythicals: 3 cover candidates → Jev picks ───────────────────────

const MYTHIC_COMMENT_LEVELS = [
  "Nobody would comment, tag or send it",
  "A few might comment a number",
  "Many would comment their number",
  "Many would comment their number AND tag or send it to a friend",
  "It would start a thread: numbers, reasons, and friends tagged",
];

/**
 * Sonnet writes three short cover questions for the chosen post type and
 * category; Jev picks one with the scoreboard as context (scroll-stop +
 * comment/send likelihood, cover-only clarity as a weight). The
 * winner is handed to generateChoiceTopic as guidance. Returns null on any
 * failure (the writer then works from the category alone, as before).
 */
export async function chooseMythicCover(opts: {
  postType: string;
  category: string;
  recentTitles: string[];
  board: Scoreboard | null;
}): Promise<{ title: string; table: string } | null> {
  try {
    const { contentAnthropic, CONTENT_MODEL, CONTENT_INPUT_COST_PER_TOKEN, CONTENT_OUTPUT_COST_PER_TOKEN, lastJsonText } =
      await import("./claude-client");
    const { copyObjectives } = await import("./copy-objectives");
    const { prisma } = await import("@/lib/prisma");
    const ctx = whatWorksContext(opts.board);
    const start = Date.now();
    const shape: Record<string, string> = {
      choice: '"WHICH BEAST WOULD YOU RIDE?"',
      duo: '"WHICH DUO ARE YOU AND YOUR BRO?"',
      place: '"WHERE DO YOU AND BRO MAKE YOUR LAST STAND?"',
      know: '"IF YOU KNOW HER, WHAT ARMOR DOES SHE CHOOSE?"',
      scenario: '"YOU CLEARED THE DUNGEON. CHOOSE YOUR LEGENDARY ITEM."',
      versus: '"MONSTER VS MONSTER: WHO WOULD WIN?"',
    };
    const response = await contentAnthropic.messages.create({
      max_tokens: 700,
      effort: "low",
      system: `${copyObjectives("mythicals")}

YOUR JOB: write three different cover questions for one post. Post type: ${opts.postType} (shape like ${shape[opts.postType] ?? shape.choice}; shape only, new words). Subject: ${opts.category}. Each cover is 4-12 words, ALL-CAPS ready, makes complete sense on its own, and is easy to answer with a number in the comments. The three must take clearly different angles.${ctx.whatWorks ? `\nWhat has worked on this account: ${ctx.whatWorks}.` : ""}${ctx.whatDoesnt ? `\nWhat has not: ${ctx.whatDoesnt}.` : ""}
Never reuse these recent covers: ${opts.recentTitles.slice(0, 30).join(" | ") || "none"}.

OUTPUT (JSON): { "titles": ["...", "...", "..."] }`,
      messages: [{ role: "user", content: "Write the three covers." }],
    });
    await prisma.claudeCallLog
      .create({
        data: {
          purpose: `loop-mythic-covers:${opts.postType}`,
          model: CONTENT_MODEL,
          tokensIn: response.usage.input_tokens,
          tokensOut: response.usage.output_tokens,
          costCents: Math.ceil(
            (response.usage.input_tokens * CONTENT_INPUT_COST_PER_TOKEN +
              response.usage.output_tokens * CONTENT_OUTPUT_COST_PER_TOKEN) *
              100
          ),
          durationMs: Date.now() - start,
          success: true,
        },
      })
      .catch(() => {});
    const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const rawTitles = (JSON.parse(lastJsonText(text)) as { titles?: unknown }).titles;
    const titles = (Array.isArray(rawTitles) ? (rawTitles as unknown[]) : [])
      .filter((t): t is string => typeof t === "string" && !!t.trim())
      .map((t) => t.trim())
      .slice(0, 3);
    if (titles.length === 0) return null;
    return await pickMythicCover(titles, ctx);
  } catch (err) {
    console.warn("[performance-loop] mythic cover candidates failed — writer works from the category:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Jev scoring for Mythicals cover candidates (exported for tests). */
export async function pickMythicCover(
  titles: string[],
  ctx: { whatWorks: string; whatDoesnt: string }
): Promise<{ title: string; table: string } | null> {
  const { askJev, scoreOf, noulOf, SCROLL_STOP_LEVELS } = await import("./jev");
  const q: Parameters<typeof askJev>[2] = {};
  const qc: Parameters<typeof askJev>[2] = {};
  titles.forEach((_, i) => {
    q[`scroll_${i}`] = {
      type: "score",
      instructions: `How strongly would a fantasy and gaming fan stop scrolling for a post whose cover is \`covers[${i}]\`? Use \`history\` (what has and hasn't worked on this account) as context.`,
      criteria: SCROLL_STOP_LEVELS,
    };
    q[`comment_${i}`] = {
      type: "score",
      instructions: `A post's cover is \`covers[${i}]\` and it shows five numbered picks. How likely is a fantasy fan to comment a number, tag a friend or send it on?`,
      criteria: MYTHIC_COMMENT_LEVELS,
    };
    qc[`clear_${i}`] = {
      type: "noul",
      instructions: `Reading ONLY \`covers[${i}]\` as an Instagram post cover, with nothing else to go on, can a stranger tell what the post is about?`,
    };
  });
  const [r, rc] = await Promise.all([
    askJev(
      "loop-mythic-cover",
      { history: { what_works: ctx.whatWorks || "no data yet", what_doesnt: ctx.whatDoesnt || "no data yet" }, covers: titles },
      q
    ),
    askJev("loop-mythic-cover-clear", { covers: titles }, qc),
  ]);
  if (!r || !rc) return { title: titles[0], table: "jev unavailable — first title" };
  let best = 0;
  let bestScore = -Infinity;
  const rows = titles.map((t, i) => {
    const scroll = scoreOf(r, `scroll_${i}`) ?? 0;
    const comment = scoreOf(r, `comment_${i}`) ?? 0;
    const clear = noulOf(rc, `clear_${i}`) ?? 0;
    // Clarity is a weight here, not a gate: Mythicals covers follow fixed,
    // proven shapes ("IF YOU KNOW HER, WHAT ARMOR DOES SHE CHOOSE?") that
    // Jev's cover-only clarity scores ~0.3 in tests (2026-09-30).
    const score = 0.45 * scroll + 0.4 * comment + 0.15 * clear;
    const eligible = true;
    if (eligible && score > bestScore) {
      bestScore = score;
      best = i;
    }
    return { t, score, scroll, comment, clear, eligible };
  });
  return {
    title: titles[best],
    table: rows
      .map((x, i) => `${i === best ? "*" : " "} ${x.score.toFixed(3)} scroll=${x.scroll.toFixed(2)} comment=${x.comment.toFixed(2)} clear=${x.clear.toFixed(2)}${x.eligible ? "" : " INELIGIBLE"}  ${x.t}`)
      .join("\n"),
  };
}
