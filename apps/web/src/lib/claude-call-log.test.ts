import { beforeEach, describe, expect, it, vi } from "vitest";

import { costCentsFor, loggedMessagesCreate, priceFor } from "./claude-call-log";

const create = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { claudeCallLog: { create: (...a: unknown[]) => create(...a) } } }));
vi.mock("@/lib/safe-log", () => ({ safeLog: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

// mockClear + explicit impl rather than mockReset: under vitest 4, a mock
// that was mockReset() in beforeEach and then rejects inside the test is
// reported as a test failure even when the code under test catches it.
beforeEach(() => {
  create.mockClear();
  create.mockImplementation(async () => undefined);
});

describe("pricing", () => {
  it("knows the models the product uses", () => {
    // Official table, platform.claude.com/docs/en/about-claude/pricing (2026-10-18).
    expect(priceFor("claude-opus-5-5")).toEqual({ input: 4, output: 20, cacheRead: 0.05, known: true });
    expect(priceFor("claude-opus-5")).toMatchObject({ input: 5, output: 25 });
    expect(priceFor("claude-sonnet-5-5")).toEqual({ input: 2, output: 10, cacheRead: 0.05, known: true });
    expect(priceFor("claude-sonnet-5")).toMatchObject({ input: 2, output: 10, cacheRead: 0.1 });
    expect(priceFor("claude-sonnet-4-6")).toEqual({ input: 3, output: 15, cacheRead: 0.1, known: true });
    expect(priceFor("claude-haiku-4-5-20251001")).toMatchObject({ input: 1, output: 5, known: true });
    expect(priceFor("claude-opus-4-7")).toMatchObject({ input: 5, output: 25 });
    expect(priceFor("claude-opus-4-1")).toMatchObject({ input: 15, output: 75 });
    expect(priceFor("claude-opus-4")).toMatchObject({ input: 15, output: 75 });
    expect(priceFor("claude-something-new").known).toBe(false);
  });

  it("costs in whole cents, rounded up, cache tokens discounted / surcharged", () => {
    // 1M in + 100k out on Opus 5.5 = $4 + $2 = $6.00
    expect(costCentsFor("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 100_000 })).toBe(600);
    // a tiny call is never free
    expect(costCentsFor("claude-haiku-4-5", { input_tokens: 50, output_tokens: 10 })).toBe(1);
    // Opus 5.5 cache reads are 0.05x: 1M reads = $0.20
    expect(costCentsFor("claude-opus-5-5", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 })).toBe(20);
    // 1M cache reads on Sonnet 4.6 = 10% of $3 = $0.30; 1M cache writes = 125% = $3.75
    expect(costCentsFor("claude-sonnet-4-6", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 })).toBe(30);
    expect(costCentsFor("claude-sonnet-4-6", { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 })).toBe(375);
    expect(costCentsFor("claude-sonnet-4-6", { input_tokens: 0, output_tokens: 0 })).toBe(0);
  });
});

describe("loggedMessagesCreate", () => {
  const params = { model: "claude-opus-5-5", max_tokens: 10, messages: [{ role: "user" as const, content: "hi" }] };

  it("returns the message and writes one success row with purpose + userId", async () => {
    const message = { id: "m1", model: "claude-opus-5-5", usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 800 }, content: [] };
    const client = { messages: { create: vi.fn(async () => message) } } as never;
    const out = await loggedMessagesCreate(client, params as never, { purpose: "life_audit", userId: "u1" });
    expect(out).toBe(message);
    expect(create).toHaveBeenCalledTimes(1);
    const row = create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(row.data).toMatchObject({
      purpose: "life_audit",
      model: "claude-opus-5-5",
      tokensIn: 2000, // input + cache read
      tokensOut: 300,
      success: true,
      errorMessage: null,
      userId: "u1",
    });
    // (1200*4 + 800*4*0.05 + 300*20)/1e6 = $0.01096 → 2 cents (ceil)
    expect(row.data.costCents).toBe(2);
    expect(typeof row.data.durationMs).toBe("number");
  });

  it("on failure writes a failed row and rethrows the original error", async () => {
    const client = { messages: { create: vi.fn(async () => { throw new Error("overloaded"); }) } } as never;
    await expect(loggedMessagesCreate(client, params as never, { purpose: "ask_past", userId: "u2" })).rejects.toThrow("overloaded");
    const row = create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(row.data).toMatchObject({ purpose: "ask_past", success: false, errorMessage: "overloaded", tokensIn: 0, tokensOut: 0, costCents: 0, userId: "u2" });
  });

  it("a failing log write never breaks the caller", async () => {
    create.mockImplementation(() => Promise.reject(Object.assign(new Error("db down"), { name: "DbError" })));
    const message = { id: "m1", model: "claude-sonnet-4-6", usage: { input_tokens: 10, output_tokens: 5 }, content: [] };
    const client = { messages: { create: vi.fn(async () => message) } } as never;
    let out: unknown;
    let threw: unknown = null;
    try {
      out = await loggedMessagesCreate(client, params as never, { purpose: "entry_extraction" });
    } catch (e) {
      threw = e;
    }
    expect(threw).toBeNull();
    expect(out).toBe(message);
  });
});
