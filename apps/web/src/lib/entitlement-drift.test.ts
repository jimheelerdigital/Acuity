import { describe, expect, it } from "vitest";

import { classifyDrift } from "./entitlement-drift";

describe("classifyDrift", () => {
  it("SEV1 access_denied_but_paid: provider ACTIVE but DB not PRO (the emily class)", () => {
    expect(
      classifyDrift({ source: "apple", dbStatus: "FREE", providerActive: true })
    ).toEqual({ kind: "access_denied_but_paid", severity: "SEV1", expected: "PRO" });
    // PAST_DUE while provider active is also access-denied-but-paid
    expect(
      classifyDrift({ source: "stripe", dbStatus: "PAST_DUE", providerActive: true })
    ).toMatchObject({ kind: "access_denied_but_paid", severity: "SEV1" });
  });

  it("SEV2 revenue_leak: DB PRO but provider INACTIVE", () => {
    expect(
      classifyDrift({ source: "stripe", dbStatus: "PRO", providerActive: false })
    ).toEqual({ kind: "revenue_leak", severity: "SEV2", expected: "FREE" });
  });

  it("SEV3 stale_past_due: DB PAST_DUE + provider inactive → should be FREE (the connolly/kayleigh class)", () => {
    expect(
      classifyDrift({ source: "stripe", dbStatus: "PAST_DUE", providerActive: false })
    ).toEqual({ kind: "stale_past_due", severity: "SEV3", expected: "FREE" });
  });

  it("no drift when DB and provider agree", () => {
    expect(
      classifyDrift({ source: "apple", dbStatus: "PRO", providerActive: true })
    ).toBeNull();
    expect(
      classifyDrift({ source: "stripe", dbStatus: "FREE", providerActive: false })
    ).toBeNull();
  });
});
