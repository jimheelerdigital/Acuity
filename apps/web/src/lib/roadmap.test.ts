import { describe, expect, it, vi } from "vitest";

import { getRoadmapItem, listRoadmap, parseRoadmapBody, toggleVote } from "./roadmap";

describe("parseRoadmapBody", () => {
  it("requires title + summary on create", () => {
    expect(parseRoadmapBody({}, { partial: false })).toMatchObject({ ok: false });
    expect(parseRoadmapBody({ title: "Typed entries", summary: "Write instead of record." }, { partial: false }))
      .toEqual({ ok: true, data: { title: "Typed entries", summary: "Write instead of record." } });
  });

  it("allows partial updates and stamps shippedAt on shipped", () => {
    const r = parseRoadmapBody({ status: "shipped", shippedVersion: "1.9.4" }, { partial: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.status).toBe("shipped");
      expect(r.data.shippedVersion).toBe("1.9.4");
      expect(r.data.shippedAt).toBeInstanceOf(Date);
    }
    const back = parseRoadmapBody({ status: "building" }, { partial: true });
    expect(back.ok && back.data.shippedAt).toBeNull();
  });

  it("rejects bad status / version / order", () => {
    expect(parseRoadmapBody({ status: "done" }, { partial: true }).ok).toBe(false);
    expect(parseRoadmapBody({ shippedVersion: "v2" }, { partial: true }).ok).toBe(false);
    expect(parseRoadmapBody({ sortOrder: "abc" }, { partial: true }).ok).toBe(false);
    expect(parseRoadmapBody({ title: "ab" }, { partial: true }).ok).toBe(false);
  });
});

describe("toggleVote", () => {
  function db(opts: { status?: string; existing?: boolean; count?: number }) {
    return {
      roadmapItem: {
        findUnique: vi.fn().mockResolvedValue(
          opts.status === undefined ? null : { id: "i1", status: opts.status }
        ),
      },
      roadmapVote: {
        findUnique: vi.fn().mockResolvedValue(opts.existing ? { userId: "u1" } : null),
        delete: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(opts.count ?? 0),
      },
    };
  }

  it("adds a vote when none exists", async () => {
    const p = db({ status: "considering", existing: false, count: 4 });
    const r = await toggleVote(p as never, "i1", "u1");
    expect(r).toEqual({ voted: true, votes: 4 });
    expect(p.roadmapVote.create).toHaveBeenCalledWith({ data: { itemId: "i1", userId: "u1" } });
  });

  it("removes a vote when one exists", async () => {
    const p = db({ status: "building", existing: true, count: 3 });
    const r = await toggleVote(p as never, "i1", "u1");
    expect(r).toEqual({ voted: false, votes: 3 });
    expect(p.roadmapVote.delete).toHaveBeenCalled();
  });

  it("refuses shipped and unknown items", async () => {
    expect(await toggleVote(db({ status: "shipped" }) as never, "i1", "u1")).toEqual({ error: "shipped" });
    expect(await toggleVote(db({}) as never, "nope", "u1")).toEqual({ error: "not_found" });
  });
});

describe("listRoadmap", () => {
  it("orders building → considering → shipped, by votes then by shippedAt desc", async () => {
    const rows = [
      { id: "a", title: "A", summary: "", status: "considering", shippedVersion: null, shippedAt: null, _count: { votes: 2 }, votes: [] },
      { id: "b", title: "B", summary: "", status: "shipped", shippedVersion: "1.9.3", shippedAt: new Date("2026-10-01"), _count: { votes: 0 }, votes: [] },
      { id: "c", title: "C", summary: "", status: "considering", shippedVersion: null, shippedAt: null, _count: { votes: 9 }, votes: [{ userId: "u1" }] },
      { id: "d", title: "D", summary: "", status: "building", shippedVersion: null, shippedAt: null, _count: { votes: 1 }, votes: [] },
      { id: "e", title: "E", summary: "", status: "shipped", shippedVersion: "1.9.4", shippedAt: new Date("2026-10-17"), _count: { votes: 0 }, votes: [] },
    ];
    const prisma = { roadmapItem: { findMany: vi.fn().mockResolvedValue(rows) } };
    const items = await listRoadmap(prisma as never, "u1");
    expect(items.map((i) => i.id)).toEqual(["d", "c", "a", "e", "b"]);
    expect(items.find((i) => i.id === "c")?.votedByMe).toBe(true);
    expect(items.find((i) => i.id === "a")?.votedByMe).toBe(false);
  });
});

// ─── Detail pages (2026-10-19) ──────────────────────────────────────

describe("roadmap detail fields", () => {
  it("parses category, timing, sections and one-per-line highlights", () => {
    const r = parseRoadmapBody(
      {
        category: "widgets",
        timeframe: "  November ",
        problem: "Opening the app to tick one box is friction.",
        solution: "",
        highlights: "- Check off from the Home Screen\n\n• Most pressing first\n",
        howTo: null,
      },
      { partial: true }
    );
    expect(r).toEqual({
      ok: true,
      data: {
        category: "widgets",
        timeframe: "November",
        problem: "Opening the app to tick one box is friction.",
        solution: null,
        highlights: ["Check off from the Home Screen", "Most pressing first"],
        howTo: null,
      },
    });
  });

  it("accepts the new planned status and rejects unknown categories / oversized fields", () => {
    expect(parseRoadmapBody({ status: "planned" }, { partial: true }).ok).toBe(true);
    expect(parseRoadmapBody({ category: "games" }, { partial: true }).ok).toBe(false);
    expect(parseRoadmapBody({ timeframe: "x".repeat(41) }, { partial: true }).ok).toBe(false);
    expect(parseRoadmapBody({ highlights: Array(9).fill("one") }, { partial: true }).ok).toBe(false);
    expect(parseRoadmapBody({ highlights: [1, 2] }, { partial: true }).ok).toBe(false);
  });

  it("orders building → planned → considering → shipped", async () => {
    const base = { summary: "", shippedVersion: null, shippedAt: null, votes: [] };
    const rows = [
      { ...base, id: "s", title: "S", status: "shipped", _count: { votes: 0 } },
      { ...base, id: "c", title: "C", status: "considering", _count: { votes: 5 } },
      { ...base, id: "p", title: "P", status: "planned", _count: { votes: 1 } },
      { ...base, id: "b", title: "B", status: "building", _count: { votes: 0 } },
    ];
    const prisma = { roadmapItem: { findMany: vi.fn().mockResolvedValue(rows) } };
    const items = await listRoadmap(prisma as never, null);
    expect(items.map((i) => i.id)).toEqual(["b", "p", "c", "s"]);
  });

  it("cards carry hasDetails but not the body; the detail call carries the body", async () => {
    const row = {
      id: "w",
      title: "Widget",
      summary: "Tasks on the Home Screen.",
      status: "shipped",
      shippedVersion: "1.9.4",
      shippedAt: new Date("2026-10-18"),
      category: "widgets",
      timeframe: null,
      problem: null,
      solution: "Tap to check off.",
      highlights: [],
      howTo: "Long-press the Home Screen.",
      _count: { votes: 2 },
      votes: [{ userId: "u1" }],
    };
    const prisma = {
      roadmapItem: {
        findMany: vi.fn().mockResolvedValue([row]),
        findUnique: vi.fn().mockResolvedValue(row),
      },
    };
    const [card] = await listRoadmap(prisma as never, "u1");
    expect(card).toMatchObject({ id: "w", category: "widgets", hasDetails: true, votedByMe: true });
    expect(card).not.toHaveProperty("solution");
    const detail = await getRoadmapItem(prisma as never, "w", "u1");
    expect(detail).toMatchObject({ solution: "Tap to check off.", howTo: "Long-press the Home Screen.", highlights: [] });
    prisma.roadmapItem.findUnique.mockResolvedValueOnce(null);
    expect(await getRoadmapItem(prisma as never, "nope", null)).toBeNull();
  });

  it("an item with no sections reports hasDetails=false and an unknown category as null", async () => {
    const row = {
      id: "x", title: "X", summary: "s", status: "considering", shippedVersion: null, shippedAt: null,
      category: "bogus", highlights: ["  "], _count: { votes: 0 }, votes: false,
    };
    const prisma = { roadmapItem: { findMany: vi.fn().mockResolvedValue([row]) } };
    const [card] = await listRoadmap(prisma as never, null);
    expect(card.hasDetails).toBe(false);
    expect(card.category).toBeNull();
  });
});
