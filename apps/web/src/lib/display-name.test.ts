import { describe, expect, it } from "vitest";

import { DISPLAY_NAME_MAX, cleanDisplayName } from "./display-name";

describe("cleanDisplayName", () => {
  it("keeps an ordinary name, trimmed", () => {
    expect(cleanDisplayName("  Lindsey ")).toBe("Lindsey");
  });
  it("allows any script, apostrophes and hyphens", () => {
    expect(cleanDisplayName("Zoë O'Neil-Ávila")).toBe("Zoë O'Neil-Ávila");
    expect(cleanDisplayName("美咲")).toBe("美咲");
  });
  it("collapses whitespace and strips control characters", () => {
    expect(cleanDisplayName("Mary\n\t  Ann\u0007")).toBe("Mary Ann");
  });
  it("rejects blank, non-string and oversized input", () => {
    expect(cleanDisplayName("   ")).toBeNull();
    expect(cleanDisplayName(undefined)).toBeNull();
    expect(cleanDisplayName(42)).toBeNull();
    expect(cleanDisplayName("a".repeat(DISPLAY_NAME_MAX + 1))).toBeNull();
    expect(cleanDisplayName("a".repeat(DISPLAY_NAME_MAX))).toHaveLength(DISPLAY_NAME_MAX);
  });
});
