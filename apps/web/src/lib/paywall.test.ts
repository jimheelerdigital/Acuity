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

describe("requireEntitlement — expired TRIAL", () => {
  it("blocks canRecord with 402 + SUBSCRIPTION_REQUIRED", async () => {
    findUniqueMock.mockResolvedValue({
      subscriptionStatus: "TRIAL",
      trialEndsAt: day(-1),
    });
    const gate = await requireEntitlement("canRecord", "u1");
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

describe("requireEntitlement — FREE", () => {
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
