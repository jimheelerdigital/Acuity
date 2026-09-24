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
}): Promise<T> {
  const block = await recentHeadlinesPromptBlock();
  const problem = async (r: T): Promise<string | null> => {
    const h = opts.headlineOf(r);
    if (await isRecentHeadline(h)) return repeatHeadlineFeedback(h);
    return opts.reject?.(r) ?? null;
  };

  const first = await opts.generate(block);
  const firstProblem = await problem(first);
  if (!firstProblem) {
    noteHeadlineUsed(opts.headlineOf(first));
    return first;
  }
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
    noteHeadlineUsed(opts.headlineOf(second));
    return second;
  } catch (err) {
    console.warn(
      `[headline-history] ${opts.label}: retry failed — shipping the first draft:`,
      err instanceof Error ? err.message : err
    );
    noteHeadlineUsed(opts.headlineOf(first));
    return first;
  }
}
