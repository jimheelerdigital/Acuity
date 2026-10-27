import { describe, expect, it, vi } from "vitest";

import { loadEmergingThemeCandidates } from "./emerging-patterns-data";

describe("loadEmergingThemeCandidates", () => {
  it("groups mentions by theme for this user only, 2+ entries, most-seen first", async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { themeId: "t1", _count: { themeId: 4 } },
      { themeId: "t2", _count: { themeId: 2 } },
    ]);
    const findMany = vi.fn().mockResolvedValue([
      { id: "t2", name: "work" },
      { id: "t1", name: "sleep" },
    ]);
    const out = await loadEmergingThemeCandidates(
      { themeMention: { groupBy }, theme: { findMany } } as never,
      "u1"
    );
    expect(out).toEqual([
      { label: "sleep", entryCount: 4 },
      { label: "work", entryCount: 2 },
    ]);
    const q = groupBy.mock.calls[0][0];
    expect(q.where).toEqual({ theme: { is: { userId: "u1" } } });
    expect(q.having).toEqual({ themeId: { _count: { gte: 2 } } });
    expect(findMany.mock.calls[0][0].where).toEqual({ id: { in: ["t1", "t2"] }, userId: "u1" });
  });

  it("skips the second query when nothing qualifies", async () => {
    const findMany = vi.fn();
    const out = await loadEmergingThemeCandidates(
      { themeMention: { groupBy: vi.fn().mockResolvedValue([]) }, theme: { findMany } } as never,
      "u1"
    );
    expect(out).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
