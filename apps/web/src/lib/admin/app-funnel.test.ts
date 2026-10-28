import { describe, expect, it, vi } from "vitest";

import { getFirstOpens } from "./app-funnel";

const t = (iso: string) => new Date(iso);

describe("getFirstOpens", () => {
  it("leaves out first opens from people who already had an account", async () => {
    const prisma = {
      onboardingEvent: {
        findMany: vi.fn().mockResolvedValue([
          // new install, signed up later (account newer than the open), saw start
          { value: '{"reinstall":false}', userId: "cnew", sessionToken: "i1", createdAt: t("2026-10-21T10:00:00Z") },
          // existing user updating to 1.9.5: account older than the open, no start
          { value: '{"reinstall":false}', userId: "cold", sessionToken: "i2", createdAt: t("2026-10-21T10:00:00Z") },
          // next release: the app says so itself
          { value: '{"reinstall":false,"had_account":true}', userId: null, sessionToken: "i3", createdAt: t("2026-10-22T10:00:00Z") },
          // new install, anonymous, never reached start
          { value: '{"reinstall":false,"had_account":false}', userId: null, sessionToken: "i4", createdAt: t("2026-10-22T10:00:00Z") },
          // the same install logging a second first open: counted once
          { value: '{"reinstall":false,"had_account":false}', userId: null, sessionToken: "i4", createdAt: t("2026-10-22T11:00:00Z") },
        ]),
      },
      user: {
        findMany: vi.fn().mockResolvedValue([
          { id: "cnew", createdAt: t("2026-10-21T10:05:00Z") },
          { id: "cold", createdAt: t("2026-08-01T00:00:00Z") },
        ]),
      },
    };
    const r = await getFirstOpens(prisma as never, t("2026-10-20"), t("2026-10-28"), [
      { event: "v10_start_viewed", userId: null, sessionToken: "i1" },
    ]);
    expect(r).toEqual({ newInstalls: 2, newReachedStart: 1, existingAccounts: 2 });
    expect(prisma.user.findMany.mock.calls[0][0].where.id.in.sort()).toEqual(["cnew", "cold"]);
  });
});
