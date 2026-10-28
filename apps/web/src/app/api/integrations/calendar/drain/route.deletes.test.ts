import { beforeEach, describe, expect, it, vi } from "vitest";

/** GET /drain returns queued event deletions only to clients that support them. */

const deletionFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async () => ({
        calendarConnectedProvider: "ios_eventkit",
        targetCalendarId: "cal_1",
        defaultEventDuration: "TIMED",
      }),
    },
    task: {
      findMany: async () => [
        { id: "task_1", title: "Call", text: null, status: "OPEN", dueDate: new Date("2026-10-28T00:00:00Z"), calendarEventId: null },
      ],
    },
    calendarDeletion: { findMany: (...a: unknown[]) => deletionFindMany(...a) },
  },
}));
vi.mock("@/lib/mobile-auth", () => ({ getAnySessionUserId: async () => "user_1" }));
vi.mock("@/lib/paywall", () => ({ requireEntitlement: async () => ({ ok: true }) }));

const get = (q = "") => {
  const url = `http://localhost/api/integrations/calendar/drain${q}`;
  return Object.assign(new Request(url), { nextUrl: new URL(url) });
};

beforeEach(() => {
  vi.clearAllMocks();
  deletionFindMany.mockResolvedValue([{ id: "del_1", providerEventId: "evt_9" }]);
});

describe("GET /drain deletes", () => {
  it("puts delete ops first for clients sending supports=delete", async () => {
    const { GET } = await import("./route");
    const body = await (await GET(get("?supports=delete") as never)).json();
    expect(body.ops.map((o: { kind: string }) => o.kind)).toEqual(["delete", "upsert"]);
    expect(body.ops[0]).toMatchObject({ taskId: "calendar-deletion:del_1", providerEventId: "evt_9" });
    expect(deletionFindMany.mock.calls[0][0].where).toEqual({ userId: "user_1" });
  });

  it("never sends deletes to older app versions (they'd recreate the event)", async () => {
    const { GET } = await import("./route");
    const body = await (await GET(get() as never)).json();
    expect(body.ops.map((o: { kind: string }) => o.kind)).toEqual(["upsert"]);
    expect(deletionFindMany).not.toHaveBeenCalled();
  });
});
