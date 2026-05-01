import { afterEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

// Mock the Anthropic SDK before importing the helper. The helper
// constructs an Anthropic instance at module load, so the mock has to
// be in place before the import.
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: (...args: unknown[]) => createMock(...args) };
    },
  };
});

import { summarizeForFreeTier } from "./free-summary";

afterEach(() => {
  createMock.mockReset();
});

describe("summarizeForFreeTier", () => {
  it("returns the Haiku response text trimmed", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "  Solid day, finished the spec.   " }],
    });
    const out = await summarizeForFreeTier("Today I finished the spec.");
    expect(out).toBe("Solid day, finished the spec.");
  });

  it("calls the Haiku model with the transcript as the user message", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "ok." }],
    });
    await summarizeForFreeTier("hello world");
    expect(createMock).toHaveBeenCalledTimes(1);
    const args = createMock.mock.calls[0][0] as {
      model: string;
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
    };
    expect(args.model).toMatch(/haiku/i);
    expect(args.messages[0]).toEqual({ role: "user", content: "hello world" });
    expect(args.max_tokens).toBe(128);
  });

  it("throws on empty transcript without making an API call", async () => {
    await expect(summarizeForFreeTier("   ")).rejects.toThrow(/empty transcript/);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws when Haiku response has no text block", async () => {
    createMock.mockResolvedValue({ content: [] });
    await expect(summarizeForFreeTier("hello")).rejects.toThrow(/no text block/);
  });

  it("throws when Haiku block.type is not text", async () => {
    createMock.mockResolvedValue({ content: [{ type: "tool_use", id: "x" }] });
    await expect(summarizeForFreeTier("hello")).rejects.toThrow(/no text block/);
  });

  it("throws when Haiku response text is empty/whitespace-only", async () => {
    createMock.mockResolvedValue({ content: [{ type: "text", text: "   " }] });
    await expect(summarizeForFreeTier("hello")).rejects.toThrow(/empty Haiku response/);
  });
});
