import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  _resetRevocationCacheForTests,
  isTokenRevoked,
  revokeAllSessions,
} from "./session-revocation";

vi.mock("@/lib/safe-log", () => ({ safeLog: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

function prismaWith(watermark: Date | null) {
  const findUnique = vi.fn().mockResolvedValue({ sessionsInvalidBefore: watermark });
  return { prisma: { user: { findUnique } } as never, findUnique };
}

beforeEach(() => _resetRevocationCacheForTests());

describe("isTokenRevoked", () => {
  it("no watermark → never revoked", async () => {
    const { prisma } = prismaWith(null);
    expect(await isTokenRevoked(prisma, "u1", 1)).toBe(false);
  });

  it("token issued before the watermark is revoked; after it is not", async () => {
    const wm = new Date("2026-10-18T12:00:00Z");
    const { prisma } = prismaWith(wm);
    expect(await isTokenRevoked(prisma, "u1", wm.getTime() / 1000 - 60)).toBe(true);
    expect(await isTokenRevoked(prisma, "u1", wm.getTime() / 1000 + 60)).toBe(false);
  });

  it("same-second issue survives (1s grace)", async () => {
    const wm = new Date("2026-10-18T12:00:00.400Z");
    const { prisma } = prismaWith(wm);
    expect(await isTokenRevoked(prisma, "u1", Math.floor(wm.getTime() / 1000))).toBe(false);
  });

  it("caches the watermark per user", async () => {
    const { prisma, findUnique } = prismaWith(null);
    await isTokenRevoked(prisma, "u1", 1);
    await isTokenRevoked(prisma, "u1", 2);
    await isTokenRevoked(prisma, "u2", 2);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});

describe("revokeAllSessions", () => {
  it("stamps the watermark, drops sessions, revokes MCP connections + tokens, warms the cache", async () => {
    const ops = {
      user: { update: vi.fn().mockResolvedValue({}), findUnique: vi.fn() },
      session: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      mcpConnection: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      mcpAccessToken: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      $transaction: vi.fn(async (arr: unknown[]) => Promise.all(arr)),
    };
    const at = await revokeAllSessions(ops as never, "u1", "test");
    expect(ops.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { sessionsInvalidBefore: at },
    });
    expect(ops.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(ops.mcpConnection.updateMany.mock.calls[0][0].where).toEqual({ userId: "u1", revokedAt: null });
    expect(ops.mcpAccessToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    // Cache warmed: a pre-revocation token is dead without another DB read.
    expect(await isTokenRevoked(ops as never, "u1", at.getTime() / 1000 - 10)).toBe(true);
    expect(ops.user.findUnique).not.toHaveBeenCalled();
  });
});
