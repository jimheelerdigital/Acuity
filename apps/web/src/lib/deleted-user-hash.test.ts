import { describe, expect, it } from "vitest";

import {
  hashDeletedUserEmail,
  hasDeletedUserHmacKey,
  hashEmailCandidates,
  looksHashed,
} from "./deleted-user-hash";

/**
 * The key comes from vitest.config.ts `test.env` — a fixed test value, not
 * the production secret.
 */

describe("hashDeletedUserEmail", () => {
  it("produces a 64-char hex digest", () => {
    expect(hashDeletedUserEmail("a@example.com")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — the same address always yields the same digest", () => {
    // This is what makes the O(1) indexed lookup possible; a per-row salt
    // would be stronger but would make equality lookup impossible.
    expect(hashDeletedUserEmail("a@example.com")).toBe(
      hashDeletedUserEmail("a@example.com")
    );
  });

  it("is case- and whitespace-insensitive", () => {
    const base = hashDeletedUserEmail("a@example.com");
    expect(hashDeletedUserEmail("A@Example.COM")).toBe(base);
    expect(hashDeletedUserEmail("  a@example.com  ")).toBe(base);
  });

  it("gives different addresses different digests", () => {
    expect(hashDeletedUserEmail("a@example.com")).not.toBe(
      hashDeletedUserEmail("b@example.com")
    );
  });

  it("never leaks the address into the digest", () => {
    const d = hashDeletedUserEmail("secret.person@example.com");
    expect(d).not.toContain("@");
    expect(d).not.toContain("secret");
    expect(d).not.toContain("example");
  });

  it("is NOT a bare sha256 — the pepper changes the output", () => {
    // Guards the whole point of #3: a plain sha256 of a low-entropy email is
    // reversible by enumeration. If someone 'simplifies' this to createHash,
    // this test fails.
    const { createHash } = require("node:crypto") as typeof import("node:crypto");
    const bare = createHash("sha256").update("a@example.com").digest("hex");
    expect(hashDeletedUserEmail("a@example.com")).not.toBe(bare);
  });
});

describe("hashEmailCandidates", () => {
  it("hashes every candidate", () => {
    const out = hashEmailCandidates(["a@example.com", "b@example.com"]);
    expect(out).toHaveLength(2);
    for (const d of out) expect(d).toMatch(/^[0-9a-f]{64}$/);
  });

  it("de-duplicates candidates that normalize to the same digest", () => {
    // The dual-candidate path passes canonical + literal; when they agree,
    // one probe is enough.
    expect(hashEmailCandidates(["a@example.com", "A@EXAMPLE.COM"])).toHaveLength(1);
  });

  it("skips empty/blank candidates", () => {
    expect(hashEmailCandidates(["", "   ", "a@example.com"])).toHaveLength(1);
  });

  it("preserves the two-probe behaviour for genuinely different forms", () => {
    // e.g. canonical (gmail dots stripped) vs literal — must stay 2 probes
    // so legacy tombstones written pre-canonicalization still match.
    const out = hashEmailCandidates(["ab@gmail.com", "a.b@gmail.com"]);
    expect(out).toHaveLength(2);
  });
});

describe("looksHashed", () => {
  it("recognizes a digest and rejects an address", () => {
    expect(looksHashed(hashDeletedUserEmail("a@example.com"))).toBe(true);
    expect(looksHashed("a@example.com")).toBe(false);
    expect(looksHashed("")).toBe(false);
    // Right length, wrong alphabet.
    expect(looksHashed("Z".repeat(64))).toBe(false);
  });

  it("makes the backfill idempotent — a digest is never re-hashed", () => {
    const once = hashDeletedUserEmail("a@example.com");
    expect(looksHashed(once)).toBe(true);
  });
});

describe("key presence", () => {
  it("reports the key as configured under test", () => {
    expect(hasDeletedUserHmacKey()).toBe(true);
  });
});
