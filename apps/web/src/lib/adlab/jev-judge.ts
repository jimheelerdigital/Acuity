/**
 * Jev judges the weekly ad drafts (2026-09-30, per Keenan: "create multiple
 * different ad scripts that run into jev first, checks for viability, and
 * then jev returns the highest probability winners back to use and then we
 * create ads based on those. We need to make Jev part of our automated
 * learning system").
 *
 * Claude writes several drafts per slot; every draft gets ONE Jev call with
 * five typed questions:
 *   concrete   noul   a concrete detail in the hook/first line, not a mood
 *   clear      noul   a stranger can tell what Ripple does
 *   policyRisk noul   implies a condition/feeling/age/health/before-after
 *   duplicate  noul   same idea as an ad already live
 *   winner     score  likelihood of starting a trial, judged against OUR
 *                     proven winners and losers (by paid trials)
 * viable = policyRisk < 0.8 and duplicate < 0.7 (tuned on the first live check).
 * rank   = 0.55·winner + 0.2·concrete + 0.25·clear.
 * The best viable draft per slot becomes the ad; nothing else is rendered.
 *
 * THE LEARNING LOOP: the winners/losers Jev compares against come from the
 * latest learning snapshot (our real trial results), so every week Jev is
 * judging against fresher evidence. Each chosen ad stores its Jev verdict,
 * and jevCalibration() checks Jev's predictions against what actually
 * produced trials — that report goes into the next batch's prompt and email.
 *
 * FAIL OPEN: no key / any error → null verdicts → first draft per slot,
 * exactly the pre-Jev behavior.
 */
import { PRODUCT_ONE_LINER } from "@/lib/positioning";
import { askAdsJev, noulOf, scoreOf, adsJevEnabled, type JevResult } from "@/lib/adlab/jev";

export interface JevVerdict {
  /** Most of the audience would recognise the situation from their own week. */
  relatable?: number;
  concrete: number;
  clear: number;
  policyRisk: number;
  duplicate: number;
  winner: number;
  rank: number;
  viable: boolean;
  /** How many drafts competed for this slot. */
  of?: number;
  /** Ranks of the drafts Jev turned down (shown on the review page). */
  beat?: number[];
}

export interface JudgeExample {
  headline: string;
  primaryText: string;
  result: string;
}

export interface DraftText {
  format: string;
  headline: string;
  primaryText: string;
  onScreen: string[];
}

const WINNER_LEVELS = [
  "much weaker than the proven losers",
  "about as weak as the proven losers",
  "between the losers and the winners",
  "about as strong as the proven winners",
  "stronger than the proven winners",
];

function verdictFrom(r: JevResult | null): JevVerdict | null {
  if (!r) return null;
  const relatable = noulOf(r, "relatable");
  const concrete = noulOf(r, "concrete");
  const clear = noulOf(r, "clear");
  const policyRisk = noulOf(r, "policyRisk");
  const duplicate = noulOf(r, "duplicate");
  const winner = scoreOf(r, "winner");
  if ([relatable, concrete, clear, policyRisk, duplicate, winner].some((x) => x === null)) return null;
  // 2026-09-30: relatability weighs more than raw specificity — the batch
  // before this went niche ("the dryer noise since March").
  const rank = 0.4 * winner! + 0.3 * relatable! + 0.2 * clear! + 0.1 * concrete!;
  return {
    relatable: relatable!,
    concrete: concrete!,
    clear: clear!,
    policyRisk: policyRisk!,
    duplicate: duplicate!,
    winner: winner!,
    rank,
    // Cutoffs from the first live check (2026-09-30): a clean, specific
    // draft scored policyRisk 0.54 / duplicate 0.49, a real violator 0.97.
    viable: policyRisk! < 0.8 && duplicate! < 0.7 && relatable! >= 0.35,
  };
}

export async function judgeDraft(ctx: {
  lane: string;
  audience: string;
  winners: JudgeExample[];
  losers: JudgeExample[];
  liveHeadlines: string[];
}, draft: DraftText): Promise<JevVerdict | null> {
  const state = {
    product: PRODUCT_ONE_LINER,
    audience: ctx.audience,
    ad: draft,
    proven_winners: ctx.winners,
    proven_losers: ctx.losers,
    live_ads: ctx.liveHeadlines,
  };
  const r = await askAdsJev(`judge:${ctx.lane}`, state, {
    relatable: {
      type: "noul",
      instructions:
        "Would most people in the audience instantly recognise the situation in ad.headline from their own ordinary week, without reading the rest of the ad? Everyday things (school forms, the dentist, groceries, a work deadline, a skipped workout, putting something off until tomorrow) count; an unusual one-off situation, an oddly specific amount or appliance, a medical or prescription detail, or a major life decision does not.",
      criteria: { true: "an everyday situation most of the audience lives", false: "niche, unusual or one-off" },
    },
    concrete: {
      type: "noul",
      instructions:
        "Does ad.headline or the first sentence of ad.primaryText contain a concrete, specific detail (a number, a named task or errand, a day or time, a physical object, or a quoted phrase someone would really say) rather than only a mood or an abstract feeling?",
      criteria: { true: "has a concrete, specific detail", false: "only mood or abstraction" },
    },
    clear: {
      type: "noul",
      instructions:
        "Reading only ad.headline and ad.primaryText, would a stranger understand that the product is an app you talk to that turns what you say into a to-do list, tracks your habits, or shows what keeps coming up?",
      criteria: { true: "clear what the app does", false: "unclear what the app does" },
    },
    policyRisk: {
      type: "noul",
      instructions:
        "Does the ad (headline, primaryText or onScreen text) say or imply that the reader has a health or mental-health condition or a negative feeling state (including as a question such as 'Overwhelmed?'), mention the reader's age or life stage, promise a health or life outcome, or use before/after framing?",
      criteria: { true: "breaks one of these rules", false: "breaks none of them" },
    },
    duplicate: {
      type: "noul",
      instructions:
        "Is this ad essentially the same idea as one of live_ads: the same hook angle with near-identical wording?",
      criteria: { true: "same idea as a live ad", false: "a different idea" },
    },
    winner: {
      type: "score",
      instructions:
        "proven_winners are ads that got this audience to start free trials; proven_losers spent money and did not. Judging by what separates them, how strong is this ad at getting someone in the audience to start a free trial?",
      criteria: WINNER_LEVELS,
    },
  });
  return verdictFrom(r);
}

/** Run judgeDraft over many drafts with a small concurrency limit. */
export async function judgeDrafts(
  ctx: Parameters<typeof judgeDraft>[0],
  drafts: DraftText[],
  concurrency = 6
): Promise<(JevVerdict | null)[]> {
  if (!adsJevEnabled()) return drafts.map(() => null);
  const out: (JevVerdict | null)[] = new Array(drafts.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, drafts.length) }, async () => {
      while (next < drafts.length) {
        const i = next++;
        out[i] = await judgeDraft(ctx, drafts[i]).catch(() => null);
      }
    })
  );
  return out;
}

/**
 * Pick the best draft in a group: viable first, then highest rank. With no
 * verdicts (Jev off/failed) the first draft wins, as before Jev.
 */
export function pickBest<T>(
  items: T[],
  verdicts: (JevVerdict | null)[],
  opts?: { ignoreDuplicate?: boolean }
): { item: T; verdict: JevVerdict | null; index: number } {
  let best = 0;
  let bestKey = -Infinity;
  const ok = (v: JevVerdict) =>
    opts?.ignoreDuplicate ? v.policyRisk < 0.8 && (v.relatable ?? 1) >= 0.35 : v.viable;
  items.forEach((_, i) => {
    const v = verdicts[i];
    if (!v) return;
    const key = (ok(v) ? 10 : 0) + v.rank - (ok(v) ? 0 : v.policyRisk);
    if (key > bestKey) {
      bestKey = key;
      best = i;
    }
  });
  const beat = verdicts
    .map((v, i) => (i !== best && v ? Math.round(v.rank * 100) / 100 : null))
    .filter((x): x is number => x !== null);
  const verdict = verdicts[best]
    ? { ...verdicts[best]!, of: items.length, beat, viable: ok(verdicts[best]!) }
    : null;
  return { item: items[best], verdict, index: best };
}

/**
 * How well Jev's predictions matched reality: launched ads that carry a Jev
 * verdict, split at the median predicted rank, compared on trials per $100.
 * Returns null until there are at least 6 judged ads with $15+ spend.
 */
export async function jevCalibration(projectId: string): Promise<string | null> {
  const { prisma } = await import("@/lib/prisma");
  const { decodeAdCopy } = await import("@/lib/adlab/weekly-batch");
  const { judgeCreatives } = await import("@/lib/adlab/evergreen");
  const creatives = await prisma.adLabCreative.findMany({
    where: { angle: { experiment: { projectId } }, ads: { some: {} } },
    select: { id: true, headline: true, generationPrompt: true },
  });
  const judged = creatives
    .map((c) => ({ c, jev: decodeAdCopy(c.generationPrompt).jev }))
    .filter((x): x is { c: (typeof creatives)[number]; jev: JevVerdict } => !!x.jev);
  if (judged.length < 6) return null;
  const results = await judgeCreatives(judged.map((x) => x.c.id));
  const rows = judged
    .map((x) => ({ ...x, r: results.get(x.c.id)! }))
    .filter((x) => x.r && x.r.spendCents >= 1500);
  if (rows.length < 6) return null;
  rows.sort((a, b) => b.jev.rank - a.jev.rank);
  const half = Math.floor(rows.length / 2);
  const per100 = (xs: typeof rows) => {
    const spend = xs.reduce((n, x) => n + x.r.spendCents, 0);
    const trials = xs.reduce((n, x) => n + x.r.trials, 0);
    return spend ? (trials / spend) * 10000 : 0;
  };
  const top = per100(rows.slice(0, half));
  const bottom = per100(rows.slice(half));
  const verdict = top > bottom * 1.2 ? "Jev's top picks are out-performing" : top < bottom * 0.8 ? "Jev's top picks are UNDER-performing — lean less on its winner score" : "no clear difference yet";
  return `Jev calibration (${rows.length} launched ads with $15+ spend): top-rated half ${top.toFixed(2)} trials per $100 vs bottom half ${bottom.toFixed(2)} — ${verdict}.`;
}
