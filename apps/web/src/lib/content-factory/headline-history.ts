/**
 * Content Factory — cross-lane headline history (2026-09-23 audit:
 * 11 cover headlines reused in 30 days — "READ THESE SLOWLY" 4x, "EARN
 * YOUR SILENCE" 3x incl. once on the Ripple women's muse lane). Every
 * lane only ever saw its OWN recent titles, and prompt example headlines
 * were being copied verbatim, so nothing stopped the same cover landing
 * on three different lanes.
 *
 * One shared view of the last 60 days of CarouselPost.headline across
 * ALL lanes and BOTH brands:
 * - recentHeadlinesPromptBlock() — compact "do not reuse" block that
 *   every cover-writing generator appends to its prompt.
 * - isRecentHeadline() — exact match after normalization, checked after
 *   generation; generators retry once with repeatHeadlineFeedback().
 *
 * Soft everywhere: a DB error means an empty history (generation runs
 * exactly as before) — this must never fail a lane.
 */

const WINDOW_DAYS = 60;
const CACHE_TTL_MS = 5 * 60 * 1000;

interface HeadlineHistory {
  loadedAt: number;
  /** Display form, newest first, deduped by normalized form. */
  headlines: string[];
  normalized: Set<string>;
}

let cache: HeadlineHistory | null = null;
let inflight: Promise<HeadlineHistory> | null = null;

/** Lowercase, punctuation stripped, whitespace collapsed. "EARN YOUR SILENCE." === "earn your silence" */
export function normalizeHeadline(h: string): string {
  return h
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadHistory(): Promise<HeadlineHistory> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { prisma } = await import("@/lib/prisma");
      const rows = await prisma.carouselPost.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - WINDOW_DAYS * 86_400_000) },
        },
        orderBy: { createdAt: "desc" },
        select: { headline: true },
        take: 2000,
      });
      const headlines: string[] = [];
      const normalized = new Set<string>();
      for (const r of rows) {
        const n = normalizeHeadline(r.headline ?? "");
        if (!n || normalized.has(n)) continue;
        normalized.add(n);
        headlines.push(r.headline.trim());
      }
      cache = { loadedAt: Date.now(), headlines, normalized };
    } catch (err) {
      console.warn(
        "[headline-history] load failed — running without cross-lane history:",
        err instanceof Error ? err.message : err
      );
      // Short-lived empty cache so a DB blip doesn't re-query per lane.
      cache = { loadedAt: Date.now(), headlines: [], normalized: new Set() };
    }
    return cache;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** True when `h` exactly matches (after normalization) any headline from the last 60 days, any lane. */
export async function isRecentHeadline(h: string): Promise<boolean> {
  const n = normalizeHeadline(h);
  if (!n) return false;
  return (await loadHistory()).normalized.has(n);
}

/**
 * Prompt block listing the most recent `limit` distinct headlines across
 * every lane. Empty string when there is no history (or the load failed).
 */
export async function recentHeadlinesPromptBlock(limit = 80): Promise<string> {
  const { headlines } = await loadHistory();
  if (headlines.length === 0) return "";
  const list = headlines.slice(0, limit).join(" | ");
  return `\n\nDO NOT reuse or closely echo any of these recent headlines (all accounts, last ${WINDOW_DAYS} days): ${list}\nThe cover headline must be new wording, not one of these and not a light rephrase of one.`;
}

/** Retry feedback for a generator whose headline came back as an exact recent repeat. */
export function repeatHeadlineFeedback(h: string): string {
  return `\n\nREJECTED: your last cover headline "${h}" was already used on a recent post. Write a completely different headline — new words, new structure — and keep the rest of the post fresh too.`;
}

/**
 * Near-duplicate IDEA check (Jev #4, 2026-09-30). The exact-match check
 * above misses "REST IS NOT A REWARD" vs "YOU DON'T HAVE TO EARN REST":
 * different words, same post. Jev picks which recent headline (if any)
 * makes the same point; a confident match is a rejection. Fails open
 * (null) when Jev is off or errors. Returns the matched headline.
 */
const NEAR_DUP_POOL = 60;
const NEAR_DUP_MIN_P = 0.6;
const NEAR_DUP_PAIR_MIN = 0.7;
const OVERLAP_MIN = 0.75;

function words(h: string): Set<string> {
  return new Set(normalizeHeadline(h).split(" ").filter((w) => w.length > 2));
}

/**
 * Tested 2026-09-30 on 60 real headlines: Jev's Choice alone mixes up
 * format-alike titles (two "which X guards your..." posts at p≈0.59), and
 * its pairwise yes/no alone is over-eager (≈0.7 for loosely related
 * lines). So a match needs BOTH to agree; plain rewordings ("SEE THE PART
 * NOBODY FILMS NOW") are caught in code by word overlap instead.
 */
export async function nearDuplicateOf(h: string): Promise<string | null> {
  const candidate = h.trim();
  if (!candidate) return null;
  const { headlines } = await loadHistory();
  const n = normalizeHeadline(candidate);
  const pool = headlines
    .filter((x) => normalizeHeadline(x) !== n)
    .slice(0, NEAR_DUP_POOL);
  if (pool.length === 0) return null;

  const cw = words(candidate);
  for (const x of pool) {
    const xw = words(x);
    if (cw.size < 2 || xw.size < 2) continue;
    let shared = 0;
    for (const w of cw) if (xw.has(w)) shared++;
    if (shared / Math.min(cw.size, xw.size) >= OVERLAP_MIN) return x;
  }

  const { askJev, choiceOf } = await import("./jev");
  const criteria: Record<string, string | null> = {
    none: "No headline in the list makes the same point as the candidate; the candidate is a new idea",
  };
  pool.forEach((x, i) => (criteria[`h${i}`] = x));
  const r = await askJev(
    "near-duplicate-headline",
    { candidate },
    {
      match: {
        type: "choice",
        instructions:
          "Which of these past social post headlines makes the SAME core point as `candidate`, even if the wording is different? Choose none unless a reader would feel they had already seen this exact post.",
        criteria,
      },
    }
  );
  const c = choiceOf(r, "match");
  if (!c || c.choice === "none" || c.p < NEAR_DUP_MIN_P) return null;
  const past = criteria[c.choice];
  if (!past) return null;
  const confirm = await askJev(
    "near-duplicate-confirm",
    { candidate },
    {
      same: {
        type: "noul",
        instructions: {
          past,
          question:
            "Do `candidate` and `past` make the same point, so a reader who saw `past` would feel this is the same post again?",
        },
      },
    }
  );
  const { noulOf } = await import("./jev");
  const same = noulOf(confirm, "same");
  return same !== null && same >= NEAR_DUP_PAIR_MIN ? past : null;
}

/** Retry feedback for a headline Jev judged to be the same idea as a recent one. */
export function nearDuplicateFeedback(h: string, match: string): string {
  return `\n\nREJECTED: your last cover headline "${h}" makes the same point as a recent post ("${match}"). Pick a genuinely different idea or angle for this post, not a rewording, and keep the rest of the post fresh too.`;
}

/**
 * Optional best-of-5 cover step (Jev #1). After the headline is accepted,
 * cover-picker writes alternatives in the same form, Jev scores all of
 * them, and the winner replaces the headline via setHeadline.
 */
export interface BestCoverOpts<T> {
  brand: import("./copy-objectives").CopyBrand;
  lane: string;
  /** Form constraints the alternatives must keep (length, case, command vs question). */
  rules?: string;
  /** The post body the cover introduces (slide text), for context. */
  contextOf: (result: T) => string;
  /** Return the result with the cover headline replaced everywhere it appears. */
  setHeadline: (result: T, headline: string) => T;
}

async function applyBestCover<T>(
  label: string,
  result: T,
  headlineOf: (r: T) => string,
  cover: BestCoverOpts<T> | undefined
): Promise<T> {
  if (!cover) return result;
  try {
    const { pickBestCover } = await import("./cover-picker");
    const current = headlineOf(result);
    const picked = await pickBestCover({
      label,
      brand: cover.brand,
      lane: cover.lane,
      current,
      context: cover.contextOf(result),
      rules: cover.rules,
    });
    if (!picked || picked.headline.trim() === current.trim()) return result;
    console.log(`[headline-history] ${label}: best-of-5 cover "${current}" -> "${picked.headline}"`);
    return cover.setHeadline(result, picked.headline);
  } catch (err) {
    console.warn(
      `[headline-history] ${label}: best-of-5 cover failed — keeping the writer's headline:`,
      err instanceof Error ? err.message : err
    );
    return result;
  }
}

/**
 * Record a headline this process just accepted, so parallel lanes
 * running in the same warm process see it before the cache refreshes.
 */
export function noteHeadlineUsed(h: string): void {
  const n = normalizeHeadline(h);
  if (!cache || !n || cache.normalized.has(n)) return;
  cache.normalized.add(n);
  cache.headlines.unshift(h.trim());
}

/**
 * Fake-candid provenance hooks (2026-09-23 audit: "overheard this in a
 * car park and wrote it on my hand...", "found this folded inside a
 * library book..."). Returns retry feedback when `hook` invents where a
 * quote came from, else null. Deliberately narrow — "i wrote this and
 * never sent it" (the letter format) must NOT match.
 */
const FAKE_CANDID_RE =
  /\b(found (this|it)\b|overheard\b|(a )?(stranger|woman i barely know|man i barely know)\b.*\b(said|told)\b|wrote (it|this) (down )?on (my hand|a napkin|a receipt|the back of)|someone left (this|it)\b|scribbled (on|in)\b)/i;

export function fakeCandidFeedback(hook: string): string | null {
  if (!FAKE_CANDID_RE.test(hook)) return null;
  return `\n\nREJECTED: your hook "${hook}" invents where the quote came from (found / overheard / written on something). That reads as fake. Write a hook about the reader's own reaction to the words instead.`;
}

/**
 * Generate-check-retry wrapper. `generate(extra)` must append `extra` to
 * its prompt: first call gets the recent-headlines block; if the result's
 * headline is an exact recent repeat (or `reject` returns feedback), ONE
 * retry gets the block plus explicit rejection feedback. Never fails the
 * lane: a throwing retry or a second miss logs a warning and ships the
 * best copy we have.
 */
export async function withHeadlineRetry<T>(opts: {
  label: string;
  generate: (extra: string) => Promise<T>;
  headlineOf: (result: T) => string;
  /** Optional extra check — return retry feedback to reject, null to accept. */
  reject?: (result: T) => string | null;
  /** Optional Jev best-of-5 cover pick, run on the accepted result. */
  bestCover?: BestCoverOpts<T>;
}): Promise<T> {
  const block = await recentHeadlinesPromptBlock();
  const problem = async (r: T): Promise<string | null> => {
    const h = opts.headlineOf(r);
    if (await isRecentHeadline(h)) return repeatHeadlineFeedback(h);
    const own = opts.reject?.(r) ?? null;
    if (own) return own;
    const { copyFlagFor } = await import("./humanizer");
    const flagged = copyFlagFor(h);
    if (flagged) return flagged;
    const near = await nearDuplicateOf(h);
    return near ? nearDuplicateFeedback(h, near) : null;
  };
  const finish = async (r: T): Promise<T> => {
    const out = await applyBestCover(opts.label, r, opts.headlineOf, opts.bestCover);
    noteHeadlineUsed(opts.headlineOf(out));
    return out;
  };

  const first = await opts.generate(block);
  const firstProblem = await problem(first);
  if (!firstProblem) return finish(first);
  console.warn(
    `[headline-history] ${opts.label}: rejected "${opts.headlineOf(first)}" — retrying once`
  );
  try {
    const second = await opts.generate(block + firstProblem);
    if (await problem(second)) {
      console.warn(
        `[headline-history] ${opts.label}: retry also rejected ("${opts.headlineOf(second)}") — shipping anyway`
      );
    }
    return finish(second);
  } catch (err) {
    console.warn(
      `[headline-history] ${opts.label}: retry failed — shipping the first draft:`,
      err instanceof Error ? err.message : err
    );
    return finish(first);
  }
}
