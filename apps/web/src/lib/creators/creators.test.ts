import { describe, expect, it } from "vitest";

import { MILESTONE_TIERS } from "./config";
import {
  clawbackFor,
  codeKey,
  customCodeProblem,
  commissionFor,
  generateCreatorCode,
  insideWindow,
  isPayoutFriday,
  milestonesReached,
  netRevenue,
  nextPayoutDate,
  normalizeCode,
  payableAt,
  payoutCutoff,
  windowEndFor,
} from "./money";

describe("commission", () => {
  it("pays 25% of net, rounded to the cent (spec acceptance numbers)", () => {
    expect(commissionFor(999)).toBe(250); // $9.99 monthly → $2.50
    expect(commissionFor(8999)).toBe(2250); // $89.99 annual → $22.50
    expect(commissionFor(0)).toBe(0);
    expect(commissionFor(-500)).toBe(0);
  });
  it("net revenue excludes tax; amount paid is already after discounts", () => {
    expect(netRevenue(1099, 100)).toBe(999);
    expect(netRevenue(999, 0)).toBe(999);
    expect(netRevenue(100, 500)).toBe(0);
  });
  it("worked example: monthly customer for 12 months = $30", () => {
    expect(12 * commissionFor(999)).toBe(3000);
  });
  it("worked example: monthly → annual in month 4 = $30", () => {
    expect(3 * commissionFor(999) + commissionFor(8999)).toBe(3000);
  });
});

describe("window + hold", () => {
  const first = new Date("2026-11-03T10:00:00Z");
  const end = windowEndFor(first);
  it("window ends 12 calendar months after the first paid payment", () => {
    expect(end.toISOString()).toBe("2027-11-03T10:00:00.000Z");
  });
  it("monthly payments inside the window count; the year-two annual renewal does not", () => {
    expect(insideWindow(new Date("2027-10-03T10:00:00Z"), end)).toBe(true);
    expect(insideWindow(end, end)).toBe(true);
    // Annual renewal 12 months + a day later (stores renew a day or more after)
    expect(insideWindow(new Date("2027-11-04T10:00:00Z"), end)).toBe(false);
  });
  it("first payment always counts", () => {
    expect(insideWindow(first, null)).toBe(true);
  });
  it("hold is 14 days", () => {
    expect(payableAt(first).toISOString()).toBe("2026-11-17T10:00:00.000Z");
  });
});

describe("clawbacks", () => {
  it("a full refund reverses the commission, netting the balance to zero", () => {
    const cb = clawbackFor({ commissionCents: 250, paymentAmountCents: 999, refundAmountCents: 999, alreadyClawedCents: 0 });
    expect(cb).toBe(-250);
    expect(250 + cb).toBe(0);
  });
  it("partial refunds claw back the matching share and never more than the commission", () => {
    expect(clawbackFor({ commissionCents: 2250, paymentAmountCents: 8999, refundAmountCents: 4500, alreadyClawedCents: 0 })).toBe(-1125);
    expect(clawbackFor({ commissionCents: 2250, paymentAmountCents: 8999, refundAmountCents: 8999, alreadyClawedCents: -1125 })).toBe(-1125);
    expect(clawbackFor({ commissionCents: 250, paymentAmountCents: 999, refundAmountCents: 999, alreadyClawedCents: -250 })).toBe(0);
  });
});

describe("milestones ($50 / $150 / $300, each tier paid once a month)", () => {
  it("matches Keenan's 2026-10-22 numbers", () => {
    expect(MILESTONE_TIERS.map((t) => [t.customers, t.bonusCents])).toEqual([
      [10, 5000],
      [25, 15000],
      [50, 30000],
    ]);
  });
  it("counts tiers reached", () => {
    expect(milestonesReached(9)).toHaveLength(0);
    expect(milestonesReached(10)).toHaveLength(1);
    expect(milestonesReached(49).reduce((s, t) => s + t.bonusCents, 0)).toBe(20000);
    expect(milestonesReached(50).reduce((s, t) => s + t.bonusCents, 0)).toBe(50000);
  });
});

describe("payout schedule: every other Friday from 2026-11-06", () => {
  it("recognises payout Fridays", () => {
    expect(isPayoutFriday(new Date("2026-11-06T14:00:00Z"))).toBe(true);
    expect(isPayoutFriday(new Date("2026-11-13T14:00:00Z"))).toBe(false);
    expect(isPayoutFriday(new Date("2026-11-20T14:00:00Z"))).toBe(true);
    expect(isPayoutFriday(new Date("2026-10-23T14:00:00Z"))).toBe(false);
  });
  it("finds the next payout date", () => {
    expect(nextPayoutDate(new Date("2026-10-22T12:00:00Z")).toISOString().slice(0, 10)).toBe("2026-11-06");
    expect(nextPayoutDate(new Date("2026-11-07T12:00:00Z")).toISOString().slice(0, 10)).toBe("2026-11-20");
    expect(nextPayoutDate(new Date("2026-11-20T23:00:00Z")).toISOString().slice(0, 10)).toBe("2026-11-20");
  });
  it("a run covers rows payable as of the Thursday before", () => {
    expect(payoutCutoff(new Date("2026-11-06T14:00:00Z")).toISOString()).toBe("2026-11-06T00:00:00.000Z");
  });
});

describe("referral codes", () => {
  it("are 6 characters with no ambiguous letters or digits", () => {
    for (let i = 0; i < 200; i++) {
      const c = generateCreatorCode();
      expect(c).toMatch(/^[A-HJ-KM-NP-Z2-9]{6}$/);
      expect(c).not.toMatch(/[01OIL]/);
    }
  });
  it("normalizes typed codes and rejects bad ones", () => {
    expect(normalizeCode(" ab3-k9m ")).toBe("AB3K9M");
    expect(normalizeCode("tess")).toBe("TESS");
    expect(normalizeCode("TES")).toBeNull(); // too short
    expect(normalizeCode("ABCDEFGHIJKLM")).toBeNull(); // 13 > 12
    expect(normalizeCode("tess!")).toBeNull();
    expect(normalizeCode(null)).toBeNull();
  });
  it("treats look-alikes as the same code (no TESSO + TESS0)", () => {
    expect(codeKey("TESSO")).toBe(codeKey("TESS0"));
    expect(codeKey("LILY1")).toBe(codeKey("1I1Y1"));
    expect(codeKey("TESS")).not.toBe(codeKey("TESA"));
  });
  it("custom codes: letters + digits, 4–12, no brand / discount / rude words", () => {
    expect(customCodeProblem("TESS")).toBeNull();
    expect(customCodeProblem("jane-smith")).toBeNull();
    expect(customCodeProblem("ab")).toMatch(/at least 4/);
    expect(customCodeProblem("1234")).toMatch(/letter/);
    expect(customCodeProblem("RIPPLE1")).toMatch(/isn't available/);
    expect(customCodeProblem("R1PPLE")).toMatch(/isn't available/); // look-alike of RIPPLE
    expect(customCodeProblem("TESS20OFF")).toMatch(/discount/);
    expect(customCodeProblem("FREETESS")).toMatch(/discount/);
  });
});
