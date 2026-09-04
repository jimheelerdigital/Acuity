import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MEMORY_AXES,
  axisMeta,
  axisToLifeArea,
  buildMemoryPayload,
  daysSince,
  type MemorySource,
} from "./lifemap-memory-payload";

/**
 * The `/api/lifemap` memory payload.
 *
 * The route is the only surface feeding both `life-map.tsx` and the new
 * "What Ripple knows about you" view, and it is ALSO read by mobile
 * binaries already in the App Store. So the two things worth pinning are:
 *   1. the ten summaries + ten canonical mention counts are present, and
 *   2. nothing that was there before disappeared.
 *
 * (2) is the one that can't be caught by reading the new view — a removed
 * field blanks a section on a client that ships on Apple's release
 * schedule, not ours.
 */

/** A UserMemory row with nothing populated — the day-one shape. */
const EMPTY: MemorySource = {
  totalEntries: 0,
  firstEntryDate: null,
  recurringThemes: [],
  recurringPeople: [],
  recurringGoals: [],
};

const POPULATED: MemorySource = {
  ...EMPTY,
  totalEntries: 12,
  firstEntryDate: new Date("2026-08-01T00:00:00Z"),
  recurringPeople: [{ name: "Dana", area: "family", sentiment: "positive", mentionCount: 4 }],
  careerSummary: "Work has been the loudest thing for three weeks running.",
  purposeSummary: "  ",
  careerMentions: 9,
  purposeMentions: 0,
  healthMentions: 3,
  relationshipsMentions: 2,
};

describe("buildMemoryPayload — the ten axis summaries", () => {
  it("returns a Summary key for every axis, defaulting to null", () => {
    const p = buildMemoryPayload(EMPTY);
    for (const axis of MEMORY_AXES) {
      expect(p, `${axis}Summary must be present`).toHaveProperty(
        `${axis}Summary`
      );
      expect(p[`${axis}Summary`]).toBeNull();
    }
    expect(MEMORY_AXES).toHaveLength(10);
  });

  it("passes through populated prose verbatim", () => {
    const p = buildMemoryPayload(POPULATED);
    expect(p.careerSummary).toBe(
      "Work has been the loudest thing for three weeks running."
    );
    expect(p.moneySummary).toBeNull();
  });

  it("covers exactly the ten axes the schema declares", () => {
    expect([...MEMORY_AXES]).toEqual([
      "career",
      "money",
      "romance",
      "family",
      "friends",
      "physicalHealth",
      "mentalHealth",
      "growth",
      "fun",
      "purpose",
    ]);
  });
});

describe("buildMemoryPayload — the ten canonical mention counts", () => {
  it("returns a Mentions key for every axis, defaulting to 0", () => {
    const p = buildMemoryPayload(EMPTY);
    for (const axis of MEMORY_AXES) {
      expect(p, `${axis}Mentions must be present`).toHaveProperty(
        `${axis}Mentions`
      );
      expect(p[`${axis}Mentions`]).toBe(0);
    }
  });

  it("includes every count the brief named", () => {
    const p = buildMemoryPayload(POPULATED);
    for (const key of [
      "romanceMentions",
      "friendsMentions",
      "mentalHealthMentions",
      "funMentions",
      "purposeMentions",
      "physicalHealthMentions",
      "growthMentions",
      "moneyMentions",
      "careerMentions",
      "familyMentions",
    ] as const) {
      expect(p, `${key} must be present`).toHaveProperty(key);
      expect(typeof p[key]).toBe("number");
    }
    expect(p.careerMentions).toBe(9);
  });
});

describe("buildMemoryPayload — backward compatibility", () => {
  it("keeps every field the route returned before this change", () => {
    // Snapshot of the pre-change payload keys. A client already shipped
    // to the App Store reads these; losing one blanks a section there.
    const p = buildMemoryPayload(POPULATED);
    for (const key of [
      "totalEntries",
      "firstEntryDate",
      "recurringThemes",
      "recurringPeople",
      "recurringGoals",
      "careerMentions",
      "healthMentions",
      "relationshipsMentions",
      "financesMentions",
      "personalMentions",
      "otherMentions",
    ] as const) {
      expect(p, `${key} must survive`).toHaveProperty(key);
    }
    expect(p.healthMentions).toBe(3);
    expect(p.relationshipsMentions).toBe(2);
  });

  it("passes recurring collections through untouched", () => {
    const p = buildMemoryPayload(POPULATED);
    expect(p.recurringPeople).toEqual([
      { name: "Dana", area: "family", sentiment: "positive", mentionCount: 4 },
    ]);
  });

  it("produces a complete payload from a bare row (no undefined holes)", () => {
    const p = buildMemoryPayload(EMPTY);
    for (const [k, v] of Object.entries(p)) {
      if (k === "firstEntryDate") continue; // legitimately null
      expect(v, `${k} must not be undefined`).not.toBeUndefined();
    }
  });
});

describe("axis metadata matches the canonical Life Matrix palette", () => {
  it("maps camelCase axes onto the LifeArea enum", () => {
    expect(axisToLifeArea("career")).toBe("CAREER");
    expect(axisToLifeArea("physicalHealth")).toBe("PHYSICAL_HEALTH");
    expect(axisToLifeArea("mentalHealth")).toBe("MENTAL_HEALTH");
  });

  it("resolves a real label + color for all ten (no fallbacks)", () => {
    for (const axis of MEMORY_AXES) {
      const meta = axisMeta(axis);
      expect(meta.label, `${axis} label`).not.toBe(axis);
      expect(meta.color, `${axis} color`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
    // Spot-check against DESIGN_SYSTEM.md §2.9.
    expect(axisMeta("career")).toEqual({ label: "Career", color: "#3B82F6" });
    expect(axisMeta("purpose")).toEqual({ label: "Purpose", color: "#6366F1" });
  });
});

describe("daysSince — the header line", () => {
  const now = new Date("2026-08-28T12:00:00Z");

  it("is null with no first entry, so the header falls back", () => {
    expect(daysSince(null, now)).toBeNull();
    expect(daysSince("not-a-date", now)).toBeNull();
  });

  it("counts the first day as day 1, never 0", () => {
    expect(daysSince("2026-08-28T09:00:00Z", now)).toBe(1);
  });

  it("counts whole elapsed days inclusively", () => {
    expect(daysSince("2026-08-27T12:00:00Z", now)).toBe(2);
    expect(daysSince("2026-07-29T12:00:00Z", now)).toBe(31);
  });

  it("never returns a negative for a clock-skewed future date", () => {
    expect(daysSince("2027-01-01T00:00:00Z", now)).toBe(1);
  });
});

describe("the route wires the builder and keeps its cache header", () => {
  const route = readFileSync(
    join(__dirname, "..", "app", "api", "lifemap", "route.ts"),
    "utf8"
  );

  it("returns memory via buildMemoryPayload", () => {
    expect(route).toContain("buildMemoryPayload(memory)");
  });

  it("still sends the 60s private cache header", () => {
    expect(route).toContain('"Cache-Control": "private, max-age=60"');
  });

  it("is still read-only — no writes to UserMemory", () => {
    expect(route).not.toContain("userMemory.update");
    expect(route).not.toContain("userMemory.upsert");
  });
});
