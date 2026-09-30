/**
 * Jev #5 — research triage (2026-09-30). Jev screens the raw research
 * items BEFORE Claude sees them:
 *
 *   - Reddit: every scraped thread title gets an on-audience Noul, a
 *     "could this become a relatable post" Score and an off-limits Noul.
 *     Off-limits and clearly off-audience threads are dropped; the rest
 *     are reordered best-first inside each subreddit block.
 *   - Competitors: every candidate outlier gets a "format worth learning
 *     from" Score and an "is this mainly an ad/product/giveaway" Noul.
 *     Promo posts are dropped; the rest are ranked and the caller keeps
 *     its usual count.
 *
 * FAIL OPEN: both functions return null when Jev is off or every call
 * failed, and callers then run exactly as they did before. A chunk that
 * fails on its own leaves its items unscored and kept (neutral rank).
 * Counting, percentiles and engagement math stay in code; Jev only sees
 * named buckets.
 */

import { askJev, jevEnabled, noulOf, scoreOf, type JevQuestion, type JevResult } from "./jev";

export type TriageBrand = "ripple" | "bwk";

/** One-line audience description per brand (from copy-objectives.ts). */
export const TRIAGE_AUDIENCE: Record<TriageBrand, string> = {
  ripple:
    "women roughly 40-50 who carry the mental load for everyone around them: work, kids, a partner, aging parents, the invisible list that never ends",
  bwk: "men roughly 18-30 trying to build discipline and self-respect in private: training, money, focus, cutting what weakens them",
};

const ACCOUNT_LINE: Record<TriageBrand, string> = {
  ripple:
    "Ripple, an account that makes women 40-50 feel seen: it names what she is carrying (recognition posts, quiet questions, specific lived-in detail) and never lectures",
  bwk: "Build With Key, an account for young men that posts calm, austere standards and commands: concrete plans, timelines, counts, no hype",
};

/** Off-limits probability at or above this drops the item. */
export const OFF_LIMITS_DROP = 0.7;
/** On-audience probability below this drops the thread. */
export const OFF_AUDIENCE_DROP = 0.3;
/**
 * Promo probability at or above this drops a competitor post. Lower than
 * the off-limits bar on purpose: dropping one just means we brief the
 * next candidate, and "full system on my profile" funnel posts land at
 * ~0.55-0.6 (2026-09-30 test on stored posts).
 */
export const PROMO_DROP = 0.5;

const REDDIT_CHUNK = 20; // threads per Jev call (3 questions each)
const COMPETITOR_CHUNK = 15; // posts per Jev call (2 questions each)
const MAX_PARALLEL = 4;

const RELATABLE_LEVELS = [
  "Useless for a post: logistics, a narrow technical question, a product or news item the audience would not see themselves in",
  "Weak: on topic but too niche or too factual to build a post the reader recognizes herself or himself in",
  "Usable: a real situation, but a common one that would need a lot of work to feel specific",
  "Strong: a specific, lived-in situation or feeling many in the audience share and would recognize on sight",
  "Exceptional: names a feeling or moment so precisely the audience would say 'this is me', comment, and send it to a friend",
];

const LEARN_LEVELS = [
  "Nothing to learn: the format or angle does not transfer to our account at all",
  "Little: a generic format every account already uses",
  "Some: a usable structure, but nothing specific to our audience",
  "Strong: a hook shape or structure we could clearly run on our own subject for our audience",
  "Exceptional: a distinctive, transferable mechanic that would likely earn comments, saves or sends from our audience",
];

async function inBatches<T, R>(items: T[], size: number, fn: (chunk: T[], offset: number) => Promise<R>): Promise<R[]> {
  const chunks: { chunk: T[]; offset: number }[] = [];
  for (let i = 0; i < items.length; i += size) chunks.push({ chunk: items.slice(i, i + size), offset: i });
  const out: R[] = new Array(chunks.length);
  for (let i = 0; i < chunks.length; i += MAX_PARALLEL) {
    const wave = chunks.slice(i, i + MAX_PARALLEL);
    const res = await Promise.all(wave.map((c) => fn(c.chunk, c.offset)));
    res.forEach((r, j) => (out[i + j] = r));
  }
  return out;
}

const pct = (v: number | null) => (v === null ? "  - " : v.toFixed(2));

// ─── Reddit ──────────────────────────────────────────────────────────

export interface SubredditTitles {
  subreddit: string;
  titles: string[];
}

export interface RedditTriageRow {
  subreddit: string;
  title: string;
  audience: number | null;
  relatable: number | null;
  offLimits: number | null;
  kept: boolean;
  reason: string;
}

/**
 * Triage a brand's scraped subreddit titles. Returns the filtered,
 * reordered scrape (same shape) plus the per-thread table, or null when
 * Jev had no opinion at all (caller uses the original scrape).
 */
export async function triageRedditThreads(
  brand: TriageBrand,
  scraped: SubredditTitles[]
): Promise<{ scraped: SubredditTitles[]; rows: RedditTriageRow[] } | null> {
  if (!jevEnabled()) return null;
  const flat = scraped.flatMap((s) => s.titles.map((title) => ({ subreddit: s.subreddit, title })));
  if (flat.length === 0) return null;
  const audience = TRIAGE_AUDIENCE[brand];

  const results = await inBatches(flat, REDDIT_CHUNK, async (chunk) => {
    const questions: Record<string, JevQuestion> = {};
    chunk.forEach((_, i) => {
      questions[`t${i}_audience`] = {
        type: "noul",
        instructions: `Is threads[${i}] written by or about someone in the target audience (${audience})?`,
        criteria: {
          true: "The poster or the person the thread is about plausibly belongs to this audience, or the situation is one this audience lives",
          false: "The thread is clearly from or about a different group (a different age, gender or life stage) or has nothing to do with their lives",
        },
      };
      questions[`t${i}_relatable`] = {
        type: "score",
        instructions: `How well could the situation in threads[${i}] become a relatable social post for the target audience (${audience})? Judge the underlying situation or feeling, not the wording.`,
        criteria: RELATABLE_LEVELS,
      };
      questions[`t${i}_offlimits`] = {
        type: "noul",
        instructions: `Is threads[${i}] off-limits for a brand to build a public post from? Off-limits means: a medical crisis or urgent medical question, self-harm or suicide, explicit sexual content, politics, or a personal situation (grief, abuse, a crisis) that would be exploitative for a brand to adapt.`,
        criteria: {
          true: "Contains one of the off-limits categories",
          false: "Ordinary life, feelings, habits, family, work or self-improvement that a brand can respectfully reflect back",
        },
      };
    });
    return askJev(`reddit-triage-${brand}`, { audience, threads: chunk }, questions);
  });

  if (results.every((r) => r === null)) return null;

  const rows: RedditTriageRow[] = flat.map((item, idx) => {
    const r: JevResult | null = results[Math.floor(idx / REDDIT_CHUNK)];
    const i = idx % REDDIT_CHUNK;
    const aud = noulOf(r, `t${i}_audience`);
    const rel = scoreOf(r, `t${i}_relatable`);
    const off = noulOf(r, `t${i}_offlimits`);
    let kept = true;
    let reason = r ? "kept" : "kept (unscored: Jev chunk failed)";
    if (off !== null && off >= OFF_LIMITS_DROP) {
      kept = false;
      reason = `off-limits ${off.toFixed(2)}`;
    } else if (aud !== null && aud < OFF_AUDIENCE_DROP) {
      kept = false;
      reason = `off-audience ${aud.toFixed(2)}`;
    }
    return { ...item, audience: aud, relatable: rel, offLimits: off, kept, reason };
  });

  const rank = (row: RedditTriageRow) => (row.relatable ?? 0.5) + 0.1 * (row.audience ?? 0.5);
  const out: SubredditTitles[] = scraped
    .map((s) => ({
      subreddit: s.subreddit,
      titles: rows
        .filter((row) => row.subreddit === s.subreddit && row.kept)
        .sort((a, b) => rank(b) - rank(a))
        .map((row) => row.title),
    }))
    .filter((s) => s.titles.length > 0);

  logRedditTable(brand, rows);
  return { scraped: out, rows };
}

function logRedditTable(brand: TriageBrand, rows: RedditTriageRow[]): void {
  const kept = rows.filter((r) => r.kept).length;
  const lines = [
    `[research-triage] reddit ${brand}: kept ${kept}/${rows.length}`,
    "  keep  aud   rel   off   subreddit / title / reason",
    ...[...rows]
      .sort((a, b) => Number(b.kept) - Number(a.kept) || (b.relatable ?? 0.5) - (a.relatable ?? 0.5))
      .map(
        (r) =>
          `  ${r.kept ? "KEEP" : "DROP"}  ${pct(r.audience)}  ${pct(r.relatable)}  ${pct(r.offLimits)}  r/${r.subreddit}: ${r.title.slice(0, 90)}${r.kept ? "" : `  [${r.reason}]`}`
      ),
  ];
  console.log(lines.join("\n"));
}

// ─── Competitors ─────────────────────────────────────────────────────

export interface CompetitorCandidate {
  id: string;
  brand: TriageBrand;
  platform: string;
  handle: string;
  niche: string | null;
  caption: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  outlierScore: number;
}

export interface CompetitorTriageRow {
  id: string;
  handle: string;
  caption: string;
  engagement: string;
  reach: string;
  learn: number | null;
  promo: number | null;
  kept: boolean;
  reason: string;
}

/** Engagement rate in code; null when there is no real view count (IG static posts fall back to likes). */
function engagementRate(p: CompetitorCandidate): number | null {
  if (p.views <= 0 || p.views <= p.likes) return null;
  return (p.likes + p.comments + p.shares) / p.views;
}

function reachBucket(outlierScore: number): string {
  if (outlierScore >= 10) return "far above its account's usual reach (10x or more)";
  if (outlierScore >= 3) return "well above its account's usual reach (3-10x)";
  if (outlierScore >= 1.5) return "somewhat above its account's usual reach";
  return "around or below its account's usual reach";
}

/**
 * Triage candidate competitor posts and return the ids to use, best
 * first, capped at `keep` — or null when Jev had no opinion at all
 * (caller keeps its original first `keep`).
 */
export async function triageCompetitorPosts(
  posts: CompetitorCandidate[],
  keep: number
): Promise<{ ids: string[]; rows: CompetitorTriageRow[] } | null> {
  if (!jevEnabled() || posts.length === 0) return null;

  // Engagement-rate percentile within this pool (math in code).
  const rates = posts.map(engagementRate);
  const known = rates.filter((r): r is number => r !== null).sort((a, b) => a - b);
  const percentile = (r: number | null): number | null => {
    if (r === null || known.length === 0) return null;
    const below = known.filter((k) => k < r).length;
    return known.length === 1 ? 0.5 : below / (known.length - 1);
  };
  const engBucket = (p: number | null) =>
    p === null
      ? "unknown (no view count)"
      : p >= 0.9
        ? "top 10% engagement rate in this batch"
        : p >= 0.75
          ? "top quarter engagement rate in this batch"
          : p >= 0.25
            ? "middle of the batch for engagement rate"
            : "bottom quarter engagement rate in this batch";
  const commentBucket = (p: CompetitorCandidate) =>
    p.likes <= 0 ? "unknown" : p.comments / p.likes >= 0.05 ? "comment-heavy (lots of conversation)" : p.comments / p.likes >= 0.01 ? "normal comment share" : "few comments relative to likes";

  const enriched = posts.map((p, idx) => {
    const pc = percentile(rates[idx]);
    return {
      post: p,
      pctile: pc,
      state: {
        brand: p.brand,
        platform: p.platform,
        niche: p.niche ?? "unspecified",
        caption: (p.caption ?? "").slice(0, 700) || "(no caption: visual-only post)",
        engagement: engBucket(pc),
        comments: commentBucket(p),
        reach: reachBucket(p.outlierScore),
      },
    };
  });

  // One call per brand-chunk so the state carries that brand's account line.
  const byBrand = new Map<TriageBrand, typeof enriched>();
  for (const e of enriched) byBrand.set(e.post.brand, [...(byBrand.get(e.post.brand) ?? []), e]);

  const answers = new Map<string, { learn: number | null; promo: number | null; scored: boolean }>();
  let anyScored = false;
  for (const [brand, list] of byBrand) {
    const results = await inBatches(list, COMPETITOR_CHUNK, async (chunk) => {
      const questions: Record<string, JevQuestion> = {};
      chunk.forEach((_, i) => {
        questions[`p${i}_learn`] = {
          type: "score",
          instructions: `Ignoring its topic and wording, is the FORMAT or angle of posts[${i}] worth learning from for our account (${ACCOUNT_LINE[brand]})? Consider the hook shape, structure and why its audience engaged (see its engagement, comments and reach buckets).`,
          criteria: LEARN_LEVELS,
        };
        questions[`p${i}_promo`] = {
          type: "noul",
          instructions: `Is posts[${i}] mainly a product post, an ad, a giveaway, or a sales pitch (e.g. "DM me", "link in bio", a discount, a course or product launch)?`,
          criteria: {
            true: "Its main purpose is to sell, promote a product or offer, or run a giveaway",
            false: "Its main purpose is content: an idea, story, feeling, lesson or entertainment, even if it has a small plug",
          },
        };
      });
      return askJev(
        `competitor-triage-${brand}`,
        { ourAccount: ACCOUNT_LINE[brand], posts: chunk.map((c) => c.state) },
        questions
      );
    });
    list.forEach((e, idx) => {
      const r = results[Math.floor(idx / COMPETITOR_CHUNK)];
      const i = idx % COMPETITOR_CHUNK;
      if (r) anyScored = true;
      answers.set(e.post.id, { learn: scoreOf(r, `p${i}_learn`), promo: noulOf(r, `p${i}_promo`), scored: !!r });
    });
  }
  if (!anyScored) return null;

  const scoredRows = enriched.map((e) => {
    const a = answers.get(e.post.id)!;
    const rank = (a.learn ?? 0.5) + 0.1 * (e.pctile ?? 0.5);
    return { e, a, rank };
  });
  const eligible = scoredRows
    .filter((s) => !(s.a.promo !== null && s.a.promo >= PROMO_DROP))
    .sort((x, y) => y.rank - x.rank);
  const keptIds = new Set(eligible.slice(0, keep).map((s) => s.e.post.id));

  const rows: CompetitorTriageRow[] = scoredRows.map(({ e, a }) => {
    const isPromo = a.promo !== null && a.promo >= PROMO_DROP;
    const kept = keptIds.has(e.post.id);
    return {
      id: e.post.id,
      handle: e.post.handle,
      caption: (e.post.caption ?? "").replace(/\s+/g, " ").slice(0, 80),
      engagement: e.state.engagement,
      reach: e.state.reach,
      learn: a.learn,
      promo: a.promo,
      kept,
      reason: isPromo
        ? `promo ${a.promo!.toFixed(2)}`
        : kept
          ? a.scored ? "kept" : "kept (unscored: Jev chunk failed)"
          : `below top ${keep}`,
    };
  });

  const order = new Map(eligible.map((s, i) => [s.e.post.id, i]));
  console.log(
    [
      `[research-triage] competitors: kept ${keptIds.size}/${posts.length} (cap ${keep})`,
      "  keep  learn promo handle / engagement / caption / reason",
      ...[...rows]
        .sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9))
        .map(
          (r) =>
            `  ${r.kept ? "KEEP" : "DROP"}  ${pct(r.learn)}  ${pct(r.promo)}  @${r.handle} [${r.engagement}] ${r.caption || "(no caption)"}${r.kept ? "" : `  [${r.reason}]`}`
        ),
    ].join("\n")
  );

  return { ids: eligible.slice(0, keep).map((s) => s.e.post.id), rows };
}
