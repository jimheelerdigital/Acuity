import { describe, expect, it } from "vitest";

import { lockedFeatureCopy, userProgression } from "@acuity/shared";

import {
  AUDIT_MIN_ENTRIES,
  auditWindowEnd,
  decideLifeAudit,
} from "./life-audit-eligibility";

const DAY = 24 * 60 * 60 * 1000;
const signup = new Date("2026-10-01T12:00:00Z");
const at = (days: number) => new Date(signup.getTime() + days * DAY);

function decide(over: Partial<Parameters<typeof decideLifeAudit>[0]> = {}) {
  return decideLifeAudit({
    now: at(7),
    createdAt: signup,
    trialEndsAt: at(7.5),
    entitled: true,
    completedEntriesInWindow: 7,
    existingStatuses: [],
    ...over,
  });
}

describe("decideLifeAudit (wait for data)", () => {
  it("dispatches at trial end with 7+ entries; period runs signup → now", () => {
    const d = decide();
    expect(d).toEqual({ action: "dispatch", periodStart: signup, periodEnd: at(7) });
  });

  it("defers with fewer than 7 entries instead of shipping a thin audit", () => {
    expect(decide({ completedEntriesInWindow: 3 })).toEqual({
      action: "defer",
      reason: "not_enough_entries",
      have: 3,
      need: AUDIT_MIN_ENTRIES,
    });
  });

  it("dispatches later, as soon as the 7th entry lands (e.g. day 19)", () => {
    expect(decide({ now: at(19), completedEntriesInWindow: 7 }).action).toBe("dispatch");
  });

  it("caps the period at signup + 30 days", () => {
    const d = decide({ now: at(30.5), completedEntriesInWindow: 8 });
    expect(d).toEqual({
      action: "dispatch",
      periodStart: signup,
      periodEnd: auditWindowEnd(signup),
    });
  });

  it("never generates after the window, whatever the count", () => {
    expect(decide({ now: at(32), completedEntriesInWindow: 3 })).toEqual({
      action: "skip",
      reason: "window_closed",
    });
  });

  it("waits until the trial is ending", () => {
    expect(decide({ now: at(3), trialEndsAt: at(7.5) })).toEqual({
      action: "skip",
      reason: "trial_not_ending_yet",
    });
  });

  it.each(["QUEUED", "GENERATING", "COMPLETE"])(
    "never sends a second audit (existing %s, including old degraded ones)",
    (status) => {
      expect(decide({ existingStatuses: [status] })).toEqual({
        action: "skip",
        reason: "already_has_audit",
      });
    }
  );

  it("retries one FAILED run, then gives up", () => {
    expect(decide({ existingStatuses: ["FAILED"] }).action).toBe("dispatch");
    expect(decide({ existingStatuses: ["FAILED", "FAILED"] })).toEqual({
      action: "skip",
      reason: "gave_up_after_failures",
    });
  });

  it("skips users without a real trial, and users who can't generate one now", () => {
    expect(decide({ trialEndsAt: null }).action).toBe("skip");
    expect(decide({ trialEndsAt: signup }).action).toBe("skip");
    expect(decide({ entitled: false })).toEqual({ action: "skip", reason: "not_entitled" });
  });
});

describe("progression: the Life Audit only 'unlocks' when it can really exist", () => {
  const prog = (entryDays: number[], nowDay: number) =>
    userProgression({
      user: { id: "u1", createdAt: signup },
      entries: entryDays.map((d, i) => ({ id: `e${i}`, createdAt: at(d), dimensionId: null })),
      themes: [],
      goals: [],
      now: at(nowDay),
    } as never);

  it("stays locked on day 8 with 2 entries, with honest copy", () => {
    const p = prog([1, 2], 8);
    expect(p.unlocked.lifeAudit).toBe(false);
    expect(lockedFeatureCopy("lifeAudit", p).headline).toBe(
      "Your Life Audit unlocks after 7 debriefs."
    );
  });

  it("unlocks on day 8 with 7 entries", () => {
    expect(prog([0, 1, 2, 3, 4, 5, 6], 8).unlocked.lifeAudit).toBe(true);
  });

  it("does not unlock when the 7th entry came after day 30", () => {
    expect(prog([1, 2, 3, 4, 5, 6, 40], 41).unlocked.lifeAudit).toBe(false);
  });
});
