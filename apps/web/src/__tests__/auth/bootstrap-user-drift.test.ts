/**
 * Covers the 2026-04-28 regression class: schema-vs-DB column drift
 * during bootstrapNewUser cascading into OAuth callback failure.
 *
 * This test exercises safeUpdateUserBootstrap (the helper introduced
 * in commit 04b729f) against simulated P2022 errors. If a future
 * change removes the helper or breaks its strip-and-retry logic,
 * this test fails and blocks the deploy.
 *
 * Tests are pure — no real DB, no real Prisma. Just a fake update
 * function that throws P2022 once per missing column, and we verify
 * the helper recovers.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// We import the helper indirectly by mocking @/lib/prisma at the
// module level; bootstrap-user reads `prisma` via `await import(...)`
// each call, so vi.mock intercepts cleanly.

const updateMock = vi.fn();
const prismaMock = {
  user: {
    update: updateMock,
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(0),
  },
  deletedUser: { findFirst: vi.fn().mockResolvedValue(null) },
  lifeMapArea: {
    upsert: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(null),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    findMany: vi.fn().mockResolvedValue([]),
  },
  userMemory: {
    upsert: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(null),
  },
  userOnboarding: {
    upsert: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(null),
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// posthog tracking is fire-and-forget; stub it.
vi.mock("@/lib/posthog", () => ({ track: vi.fn().mockResolvedValue(undefined) }));

// referrals helpers don't matter for the drift test path.
vi.mock("@/lib/referrals", () => ({
  generateReferralCode: () => "TEST-CODE",
  resolveReferrerByCode: vi.fn().mockResolvedValue(null),
}));

describe("bootstrapNewUser — schema drift resilience", () => {
  beforeEach(() => {
    updateMock.mockReset();
  });

  it("succeeds when every column exists", async () => {
    updateMock.mockResolvedValue({ id: "u1" });

    const { bootstrapNewUser } = await import("@/lib/bootstrap-user");
    await expect(
      bootstrapNewUser({
        userId: "u1",
        email: "ok@example.com",
        attribution: { utmSource: "google", utmMedium: "cpc" },
      })
    ).resolves.toBeUndefined();

    // First call should include both attribution columns.
    const firstCallArgs = updateMock.mock.calls[0][0];
    expect(firstCallArgs.data).toMatchObject({
      signupUtmSource: "google",
      signupUtmMedium: "cpc",
    });
  });

  it("strips a missing column and retries on P2022", async () => {
    // First attempt: schema has signupUtmSource but DB doesn't.
    // Second attempt: succeeds.
    updateMock
      .mockImplementationOnce(() => {
        const err = new Error(
          "Invalid `prisma.user.update()` invocation: " +
            "The column `User.signupUtmSource` does not exist in the current database."
        );
        (err as { code?: string }).code = "P2022";
        return Promise.reject(err);
      })
      .mockResolvedValueOnce({ id: "u2" });

    const { bootstrapNewUser } = await import("@/lib/bootstrap-user");
    await expect(
      bootstrapNewUser({
        userId: "u2",
        email: "drift@example.com",
        attribution: { utmSource: "google", utmMedium: "cpc" },
      })
    ).resolves.toBeUndefined();

    expect(updateMock).toHaveBeenCalledTimes(2);
    const retryArgs = updateMock.mock.calls[1][0];
    // signupUtmSource was dropped; the rest of the payload survives.
    expect(retryArgs.data.signupUtmSource).toBeUndefined();
    expect(retryArgs.data.signupUtmMedium).toBe("cpc");
    expect(retryArgs.data.subscriptionStatus).toBe("TRIAL");
    expect(retryArgs.data.referralCode).toBe("TEST-CODE");
  });

  it("strips multiple missing columns across multiple retries", async () => {
    updateMock
      .mockImplementationOnce(() => {
        const err = new Error(
          "The column `User.signupUtmSource` does not exist in the current database."
        );
        (err as { code?: string }).code = "P2022";
        return Promise.reject(err);
      })
      .mockImplementationOnce(() => {
        const err = new Error(
          "The column `User.signupUtmMedium` does not exist in the current database."
        );
        (err as { code?: string }).code = "P2022";
        return Promise.reject(err);
      })
      .mockResolvedValueOnce({ id: "u3" });

    const { bootstrapNewUser } = await import("@/lib/bootstrap-user");
    await expect(
      bootstrapNewUser({
        userId: "u3",
        email: "double-drift@example.com",
        attribution: {
          utmSource: "google",
          utmMedium: "cpc",
          utmCampaign: "spring",
        },
      })
    ).resolves.toBeUndefined();

    expect(updateMock).toHaveBeenCalledTimes(3);
    const finalArgs = updateMock.mock.calls[2][0];
    expect(finalArgs.data.signupUtmSource).toBeUndefined();
    expect(finalArgs.data.signupUtmMedium).toBeUndefined();
    expect(finalArgs.data.signupUtmCampaign).toBe("spring");
  });

  it("propagates errors that aren't P2022", async () => {
    updateMock.mockImplementationOnce(() => {
      const err = new Error("connection refused");
      (err as { code?: string }).code = "P1001";
      return Promise.reject(err);
    });

    const { bootstrapNewUser } = await import("@/lib/bootstrap-user");
    await expect(
      bootstrapNewUser({
        userId: "u4",
        email: "network-fail@example.com",
      })
    ).rejects.toThrow(/connection refused/);

    // Helper attempted exactly once before propagating — no retry on
    // non-drift errors.
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});
