import { describe, expect, it } from "vitest";

import {
  isWelcomePhase,
  nextPhase,
  phasesFor,
  progressFor,
  resumePhase,
} from "../../../../../apps/mobile/lib/welcome/phases";

const withHabits = { habitsEnabled: true };
const noHabits = { habitsEnabled: false };

describe("funnel welcome flow — order", () => {
  it("follows the Miro existing-user steps, consent moved before the recorder", () => {
    expect(phasesFor(withHabits)).toEqual([
      "hello",
      "value",
      "consent",
      "record",
      "notify",
      "habit",
      "results",
    ]);
  });

  it("drops the habit step when habits are off", () => {
    expect(phasesFor(noHabits)).not.toContain("habit");
    expect(nextPhase("notify", noHabits)).toBe("results");
  });

  it("never puts a paywall in it (users already paid — Guideline 3.1.3(b))", () => {
    expect(phasesFor(withHabits).some((p) => String(p).includes("pay"))).toBe(false);
  });

  it("consent always comes before audio leaves the device", () => {
    const list = phasesFor(withHabits);
    expect(list.indexOf("consent")).toBeLessThan(list.indexOf("record"));
  });

  it("has no step after results", () => {
    expect(nextPhase("results", withHabits)).toBeNull();
  });
});

describe("progress bar", () => {
  it("is never empty on the first screen and full on the last", () => {
    expect(progressFor("hello", withHabits)).toBeGreaterThan(0);
    expect(progressFor("results", withHabits)).toBe(1);
    expect(progressFor("results", noHabits)).toBe(1);
  });

  it("only ever moves forward", () => {
    const list = phasesFor(withHabits);
    const values = list.map((p) => progressFor(p, withHabits));
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });
});

describe("resume", () => {
  it("starts a fresh install at hello", () => {
    expect(resumePhase(null, null)).toBe("hello");
  });

  it("goes to setup once a debrief was sent, whatever was stored", () => {
    expect(resumePhase("consent", "e1")).toBe("notify");
    expect(resumePhase("record", "e1")).toBe("notify");
    expect(resumePhase(null, "e1")).toBe("notify");
  });

  it("keeps later setup/results positions after a debrief", () => {
    expect(resumePhase("habit", "e1")).toBe("habit");
    expect(resumePhase("results", "e1")).toBe("results");
  });

  it("returns to the pre-agreed consent screen if they backed out of the recorder", () => {
    expect(resumePhase("record", null)).toBe("record");
  });

  it("never shows setup or results without a debrief", () => {
    expect(resumePhase("notify", null)).toBe("consent");
    expect(resumePhase("results", null)).toBe("consent");
  });

  it("rejects junk phases from storage", () => {
    expect(isWelcomePhase("paywall")).toBe(false);
    expect(isWelcomePhase(3)).toBe(false);
    expect(isWelcomePhase("notify")).toBe(true);
  });
});
