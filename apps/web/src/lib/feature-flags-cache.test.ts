import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The flag cache must not outlive FLAG_CACHE_TTL_MS on a warm instance
 * (2026-10-25: a per-user override written to the DB kept returning 404).
 */

const db = {
  flag: { enabled: false, requiredTier: null as string | null, rolloutPercentage: 100 },
  overrides: [] as { flagKey: string; enabled: boolean }[],
  flagReads: 0,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    featureFlag: {
      findUnique: async () => {
        db.flagReads++;
        return { ...db.flag };
      },
    },
    userFeatureOverride: { findMany: async () => db.overrides.map((o) => ({ ...o })) },
  },
}));
vi.mock("@/lib/entitlements/resolve", () => ({ resolveEntitlement: async () => null }));

import { FLAG_CACHE_TTL_MS, isEnabled, resetFeatureFlagCache } from "@/lib/feature-flags";

describe("feature flag cache TTL", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T20:00:00Z"));
    resetFeatureFlagCache();
    db.flag = { enabled: false, requiredTier: null, rolloutPercentage: 100 };
    db.overrides = [];
    db.flagReads = 0;
  });
  afterEach(() => vi.useRealTimers());

  it("dedups reads within the TTL", async () => {
    await isEnabled("u1", "calendar_integrations");
    await isEnabled("u1", "calendar_integrations");
    expect(db.flagReads).toBe(1);
  });

  it("sees a new per-user override once the TTL has passed", async () => {
    expect(await isEnabled("u1", "calendar_integrations")).toBe(false);
    db.overrides = [{ flagKey: "calendar_integrations", enabled: true }];
    expect(await isEnabled("u1", "calendar_integrations")).toBe(false); // still cached
    vi.advanceTimersByTime(FLAG_CACHE_TTL_MS + 1);
    expect(await isEnabled("u1", "calendar_integrations")).toBe(true);
  });

  it("sees a flag turned on globally once the TTL has passed", async () => {
    expect(await isEnabled("u2", "calendar_integrations")).toBe(false);
    db.flag.enabled = true;
    vi.advanceTimersByTime(FLAG_CACHE_TTL_MS + 1);
    expect(await isEnabled("u2", "calendar_integrations")).toBe(true);
  });
});
