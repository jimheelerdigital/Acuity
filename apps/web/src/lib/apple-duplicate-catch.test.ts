import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
process.env.NEXTAUTH_SECRET = "test-secret";

import { fullNameMatches, isVeryStrong, matchDuplicates, nameMatches, namesConflict, purchaseLabel, signLinkApple, verifyLinkApple } from "./apple-duplicate-catch";

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

  it("never pairs two different names (Melissa vs Sheryl Farrer, 2026-10-03)", () => {
    const m = matchDuplicates(
      [{ id: "d3", email: "r7@privaterelay.appleid.com", name: "Sheryl Farrer", createdAt: at("2026-10-03T09:55:05Z") }],
      [{ id: "p6", email: "dmb121815@gmail.com", name: "Melissa", paidAt: at("2026-10-03T08:54:00Z") }]
    );
    expect(m).toHaveLength(0);
  });

  it("signed link round-trips and rejects tampering", () => {
    const t = signLinkApple("dupe", "paid");
    expect(verifyLinkApple(t)).toEqual({ from: "dupe", to: "paid" });
    expect(verifyLinkApple(t.slice(0, -2) + "xx")).toBeNull();
    expect(verifyLinkApple("nope")).toBeNull();
  });

  it("auto-links only a first+last name match within 2h of paying (LeJean)", () => {
    // Cardholder name gives the full name; the email alone ("lejeanc59") only
    // gives the first name, which is not enough to link without a founder.
    const emailOnly = { id: "p", email: "lejeanc59@gmail.com", name: null, paidAt: at("2026-10-06T17:20:58Z") };
    const [firstOnly] = matchDuplicates(
      [{ id: "d", email: "x@privaterelay.appleid.com", name: "LeJean Carter", createdAt: at("2026-10-06T17:22:13Z") }],
      [emailOnly]
    );
    expect(firstOnly.confidence).toBe("strong");
    expect(isVeryStrong(firstOnly)).toBe(false);
    const paid = { ...emailOnly, cardName: "LeJean Carter" };
    const dupe = (iso: string, name: string | null) => ({ id: "d", email: "x@privaterelay.appleid.com", name, createdAt: at(iso) });
    const [lejean] = matchDuplicates([dupe("2026-10-06T17:22:13Z", "LeJean Carter")], [paid]);
    expect(lejean.confidence).toBe("strong");
    expect(isVeryStrong(lejean)).toBe(true);
    const [late] = matchDuplicates([dupe("2026-10-07T09:00:00Z", "LeJean Carter")], [paid]);
    expect(late.confidence).toBe("strong");
    expect(isVeryStrong(late)).toBe(false);
    const [noName] = matchDuplicates([dupe("2026-10-06T17:22:13Z", null)], [paid]);
    expect(noName.confidence).toBe("possible");
    expect(isVeryStrong(noName)).toBe(false);
  });

  it("cardholder name that differs from the Apple name = different person (Hester vs Blankenbaker, 2026-10-01)", () => {
    const dupe = { id: "d9", email: "z@privaterelay.appleid.com", name: "Michael Hester", createdAt: at("2026-10-01T01:38:10Z") };
    const paid = { id: "p9", email: "bbfamspam@gmail.com", name: null, cardName: "Lindsey Blankenbaker", paidAt: at("2026-10-01T01:15:27Z") };
    expect(namesConflict(dupe.name, paid)).toBe(true);
    expect(matchDuplicates([dupe], [paid])).toHaveLength(0);
  });

  it("a shared surname alone never auto-links (spouse case)", () => {
    const dupe = { id: "d10", email: "s@privaterelay.appleid.com", name: "Michael Blankenbaker", createdAt: at("2026-10-01T01:38:10Z") };
    const paid = { id: "p10", email: "bbfamspam@gmail.com", name: null, cardName: "Lindsey Blankenbaker", paidAt: at("2026-10-01T01:15:27Z") };
    const [m] = matchDuplicates([dupe], [paid]);
    expect(m.confidence).toBe("strong");
    expect(fullNameMatches(dupe.name, paid)).toBe(false);
    expect(isVeryStrong(m)).toBe(false);
  });

  it("first name alone never auto-links (Kevin, 2026-10-07)", () => {
    const dupe = { id: "d11", email: "k@privaterelay.appleid.com", name: "KEVIN MCNAMARA", createdAt: at("2026-10-07T23:04:00Z") };
    const nameOnly = { id: "p11", email: "kdmc42@gmail.com", name: "Kevin", paidAt: at("2026-10-07T22:50:00Z") };
    const [m] = matchDuplicates([dupe], [nameOnly]);
    expect(m.confidence).toBe("strong");
    expect(isVeryStrong(m)).toBe(false);
    const [full] = matchDuplicates([dupe], [{ ...nameOnly, cardName: "Kevin McNamara" }]);
    expect(isVeryStrong(full)).toBe(true);
  });

  it("alert says trial, not paid, when nothing has been charged", () => {
    expect(purchaseLabel("trialing").subjectNoun).toBe("web trial");
    expect(purchaseLabel("active").verb).toBe("paid");
    expect(purchaseLabel(null).subjectNoun).toBe("web subscriber");
  });
});
