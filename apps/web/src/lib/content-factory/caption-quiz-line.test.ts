import { describe, expect, it } from "vitest";

import { applyQuizLine, MYTHICALS_QUIZ_LINES } from "./caption-writer";

const LEGACY = "Which legendary creature are you? Take the free quiz at legendarymythicals.com/quiz";

describe("Mythicals caption quiz line (2026-10-27)", () => {
  const caption = "Five dragons, one rider. Which one carries you?\n\n#dragon #fantasyart #mythology";

  it("adds exactly one quiz line just above the hashtags", () => {
    const out = applyQuizLine(caption, "mythicals");
    const paras = out.split("\n\n");
    expect(paras).toHaveLength(3);
    expect(MYTHICALS_QUIZ_LINES).toContain(paras[1]);
    expect(paras[2]).toBe("#dragon #fantasyart #mythology");
  });

  it("is stable and never stacks lines on a second pass or an old caption", () => {
    const once = applyQuizLine(caption, "mythicals");
    expect(applyQuizLine(once, "mythicals")).toBe(once);
    const old = `Five dragons, one rider. Which one carries you?\n\n${LEGACY}\n\n#dragon #fantasyart #mythology`;
    expect(applyQuizLine(old, "mythicals").split("legendarymythicals.com").length - 1).toBe(1);
  });

  it("appends at the end when there are no hashtags, and leaves other brands alone", () => {
    expect(applyQuizLine("Pick one.", "mythicals").split("\n\n")).toHaveLength(2);
    expect(applyQuizLine(caption, "ripple")).toBe(caption);
    expect(applyQuizLine(caption, "bwk")).toBe(caption);
  });
});
