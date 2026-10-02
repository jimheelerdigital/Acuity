import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique, update } } }));
vi.mock("@/lib/safe-log", () => ({ safeLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { bootstrapNewUser } from "./bootstrap-user";

describe("bootstrapNewUser guard (2026-10-02)", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
  });

  it("never touches a paid account (Google linked to a funnel customer)", async () => {
    findUnique.mockResolvedValue({ createdAt: new Date(Date.now() - 30_000), subscriptionStatus: "PRO" });
    await bootstrapNewUser({ userId: "u1", email: "a@b.com", signupMethod: "google" });
    expect(update).not.toHaveBeenCalled();
  });

  it("never re-bootstraps an account older than 10 minutes", async () => {
    findUnique.mockResolvedValue({ createdAt: new Date(Date.now() - 3 * 3600_000), subscriptionStatus: "TRIAL" });
    await bootstrapNewUser({ userId: "u1", email: "a@b.com", signupMethod: "google" });
    expect(update).not.toHaveBeenCalled();
  });
});
