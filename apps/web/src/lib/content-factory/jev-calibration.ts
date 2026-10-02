/**
 * Jev calibration from our own results (2026-10-02, per Keenan: "build
 * everything that we need"; first flagged in the 10-01 audit: Jev's scroll /
 * save scores had ~0 correlation with real engagement).
 *
 * Every pick post records Jev's four concept scores in its recipe (scroll,
 * comment, clear, core). Weekly, after the performance loop scores posts at
 * 48h, this measures how well each Jev score predicted OUR score (Spearman
 * rank correlation) and reweights pickConcept: dimensions that predicted
 * wins gain weight, ones that didn't lose it. Defaults hold until there are
 * MIN_POSTS scored posts per brand, and weights move at most halfway per
 * week so one odd week can't swing them.
 *
 * Stored at calibration/pick-<brand>.json in the content-factory bucket.
 */

import { readJson, writeJson, type ScoredPost } from "./performance-loop";

export type PickBrand = "ripple" | "bwk";
export type PickWeights = { scroll: number; comment: number; clear: number; core: number };

/** The hand-set weights pickConcept used before calibration. */
export const DEFAULT_PICK_WEIGHTS: PickWeights = { scroll: 0.35, comment: 0.3, clear: 0.1, core: 0.25 };
const MIN_POSTS = 8;
const DIMS = ["scroll", "comment", "clear", "core"] as const;

export interface PickCalibration {
  brand: PickBrand;
  updatedAt: string;
  n: number;
  /** Spearman correlation of each Jev score with our 48h score. */
  rho: Record<string, number>;
  weights: PickWeights;
}

const path = (brand: PickBrand) => `calibration/pick-${brand}.json`;

export async function readPickWeights(brand: PickBrand): Promise<PickWeights> {
  const c = await readJson<PickCalibration>(path(brand)).catch(() => null);
  return c?.weights ?? DEFAULT_PICK_WEIGHTS;
}

export async function readPickCalibration(brand: PickBrand): Promise<PickCalibration | null> {
  return readJson<PickCalibration>(path(brand)).catch(() => null);
}

function ranks(xs: number[]): number[] {
  const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    for (let k = i; k <= j; k++) r[order[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return r;
}

/** Spearman rank correlation; 0 when either side has no variance. */
export function spearman(a: number[], b: number[]): number {
  const ra = ranks(a), rb = ranks(b);
  const n = a.length;
  const ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** New weights from correlations: predictive dims up, useless ones down. */
export function weightsFromRho(rho: Record<string, number>, prev: PickWeights): PickWeights {
  const target: Record<string, number> = {};
  for (const d of DIMS) {
    const r = Math.max(-0.5, Math.min(0.6, rho[d] ?? 0));
    target[d] = Math.max(0.03, DEFAULT_PICK_WEIGHTS[d] * (1 + 1.5 * r));
  }
  const sum = DIMS.reduce((s, d) => s + target[d], 0);
  const out = {} as PickWeights;
  // Move halfway from last week's weights toward the target.
  for (const d of DIMS) out[d] = Math.round(((prev[d] + target[d] / sum) / 2) * 1000) / 1000;
  return out;
}

/** Recalibrate both pick brands from scored posts. Returns what was written. */
export async function refreshPickCalibration(scored: ScoredPost[]): Promise<PickCalibration[]> {
  const { readRecipe } = await import("./performance-loop");
  const out: PickCalibration[] = [];
  for (const brand of ["ripple", "bwk"] as const) {
    const rows: { jev: Record<string, number>; score: number }[] = [];
    for (const p of scored) {
      if (p.brand !== brand || p.postType !== "pick") continue;
      const recipe = await readRecipe(p.postId);
      if (recipe?.jev) rows.push({ jev: recipe.jev, score: p.score });
    }
    if (rows.length < MIN_POSTS) continue;
    const rho: Record<string, number> = {};
    for (const d of DIMS) rho[d] = Math.round(spearman(rows.map((r) => r.jev[d] ?? 0), rows.map((r) => r.score)) * 1000) / 1000;
    const prev = await readPickWeights(brand);
    const cal: PickCalibration = { brand, updatedAt: new Date().toISOString(), n: rows.length, rho, weights: weightsFromRho(rho, prev) };
    await writeJson(path(brand), cal);
    console.log(`[jev-calibration] ${brand}: n=${rows.length} rho=${JSON.stringify(rho)} weights=${JSON.stringify(cal.weights)}`);
    out.push(cal);
  }
  return out;
}
