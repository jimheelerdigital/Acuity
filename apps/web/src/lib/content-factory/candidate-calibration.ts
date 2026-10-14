/**
 * Is Jev earning its keep? (2026-10-13, per Keenan's go-ahead on the
 * candidate pipeline: "results decide").
 *
 * Every Ripple selfie / Mythicals post is chosen from several Opus-written
 * candidates, ranked by Jev on a couple of questions (candidate-pipeline.ts).
 * The winner's Jev answers are saved in its recipe (`recipe.jev`). Weekly,
 * once posts are 48h+ old and scored on the brand's win metric, this
 * measures how well each Jev question predicted the real score (Spearman)
 * and reweights the ranking:
 *   - questions that predicted wins gain weight, ones that didn't lose it
 *     (moving at most halfway per week);
 *   - KILL RULE: from KILL_MIN_POSTS scored posts, a question whose
 *     correlation stays under KILL_RHO gets weight 0; when every question is
 *     at 0, Jev is switched off for the brand and Opus's own ranking picks.
 * Stored at calibration/candidates-<brand>.json. Fails open to defaults.
 */

import { readJson, writeJson, type ScoredPost } from "./performance-loop";
import { spearman } from "./jev-calibration";

export type CandidateBrand = "ripple" | "mythicals";

/** Jev questions per brand: the only ones with any link to results so far. */
// "pattern" (2026-10-13, per Keenan: Jev ranks on the brief's 70/30 how/what
// lessons) is calibrated and killed like the others if it doesn't predict.
export const CANDIDATE_DIMS: Record<CandidateBrand, string[]> = {
  ripple: ["comment", "send", "pattern"],
  mythicals: ["comment", "watch", "pattern"],
};

const MIN_POSTS = 8;
export const KILL_MIN_POSTS = 40;
export const KILL_RHO = 0.15;

export interface CandidateCalibration {
  brand: CandidateBrand;
  updatedAt: string;
  n: number;
  rho: Record<string, number>;
  weights: Record<string, number>;
  /** True when the kill rule switched Jev off for this brand. */
  jevOff: boolean;
}

const path = (b: CandidateBrand) => `calibration/candidates-${b}.json`;

export function defaultWeights(brand: CandidateBrand): Record<string, number> {
  const dims = CANDIDATE_DIMS[brand];
  return Object.fromEntries(dims.map((d) => [d, 1 / dims.length]));
}

export async function readCandidateCalibration(brand: CandidateBrand): Promise<CandidateCalibration | null> {
  return readJson<CandidateCalibration>(path(brand));
}

export async function readCandidateWeights(brand: CandidateBrand): Promise<{ weights: Record<string, number>; jevOff: boolean }> {
  const c = await readCandidateCalibration(brand).catch(() => null);
  if (!c) return { weights: defaultWeights(brand), jevOff: false };
  // A question added after the last calibration starts at its default weight.
  const base = defaultWeights(brand);
  const weights = Object.fromEntries(CANDIDATE_DIMS[brand].map((d) => [d, c.weights[d] ?? base[d]]));
  return { weights, jevOff: c.jevOff };
}

export function nextWeights(
  brand: CandidateBrand,
  rho: Record<string, number>,
  prev: Record<string, number>,
  n: number
): { weights: Record<string, number>; jevOff: boolean } {
  const dims = CANDIDATE_DIMS[brand];
  const base = defaultWeights(brand);
  const target: Record<string, number> = {};
  for (const d of dims) {
    const r = rho[d] ?? 0;
    target[d] = n >= KILL_MIN_POSTS && r < KILL_RHO ? 0 : Math.max(0.05, base[d] * (1 + 1.5 * Math.max(-0.5, Math.min(0.6, r))));
  }
  const sum = dims.reduce((s, d) => s + target[d], 0);
  if (sum === 0) return { weights: Object.fromEntries(dims.map((d) => [d, 0])), jevOff: true };
  const weights: Record<string, number> = {};
  for (const d of dims) {
    const t = target[d] / sum;
    // A killed question goes straight to 0; others move halfway.
    weights[d] = target[d] === 0 ? 0 : Math.round((((prev[d] ?? base[d]) + t) / 2) * 1000) / 1000;
  }
  return { weights, jevOff: false };
}

/** Recalibrate both brands from posts scored on the win metric. */
export async function refreshCandidateCalibration(scored: ScoredPost[]): Promise<CandidateCalibration[]> {
  const { readRecipe } = await import("./performance-loop");
  const out: CandidateCalibration[] = [];
  for (const brand of ["ripple", "mythicals"] as CandidateBrand[]) {
    const dims = CANDIDATE_DIMS[brand];
    const pairs: { jev: Record<string, number>; score: number }[] = [];
    for (const p of scored.filter((s) => s.brand === brand)) {
      const r = await readRecipe(p.postId);
      if (r?.jev && dims.every((d) => typeof r.jev?.[d] === "number")) pairs.push({ jev: r.jev, score: p.score });
    }
    const prev = await readCandidateCalibration(brand);
    const rho: Record<string, number> = {};
    for (const d of dims) {
      rho[d] = pairs.length >= MIN_POSTS ? Math.round(spearman(pairs.map((x) => x.jev[d]), pairs.map((x) => x.score)) * 1000) / 1000 : 0;
    }
    const next =
      pairs.length >= MIN_POSTS
        ? nextWeights(brand, rho, prev?.weights ?? defaultWeights(brand), pairs.length)
        : { weights: { ...defaultWeights(brand), ...(prev?.weights ?? {}) }, jevOff: prev?.jevOff ?? false };
    const cal: CandidateCalibration = { brand, updatedAt: new Date().toISOString(), n: pairs.length, rho, ...next };
    await writeJson(path(brand), cal);
    out.push(cal);
  }
  return out;
}

/** One paragraph for the Sunday email. */
export function calibrationSummary(c: CandidateCalibration | null): string {
  if (!c || c.n < MIN_POSTS)
    return `Not enough data yet: ${c?.n ?? 0} scored posts carry Jev rankings (needs ${MIN_POSTS} to measure, ${KILL_MIN_POSTS} before the kill rule can switch a question off).`;
  const dims = Object.keys(c.rho)
    .map((d) => `"${d}" ${c.rho[d] >= 0 ? "+" : ""}${c.rho[d].toFixed(2)} (weight ${c.weights[d]?.toFixed(2) ?? "0"})`)
    .join(", ");
  return c.jevOff
    ? `Jev is OFF for this brand: across ${c.n} scored posts none of its questions predicted results (all under ${KILL_RHO}). Opus's own ranking picks posts now.`
    : `Across ${c.n} scored posts, how well Jev's ranking predicted real results (1 = perfectly, 0 = no link): ${dims}. ${c.n >= KILL_MIN_POSTS ? `Questions under ${KILL_RHO} are switched off.` : `The kill rule starts at ${KILL_MIN_POSTS} posts.`}`;
}
