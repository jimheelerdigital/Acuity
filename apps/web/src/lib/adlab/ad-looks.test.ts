import { describe, it, expect } from "vitest";
import { LOOKS, assignLooks, copyFitsLook, fallbackLook, lookByKey, randomVariant, buildLookPrompt } from "./ad-looks";
import { BATCH_GROUPS, type AdImageCopy } from "./weekly-batch";

// 2026-10-05 (Keenan: "the more variance the better"): one look per slot,
// no repeats, recent looks avoided, family caps, copy-fit fallbacks.
const copy: AdImageCopy = {
  headline: "The school form, said once",
  description: "Ripple turns what you say into a dated list.",
  cta: "SIGN_UP",
  imageScene: "n/a",
  solutionLine: "Ripple turns what you said into your to-do list.",
  benefits: ["Form due Friday", "Dentist Tuesday 3pm", "Call Mom Sunday"],
  said: "Emma's form is due Friday and the dentist is Tuesday",
  caught: ["Form, Friday", "Dentist, Tue 3pm"],
  lines: ["Form due Friday", "Dentist Tuesday", "Lunch stuff", "Call Mom"],
  stats: [{ value: "14", label: "things handled" }, { value: "3", label: "slipped" }, { value: "4", label: "weeks running" }],
  insight: "Money came up every Sunday.",
};

describe("ad look library", () => {
  it("has many distinct looks across families", () => {
    expect(LOOKS.length).toBeGreaterThanOrEqual(28);
    expect(new Set(LOOKS.map((l) => l.key)).size).toBe(LOOKS.length);
    expect(new Set(LOOKS.map((l) => l.family)).size).toBe(5);
  });

  it("assigns 10 unique looks within family caps and avoids recent ones", () => {
    const recent = new Set(LOOKS.slice(0, 8).map((l) => l.key));
    for (let run = 0; run < 20; run++) {
      const got = assignLooks(10, recent);
      expect(new Set(got.map((l) => l.key)).size).toBe(10);
      expect(got.filter((l) => l.family === "photo").length).toBeLessThanOrEqual(2);
      expect(got.filter((l) => l.family === "code").length).toBeLessThanOrEqual(2);
      for (const l of got) expect(recent.has(l.key)).toBe(false);
    }
  });

  it("every image-model look puts the exact headline in its prompt", () => {
    for (const l of LOOKS.filter((x) => x.family !== "code")) {
      const p = buildLookPrompt(l, copy, BATCH_GROUPS.women, randomVariant("women"));
      expect(p).toContain(copy.headline);
      expect(p).not.toMatch(/undefined/);
    }
  });

  it("falls back when the copy can't fill a look", () => {
    const needsStats = lookByKey("look-wrapped")!;
    expect(copyFitsLook(needsStats, { ...copy, stats: undefined })).toBe(false);
    const fb = fallbackLook(new Set(["look-statement"]));
    expect(fb.needs).toBe("none");
    expect(fb.key).not.toBe("look-statement");
  });
});

describe("variety check redo picking", () => {
  it("redoes broken text and fakes first, then the later ad of each similar pair, max 3", async () => {
    const { pickRedos } = await import("./variety-check");
    expect(pickRedos({ similar: [[2, 7], [4, 5]], fake: [{ n: 9, reason: "" }], brokenText: [{ n: 3, reason: "" }] })).toEqual([3, 9, 7]);
    expect(pickRedos({ similar: [], fake: [], brokenText: [] })).toEqual([]);
  });
});
