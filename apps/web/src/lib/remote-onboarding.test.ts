import { describe, expect, it } from "vitest";

import {
  DEFAULT_ONBOARDING_CONFIG,
  fillOnboardingTemplate,
  pickOnboardingVariant,
  sanitizeOrder,
  sanitizeOverrides,
  sanitizeRemoteConfig,
} from "@acuity/shared";

describe("sanitizeOverrides", () => {
  it("keeps known text fields and drops everything else", () => {
    const out = sanitizeOverrides({
      hook: { title: "  I've tried every planner.  ", evil: "<script>" },
      age: { options: { "35": "35 to 44, still going", "bad key!": "x" } },
      unknownSection: { title: "nope" },
      paywall: { trustLine: "No commitment. Cancel anytime.", price: "$0.01" },
    });
    expect(out).toEqual({
      hook: { title: "I've tried every planner." },
      age: { options: { "35": "35 to 44, still going" } },
      paywall: { trustLine: "No commitment. Cancel anytime." },
    });
  });
  it("caps lengths and ignores non-strings", () => {
    const out = sanitizeOverrides({ hook: { title: "x".repeat(500), promise: 42 } });
    expect(out.hook?.title?.length).toBe(160);
    expect(out.hook?.promise).toBeUndefined();
  });
  it("needs at least 4 floating to-dos", () => {
    expect(sanitizeOverrides({ notLazy: { things: ["a", "b"] } })).toEqual({});
    expect(sanitizeOverrides({ notLazy: { things: ["a", "b", "c", "d"] } }).notLazy?.things).toHaveLength(4);
  });
});

describe("sanitizeOrder", () => {
  it("forces consent last and dedupes", () => {
    expect(sanitizeOrder(["consent", "hook", "name", "hook", "made-up"])).toEqual(["hook", "name", "consent"]);
  });
  it("rejects an order missing a required screen", () => {
    expect(sanitizeOrder(["hook", "age"])).toBeUndefined();
    expect(sanitizeOrder("hook")).toBeUndefined();
  });
});

describe("sanitizeRemoteConfig", () => {
  it("falls back to the default when nothing is live", () => {
    expect(sanitizeRemoteConfig(null)).toEqual(DEFAULT_ONBOARDING_CONFIG);
    expect(sanitizeRemoteConfig({ variants: [{ id: "a", weight: 0, overrides: {} }] })).toEqual(DEFAULT_ONBOARDING_CONFIG);
  });
  it("normalizes ids and drops duplicates", () => {
    const c = sanitizeRemoteConfig({ variants: [{ id: "Planner Hook", weight: 50 }, { id: "planner-hook", weight: 50 }, { id: "control", weight: 150 }] });
    expect(c.variants.map((v) => [v.id, v.weight])).toEqual([["planner-hook", 50], ["control", 100]]);
  });
});

describe("pickOnboardingVariant", () => {
  const config = sanitizeRemoteConfig({ variants: [{ id: "control", weight: 50 }, { id: "b", weight: 50 }, { id: "paused", weight: 0 }] });
  it("is sticky per install", () => {
    expect(pickOnboardingVariant(config, "install-1").id).toBe(pickOnboardingVariant(config, "install-1").id);
  });
  it("splits roughly by weight and never picks a paused variant", () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      const id = pickOnboardingVariant(config, `install-${i}`).id;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    expect(counts.paused).toBeUndefined();
    expect(counts.control).toBeGreaterThan(850);
    expect(counts.b).toBeGreaterThan(850);
  });
});

describe("fillOnboardingTemplate", () => {
  it("fills days and name, and drops the name cleanly when missing", () => {
    expect(fillOnboardingTemplate("Start my {days}-day free trial", { days: 7 })).toBe("Start my 7-day free trial");
    expect(fillOnboardingTemplate("Your plan is ready, {name}", { name: "Laura" })).toBe("Your plan is ready, Laura");
    expect(fillOnboardingTemplate("Your plan is ready, {name}", { name: "" })).toBe("Your plan is ready");
  });
});
