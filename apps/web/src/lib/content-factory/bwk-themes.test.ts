import { describe, it, expect } from "vitest";
import {
  BWK_LANE_FAMILY,
  BWK_COVER_COMMAND_RULE,
  MEN_COVER_FAMILIES,
  rollMenCoverRule,
  menSubjectRules,
} from "./moody-carousel";

// 2026-09-24: BWK lanes lock to one image family, every BWK cover is a
// command, and family-specific image rules only appear when relevant.
describe("BWK theme locks", () => {
  const names = new Set(MEN_COVER_FAMILIES.map((f) => f.name));

  it("every lane lock points at a real family", () => {
    for (const fam of Object.values(BWK_LANE_FAMILY)) expect(names.has(fam)).toBe(true);
  });

  it("cars and fantasy never come from the random roll", () => {
    const pool = MEN_COVER_FAMILIES.filter((f) => f.inRandomPool).map((f) => f.name);
    expect(pool).not.toContain("luxury cars");
    expect(pool).not.toContain("fantasy hero");
    for (let i = 0; i < 200; i++) {
      const rule = rollMenCoverRule();
      expect(rule).not.toMatch(/from the luxury cars family/);
      expect(rule).not.toMatch(/from the fantasy hero family/);
    }
  });

  it("every family has enough variety to draw from", () => {
    for (const f of MEN_COVER_FAMILIES) {
      expect(f.subjects.length).toBeGreaterThanOrEqual(8);
      expect(f.settings.length).toBeGreaterThanOrEqual(6);
    }
  });

  it("a locked lane pins cover and items to its family and names a concrete subject", () => {
    const rule = rollMenCoverRule("luxury cars");
    expect(rule).toMatch(/from the luxury cars family/);
    expect(rule).toMatch(/FAMILY LOCK/);
    const fam = MEN_COVER_FAMILIES.find((f) => f.name === "luxury cars")!;
    expect(fam.subjects.some((s) => rule.includes(`the cover subject is ${s}`))).toBe(true);
  });

  it("unlocked lanes (muse-men) also get assigned item subjects, never cars or fantasy", () => {
    const carOrFantasy = MEN_COVER_FAMILIES.filter((f) => !f.inRandomPool).flatMap((f) => f.subjects);
    for (let i = 0; i < 100; i++) {
      const rule = rollMenCoverRule();
      expect(rule).toMatch(/each item uses a DIFFERENT subject/);
      for (const s of carOrFantasy) expect(rule).not.toContain(s);
    }
  });

  it("every BWK cover rule carries the command rule", () => {
    expect(rollMenCoverRule()).toContain(BWK_COVER_COMMAND_RULE);
    expect(rollMenCoverRule("fantasy hero")).toContain(BWK_COVER_COMMAND_RULE);
  });
});

describe("menSubjectRules", () => {
  it("a car scene gets no warrior, animal, or dragon allowance", () => {
    const r = menSubjectRules("A 1960s Ferrari 250 GT under one cold spotlight in a dark garage.");
    expect(r).not.toMatch(/WARRIOR|DRAGON/);
    expect(r).toContain("NO animals.");
  });
  it("a wildlife scene allows its one animal", () => {
    const r = menSubjectRules("A grey wolf on a ridgeline in blowing snow.");
    expect(r).toMatch(/ONE animal named in the scene/);
    expect(r).not.toContain("NO animals.");
  });
  it("a dragon scene gets the dragon carve-out, not the plain warrior one", () => {
    const r = menSubjectRules("A lone armored rider on a black dragon banking over a fjord at dawn.");
    expect(r).toMatch(/DRAGON/);
    expect(r).not.toMatch(/The ONE armored WARRIOR/);
  });
});
