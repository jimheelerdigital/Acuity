import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
process.env.NEXTAUTH_SECRET = "test-secret";

import { matchDuplicates, nameMatches, signLinkApple, verifyLinkApple } from "./apple-duplicate-catch";

const at = (iso: string) => new Date(iso);

describe("apple duplicate catch", () => {
  it("matches Aubrey by surname in the paid email", () => {
    expect(nameMatches("AuBrey Tondreault", { name: "Aubrey", email: "atondreault@me.com" })).toBeTruthy();
    expect(nameMatches("Michael Hester", { name: null, email: "bbfamspam@gmail.com" })).toBeNull();
  });

  it("strong match beats a nearer stranger", () => {
    const m = matchDuplicates(
      [{ id: "d1", email: "x@privaterelay.appleid.com", name: "AuBrey Tondreault", createdAt: at("2026-10-01T19:34:42Z") }],
      [
        { id: "p1", email: "atondreault@me.com", name: "Aubrey", paidAt: at("2026-10-01T19:31:34Z") },
        { id: "p2", email: "someone@gmail.com", name: null, paidAt: at("2026-10-01T19:33:00Z") },
      ]
    );
    expect(m).toHaveLength(1);
    expect(m[0].paid.id).toBe("p1");
    expect(m[0].confidence).toBe("strong");
  });

  it("possible match only when exactly one payment in the 2h before", () => {
    const dupe = { id: "d2", email: "y@privaterelay.appleid.com", name: "Michael Hester", createdAt: at("2026-10-01T01:38:00Z") };
    const one = matchDuplicates([dupe], [{ id: "p3", email: "bbfamspam@gmail.com", name: null, paidAt: at("2026-10-01T01:14:00Z") }]);
    expect(one[0]?.confidence).toBe("possible");
    const two = matchDuplicates([dupe], [
      { id: "p3", email: "bbfamspam@gmail.com", name: null, paidAt: at("2026-10-01T01:14:00Z") },
      { id: "p4", email: "other@gmail.com", name: null, paidAt: at("2026-10-01T01:20:00Z") },
    ]);
    expect(two).toHaveLength(0);
    const after = matchDuplicates([dupe], [{ id: "p5", email: "late@gmail.com", name: null, paidAt: at("2026-10-01T02:00:00Z") }]);
    expect(after).toHaveLength(0);
  });

  it("signed link round-trips and rejects tampering", () => {
    const t = signLinkApple("dupe", "paid");
    expect(verifyLinkApple(t)).toEqual({ from: "dupe", to: "paid" });
    expect(verifyLinkApple(t.slice(0, -2) + "xx")).toBeNull();
    expect(verifyLinkApple("nope")).toBeNull();
  });
});
