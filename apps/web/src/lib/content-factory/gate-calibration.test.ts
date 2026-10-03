import { describe, expect, it } from "vitest";
import { gateWeightsFromRho, laneTracks } from "./gate-calibration";
import { DEFAULT_GATE_WEIGHTS } from "./publish-gate";
import { isOutOfCreditsError } from "./post-video";
import type { ScoredPost } from "./performance-loop";

const post = (lane: string, score: number) => ({ lane, score }) as ScoredPost;

describe("laneTracks", () => {
  it("shrinks small samples toward 1.0", () => {
    const t = laneTracks([post("a", 3), post("a", 3)]);
    // (6 + 3) / (2 + 3) = 1.8, not 3
    expect(t.a.track).toBe(1.8);
    expect(t.a.mean).toBe(3);
  });
  it("clamps extremes", () => {
    const t = laneTracks(Array.from({ length: 40 }, () => post("dead", 0)));
    expect(t.dead.track).toBe(0.4);
  });
});

describe("gateWeightsFromRho", () => {
  it("decays useless Jev scores halfway toward the floor", () => {
    const w = gateWeightsFromRho("ripple", { scroll: 0, save: -0.1, coach: -0.35 }, DEFAULT_GATE_WEIGHTS.ripple);
    expect(w.track).toBe(1);
    expect(w.scroll).toBe(0.04); // (0.05 + 0.03) / 2
    expect(w.coach).toBeCloseTo((0.5 + 0.49) / 2, 3);
  });
  it("gives a predictive score weight and keeps BWK coach at 0", () => {
    const w = gateWeightsFromRho("bwk", { scroll: 0.5, save: 0 }, DEFAULT_GATE_WEIGHTS.bwk);
    expect(w.scroll).toBeCloseTo((0.05 + 0.4) / 2, 3);
    expect(w.coach).toBe(0);
  });
  it("never lets Ripple coach fall below the floor", () => {
    let w = DEFAULT_GATE_WEIGHTS.ripple;
    for (let i = 0; i < 20; i++) w = gateWeightsFromRho("ripple", { coach: 0.3 }, w);
    expect(w.coach).toBeGreaterThanOrEqual(0.199);
  });
});

describe("isOutOfCreditsError", () => {
  it("matches billing failures, not ordinary ones", () => {
    expect(isOutOfCreditsError('Higgsfield submit failed (402) for model "x": {}')).toBe(true);
    expect(isOutOfCreditsError("Higgsfield submit failed (400): Insufficient credits")).toBe(true);
    expect(isOutOfCreditsError("Higgsfield submit failed (500): internal error")).toBe(false);
    expect(isOutOfCreditsError("The operation was aborted due to timeout")).toBe(false);
  });
});
