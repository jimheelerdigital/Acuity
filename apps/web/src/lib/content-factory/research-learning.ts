/**
 * Research learning (2026-10-02, per Keenan: "build everything that we need
 * to continue this project"). Closes the loop between competitor research
 * and OUR results, so the weekly scrape spends its Apify budget where it
 * pays off:
 *
 *   1. SOURCE CREDIT — every pick post built on a brief records the brief
 *      (recipe.researchSeed). Its 48h score (performance loop) is credited
 *      to the brief's account and, for search finds, to the search phrase.
 *      Weak sources stop feeding seeds and get paused; proven ones go first.
 *   2. KEYWORD EVOLUTION — each run logs how many standouts every search
 *      phrase found. A phrase with no standouts in its last 3 runs is
 *      retired, and Opus proposes replacements from what this audience is
 *      engaging with. The phrase count per brand stays fixed (cost flat).
 *
 * State lives in the content-factory bucket next to the scoreboards:
 *   research/keywords.json        active / retired phrases per brand
 *   research/keyword-runs.json    per-run yield history (last 30 runs)
 *   research/learning.json        source scoreboard
 */

import { readJson, writeJson, labelFor, type ArmStat } from "./performance-loop";
import { SEARCH_KEYWORDS, type ResearchBrand } from "./competitor-discovery";

const KEYWORDS_PATH = "research/keywords.json";
const RUNS_PATH = "research/keyword-runs.json";
const LEARNING_PATH = "research/learning.json";

/** Runs with zero standouts before a phrase is retired. */
const RETIRE_AFTER_EMPTY_RUNS = 3;
/** Phrases per brand (fixed, so Apify cost stays flat). */
const KEYWORDS_PER_BRAND: Record<ResearchBrand, number> = {
  ripple: SEARCH_KEYWORDS.ripple.length,
  bwk: SEARCH_KEYWORDS.bwk.length,
};

export interface KeywordEntry {
  keyword: string;
  status: "active" | "retired";
  origin: "seed" | "opus";
  addedAt: string;
  retiredAt?: string;
  reason?: string;
}
export type KeywordBook = Record<ResearchBrand, KeywordEntry[]>;

export interface KeywordRun {
  date: string;
  brand: ResearchBrand;
  keyword: string;
  results: number;
  standouts: number;
}

export interface ResearchLearning {
  updatedAt: string;
  /** Key: "account:<handle>" or "keyword:<phrase>". */
  sources: Record<string, ArmStat & { brand: ResearchBrand }>;
}

// ─── Keywords ─────────────────────────────────────────────────────────

export async function readKeywordBook(): Promise<KeywordBook> {
  const stored = await readJson<KeywordBook>(KEYWORDS_PATH);
  if (stored) return stored;
  const now = new Date().toISOString();
  const seed = (b: ResearchBrand): KeywordEntry[] =>
    SEARCH_KEYWORDS[b].map((keyword) => ({ keyword, status: "active", origin: "seed", addedAt: now }));
  return { ripple: seed("ripple"), bwk: seed("bwk") };
}

/** The phrases this run should search, per brand. */
export async function activeKeywords(): Promise<Record<ResearchBrand, string[]>> {
  const book = await readKeywordBook();
  const pick = (b: ResearchBrand) => book[b].filter((k) => k.status === "active").map((k) => k.keyword);
  return { ripple: pick("ripple"), bwk: pick("bwk") };
}

/** Append this run's per-phrase yield (keeps the last 30 runs' rows). */
export async function recordKeywordRun(rows: Omit<KeywordRun, "date">[]): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const history = (await readJson<KeywordRun[]>(RUNS_PATH)) ?? [];
  const dates = [...new Set([...history.map((r) => r.date), date])].sort().slice(-30);
  const kept = history.filter((r) => dates.includes(r.date) && r.date !== date);
  await writeJson(RUNS_PATH, [...kept, ...rows.map((r) => ({ ...r, date }))]);
}

/**
 * Retire phrases with no standouts in their last RETIRE_AFTER_EMPTY_RUNS
 * runs, then refill each brand back to its fixed size with Opus proposals.
 * Returns what changed, for the weekly email.
 */
export async function evolveKeywords(): Promise<{ retired: string[]; added: string[] }> {
  const book = await readKeywordBook();
  const history = (await readJson<KeywordRun[]>(RUNS_PATH)) ?? [];
  const now = new Date().toISOString();
  const retired: string[] = [];
  const added: string[] = [];

  for (const brand of ["ripple", "bwk"] as const) {
    for (const k of book[brand]) {
      if (k.status !== "active") continue;
      const runs = history
        .filter((r) => r.brand === brand && r.keyword === k.keyword)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, RETIRE_AFTER_EMPTY_RUNS);
      if (runs.length >= RETIRE_AFTER_EMPTY_RUNS && runs.every((r) => r.standouts === 0)) {
        k.status = "retired";
        k.retiredAt = now;
        k.reason = `no standout posts in ${RETIRE_AFTER_EMPTY_RUNS} runs`;
        retired.push(`${brand}: ${k.keyword}`);
      }
    }
    const active = book[brand].filter((k) => k.status === "active");
    const open = KEYWORDS_PER_BRAND[brand] - active.length;
    if (open <= 0) continue;
    const proposals = await proposeKeywords(brand, book[brand], history, open).catch((e) => {
      console.warn(`[research-learning] keyword proposals failed (${brand}):`, e instanceof Error ? e.message : e);
      return [] as string[];
    });
    for (const keyword of proposals) {
      book[brand].push({ keyword, status: "active", origin: "opus", addedAt: now });
      added.push(`${brand}: ${keyword}`);
    }
  }
  await writeJson(KEYWORDS_PATH, book);
  return { retired, added };
}

/** Opus proposes new TikTok search phrases from what is working. */
async function proposeKeywords(
  brand: ResearchBrand,
  entries: KeywordEntry[],
  history: KeywordRun[],
  n: number
): Promise<string[]> {
  const { contentAnthropic, CONTENT_MODEL, lastJsonText } = await import("./claude-client");
  const { getResearchSeeds } = await import("./competitor-mimic");
  const yieldOf = (kw: string) => {
    const rs = history.filter((r) => r.brand === brand && r.keyword === kw);
    return `${rs.reduce((s, r) => s + r.standouts, 0)} standouts in ${rs.length} runs`;
  };
  const seeds = await getResearchSeeds(brand, 6);
  const audience =
    brand === "ripple"
      ? "women roughly 40-50 carrying a heavy mental load (household, family, work; the invisible work; identity set aside)"
      : "men roughly 20-45 rebuilding themselves: discipline, habits, self-respect (not money schemes, not dating advice)";
  const res = await contentAnthropic.messages.create({
    model: CONTENT_MODEL,
    max_tokens: 600,
    system: `You choose TikTok search phrases for competitor research. The audience: ${audience}. A good phrase is what this audience actually types into TikTok search, 1-5 words, and returns posts MADE FOR them (not for a different age, gender or interest). Avoid medical topics, money schemes and anything a sales account would dominate. Return {"phrases":["..."]} only.`,
    messages: [
      {
        role: "user",
        content: [
          `Current phrases and how they did:\n${entries.map((e) => `- "${e.keyword}" (${e.status}; ${yieldOf(e.keyword)})`).join("\n")}`,
          seeds.length
            ? `What this audience engaged with most this week (research briefs):\n${seeds.map((s) => `- ${s.brief.hook} | their words: ${s.brief.phrases.join(", ")}`).join("\n")}`
            : "",
          `Propose exactly ${n} NEW phrases, different from every phrase above (active or retired), close to what has produced standouts.`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const parsed = JSON.parse(lastJsonText(text)) as { phrases?: unknown[] };
  const seen = new Set(entries.map((e) => e.keyword.toLowerCase()));
  return (parsed.phrases ?? [])
    .filter((p): p is string => typeof p === "string")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p && p.split(/\s+/).length <= 6 && !seen.has(p))
    .slice(0, n);
}

// ─── Source credit ───────────────────────────────────────────────────

/**
 * Credit each research-seeded post's 48h score to its brief's account and
 * search phrase. Writes research/learning.json and returns it.
 */
export async function refreshResearchLearning(): Promise<ResearchLearning> {
  const { prisma } = await import("@/lib/prisma");
  const { scorePosts, readRecipe } = await import("./performance-loop");
  const scored = await scorePosts();
  const groups = new Map<string, { brand: ResearchBrand; scores: number[] }>();
  for (const p of scored) {
    if (p.source !== "research" || p.brand === "mythicals") continue;
    const recipe = await readRecipe(p.postId);
    if (!recipe?.researchSeed) continue;
    const seed = await prisma.competitorPost.findUnique({
      where: { id: recipe.researchSeed },
      select: { account: { select: { handle: true, niche: true } } },
    });
    if (!seed) continue;
    const keys = [`account:${seed.account.handle}`];
    if (seed.account.niche?.startsWith("search: ")) keys.push(`keyword:${seed.account.niche.slice(8)}`);
    for (const k of keys) {
      const g = groups.get(k) ?? { brand: p.brand, scores: [] };
      g.scores.push(p.score);
      groups.set(k, g);
    }
  }
  const sources: ResearchLearning["sources"] = {};
  for (const [k, g] of groups) {
    const mean = g.scores.reduce((a, b) => a + b, 0) / g.scores.length;
    sources[k] = { brand: g.brand, n: g.scores.length, mean: Math.round(mean * 1000) / 1000, label: labelFor(g.scores.length, mean) };
  }
  const out: ResearchLearning = { updatedAt: new Date().toISOString(), sources };
  await writeJson(LEARNING_PATH, out);
  return out;
}

export async function readResearchLearning(): Promise<ResearchLearning | null> {
  return readJson<ResearchLearning>(LEARNING_PATH);
}

/** A source's label ("account:<handle>" / "keyword:<phrase>"), or untested. */
export function sourceLabel(learning: ResearchLearning | null, key: string): ArmStat["label"] {
  return learning?.sources[key]?.label ?? "untested";
}
