import { describe, expect, it, vi } from "vitest";

import { backfillInstallEvents, readInstallId } from "./mobile-session";

const INSTALL = "0f1e2d3c-4b5a-4968-8776-655443322110";

function db(productAnalyticsEnabled: boolean | null = true) {
  return {
    user: { findUnique: vi.fn().mockResolvedValue({ productAnalyticsEnabled }) },
    onboardingEvent: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
  };
}

describe("backfillInstallEvents", () => {
  it("attaches only this install's anonymous v10_/app_ rows to the user", async () => {
    const d = db();
    const n = await backfillInstallEvents(d, "user_1", INSTALL);
    expect(n).toBe(6);
    const wheres = d.onboardingEvent.updateMany.mock.calls.map((c) => c[0]);
    expect(wheres.map((w) => w.where.event.startsWith).sort()).toEqual(["app_", "v10_"]);
    for (const w of wheres) {
      expect(w.where.sessionToken).toBe(INSTALL);
      expect(w.where.userId).toBeNull(); // never re-assigns someone else's rows
      expect(w.data).toEqual({ userId: "user_1" });
    }
  });

  it("does nothing for a user who opted out of product analytics", async () => {
    const d = db(false);
    expect(await backfillInstallEvents(d, "user_1", INSTALL)).toBe(0);
    expect(d.onboardingEvent.updateMany).not.toHaveBeenCalled();
  });
});

describe("readInstallId", () => {
  it("is null outside a request (never throws)", () => {
    expect(readInstallId()).toBeNull();
  });
});
