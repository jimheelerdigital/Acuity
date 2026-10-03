/**
 * Publish-gate calibration (2026-10-02, per Keenan: "if you think i should
 * build all 4 then build all 4" — fix #1 of the 30-day hands-off list).
 *
 * The gate used to rank a brand-day mostly on Jev's scroll / save / sense
 * guesses, which the 09-30 backtest showed have ~0 link to engagement
 * (only coach tone did, -0.35). Two things now drive it instead:
 *
 * 1. LANE TRACK RECORD (daily) — each lane's real average score over the
 *    last 30 days (performance-loop scorePosts, every lane), shrunk toward
 *    1.0 (a typical post) with PRIOR_POSTS of pseudo-evidence so a lane
 *    with two lucky posts doesn't jump the queue. Clamped to TRACK_CLAMP.
 * 2. WEIGHTS (weekly, Monday report) — for every KEPT gated post that now
 *    has results, the Spearman correlation of each Jev score with the real
 *    score. A Jev score that starts predicting earns weight back; one that
 *    doesn't decays to a tie-break. Moves halfway per week, needs
 *    MIN_POSTS, coach never drops below COACH_FLOOR on Ripple (the one
 *    score with evidence behind it).
 *
 * Held posts never post, so they never get results: the weights learn
 * only from what shipped. The gate's lane rotation (a lane held yesterday
 * is protected today) keeps weak lanes posting enough to be re-measured.
 *
 * Stored at calibration/gate-<brand>.json in the content-factory bucket.
 * Every reader fails open (no file → DEFAULT_GATE_WEIGHTS, track 1.0).
 */

import { readJson, writeJson, scorePosts, type ScoredPost } from "./performance-loop";
import { spearman } from "./jev-calibration";
import { DEFAULT_GATE_WEIGHTS, gateExemptLane, readGateMarker, type GateWeights, type GatedBrand } from "./publish-gate";

const PRIOR_POSTS = 3;
const TRACK_CLAMP: [number, number] = [0.4, 2.5];
const MIN_POSTS = 12;
const COACH_FLOOR = 0.2;
/** Jev weights never fully vanish: they still break ties inside a lane. */
const JEV_FLOOR = 0.03;
const MARKER_DAYS = 35;

export interface LaneTrack {
  n: number;
  /** Raw mean score (1.0 = typical post for the account). */
  mean: number;
  /** Shrunk + clamped value the gate uses. */
  track: number;
}

export interface GateCalibration {
  brand: GatedBrand;
  updatedAt: string;
  weightsUpdatedAt: string | null;
  lanes: Record<string, LaneTrack>;
  /** Kept gated posts with results used for the weights. */
  n: number;
  rho: Record<string, number>;
  weights: GateWeights;
}

const path = (brand: GatedBrand) => `calibration/gate-${brand}.json`;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export async function readGateCalibration(brand: GatedBrand): Promise<GateCalibration | null> {
  return readJson<GateCalibration>(path(brand)).catch(() => null);
}

export function laneTracks(scored: ScoredPost[]): Record<string, LaneTrack> {
  const groups = new Map<string, number[]>();
  for (const p of scored) groups.set(p.lane, [...(groups.get(p.lane) ?? []), p.score]);
  const out: Record<string, LaneTrack> = {};
  for (const [lane, xs] of groups) {
    const sum = xs.reduce((a, b) => a + b, 0);
    const shrunk = (sum + PRIOR_POSTS * 1.0) / (xs.length + PRIOR_POSTS);
    out[lane] = {
      n: xs.length,
      mean: r3(sum / xs.length),
      track: r3(Math.min(TRACK_CLAMP[1], Math.max(TRACK_CLAMP[0], shrunk))),
    };
  }
  return out;
}

/** Predictive Jev scores gain weight, useless ones fall to the floor. Halfway per run. */
export function gateWeightsFromRho(brand: GatedBrand, rho: Record<string, number>, prev: GateWeights): GateWeights {
  const pos = (x: number | undefined) => Math.min(0.6, Math.max(0, x ?? 0));
  const target: GateWeights = {
    track: 1,
    scroll: Math.max(JEV_FLOOR, 0.8 * pos(rho.scroll)),
    save: Math.max(JEV_FLOOR, 0.8 * pos(rho.save)),
    // Coach predicts NEGATIVELY (lecturing does worse), so its weight follows -rho.
    coach: brand === "ripple" ? Math.max(COACH_FLOOR, 1.4 * pos(-(rho.coach ?? 0))) : 0,
  };
  const out = {} as GateWeights;
  for (const k of Object.keys(target) as (keyof GateWeights)[]) out[k] = r3((prev[k] + target[k]) / 2);
  return out;
}

/** Jev scores of kept, gated posts from the last MARKER_DAYS of gate decisions. */
async function keptGateScores(brand: GatedBrand): Promise<Map<string, { scroll: number; save: number; coach: number | null }>> {
  const out = new Map<string, { scroll: number; save: number; coach: number | null }>();
  const today = Date.now();
  for (let d = 1; d <= MARKER_DAYS; d++) {
    const date = new Date(today - d * 86_400_000).toISOString().slice(0, 10);
    const m = await readGateMarker(brand, date).catch(() => null);
    for (const r of m?.rows ?? []) {
      if (r.held || r.scrollStop == null || r.saveSend == null) continue;
      out.set(r.id, { scroll: r.scrollStop, save: r.saveSend, coach: r.coach });
    }
  }
  return out;
}

/**
 * Refresh lane track records for Ripple and BWK; with `updateWeights`,
 * also re-fit the Jev weights (weekly). Returns what was written.
 */
export async function refreshGateCalibration(opts: { updateWeights?: boolean } = {}): Promise<GateCalibration[]> {
  const scored = await scorePosts({ allLanes: true });
  const out: GateCalibration[] = [];
  for (const brand of ["ripple", "bwk"] as const) {
    const mine = scored.filter((p) => p.brand === brand && !gateExemptLane(p.lane));
    const prev = await readGateCalibration(brand);
    let weights = prev?.weights ?? DEFAULT_GATE_WEIGHTS[brand];
    let rho = prev?.rho ?? {};
    let n = prev?.n ?? 0;
    let weightsUpdatedAt = prev?.weightsUpdatedAt ?? null;
    if (opts.updateWeights) {
      const jev = await keptGateScores(brand);
      const rows = mine.flatMap((p) => {
        const j = jev.get(p.postId);
        return j ? [{ ...j, score: p.score }] : [];
      });
      if (rows.length >= MIN_POSTS) {
        const real = rows.map((r) => r.score);
        rho = {
          scroll: r3(spearman(rows.map((r) => r.scroll), real)),
          save: r3(spearman(rows.map((r) => r.save), real)),
        };
        const coachRows = rows.filter((r) => r.coach != null);
        if (brand === "ripple" && coachRows.length >= MIN_POSTS) {
          rho.coach = r3(spearman(coachRows.map((r) => r.coach!), coachRows.map((r) => r.score)));
        }
        weights = gateWeightsFromRho(brand, rho, weights);
        n = rows.length;
        weightsUpdatedAt = new Date().toISOString();
      }
    }
    const cal: GateCalibration = {
      brand,
      updatedAt: new Date().toISOString(),
      weightsUpdatedAt,
      lanes: laneTracks(mine),
      n,
      rho,
      weights,
    };
    await writeJson(path(brand), cal);
    console.log(`[gate-calibration] ${brand}: ${Object.keys(cal.lanes).length} lanes, n=${n} rho=${JSON.stringify(rho)} weights=${JSON.stringify(weights)}`);
    out.push(cal);
  }
  return out;
}
