import { describe, expect, it, vi } from "vitest";

import { findTryResult, isExpoPushToken, parseTryJob, waitThenPush, type TryResult } from "./try-result";

const job = { storagePath: "abc123.m4a", anonDeviceId: "0f1e2d3c-4b5a-4968-8776-655443322110" };

describe("parseTryJob", () => {
  it("accepts a flat storage name + device id", () => {
    expect(parseTryJob(job)).toEqual(job);
  });
  it("rejects paths outside the flat namespace and missing ids", () => {
    expect(parseTryJob({ ...job, storagePath: "../x" })).toBeNull();
    expect(parseTryJob({ ...job, storagePath: "a/b" })).toBeNull();
    expect(parseTryJob({ storagePath: "a" })).toBeNull();
    expect(parseTryJob(null)).toBeNull();
  });
});

describe("findTryResult", () => {
  const row = { sessionToken: "tok", extractionData: { tasks: [] }, expiresAt: new Date("2026-10-21T00:00:00Z") };

  it("ready when the TrySession for that upload AND device exists", async () => {
    const findFirst = vi.fn().mockResolvedValue(row);
    const r = await findTryResult(job, { db: { trySession: { findFirst } }, audioExists: async () => true });
    expect(r).toEqual({ status: "ready", sessionToken: "tok", extraction: { tasks: [] }, expiresAt: "2026-10-21T00:00:00.000Z" });
    const where = findFirst.mock.calls[0][0].where;
    expect(where.audioPath).toBe(job.storagePath);
    expect(where.anonDeviceId).toBe(job.anonDeviceId);
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it("pending while the audio is still there (analysis running)", async () => {
    const r = await findTryResult(job, { db: { trySession: { findFirst: async () => null } }, audioExists: async () => true });
    expect(r).toEqual({ status: "pending" });
  });

  it("failed when there is no session and the audio was deleted", async () => {
    const r = await findTryResult(job, { db: { trySession: { findFirst: async () => null } }, audioExists: async () => false });
    expect(r).toEqual({ status: "failed" });
  });
});

describe("isExpoPushToken", () => {
  it("accepts Expo tokens only", () => {
    expect(isExpoPushToken("ExponentPushToken[AbC123_-x]")).toBe(true);
    expect(isExpoPushToken("ExpoPushToken[AbC123]")).toBe(true);
    expect(isExpoPushToken("https://evil.example/hook")).toBe(false);
    expect(isExpoPushToken(42)).toBe(false);
  });
});

describe("waitThenPush", () => {
  const fakeClock = () => {
    let t = 0;
    return { now: () => t, sleep: async (ms: number) => void (t += ms) };
  };

  it("waits for the result, then sends exactly one push", async () => {
    const seq: TryResult[] = [{ status: "pending" }, { status: "pending" }, { status: "ready", sessionToken: "t", extraction: {}, expiresAt: "x" }];
    const push = vi.fn().mockResolvedValue(true);
    const c = fakeClock();
    const out = await waitThenPush(job, "ExponentPushToken[a]", { budgetMs: 140_000, find: async () => seq.shift()!, push, ...c });
    expect(out).toBe("sent");
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("ExponentPushToken[a]");
  });

  it("never pushes when the analysis failed", async () => {
    const push = vi.fn();
    const out = await waitThenPush(job, "ExponentPushToken[a]", { budgetMs: 140_000, find: async () => ({ status: "failed" }), push, ...fakeClock() });
    expect(out).toBe("failed");
    expect(push).not.toHaveBeenCalled();
  });

  it("gives up at the budget without pushing", async () => {
    const push = vi.fn();
    const out = await waitThenPush(job, "ExponentPushToken[a]", { budgetMs: 10_000, find: async () => ({ status: "pending" }), push, ...fakeClock() });
    expect(out).toBe("timeout");
    expect(push).not.toHaveBeenCalled();
  });
});
