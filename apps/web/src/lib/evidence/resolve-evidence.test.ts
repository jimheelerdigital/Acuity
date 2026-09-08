import { describe, expect, it, vi } from "vitest";

import {
  resolveEvidence,
  type DigestSource,
} from "@/inngest/functions/compute-user-insights";

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: vi.fn() };
  },
}));

/**
 * resolveEvidence turns the model's cited refs into rows we can stand behind.
 * Its job is to be SKEPTICAL: only refs we issued, only entries whose text
 * actually supports the claim, only one row per entry.
 */

const sources: DigestSource[] = [
  {
    ref: "E1",
    entryId: "entry_run",
    transcript: "I went for a run after dinner and felt so much better.",
    summary: null,
  },
  {
    ref: "E2",
    entryId: "entry_work",
    transcript: "Work was stressful, the deadline moved again.",
    summary: null,
  },
  {
    ref: "E3",
    entryId: "entry_empty",
    transcript: null,
    summary: null,
  },
];

const INSIGHT = "Your mood lifts on days you run";

describe("resolveEvidence — only cites what it can quote", () => {
  it("resolves a supported citation into a verbatim excerpt", () => {
    const out = resolveEvidence(INSIGHT, ["E1"], sources);
    expect(out).toHaveLength(1);
    expect(out[0].entryId).toBe("entry_run");
    expect(sources[0].transcript).toContain(out[0].excerpt);
  });

  it("carries offsets that locate the excerpt in the transcript", () => {
    const out = resolveEvidence(INSIGHT, ["E1"], sources);
    const t = sources[0].transcript!;
    expect(t.slice(out[0].startIndex!, out[0].endIndex!)).toBe(out[0].excerpt);
  });

  it("DROPS a ref we never issued (model invented E99)", () => {
    expect(resolveEvidence(INSIGHT, ["E99"], sources)).toHaveLength(0);
  });

  it("DROPS a real entry whose text does not support the claim", () => {
    // E2 exists and is a genuine entry, but says nothing about running or mood.
    const out = resolveEvidence(INSIGHT, ["E2"], sources);
    expect(out).toHaveLength(0);
  });

  it("DROPS an entry with no text to quote", () => {
    expect(resolveEvidence(INSIGHT, ["E3"], sources)).toHaveLength(0);
  });

  it("keeps the supported citation and drops the unsupported one in a mixed list", () => {
    const out = resolveEvidence(INSIGHT, ["E1", "E2", "E99"], sources);
    expect(out.map((e) => e.entryId)).toEqual(["entry_run"]);
  });

  it("returns nothing for an empty citation list", () => {
    expect(resolveEvidence(INSIGHT, [], sources)).toHaveLength(0);
  });

  it("de-duplicates repeat citations of the same entry", () => {
    // Guards the @@unique([insightId, entryId]) constraint, and stops an
    // insight looking better-evidenced by citing one entry three times.
    const out = resolveEvidence(INSIGHT, ["E1", "E1", "e1"], sources);
    expect(out).toHaveLength(1);
  });

  it("is case- and whitespace-insensitive on refs", () => {
    expect(resolveEvidence(INSIGHT, [" e1 "], sources)).toHaveLength(1);
  });

  it("ignores non-string junk in the refs array", () => {
    const junk = [null, 42, {}, ["E1"], "E1"] as unknown as string[];
    expect(resolveEvidence(INSIGHT, junk, sources)).toHaveLength(1);
  });

  it("returns nothing when there are no sources at all", () => {
    expect(resolveEvidence(INSIGHT, ["E1"], [])).toHaveLength(0);
  });
});
