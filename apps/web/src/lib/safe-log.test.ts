import { describe, expect, it } from "vitest";

import { __sanitize_for_tests as sanitize } from "./safe-log";

describe("safe-log sanitize", () => {
  it("replaces `email` with an 8-char sha256 prefix", () => {
    const out = sanitize({ email: "alice@example.com", other: "kept" }) as Record<
      string,
      unknown
    >;
    expect(typeof out.email).toBe("string");
    expect(out.email).toMatch(/^[0-9a-f]{8}$/);
    expect(out.email).not.toBe("alice@example.com");
    expect(out.other).toBe("kept");
  });

  it("redacts `name`, `transcript`, `audioPath`, `audioUrl`, `phoneNumber`", () => {
    const out = sanitize({
      name: "Alice Smith",
      transcript: "my secret journal",
      audioPath: "userid/entryid.webm",
      audioUrl: "https://signed.example/x",
      phoneNumber: "+15551234",
      kept: "safe",
    });
    expect(out).toEqual({
      name: "<redacted>",
      transcript: "<redacted>",
      audioPath: "<redacted>",
      audioUrl: "<redacted>",
      phoneNumber: "<redacted>",
      kept: "safe",
    });
  });

  it("is case-insensitive on the key match", () => {
    const out = sanitize({
      Email: "a@b.com",
      NAME: "Alice",
      AudioPath: "x/y.webm",
    }) as Record<string, unknown>;
    expect(out.Email).toMatch(/^[0-9a-f]{8}$/);
    expect(out.NAME).toBe("<redacted>");
    expect(out.AudioPath).toBe("<redacted>");
  });

  it("recurses into nested objects and arrays", () => {
    const out = sanitize({
      user: { email: "a@b.com", name: "Alice" },
      entries: [{ transcript: "x", themes: ["t1"] }],
    });
    expect(out).toMatchObject({
      user: { email: expect.stringMatching(/^[0-9a-f]{8}$/), name: "<redacted>" },
      entries: [{ transcript: "<redacted>", themes: ["t1"] }],
    });
  });

  it("passes through non-object values", () => {
    expect(sanitize("hello")).toBe("hello");
    expect(sanitize(42)).toBe(42);
    expect(sanitize(null)).toBe(null);
    expect(sanitize(undefined)).toBe(undefined);
    expect(sanitize(true)).toBe(true);
  });

  it("produces a stable hash for the same email", () => {
    const a = sanitize({ email: "alice@example.com" }) as Record<string, unknown>;
    const b = sanitize({ email: "alice@example.com" }) as Record<string, unknown>;
    expect(a.email).toBe(b.email);
  });

  it("produces different hashes for different emails", () => {
    const a = sanitize({ email: "alice@example.com" }) as Record<string, unknown>;
    const b = sanitize({ email: "bob@example.com" }) as Record<string, unknown>;
    expect(a.email).not.toBe(b.email);
  });
});
