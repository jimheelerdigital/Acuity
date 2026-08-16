import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { entitlementsFor } from "@/lib/entitlements";

const findUniqueMock = vi.fn();
const rcLoadMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
  },
}));

vi.mock("@/lib/safe-log", () => ({
  safeLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/revenuecat/client", () => ({
  fetchRcEntitlementState: (...args: unknown[]) => rcLoadMock(...args),
}));

/**
 * The three RC flags are read through lib/revenuecat/flags at call time, so
 * a test can flip them by mutating process.env. Mirrors how the flag will
 * actually be flipped in production (env change, no code change).
 */
function setFlag(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  setFlag("RC_SOURCE_OF_TRUTH", undefined);
});

afterEach(() => {
  findUniqueMock.mockReset();
  rcLoadMock.mockReset();
  setFlag("RC_SOURCE_OF_TRUTH", undefined);
});

const day = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

const dbRow = (over: Record<string, unknown> = {}) => ({
  subscriptionStatus: "PRO",
  trialEndsAt: null,
  stripeFirstFailureAt: null,
  subscriptionSource: "stripe",
  ...over,
});

async function subject() {
  return import("./resolve");
}

// ─── Default posture: DB source, behavior identical to before ─────────

describe("resolveEntitlement — default source", () => {
  it("uses the DB when RC_SOURCE_OF_TRUTH is off", async () => {
    const { resolveEntitlement, activeSourceName } = await subject();
    expect(activeSourceName()).toBe("db");

    findUniqueMock.mockResolvedValue(dbRow());
    const res = await resolveEntitlement("u1");

    expect(res).not.toBeNull();
    expect(res!.source).toBe("db");
    expect(res!.fellBack).toBe(false);
    expect(res!.entitlement.isActive).toBe(true);
    expect(rcLoadMock).not.toHaveBeenCalled();
  });

  it("returns null for a falsy userId without querying", async () => {
    const { resolveEntitlement } = await subject();
    expect(await resolveEntitlement(null)).toBeNull();
    expect(await resolveEntitlement(undefined)).toBeNull();
    expect(await resolveEntitlement("")).toBeNull();
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("returns null when the user row is missing", async () => {
    const { resolveEntitlement } = await subject();
    findUniqueMock.mockResolvedValue(null);
    expect(await resolveEntitlement("ghost")).toBeNull();
  });

  it("selects exactly the four columns the decision needs", async () => {
    const { resolveEntitlement, ENTITLEMENT_SELECT } = await subject();
    findUniqueMock.mockResolvedValue(dbRow());
    await resolveEntitlement("u1");

    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: ENTITLEMENT_SELECT,
    });
  });
});

/**
 * The load-bearing regression guard for this refactor: the resolver must
 * agree with a direct `entitlementsFor` call on EVERY state, or the
 * "behavior is identical" claim is false.
 */
describe("resolveEntitlement — parity with entitlementsFor (no behavior change)", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  const cases = [
    { name: "PRO", row: dbRow({ subscriptionStatus: "PRO" }) },
    { name: "PAST_DUE (no grace)", row: dbRow({ subscriptionStatus: "PAST_DUE" }) },
    { name: "FREE", row: dbRow({ subscriptionStatus: "FREE" }) },
    {
      name: "active TRIAL",
      row: dbRow({ subscriptionStatus: "TRIAL", trialEndsAt: day(5) }),
    },
    {
      name: "expired TRIAL",
      row: dbRow({ subscriptionStatus: "TRIAL", trialEndsAt: day(-1) }),
    },
    {
      name: "TRIAL with null trialEndsAt (brand-new account)",
      row: dbRow({ subscriptionStatus: "TRIAL", trialEndsAt: null }),
    },
    { name: "unknown status (fail closed)", row: dbRow({ subscriptionStatus: "WAT" }) },
    { name: "comp source is still PRO", row: dbRow({ subscriptionStatus: "PRO", subscriptionSource: "comp" }) },
    { name: "apple source is still PRO", row: dbRow({ subscriptionStatus: "PRO", subscriptionSource: "apple" }) },
    { name: "null source", row: dbRow({ subscriptionStatus: "FREE", subscriptionSource: null }) },
  ];

  for (const c of cases) {
    it(`matches entitlementsFor for ${c.name}`, async () => {
      const { resolveEntitlement } = await subject();
      findUniqueMock.mockResolvedValue(c.row);
      const res = await resolveEntitlement("u1", now);
      expect(res!.entitlement).toEqual(
        entitlementsFor(
          {
            subscriptionStatus: c.row.subscriptionStatus as string,
            trialEndsAt: c.row.trialEndsAt as Date | null,
            stripeFirstFailureAt: c.row.stripeFirstFailureAt as Date | null,
          },
          now
        )
      );
    });
  }

  it("entitlement ignores subscriptionSource entirely", async () => {
    const { resolveEntitlement } = await subject();
    const results = [];
    for (const source of ["stripe", "apple", "google_play", "comp", null]) {
      findUniqueMock.mockResolvedValue(
        dbRow({ subscriptionStatus: "PRO", subscriptionSource: source })
      );
      results.push((await resolveEntitlement("u1", now))!.entitlement);
    }
    for (const r of results) expect(r).toEqual(results[0]);
  });
});

// ─── The cutover switch + dual-read fallback ──────────────────────────

describe("resolveEntitlement — RC_SOURCE_OF_TRUTH on", () => {
  it("reads RevenueCat when the flag is on", async () => {
    setFlag("RC_SOURCE_OF_TRUTH", "1");
    const { resolveEntitlement, activeSourceName } = await subject();
    expect(activeSourceName()).toBe("revenuecat");

    rcLoadMock.mockResolvedValue({
      subscriptionStatus: "PRO",
      trialEndsAt: null,
      stripeFirstFailureAt: null,
      subscriptionSource: "apple",
    });

    const res = await resolveEntitlement("u1");
    expect(res!.source).toBe("revenuecat");
    expect(res!.fellBack).toBe(false);
    expect(res!.entitlement.isActive).toBe(true);
    // RC answered — the DB must not have been consulted at all.
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("falls back to the DB when RC returns null (user unknown to RC)", async () => {
    setFlag("RC_SOURCE_OF_TRUTH", "1");
    const { resolveEntitlement } = await subject();

    rcLoadMock.mockResolvedValue(null);
    findUniqueMock.mockResolvedValue(dbRow({ subscriptionStatus: "PRO" }));

    const res = await resolveEntitlement("u1");
    expect(res!.source).toBe("db");
    expect(res!.fellBack).toBe(true);
    expect(res!.entitlement.isActive).toBe(true);
  });

  it("falls back to the DB when the RC read THROWS — an outage never revokes access", async () => {
    setFlag("RC_SOURCE_OF_TRUTH", "1");
    const { resolveEntitlement } = await subject();

    rcLoadMock.mockRejectedValue(new Error("RC 503"));
    findUniqueMock.mockResolvedValue(dbRow({ subscriptionStatus: "PRO" }));

    const res = await resolveEntitlement("u1");
    expect(res!.source).toBe("db");
    expect(res!.fellBack).toBe(true);
    // The critical assertion: a paying user keeps full access.
    expect(res!.entitlement.isActive).toBe(true);
    expect(res!.entitlement.canExtractEntries).toBe(true);
  });

  it("returns null when RC AND the DB both have nothing", async () => {
    setFlag("RC_SOURCE_OF_TRUTH", "1");
    const { resolveEntitlement } = await subject();
    rcLoadMock.mockResolvedValue(null);
    findUniqueMock.mockResolvedValue(null);
    expect(await resolveEntitlement("ghost")).toBeNull();
  });
});

// ─── Flag parsing posture ────────────────────────────────────────────

describe("activeSourceName — flag parsing is fail-closed", () => {
  const offValues = ["0", "false", "", "no", "ture", "TRUE_ISH", " "];
  for (const v of offValues) {
    it(`treats ${JSON.stringify(v)} as OFF`, async () => {
      setFlag("RC_SOURCE_OF_TRUTH", v);
      const { activeSourceName } = await subject();
      expect(activeSourceName()).toBe("db");
    });
  }

  const onValues = ["1", "true", "TRUE", " on ", "yes"];
  for (const v of onValues) {
    it(`treats ${JSON.stringify(v)} as ON`, async () => {
      setFlag("RC_SOURCE_OF_TRUTH", v);
      const { activeSourceName } = await subject();
      expect(activeSourceName()).toBe("revenuecat");
    });
  }
});

describe("resolveEntitlementFromState", () => {
  it("computes without any I/O", async () => {
    const { resolveEntitlementFromState } = await subject();
    // Fixed clock — a relative `day(3)` against an implicit `new Date()` can
    // land in the same millisecond and floor to 3 instead of 2, which makes
    // the assertion flaky rather than wrong.
    const now = new Date("2026-08-15T12:00:00Z");
    const res = resolveEntitlementFromState(
      {
        subscriptionStatus: "TRIAL",
        trialEndsAt: new Date("2026-08-18T06:00:00Z"), // 2.75 days out
        stripeFirstFailureAt: null,
        subscriptionSource: null,
      },
      now
    );
    expect(res.entitlement.isTrialing).toBe(true);
    expect(res.entitlement.trialDaysRemaining).toBe(2);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });
});

// ─── App-managed trial overlay (RevenueCat migration, task 9) ─────────
//
// Ripple's trial needs no payment method, so RC has nothing to observe and
// reports a trialing user as FREE. These tests are the regression guard that
// flipping RC_SOURCE_OF_TRUTH does not revoke access from the 7 users who are
// mid-trial at cutover.

describe("app-managed trial overlay", () => {
  const NOW = new Date("2026-08-15T12:00:00Z");
  const rcFree = {
    subscriptionStatus: "FREE",
    trialEndsAt: null,
    stripeFirstFailureAt: null,
    subscriptionSource: null,
  };

  it("keeps a mid-trial user entitled even though RC says FREE", async () => {
    setFlag("RC_SOURCE_OF_TRUTH", "1");
    const { resolveEntitlement } = await subject();

    rcLoadMock.mockResolvedValue(rcFree);
    findUniqueMock.mockResolvedValue(
      dbRow({
        subscriptionStatus: "TRIAL",
        trialEndsAt: new Date("2026-08-18T12:00:00Z"),
        subscriptionSource: null,
      })
    );

    const res = await resolveEntitlement("u1", NOW);
    // The assertion that matters: a trialing user does NOT lose access.
    expect(res!.entitlement.isTrialing).toBe(true);
    expect(res!.entitlement.canExtractEntries).toBe(true);
    expect(res!.entitlement.trialDaysRemaining).toBe(3);
  });

  it("covers a brand-new account whose trialEndsAt is not set yet", async () => {
    setFlag("RC_SOURCE_OF_TRUTH", "1");
    const { resolveEntitlement } = await subject();
    rcLoadMock.mockResolvedValue(rcFree);
    findUniqueMock.mockResolvedValue(
      dbRow({ subscriptionStatus: "TRIAL", trialEndsAt: null, subscriptionSource: null })
    );
    const res = await resolveEntitlement("u1", NOW);
    expect(res!.entitlement.isTrialing).toBe(true);
  });

  it("does NOT resurrect an EXPIRED trial", async () => {
    setFlag("RC_SOURCE_OF_TRUTH", "1");
    const { resolveEntitlement } = await subject();
    rcLoadMock.mockResolvedValue(rcFree);
    findUniqueMock.mockResolvedValue(
      dbRow({
        subscriptionStatus: "TRIAL",
        trialEndsAt: new Date("2026-08-01T12:00:00Z"),
        subscriptionSource: null,
      })
    );
    const res = await resolveEntitlement("u1", NOW);
    expect(res!.entitlement.isTrialing).toBe(false);
    expect(res!.entitlement.isPostTrialFree).toBe(true);
  });

  it("does NOT overlay for a genuinely FREE (lapsed) user", async () => {
    setFlag("RC_SOURCE_OF_TRUTH", "1");
    const { resolveEntitlement } = await subject();
    rcLoadMock.mockResolvedValue(rcFree);
    findUniqueMock.mockResolvedValue(
      dbRow({ subscriptionStatus: "FREE", trialEndsAt: null })
    );
    const res = await resolveEntitlement("u1", NOW);
    expect(res!.entitlement.isPostTrialFree).toBe(true);
    expect(res!.entitlement.canExtractEntries).toBe(false);
  });

  it("skips the overlay entirely when RC reports a paid entitlement", async () => {
    setFlag("RC_SOURCE_OF_TRUTH", "1");
    const { resolveEntitlement } = await subject();
    rcLoadMock.mockResolvedValue({
      subscriptionStatus: "PRO",
      trialEndsAt: null,
      stripeFirstFailureAt: null,
      subscriptionSource: "apple",
    });
    const res = await resolveEntitlement("u1", NOW);
    expect(res!.entitlement.isActive).toBe(true);
    // No extra DB query on the paid path.
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("lets a store-managed RC trial through as TRIAL without the overlay", async () => {
    setFlag("RC_SOURCE_OF_TRUTH", "1");
    const { resolveEntitlement } = await subject();
    rcLoadMock.mockResolvedValue({
      subscriptionStatus: "TRIAL",
      trialEndsAt: new Date("2026-08-20T12:00:00Z"),
      stripeFirstFailureAt: null,
      subscriptionSource: "apple",
    });
    const res = await resolveEntitlement("u1", NOW);
    expect(res!.entitlement.isTrialing).toBe(true);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });
});

describe("isActiveAppManagedTrial", () => {
  const NOW = new Date("2026-08-15T12:00:00Z");
  const st = (over: Record<string, unknown> = {}) => ({
    subscriptionStatus: "TRIAL",
    trialEndsAt: new Date("2026-08-20T12:00:00Z"),
    stripeFirstFailureAt: null,
    subscriptionSource: null,
    ...over,
  });

  it("is true for a future trialEndsAt and for null", async () => {
    const { isActiveAppManagedTrial } = await subject();
    expect(isActiveAppManagedTrial(st(), NOW)).toBe(true);
    expect(isActiveAppManagedTrial(st({ trialEndsAt: null }), NOW)).toBe(true);
  });

  it("is false for an expired trial, and for any non-TRIAL status", async () => {
    const { isActiveAppManagedTrial } = await subject();
    expect(
      isActiveAppManagedTrial(st({ trialEndsAt: new Date("2026-08-01") }), NOW)
    ).toBe(false);
    for (const s of ["PRO", "FREE", "PAST_DUE"]) {
      expect(isActiveAppManagedTrial(st({ subscriptionStatus: s }), NOW)).toBe(false);
    }
  });

  it("treats trialEndsAt exactly === now as expired (no boundary slop)", async () => {
    const { isActiveAppManagedTrial } = await subject();
    expect(isActiveAppManagedTrial(st({ trialEndsAt: NOW }), NOW)).toBe(false);
  });
});
