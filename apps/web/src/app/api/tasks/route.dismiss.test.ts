import { beforeEach, describe, expect, it, vi } from "vitest";

/** PATCH /api/tasks action=dismiss queues the calendar event's removal, then hard-deletes. */

const findFirst = vi.fn();
const del = vi.fn();
const queue = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      delete: (...a: unknown[]) => del(...a),
    },
  },
}));
vi.mock("@/lib/mobile-auth", () => ({ getAnySessionUserId: async () => "user_1" }));
vi.mock("@/lib/rate-limit", () => ({ enforceUserRateLimit: async () => null }));
vi.mock("@/lib/enqueue-sync", () => ({ enqueueSyncForTask: vi.fn() }));
vi.mock("@/lib/safe-log", () => ({ safeLog: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/calendar-deletion", () => ({ queueCalendarDeletion: (...a: unknown[]) => queue(...a) }));

const patch = (body: unknown) =>
  new Request("http://localhost/api/tasks", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockImplementation(async ({ select }: { select: Record<string, boolean> }) =>
    select.calendarEventId ? { calendarEventId: "evt_9" } : { id: "task_1" }
  );
  queue.mockResolvedValue(true);
});

describe("PATCH /api/tasks dismiss", () => {
  it("queues the event's deletion before the task row is deleted", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ id: "task_1", action: "dismiss" }) as never);
    expect(res.status).toBe(200);
    expect(queue).toHaveBeenCalledWith(expect.anything(), "user_1", "evt_9");
    expect(del).toHaveBeenCalledWith({ where: { id: "task_1" } });
    expect(queue.mock.invocationCallOrder[0]).toBeLessThan(del.mock.invocationCallOrder[0]);
  });
});
