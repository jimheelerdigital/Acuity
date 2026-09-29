import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the MCP token lifecycle. Prisma is mocked with a tiny
 * in-memory store so we exercise the REAL hashing/verify/revoke logic in
 * mcp-token.ts without a database.
 *
 * The store keys rows by whatever `tokenHash` the lib computes, so verify
 * naturally matches only when the presented plaintext hashes to a stored
 * row — exactly the production path.
 */

interface Row {
  id: string;
  userId: string;
  tokenHash: string;
  prefix: string;
  name: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
}

const rows: Row[] = [];
let idSeq = 0;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mcpAccessToken: {
      create: vi.fn(async ({ data, select }: any) => {
        const row: Row = {
          id: `tok_${++idSeq}`,
          userId: data.userId,
          tokenHash: data.tokenHash,
          prefix: data.prefix,
          name: data.name ?? null,
          createdAt: new Date(),
          lastUsedAt: null,
          revokedAt: null,
          expiresAt: null,
        };
        rows.push(row);
        return select?.id ? { id: row.id } : row;
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        return rows.find((r) => r.tokenHash === where.tokenHash) ?? null;
      }),
      findMany: vi.fn(async ({ where, select }: any) => {
        const matched = rows
          .filter((r) => r.userId === where.userId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (!select) return matched;
        // Honor Prisma's `select` projection so tests see the real shape.
        const keys = Object.keys(select).filter((k) => select[k]);
        return matched.map((r) =>
          Object.fromEntries(keys.map((k) => [k, (r as any)[k]]))
        );
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = rows.find((r) => r.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matched = rows.filter(
          (r) =>
            r.id === where.id &&
            r.userId === where.userId &&
            (where.revokedAt === null ? r.revokedAt === null : true)
        );
        matched.forEach((r) => Object.assign(r, data));
        return { count: matched.length };
      }),
    },
  },
}));

// Import AFTER the mock is registered.
import {
  mintMcpToken,
  verifyMcpToken,
  revokeMcpToken,
  listMcpTokens,
} from "./mcp-token";

beforeEach(() => {
  rows.length = 0;
  idSeq = 0;
});

describe("mcp-token", () => {
  it("mints a prefixed, high-entropy token and stores only its hash", async () => {
    const minted = await mintMcpToken("user_a", "Claude Desktop");
    expect(minted.plaintext.startsWith("rpl_mcp_")).toBe(true);
    expect(minted.plaintext.length).toBeGreaterThan(40);
    // The stored row must NOT contain the plaintext anywhere.
    const row = rows[0];
    expect(row.tokenHash).not.toContain(minted.plaintext);
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.prefix.startsWith("rpl_mcp_")).toBe(true);
    expect(row.name).toBe("Claude Desktop");
  });

  it("verifies a valid token to its owner", async () => {
    const minted = await mintMcpToken("user_a");
    const v = await verifyMcpToken(minted.plaintext);
    expect(v).not.toBeNull();
    expect(v?.userId).toBe("user_a");
  });

  it("rejects an unknown token and a non-prefixed string", async () => {
    await mintMcpToken("user_a");
    expect(await verifyMcpToken("rpl_mcp_not_a_real_token")).toBeNull();
    expect(await verifyMcpToken("bearer-ish-nonsense")).toBeNull();
    expect(await verifyMcpToken("")).toBeNull();
    expect(await verifyMcpToken(null)).toBeNull();
  });

  it("rejects a revoked token", async () => {
    const minted = await mintMcpToken("user_a");
    expect(await verifyMcpToken(minted.plaintext)).not.toBeNull();
    const ok = await revokeMcpToken("user_a", minted.id);
    expect(ok).toBe(true);
    expect(await verifyMcpToken(minted.plaintext)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const minted = await mintMcpToken("user_a");
    // Force expiry into the past on the stored row.
    rows[0].expiresAt = new Date(Date.now() - 1000);
    expect(await verifyMcpToken(minted.plaintext)).toBeNull();
  });

  it("only lets a user revoke their own token", async () => {
    const minted = await mintMcpToken("user_a");
    // Wrong owner cannot revoke.
    expect(await revokeMcpToken("user_b", minted.id)).toBe(false);
    expect(await verifyMcpToken(minted.plaintext)).not.toBeNull();
    // Correct owner can; second revoke is a no-op (idempotent).
    expect(await revokeMcpToken("user_a", minted.id)).toBe(true);
    expect(await revokeMcpToken("user_a", minted.id)).toBe(false);
  });

  it("lists a user's tokens without exposing the hash", async () => {
    await mintMcpToken("user_a", "one");
    await mintMcpToken("user_a", "two");
    await mintMcpToken("user_b", "other");
    const list = await listMcpTokens("user_a");
    expect(list).toHaveLength(2);
    // Summary shape must not leak the hash.
    expect(Object.keys(list[0])).not.toContain("tokenHash");
  });
});
