import { describe, expect, it } from "vitest";

import { deriveSubscriptionUpdate } from "./subscription-status";

const PERIOD_END_UNIX = 1_780_000_000; // arbitrary fixed Unix seconds

describe("deriveSubscriptionUpdate", () => {
  it("active, not canceling → PRO with cancelAtPeriodEnd false", () => {
    const d = deriveSubscriptionUpdate({
      status: "active",
      cancel_at_period_end: false,
      current_period_end: PERIOD_END_UNIX,
    });
    expect(d.nextStatus).toBe("PRO");
    expect(d.cancelAtPeriodEnd).toBe(false);
    expect(d.currentPeriodEnd).toEqual(new Date(PERIOD_END_UNIX * 1000));
  });

  it("active, scheduled to cancel → PRO with cancelAtPeriodEnd true (Sian's case)", () => {
    const d = deriveSubscriptionUpdate({
      status: "active",
      cancel_at_period_end: true,
      current_period_end: PERIOD_END_UNIX,
    });
    expect(d.nextStatus).toBe("PRO");
    expect(d.cancelAtPeriodEnd).toBe(true);
    expect(d.currentPeriodEnd).toEqual(new Date(PERIOD_END_UNIX * 1000));
  });

  it("trialing → PRO (preserves existing mapping)", () => {
    const d = deriveSubscriptionUpdate({
      status: "trialing",
      cancel_at_period_end: false,
      current_period_end: PERIOD_END_UNIX,
    });
    expect(d.nextStatus).toBe("PRO");
    expect(d.cancelAtPeriodEnd).toBe(false);
  });

  it("trialing + cancel scheduled → PRO, cancelAtPeriodEnd true", () => {
    const d = deriveSubscriptionUpdate({
      status: "trialing",
      cancel_at_period_end: true,
      current_period_end: PERIOD_END_UNIX,
    });
    expect(d.nextStatus).toBe("PRO");
    expect(d.cancelAtPeriodEnd).toBe(true);
  });

  it.each(["past_due", "unpaid", "canceled", "incomplete_expired"])(
    "%s → FREE (no-grace mapping preserved)",
    (status) => {
      const d = deriveSubscriptionUpdate({
        status,
        cancel_at_period_end: false,
        current_period_end: PERIOD_END_UNIX,
      });
      expect(d.nextStatus).toBe("FREE");
    }
  );

  it("a FREE-mapped status never reports cancelAtPeriodEnd, even if Stripe sends true", () => {
    // A canceled/terminal sub is no longer 'scheduled to cancel' — guard
    // against a stale true flag lingering on a downgraded row.
    const d = deriveSubscriptionUpdate({
      status: "canceled",
      cancel_at_period_end: true,
      current_period_end: PERIOD_END_UNIX,
    });
    expect(d.nextStatus).toBe("FREE");
    expect(d.cancelAtPeriodEnd).toBe(false);
  });

  it.each(["incomplete", "paused", "", "future_unknown_status"])(
    "unmapped status %s → null (webhook logs + no-ops)",
    (status) => {
      const d = deriveSubscriptionUpdate({
        status,
        cancel_at_period_end: false,
        current_period_end: PERIOD_END_UNIX,
      });
      expect(d.nextStatus).toBeNull();
    }
  );

  it("null current_period_end → currentPeriodEnd null (Stripe omitted it)", () => {
    const d = deriveSubscriptionUpdate({
      status: "active",
      cancel_at_period_end: false,
      current_period_end: null,
    });
    expect(d.currentPeriodEnd).toBeNull();
  });
});
