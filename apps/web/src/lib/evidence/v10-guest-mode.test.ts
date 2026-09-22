import { describe, expect, it } from "vitest";

import {
  SAVE_WALL_COPY,
  guestCanEdit,
  guestMayRecord,
  saveWallFor,
} from "../../../../../apps/mobile/lib/onboarding-v10/guest-mode";

describe("save wall escalation", () => {
  it("is soft on the first mic tap", () => {
    expect(saveWallFor(0)).toBe("soft");
  });

  it("is hard from the second tap onward", () => {
    expect(saveWallFor(1)).toBe("hard");
    expect(saveWallFor(2)).toBe("hard");
    expect(saveWallFor(99)).toBe("hard");
  });

  it("only the soft wall is dismissible", () => {
    expect(SAVE_WALL_COPY.soft.secondary).not.toBeNull();
    expect(SAVE_WALL_COPY.hard.secondary).toBeNull();
  });

  it("never lets a guest into the recorder", () => {
    // Letting one through would create a second unclaimed debrief and the
    // claim endpoint has no way to know which one to take.
    expect(guestMayRecord()).toBe(false);
  });

  it("keeps a guest read-only", () => {
    expect(guestCanEdit()).toBe(false);
  });

  it("says why, in terms of the user's own data", () => {
    // Not "sign up to unlock" — the real reason is that nothing is backed
    // up, which is a fact about their debrief rather than a sales line.
    const corpus = Object.values(SAVE_WALL_COPY)
      .flatMap((c) => [c.title, c.body])
      .join(" ")
      .toLowerCase();
    expect(corpus).toContain("this phone");
    expect(corpus).not.toContain("unlock");
    expect(corpus).not.toContain("upgrade");
    expect(corpus).toContain("debrief");
  });

  it("uses no banned vocabulary", () => {
    const corpus = Object.values(SAVE_WALL_COPY)
      .flatMap((c) => [c.title, c.body, c.primary, c.secondary ?? ""])
      .join(" ")
      .toLowerCase();
    for (const banned of ["journal", "check-in", "brain dump", "tonight", "bedtime"]) {
      expect(corpus).not.toContain(banned);
    }
  });
});
