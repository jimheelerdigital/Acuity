import { describe, expect, it } from "vitest";

import { retakePrompt } from "./clip-audit";

describe("Mythicals clip retake prompt (2026-10-27)", () => {
  it("names the last take's problem and asks for smaller, simpler movement", () => {
    const p = retakePrompt("Epic cinematic fantasy film shot. Action: the paladin swings his sword.", "a dragon appears in the background breathing fire.");
    expect(p).toContain("Action: the paladin swings his sword.");
    expect(p).toContain("failed because a dragon appears in the background breathing fire. Avoid that completely.");
    expect(p).toMatch(/smaller and simpler/);
  });
});
