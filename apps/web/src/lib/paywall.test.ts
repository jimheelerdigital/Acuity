import { afterEach, describe, expect, it, vi } from "vitest";

import { requireEntitlement } from "./paywall";

const findUniqueMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
  },
}));

// @/lib/safe-log imports `server-only`; the vitest alias handles that,
// but we silence its actual console calls so test output stays clean.
vi.mock("@/lib/safe-log", () => ({
  safeLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

afterEach(() => {
  findUniqueMock.mockReset();
});

const day = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

describe("requireEntitlement — PRO", () => {
  it("allows canRecord", async () => {
    findUniqueMock.mockResolvedValue({
      subscriptionStatus: "PRO",
      trialEndsAt: null,
    });
    const gate = await requireEntitlement("canRecord", "u1");
    expect(gate.ok).toBe(true);
  });
});

describe("requireEntitlement — active TRIAL", () => {
  it("allows canRecord when trialEndsAt is in the future", async () => {
    findUniqueMock.mockResolvedValue({
      subscriptionStatus: "TRIAL",
      trialEndsAt: day(7),
    });
    const gate = await requireEntitlement("canRecord", "u1");
    expect(gate.ok).toBe(true);
  });

  it("allows canGenerateNewWeeklyReport", async () => {
    findUniqueMock.mockResolvedValue({
      subscriptionStatus: "TRIAL",
      trialEndsAt: day(7),
    });
    const gate = await requireEntitlement(
      "canGenerateNewWeeklyReport",
      "u1"
    );
    expect(gate.ok).toBe(true);
  });
});

describe("requireEntitlement — expired TRIAL (v1.1: FREE journaling loop)", () => {
  it("ALLOWS canRecord — recording is the FREE primary action", async () => {
    findUniqueMock.mockResolvedValue({
      subscriptionStatus: "TRIAL",
      trialEndsAt: day(-1),
    });
    const gate = await requireEntitlement("canRecord", "u1");
    expect(gate.ok).toBe(true);
  });

  it("blocks canExtractEntries with 402 + SUBSCRIPTION_REQUIRED", async () => {
    findUniqueMock.mockResolvedValue({
      subscriptionStatus: "TRIAL",
      trialEndsAt: day(-1),
    });
    const gate = await requireEntitlement("canExtractEntries", "u1");
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(402);
    const body = (await gate.response.json()) as {
      error: string;
      redirect: string;
    };
    expect(body.error).toBe("SUBSCRIPTION_REQUIRED");
    expect(body.redirect).toContain("/upgrade");
  });
});

describe("requireEntitlement — FREE (v1.1: FREE journaling loop)", () => {
  it("ALLOWS canRecord", async () => {
    findUniqueMock.mockResolvedValue({
      subscriptionStatus: "FREE",
      trialEndsAt: null,
    });
    const gate = await requireEntitlement("canRecord", "u1");
    expect(gate.ok).toBe(true);
  });

  it("blocks canExtractEntries with 402", async () => {
    findUniqueMock.mockResolvedValue({
      subscriptionStatus: "FREE",
      trialEndsAt: null,
    });
    const gate = await requireEntitlement("canExtractEntries", "u1");
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(402);
  });

  it("blocks canRefreshLifeMap", async () => {
    findUniqueMock.mockResolvedValue({
      subscriptionStatus: "FREE",
      trialEndsAt: null,
    });
    const gate = await requireEntitlement("canRefreshLifeMap", "u1");
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(402);
  });
});

describe("requireEntitlement — canExtractEntries (PRO + TRIAL allow)", () => {
  it("PRO allows canExtractEntries", async () => {
    findUniqueMock.mockResolvedValue({
      subscriptionStatus: "PRO",
      trialEndsAt: null,
    });
    const gate = await requireEntitlement("canExtractEntries", "u1");
    expect(gate.ok).toBe(true);
  });

  it("active TRIAL allows canExtractEntries", async () => {
    findUniqueMock.mockResolvedValue({
      subscriptionStatus: "TRIAL",
      trialEndsAt: day(7),
    });
    const gate = await requireEntitlement("canExtractEntries", "u1");
    expect(gate.ok).toBe(true);
  });

  // 2026-06-13 (eb97f33f) reversed the 21-day PAST_DUE grace: a failed
  // payment drops to FREE-tier access IMMEDIATELY, across Stripe, Apple and
  // Google. The *FirstFailureAt timestamps became audit-only — they drive
  // the recovery banner's 30-day window and no longer gate access.
  //
  // That commit updated entitlements.test.ts but not this file, so these two
  // cases asserted the superseded policy and had been failing ever since.
  // The code was right the whole time.
  it("PAST_DUE denies canExtractEntries (no grace)", async () => {
    findUniqueMock.mockResolvedValue({
      subscriptionStatus: "PAST_DUE",
      trialEndsAt: null,
    });
    const gate = await requireEntitlement("canExtractEntries", "u1");
    expect(gate.ok).toBe(false);
  });

  it("PAST_DUE still allows canRecord — recording is the FREE loop", async () => {
    // The half of the rule worth pinning: losing extraction is not losing
    // the app. Someone whose card failed keeps recording and keeps their
    // history; a regression that took THAT away would be the serious one.
    findUniqueMock.mockResolvedValue({
      subscriptionStatus: "PAST_DUE",
      trialEndsAt: null,
    });
    const gate = await requireEntitlement("canRecord", "u1");
    expect(gate.ok).toBe(true);
  });
});

describe("requireEntitlement — canSyncCalendar (PRO + TRIAL allow, v1.1 slice C1)", () => {
  it("PRO allows canSyncCalendar", async () => {
    findUniqueMock.mockResolvedValue({
      subscriptionStatus: "PRO",
      trialEndsAt: null,
    });
    const gate = await requireEntitlement("canSyncCalendar", "u1");
    expect(gate.ok).toBe(true);
  });

  it("active TRIAL allows canSyncCalendar", async () => {
    findUniqueMock.mockResolvedValue({
      subscriptionStatus: "TRIAL",
      trialEndsAt: day(7),
    });
    const gate = await requireEntitlement("canSyncCalendar", "u1");
    expect(gate.ok).toBe(true);
  });

  // Same no-grace rule as canExtractEntries above.
  it("PAST_DUE denies canSyncCalendar (no grace)", async () => {
    findUniqueMock.mockResolvedValue({
      subscriptionStatus: "PAST_DUE",
      trialEndsAt: null,
    });
    const gate = await requireEntitlement("canSyncCalendar", "u1");
    expect(gate.ok).toBe(false);
  });

  it("FREE blocks canSyncCalendar with 402", async () => {
    findUniqueMock.mockResolvedValue({
      subscriptionStatus: "FREE",
      trialEndsAt: null,
    });
    const gate = await requireEntitlement("canSyncCalendar", "u1");
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(402);
    const body = (await gate.response.json()) as {
      error: string;
      redirect: string;
    };
    expect(body.error).toBe("SUBSCRIPTION_REQUIRED");
    expect(body.redirect).toContain("/upgrade");
  });

  it("expired TRIAL blocks canSyncCalendar with 402", async () => {
    findUniqueMock.mockResolvedValue({
      subscriptionStatus: "TRIAL",
      trialEndsAt: day(-1),
    });
    const gate = await requireEntitlement("canSyncCalendar", "u1");
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(402);
  });
});

describe("requireEntitlement — PAST_DUE", () => {
  it("allows canRecord during Stripe grace window", async () => {
    findUniqueMock.mockResolvedValue({
      subscriptionStatus: "PAST_DUE",
      trialEndsAt: null,
    });
    const gate = await requireEntitlement("canRecord", "u1");
    expect(gate.ok).toBe(true);
  });
});

describe("requireEntitlement — stale session (user row missing)", () => {
  it("soft-locks with 402 + redirect to /auth/signin", async () => {
    findUniqueMock.mockResolvedValue(null);
    const gate = await requireEntitlement("canRecord", "u1");
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(402);
    const body = (await gate.response.json()) as { redirect: string };
    expect(body.redirect).toContain("/auth/signin");
  });
});
