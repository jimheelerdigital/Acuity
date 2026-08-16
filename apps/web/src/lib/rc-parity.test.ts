import { describe, expect, it, vi } from "vitest";

import {
  rcParityReadyForCutover,
  type RcParityFinding,
  type RcParityResult,
} from "./entitlement-drift";

vi.mock("@/lib/safe-log", () => ({
  safeLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/**
 * The cutover gate. These tests encode the rule so the go/no-go decision is
 * a stated policy rather than a judgment call made at 11pm on cutover night.
 */

const finding = (over: Partial<RcParityFinding> = {}): RcParityFinding => ({
  userId: "u1",
  email: "a@example.com",
  dbStatus: "PRO",
  dbSource: "apple",
  rcStatus: "FREE",
  rcSource: null,
  rcHasPro: false,
  agrees: false,
  kind: "rc_missing_entitlement",
  severity: "SEV1",
  ...over,
});

const result = (over: Partial<RcParityResult> = {}): RcParityResult => ({
  total: 19,
  checked: 19,
  unreadable: 0,
  agreeing: 19,
  findings: [],
  unreadableDetails: [],
  inert: false,
  ...over,
});

describe("rcParityReadyForCutover", () => {
  it("is READY on a clean scan", () => {
    const gate = rcParityReadyForCutover(result());
    expect(gate.ready).toBe(true);
    expect(gate.reasons).toEqual([]);
  });

  it("BLOCKS while RC credentials are absent (today's state)", () => {
    const gate = rcParityReadyForCutover(result({ inert: true }));
    expect(gate.ready).toBe(false);
    expect(gate.reasons.join(" ")).toContain("credentials absent");
  });

  it("BLOCKS when any user would lose access — the SEV1 rule", () => {
    const gate = rcParityReadyForCutover(
      result({ findings: [finding({ severity: "SEV1" })], agreeing: 18 })
    );
    expect(gate.ready).toBe(false);
    expect(gate.reasons.join(" ")).toContain("LOSE access");
  });

  it("BLOCKS on unreadable rows — unverified is not the same as passing", () => {
    const gate = rcParityReadyForCutover(result({ unreadable: 2, checked: 17 }));
    expect(gate.ready).toBe(false);
    expect(gate.reasons.join(" ")).toContain("unreadable");
  });

  it("BLOCKS when nothing was checked, even with no findings", () => {
    const gate = rcParityReadyForCutover(result({ checked: 0, total: 0, agreeing: 0 }));
    expect(gate.ready).toBe(false);
    expect(gate.reasons.join(" ")).toContain("no users");
  });

  it("allows a SEV2 extra-entitlement — RC granting more than the DB never locks anyone out", () => {
    const gate = rcParityReadyForCutover(
      result({
        findings: [
          finding({
            severity: "SEV2",
            kind: "rc_extra_entitlement",
            dbStatus: "FREE",
            rcStatus: "PRO",
            rcHasPro: true,
          }),
        ],
      })
    );
    expect(gate.ready).toBe(true);
  });

  it("allows a SEV3 status mismatch (TRIAL vs PRO) without blocking", () => {
    const gate = rcParityReadyForCutover(
      result({
        findings: [
          finding({
            severity: "SEV3",
            kind: "status_mismatch",
            dbStatus: "TRIAL",
            rcStatus: "PRO",
            rcHasPro: true,
            agrees: true,
          }),
        ],
      })
    );
    expect(gate.ready).toBe(true);
  });

  it("reports EVERY blocking reason at once, not just the first", () => {
    const gate = rcParityReadyForCutover(
      result({
        inert: true,
        checked: 0,
        unreadable: 19,
        findings: [finding({ severity: "SEV1" })],
      })
    );
    expect(gate.ready).toBe(false);
    expect(gate.reasons).toHaveLength(4);
  });
});
