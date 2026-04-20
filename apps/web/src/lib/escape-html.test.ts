import { describe, expect, it } from "vitest";

import { escapeHtml } from "./escape-html";

describe("escapeHtml", () => {
  it("escapes the five canonical characters", () => {
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml(">")).toBe("&gt;");
    expect(escapeHtml("&")).toBe("&amp;");
    expect(escapeHtml('"')).toBe("&quot;");
    expect(escapeHtml("'")).toBe("&#39;");
  });

  it("neutralizes a classic script-tag XSS payload", () => {
    const payload = "<script>alert(1)</script>";
    const out = escapeHtml(payload);
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("neutralizes an attribute-break payload", () => {
    const payload = '" onerror="alert(1)"';
    const out = escapeHtml(payload);
    expect(out).not.toContain('"');
    expect(out).toContain("&quot;");
  });

  it("neutralizes a character-reference entity (no double-encoding issue)", () => {
    // Escape order matters — `&` must come first so existing entities
    // in the input get re-encoded consistently.
    const out = escapeHtml("&amp;");
    expect(out).toBe("&amp;amp;");
  });

  it("returns empty string for null / undefined", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("passes through plain text unchanged", () => {
    expect(escapeHtml("Alice Smith")).toBe("Alice Smith");
    expect(escapeHtml("alice@example.com")).toBe("alice@example.com");
  });
});
