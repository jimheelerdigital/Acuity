import { describe, expect, it } from "vitest";
import { DEFAULT_PICK_WEIGHTS, spearman, weightsFromRho } from "./jev-calibration";
import { isRedFlag } from "./competitor-discovery";

describe("jev calibration", () => {
  it("spearman is 1 for the same order and -1 for reversed", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1);
    expect(spearman([1, 1, 1], [1, 2, 3])).toBe(0);
  });
  it("moves weight toward predictive scores, halfway, and sums to ~1", () => {
    const w = weightsFromRho({ scroll: 0, watch: 0, comment: 0.6, clear: 0, core: -0.5 }, DEFAULT_PICK_WEIGHTS);
    expect(w.comment).toBeGreaterThan(DEFAULT_PICK_WEIGHTS.comment);
    expect(w.core).toBeLessThan(DEFAULT_PICK_WEIGHTS.core);
    expect(w.scroll + w.watch + w.comment + w.clear + w.core).toBeCloseTo(1, 1);
  });
});

describe("competitor red flags", () => {
  it.each([
    ["If you're tired of being broke, DM 'START'", true],
    ["Want views like this? System in my profile", true],
    ["Use code KEY20 for 20% off", true],
    ["#monkmode #nofap day 30", true],
    ["Most women are the default parent. This did not happen by choice.", false],
    ["my winter arc starts now #winterarc", false],
  ])("%s → %s", (text, flagged) => {
    expect(isRedFlag(text)).toBe(flagged);
  });
});
