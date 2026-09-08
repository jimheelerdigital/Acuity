import { afterEach, describe, expect, it, vi } from "vitest";

const findManyPerson = vi.fn();
const findManyGoal = vi.fn();
const findManyTheme = vi.fn();
const findUniqueMemory = vi.fn();
const findManyInsight = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    person: { findMany: (...a: unknown[]) => findManyPerson(...a) },
    goal: { findMany: (...a: unknown[]) => findManyGoal(...a) },
    theme: { findMany: (...a: unknown[]) => findManyTheme(...a) },
    userMemory: { findUnique: (...a: unknown[]) => findUniqueMemory(...a) },
    userInsight: { findMany: (...a: unknown[]) => findManyInsight(...a) },
  },
}));

vi.mock("@/lib/safe-log", () => ({
  safeLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { buildMemoryLedger } from "./memory-ledger";

function setDefaults() {
  findManyPerson.mockResolvedValue([]);
  findManyGoal.mockResolvedValue([]);
  findManyTheme.mockResolvedValue([]);
  findUniqueMemory.mockResolvedValue(null);
  findManyInsight.mockResolvedValue([]);
}

afterEach(() => {
  vi.resetAllMocks();
});

const insight = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  observationText: "You sleep better after exercise",
  severity: "POSITIVE",
  linkedAreaId: "PHYSICAL_HEALTH",
  confidence: 0.9,
  correctionState: null,
  correctionNote: null,
  correctedAt: null,
  createdAt: new Date("2026-08-10T00:00:00Z"),
  evidence: [],
  ...over,
});

const ev = (entryId: string) => ({
  entryId,
  excerpt: "I slept great after the gym",
  startIndex: 0,
  endIndex: 27,
  entry: { entryDate: new Date("2026-08-09T00:00:00Z") },
});

describe("memory ledger — patterns vs uncertainty", () => {
  it("puts a well-evidenced insight in patterns, with its receipts", async () => {
    setDefaults();
    findManyInsight.mockResolvedValue([
      insight({ evidence: [ev("e1"), ev("e2")] }),
    ]);

    const l = await buildMemoryLedger("u1");
    expect(l.patterns).toHaveLength(1);
    expect(l.uncertain).toHaveLength(0);
    expect(l.patterns[0].receipts).toHaveLength(2);
    expect(l.patterns[0].receipts[0].excerpt).toContain("gym");
    expect(l.patterns[0].tier).toBe("CONFIRMED");
  });

  it("NEVER puts an unsourced insight in patterns, however confident", async () => {
    setDefaults();
    findManyInsight.mockResolvedValue([
      insight({ confidence: 1, evidence: [] }),
    ]);

    const l = await buildMemoryLedger("u1");
    expect(l.patterns).toHaveLength(0);
    expect(l.uncertain).toHaveLength(1);
    expect(l.uncertain[0].tier).toBe("UNSOURCED");
    expect(l.uncertain[0].reasons.join(" ")).toContain("no traceable source");
  });

  it("keeps a single-source insight out of patterns", async () => {
    setDefaults();
    findManyInsight.mockResolvedValue([insight({ evidence: [ev("e1")] })]);

    const l = await buildMemoryLedger("u1");
    expect(l.patterns).toHaveLength(0);
    expect(l.uncertain[0].tier).toBe("PROVISIONAL");
    expect(l.uncertain[0].evidenceCount).toBe(1);
  });

  it("routes a user-refuted insight out of patterns and into corrections", async () => {
    setDefaults();
    findManyInsight.mockResolvedValue([
      insight({ evidence: [ev("e1"), ev("e2")], correctionState: "WRONG", correctionNote: "not true" }),
    ]);

    const l = await buildMemoryLedger("u1");
    expect(l.patterns).toHaveLength(0);
    expect(l.uncertain[0].tier).toBe("REFUTED");
    expect(l.corrections).toHaveLength(1);
    expect(l.corrections[0].state).toBe("WRONG");
    expect(l.corrections[0].note).toBe("not true");
  });

  it("reports the unasserted share", async () => {
    setDefaults();
    findManyInsight.mockResolvedValue([
      insight({ id: "ok", evidence: [ev("e1"), ev("e2")] }),
      insight({ id: "bad1", evidence: [] }),
      insight({ id: "bad2", evidence: [] }),
      insight({ id: "bad3", evidence: [] }),
    ]);

    const l = await buildMemoryLedger("u1");
    expect(l.summary.patternCount).toBe(1);
    expect(l.summary.uncertainCount).toBe(3);
    expect(l.summary.unassertedShare).toBe(0.75);
  });

  it("handles a user with nothing at all", async () => {
    setDefaults();
    const l = await buildMemoryLedger("u1");
    expect(l.patterns).toEqual([]);
    expect(l.summary.unassertedShare).toBe(0);
    expect(l.generatedAt).toBeTruthy();
  });
});

describe("memory ledger — the other sections", () => {
  it("maps people with their evidence counts", async () => {
    setDefaults();
    findManyPerson.mockResolvedValue([
      {
        id: "p1",
        displayName: "Sam",
        aliases: ["Sammy"],
        mentionCount: 12,
        firstMentionedAt: new Date("2026-01-01T00:00:00Z"),
        _count: { mentions: 9 },
      },
    ]);

    const l = await buildMemoryLedger("u1");
    expect(l.people[0].displayName).toBe("Sam");
    expect(l.people[0].evidenceEntryCount).toBe(9);
    expect(l.people[0].aliases).toEqual(["Sammy"]);
  });

  it("counts DISTINCT source entries for a goal", async () => {
    setDefaults();
    findManyGoal.mockResolvedValue([
      {
        id: "g1",
        title: "Run a 10k",
        status: "IN_PROGRESS",
        lifeArea: "PHYSICAL_HEALTH",
        progress: 40,
        targetDate: null,
        lastMentionedAt: new Date("2026-08-01T00:00:00Z"),
        entryRefs: ["e1", "e2", "e1"], // duplicate must not inflate the count
        editedByUser: false,
      },
    ]);

    const l = await buildMemoryLedger("u1");
    expect(l.goals[0].sourceEntryCount).toBe(2);
  });

  it("only counts a theme as recurring at 2+ mentions", async () => {
    setDefaults();
    findManyTheme.mockResolvedValue([
      {
        id: "t1",
        name: "work stress",
        mentions: [
          { sentiment: "NEGATIVE", createdAt: new Date("2026-08-01T00:00:00Z") },
          { sentiment: "NEUTRAL", createdAt: new Date("2026-08-05T00:00:00Z") },
        ],
      },
      {
        id: "t2",
        name: "one-off",
        mentions: [{ sentiment: "POSITIVE", createdAt: new Date("2026-08-02T00:00:00Z") }],
      },
    ]);

    const l = await buildMemoryLedger("u1");
    expect(l.recurringThemes.map((t) => t.name)).toEqual(["work stress"]);
    expect(l.recurringThemes[0].sentiment).toEqual({
      positive: 0,
      neutral: 1,
      negative: 1,
    });
  });

  it("extracts key facts from the populated life-area summaries only", async () => {
    setDefaults();
    findUniqueMemory.mockResolvedValue({
      careerSummary: "Leads a small team",
      careerMentions: 8,
      moneySummary: "   ",
      moneyMentions: 3,
      familySummary: null,
      familyMentions: 0,
    });

    const l = await buildMemoryLedger("u1");
    expect(l.keyFacts).toHaveLength(1);
    expect(l.keyFacts[0].area).toBe("CAREER");
    expect(l.keyFacts[0].mentions).toBe(8);
  });

  it("excludes dismissed insights from the query", async () => {
    setDefaults();
    await buildMemoryLedger("u1");
    const where = findManyInsight.mock.calls[0][0].where;
    expect(where).toMatchObject({ userId: "u1", dismissedAt: null });
  });
});
