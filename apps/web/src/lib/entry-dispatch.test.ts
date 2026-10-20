import { describe, expect, it, vi } from "vitest";

import { dispatchEntryProcessing, entryProcessEventId } from "./entry-dispatch";
import { SWEEP_EPOCH, sweepWindow } from "@/inngest/functions/entry-queued-sweeper";

const data = { entryId: "e1", userId: "u1" };
const noSleep = async () => {};

describe("dispatchEntryProcessing", () => {
  it("sends once with the deterministic dedupe id", async () => {
    const send = vi.fn().mockResolvedValue({ ids: ["x"] });
    expect(await dispatchEntryProcessing(data, { send, sleep: noSleep })).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual({ id: "entry-process:e1", name: "entry/process.requested", data });
  });

  it("retries a failed hand-off (the 2026-10-20 'other side closed')", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({ ids: ["x"] });
    expect(await dispatchEntryProcessing(data, { send, sleep: noSleep })).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    // Same id every attempt, so a send that secretly landed is deduped.
    expect(send.mock.calls[1][0].id).toBe(send.mock.calls[0][0].id);
  });

  it("bounds a hanging send and never throws", async () => {
    const send = vi.fn(() => new Promise(() => {})); // hangs forever
    expect(await dispatchEntryProcessing(data, { send, sleep: noSleep, timeoutMs: 5 })).toBe(false);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("id is per entry", () => {
    expect(entryProcessEventId("abc")).toBe("entry-process:abc");
  });
});

describe("sweepWindow", () => {
  it("skips entries younger than 90s (dispatch may still be in flight)", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    expect(sweepWindow(now).lt.toISOString()).toBe("2026-10-22T11:58:30.000Z");
    expect(sweepWindow(now).gt.toISOString()).toBe("2026-10-21T12:00:00.000Z");
  });

  it("never reaches entries sent before the dedupe id existed", () => {
    const now = new Date(SWEEP_EPOCH.getTime() + 60 * 60 * 1000);
    expect(sweepWindow(now).gt).toEqual(SWEEP_EPOCH);
  });
});
