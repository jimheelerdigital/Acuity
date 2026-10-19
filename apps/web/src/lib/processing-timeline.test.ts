import { describe, expect, it, vi } from "vitest";

import { markPhase, summarizeTimeline } from "./processing-timeline";

describe("summarizeTimeline", () => {
  const created = new Date(1_000_000);

  it("splits a voice entry into phase durations", () => {
    const s = summarizeTimeline(
      [
        { p: "transcribe_start", at: 1_002_000 },
        { p: "transcribe_done", at: 1_009_000 },
        { p: "extract_start", at: 1_012_000 },
        { p: "extract_done", at: 1_027_000 },
        { p: "persist_done", at: 1_028_500 },
        { p: "finished", at: 1_036_000 },
      ],
      created
    );
    expect(s).toEqual({
      queueMs: 2_000,
      whisperMs: 7_000,
      preExtractMs: 3_000,
      extractMs: 15_000,
      persistMs: 1_500,
      tailMs: 7_500,
      totalMs: 36_000,
    });
  });

  it("treats transcript_provided as the end of transcription for typed entries", () => {
    const s = summarizeTimeline(
      [
        { p: "transcript_provided", at: 1_001_000 },
        { p: "extract_start", at: 1_003_000 },
        { p: "extract_done", at: 1_013_000 },
      ],
      created
    );
    expect(s.whisperMs).toBeNull();
    expect(s.preExtractMs).toBe(2_000);
    expect(s.extractMs).toBe(10_000);
    expect(s.totalMs).toBeNull(); // not finished
  });

  it("tolerates garbage and missing marks", () => {
    expect(summarizeTimeline(null, created).totalMs).toBeNull();
    expect(summarizeTimeline([{ nope: 1 }, "x", 3], created).queueMs).toBeNull();
  });
});

describe("markPhase", () => {
  it("appends via jsonb concat and never throws", async () => {
    const $executeRaw = vi.fn().mockResolvedValue(1);
    await markPhase({ $executeRaw } as never, "e1", "extract_start", 123);
    expect($executeRaw).toHaveBeenCalledTimes(1);
    // Tagged template: values are the interpolations.
    const values = $executeRaw.mock.calls[0].slice(1);
    expect(values[0]).toBe(JSON.stringify([{ p: "extract_start", at: 123 }]));
    expect(values[1]).toBe("e1");

    const boom = vi.fn().mockRejectedValue(new Error("db down"));
    await expect(
      markPhase({ $executeRaw: boom } as never, "e1", "finished")
    ).resolves.toBeUndefined();
  });
});
