import { describe, expect, it } from "vitest";

import {
  AUDIO_BYTES_PER_SECOND,
  AUDIO_FILE_BUDGET,
  audioTruncationNote,
  estimateAudioBytes,
  formatMb,
  planAudioInclusion,
  type AudioCandidate,
} from "./export-audio-budget";

/**
 * The audio budget guards the export's scratch disk. Streaming the archive
 * fixed peak MEMORY; it did nothing about the ephemeral volume the archive
 * is written to, and an account with a pathological amount of retained
 * audio can still fill it.
 *
 * The interesting cases are all about what happens at the edges — an
 * oversized single file, rows with no duration recorded, and making sure
 * a truncated export says so instead of silently shipping less than the
 * user asked for.
 */

const file = (id: string, bytes: number | null = null): AudioCandidate => ({
  id,
  audioPath: `u/${id}.m4a`,
  audioBytes: bytes,
});

const MB = 1024 * 1024;

describe("planAudioInclusion — the normal case", () => {
  it("includes everything that fits, in order", () => {
    const plan = planAudioInclusion([file("a", MB), file("b", MB), file("c", MB)], {
      byteBudget: 10 * MB,
    });
    expect(plan.included.map((f) => f.id)).toEqual(["a", "b", "c"]);
    expect(plan.skipped).toEqual([]);
    expect(plan.truncated).toBe(false);
    expect(plan.plannedBytes).toBe(3 * MB);
  });

  it("ignores entries with no audioPath without calling them skipped", () => {
    // A transcript-only entry is not a truncation — it never had audio.
    const plan = planAudioInclusion([
      { id: "a", audioPath: null },
      file("b", MB),
    ]);
    expect(plan.included.map((f) => f.id)).toEqual(["b"]);
    expect(plan.skipped).toEqual([]);
    expect(plan.truncated).toBe(false);
  });

  it("the real 105MB account sails through untruncated", () => {
    // The case that prompted this work. 500 files averaging ~210KB.
    const many = Array.from({ length: 500 }, (_, i) => file(`e${i}`, 210 * 1024));
    const plan = planAudioInclusion(many);
    expect(plan.truncated).toBe(false);
    expect(plan.included).toHaveLength(500);
  });
});

describe("planAudioInclusion — the byte budget", () => {
  it("stops admitting once the budget would be exceeded", () => {
    const plan = planAudioInclusion(
      [file("a", 4 * MB), file("b", 4 * MB), file("c", 4 * MB)],
      { byteBudget: 10 * MB }
    );
    expect(plan.included.map((f) => f.id)).toEqual(["a", "b"]);
    expect(plan.skipped).toEqual([{ id: "c", reason: "byte-budget" }]);
    expect(plan.plannedBytes).toBe(8 * MB);
  });

  it("skips a single file larger than the entire budget rather than blowing it", () => {
    // The >-not->= case: admitting this would put the plan over on its
    // very first file, which is the one outcome the budget must prevent.
    const plan = planAudioInclusion([file("huge", 50 * MB)], { byteBudget: 10 * MB });
    expect(plan.included).toEqual([]);
    expect(plan.skipped).toEqual([{ id: "huge", reason: "byte-budget" }]);
  });

  it("keeps going after a skip — a big file does not end the export", () => {
    const plan = planAudioInclusion(
      [file("big", 9 * MB), file("small", 1 * MB)],
      { byteBudget: 5 * MB }
    );
    expect(plan.included.map((f) => f.id)).toEqual(["small"]);
    expect(plan.skipped).toEqual([{ id: "big", reason: "byte-budget" }]);
  });

  it("admits unknown-size files and counts them as zero", () => {
    // No byte column exists on Entry, so pre-duration rows land here. The
    // file cap is what bounds this case; refusing them would gut the
    // export for exactly the oldest entries a user is exporting FOR.
    const plan = planAudioInclusion([file("a", null), file("b", null)], {
      byteBudget: 1,
    });
    expect(plan.included).toHaveLength(2);
    expect(plan.plannedBytes).toBe(0);
    expect(plan.truncated).toBe(false);
  });

  it("treats zero and negative sizes as unknown", () => {
    const plan = planAudioInclusion([file("a", 0), file("b", -5)], { byteBudget: 1 });
    expect(plan.included).toHaveLength(2);
  });
});

describe("planAudioInclusion — the file budget", () => {
  it("caps on count even when every file is tiny", () => {
    const many = Array.from({ length: 12 }, (_, i) => file(`e${i}`, 1));
    const plan = planAudioInclusion(many, { fileBudget: 10 });
    expect(plan.included).toHaveLength(10);
    expect(plan.skipped).toHaveLength(2);
    expect(plan.skipped.every((s) => s.reason === "file-budget")).toBe(true);
  });

  it("drops the NEWEST audio, given oldest-first input", () => {
    // Deliberate: the archive a user cannot see in-app is worth more to
    // them than this morning's recording, which is still one tap away.
    const plan = planAudioInclusion(
      [file("oldest", 1), file("middle", 1), file("newest", 1)],
      { fileBudget: 2 }
    );
    expect(plan.included.map((f) => f.id)).toEqual(["oldest", "middle"]);
    expect(plan.skipped).toEqual([{ id: "newest", reason: "file-budget" }]);
  });

  it("defaults to a decade of daily recording", () => {
    expect(AUDIO_FILE_BUDGET).toBeGreaterThan(365 * 10);
  });
});

describe("estimateAudioBytes", () => {
  it("scales with duration", () => {
    expect(estimateAudioBytes(60)).toBe(60 * AUDIO_BYTES_PER_SECOND);
  });

  it("returns null for anything unusable rather than guessing zero", () => {
    // null is "unknown" and admits the file; 0 would read as a known-empty
    // file. They are different, and conflating them would silently change
    // which entries get included.
    for (const bad of [null, undefined, 0, -1, NaN, Infinity]) {
      expect(estimateAudioBytes(bad as number), `${bad}`).toBeNull();
    }
  });

  it("rounds up, because over-estimating is the safe direction", () => {
    expect(estimateAudioBytes(0.5)).toBe(Math.ceil(0.5 * AUDIO_BYTES_PER_SECOND));
  });
});

describe("audioTruncationNote", () => {
  it("is null when nothing was dropped, so callers have one condition", () => {
    const plan = planAudioInclusion([file("a", MB)]);
    expect(audioTruncationNote(plan)).toBeNull();
  });

  it("names the count and both reasons when they apply", () => {
    const plan = planAudioInclusion(
      [file("a", 1), file("b", 1), file("big", 999 * MB)],
      { byteBudget: 10 * MB, fileBudget: 2 }
    );
    const note = audioTruncationNote(plan)!;
    expect(note).toMatch(/were not included/i);
    expect(note).toMatch(/file limit/i);
  });

  it("reassures that the written record is complete", () => {
    // The whole point of surfacing truncation: a user must not conclude
    // their transcripts were trimmed too.
    const plan = planAudioInclusion([file("a", 99 * MB)], { byteBudget: MB });
    const note = audioTruncationNote(plan)!;
    expect(note).toMatch(/nothing about your written record was truncated/i);
  });
});

describe("formatMb", () => {
  it("renders one decimal", () => {
    expect(formatMb(1536 * 1024)).toBe("1.5 MB");
    expect(formatMb(0)).toBe("0.0 MB");
  });
});
