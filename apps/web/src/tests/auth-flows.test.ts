import { describe, expect, it, beforeEach, vi } from "vitest";

/**
 * Auth-flow tests. Full end-to-end route tests (signup → verification
 * email → token → signin → reset → etc.) need a test-DB harness that
 * doesn't exist in the repo today. These tests cover the pure helpers
 * + one Prisma-mocked integration so the low-hanging fruit is
 * protected against regression while we stand up the harness.
 *
 * Follow-up to build real route-level tests:
 *   1. Pin a Supabase test project or spin up a Postgres container
 *      via testcontainers.
 *   2. Add a resetTestDatabase() fixture per test.
 *   3. Mock Resend at the module level so no real emails fire.
 *   4. Call the route handlers as functions:
 *        import { POST as signup } from "@/app/api/auth/signup/route";
 *        const res = await signup(mockRequest);
 *
 * Tracked in docs/SECURITY_AUDIT.md as a follow-up.
 */

describe("password helpers", () => {
  it("rejects empty password", async () => {
    const { validatePassword } = await import("@/lib/passwords");
    const r = validatePassword("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("empty");
  });

  it("rejects < 12 chars", async () => {
    const { validatePassword } = await import("@/lib/passwords");
    const r = validatePassword("short");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("too_short");
  });

  it("rejects > 128 chars", async () => {
    const { validatePassword } = await import("@/lib/passwords");
    const long = "a".repeat(129);
    const r = validatePassword(long);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("too_long");
  });

  it("accepts 12-char password", async () => {
    const { validatePassword } = await import("@/lib/passwords");
    const r = validatePassword("exactly12chs");
    expect(r.ok).toBe(true);
  });

  it("rejects non-string types", async () => {
    const { validatePassword } = await import("@/lib/passwords");
    expect(validatePassword(null).ok).toBe(false);
    expect(validatePassword(undefined).ok).toBe(false);
    expect(validatePassword(12345678901234).ok).toBe(false);
  });

  it("hash and verify roundtrip", async () => {
    const { hashPassword, verifyPassword } = await import("@/lib/passwords");
    const hash = await hashPassword("correct horse battery");
    expect(hash).not.toBe("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong horse battery", hash)).toBe(false);
  });
});

describe("email regex", () => {
  // Same pattern as routes/signup/forgot/reset/mobile-signup/mobile-login.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  it.each([
    ["user@example.com", true],
    ["jim+test@heelerdigital.com", true],
    ["user@sub.domain.co.uk", true],
    ["", false],
    ["no-at-sign", false],
    ["missing@tld", false],
    ["whitespace @example.com", false],
    ["double@@example.com", false],
  ])("parses %j → %s", (input, expected) => {
    expect(EMAIL_RE.test(input)).toBe(expected);
  });
});

describe("trialDaysForEmail — reduced-trial logic (pentest T-07 fix)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 14 days for a never-seen email (null prisma lookup)", async () => {
    vi.doMock("@/lib/prisma", () => ({
      prisma: {
        deletedUser: {
          findUnique: async () => null,
        },
      },
    }));
    const { trialDaysForEmail } = await import("@/lib/bootstrap-user");
    expect(await trialDaysForEmail("new@example.com")).toBe(14);
  });

  it("returns 3 days for an email deleted 10 days ago", async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    vi.doMock("@/lib/prisma", () => ({
      prisma: {
        deletedUser: {
          findUnique: async () => ({
            email: "returned@example.com",
            deletedAt: tenDaysAgo,
            originalCreatedAt: new Date(0),
            originalTrialEndedAt: null,
          }),
        },
      },
    }));
    const { trialDaysForEmail } = await import("@/lib/bootstrap-user");
    expect(await trialDaysForEmail("returned@example.com")).toBe(3);
  });

  it("returns 14 days for an email deleted >90 days ago", async () => {
    const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    vi.doMock("@/lib/prisma", () => ({
      prisma: {
        deletedUser: {
          findUnique: async () => ({
            email: "longago@example.com",
            deletedAt: hundredDaysAgo,
            originalCreatedAt: new Date(0),
            originalTrialEndedAt: null,
          }),
        },
      },
    }));
    const { trialDaysForEmail } = await import("@/lib/bootstrap-user");
    expect(await trialDaysForEmail("longago@example.com")).toBe(14);
  });

  it("returns 14 days for a null email (defensive)", async () => {
    vi.doMock("@/lib/prisma", () => ({
      prisma: {
        deletedUser: {
          findUnique: async () => {
            throw new Error("should not be called");
          },
        },
      },
    }));
    const { trialDaysForEmail } = await import("@/lib/bootstrap-user");
    expect(await trialDaysForEmail(null)).toBe(14);
  });

  it("normalizes email casing before lookup", async () => {
    let lookedUp = "";
    vi.doMock("@/lib/prisma", () => ({
      prisma: {
        deletedUser: {
          findUnique: async (q: { where: { email: string } }) => {
            lookedUp = q.where.email;
            return null;
          },
        },
      },
    }));
    const { trialDaysForEmail } = await import("@/lib/bootstrap-user");
    await trialDaysForEmail("MixedCase@Example.COM");
    expect(lookedUp).toBe("mixedcase@example.com");
  });
});

describe("streak compute (pure)", () => {
  beforeEach(() => vi.resetModules());

  it("first session → streak of 1", async () => {
    const { computeStreakUpdate } = await import("@/lib/streak");
    const r = computeStreakUpdate({
      now: new Date("2026-04-20T12:00:00Z"),
      timezone: "America/Chicago",
      lastSessionDate: null,
      currentStreak: 0,
      longestStreak: 0,
      lastStreakMilestone: null,
    });
    expect(r.currentStreak).toBe(1);
    expect(r.longestStreak).toBe(1);
    expect(r.milestoneHit).toBeNull();
  });

  it("same calendar day → no change", async () => {
    const { computeStreakUpdate } = await import("@/lib/streak");
    // Both timestamps land on 2026-04-20 when rendered in Chicago:
    // 14:00 UTC = 09:00 CDT; 22:00 UTC = 17:00 CDT — same day.
    const r = computeStreakUpdate({
      now: new Date("2026-04-20T22:00:00Z"),
      timezone: "America/Chicago",
      lastSessionDate: new Date("2026-04-20T14:00:00Z"),
      currentStreak: 5,
      longestStreak: 5,
      lastStreakMilestone: null,
    });
    expect(r.currentStreak).toBe(5);
  });

  it("next calendar day → +1", async () => {
    const { computeStreakUpdate } = await import("@/lib/streak");
    const r = computeStreakUpdate({
      now: new Date("2026-04-21T12:00:00Z"),
      timezone: "America/Chicago",
      lastSessionDate: new Date("2026-04-20T12:00:00Z"),
      currentStreak: 5,
      longestStreak: 5,
      lastStreakMilestone: null,
    });
    expect(r.currentStreak).toBe(6);
    expect(r.longestStreak).toBe(6);
  });

  it("2-day gap → reset to 1", async () => {
    const { computeStreakUpdate } = await import("@/lib/streak");
    const r = computeStreakUpdate({
      now: new Date("2026-04-22T12:00:00Z"),
      timezone: "America/Chicago",
      lastSessionDate: new Date("2026-04-20T12:00:00Z"),
      currentStreak: 30,
      longestStreak: 30,
      lastStreakMilestone: 30,
    });
    expect(r.currentStreak).toBe(1);
    expect(r.longestStreak).toBe(30);
  });

  it("crossing 7 fires milestone once", async () => {
    const { computeStreakUpdate } = await import("@/lib/streak");
    const r = computeStreakUpdate({
      now: new Date("2026-04-26T12:00:00Z"),
      timezone: "America/Chicago",
      lastSessionDate: new Date("2026-04-25T12:00:00Z"),
      currentStreak: 6,
      longestStreak: 6,
      lastStreakMilestone: null,
    });
    expect(r.currentStreak).toBe(7);
    expect(r.milestoneHit).toBe(7);
  });

  it("does not re-fire a milestone after drop + climb", async () => {
    const { computeStreakUpdate } = await import("@/lib/streak");
    const r = computeStreakUpdate({
      now: new Date("2026-05-01T12:00:00Z"),
      timezone: "America/Chicago",
      lastSessionDate: new Date("2026-04-30T12:00:00Z"),
      currentStreak: 6,
      longestStreak: 30,
      lastStreakMilestone: 7, // already fired
    });
    expect(r.currentStreak).toBe(7);
    expect(r.milestoneHit).toBeNull();
  });

  it("jumps past milestones return the highest crossed", async () => {
    const { computeStreakUpdate } = await import("@/lib/streak");
    // Contrived: user had streak=6, skipped days to reset, then
    // somehow leapt to 100 (impossible via normal flow, but the
    // algorithm should handle it).
    const r = computeStreakUpdate({
      now: new Date("2026-04-20T12:00:00Z"),
      timezone: "America/Chicago",
      lastSessionDate: new Date("2026-04-19T12:00:00Z"),
      currentStreak: 99,
      longestStreak: 99,
      lastStreakMilestone: null,
    });
    expect(r.currentStreak).toBe(100);
    expect(r.milestoneHit).toBe(100);
  });
});
