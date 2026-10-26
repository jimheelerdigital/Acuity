import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const calls: unknown[] = [];
let row: { creatorId: string } | null = null;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    creatorReferralClick: {
      findFirst: async (args: unknown) => {
        calls.push(args);
        return row;
      },
    },
  },
}));

import { SUGGEST_WINDOW_MS, hashIp, ipFromHeaders, suggestForIpHash } from "./suggest";

describe("referral suggestion", () => {
  beforeEach(() => {
    calls.length = 0;
    row = null;
  });

  it("hashes the same IP the same way and never stores it raw", () => {
    const h = hashIp("203.0.113.7");
    expect(h).toHaveLength(32);
    expect(h).toBe(hashIp(" 203.0.113.7 "));
    expect(h).not.toContain("203");
    expect(hashIp("")).toBeNull();
  });

  it("takes the first x-forwarded-for address", () => {
    const h = new Headers({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" });
    expect(ipFromHeaders(h)).toBe("198.51.100.2");
    expect(ipFromHeaders(new Headers())).toBeNull();
  });

  it("looks back only 24 hours, newest first", async () => {
    row = { creatorId: "c1" };
    const now = new Date("2026-10-25T20:00:00Z");
    expect(await suggestForIpHash("abc", now)).toEqual({ creatorId: "c1" });
    const args = calls[0] as { where: { ipHash: string; createdAt: { gte: Date } }; orderBy: unknown };
    expect(args.where.ipHash).toBe("abc");
    expect(now.getTime() - args.where.createdAt.gte.getTime()).toBe(SUGGEST_WINDOW_MS);
    expect(args.orderBy).toEqual({ createdAt: "desc" });
  });

  it("returns nothing without an IP", async () => {
    expect(await suggestForIpHash(null)).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
