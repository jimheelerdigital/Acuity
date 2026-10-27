import { describe, expect, it, vi } from "vitest";

// The extraction module pulls in the Anthropic client at import time;
// these tests only read the built prompt strings.
vi.mock("@anthropic-ai/sdk", () => ({ default: class {} }));
vi.mock("openai", () => ({ default: class {} }));

import { extractionSystemPromptFor } from "./pipeline";

/**
 * PAUSED 2026-10-27 (Jimmy): the per-entry reflection never got the legal
 * review it was parked for, so it sits behind the `entry_reflection` flag,
 * off by default. With the flag off the model must not even be asked for one.
 */
describe("entry reflection pause", () => {
  it.each([false, true])(
    "omits the reflection field and guidance when off (dispositional=%s)",
    (dispositional) => {
      const p = extractionSystemPromptFor(dispositional, false);
      expect(p).not.toContain('"reflection"');
      expect(p).not.toMatch(/reflection: ONE short message/);
      expect(p).toContain('"summary"');
    }
  );

  it.each([false, true])(
    "keeps the full reflection guidance when on (dispositional=%s)",
    (dispositional) => {
      const p = extractionSystemPromptFor(dispositional, true);
      expect(p).toContain('"reflection"');
      expect(p).toMatch(/SAFETY — READ THIS TWICE/);
    }
  );
});
