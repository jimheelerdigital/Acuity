import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 1.9.6 pre-build verification (2026-10-23): POST /api/tasks with the Siri /
 * Action Button `autoGroup` flag, run through the real handler.
 */

const taskCreate = vi.fn();
const groupFindFirst = vi.fn();
const dispatch = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: { create: (...a: unknown[]) => taskCreate(...a) },
    taskGroup: { findFirst: (...a: unknown[]) => groupFindFirst(...a) },
  },
}));
vi.mock("@/lib/mobile-auth", () => ({ getAnySessionUserId: async () => "user_1" }));
vi.mock("@/lib/rate-limit", () => ({ enforceUserRateLimit: async () => null }));
vi.mock("@/lib/enqueue-sync", () => ({ enqueueSyncForTask: vi.fn(async () => ({ enqueued: false })) }));
vi.mock("@/lib/task-groups", () => ({ ensureDefaultTaskGroups: vi.fn() }));
vi.mock("@/lib/safe-log", () => ({ safeLog: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/task-auto-group", () => ({ dispatchTaskAutoGroup: (...a: unknown[]) => dispatch(...a) }));

const post = (body: unknown) =>
  new Request("http://localhost/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  taskCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "task_1", ...data }));
  dispatch.mockResolvedValue(true);
});

describe("POST /api/tasks autoGroup", () => {
  it("no group + autoGroup → task saved ungrouped, AI filing dispatched", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ title: "Call dentist", dueDate: "2026-10-25", autoGroup: true }) as never);
    expect(res.status).toBe(201);
    expect(taskCreate.mock.calls[0][0].data).toMatchObject({ title: "Call dentist", groupId: null });
    expect(dispatch).toHaveBeenCalledWith("task_1", "user_1");
  });

  it("a chosen group wins: saved with it, no AI filing", async () => {
    groupFindFirst.mockResolvedValue({ id: "grp_health" });
    const { POST } = await import("./route");
    await POST(post({ title: "Run", groupId: "grp_health", autoGroup: true }) as never);
    expect(taskCreate.mock.calls[0][0].data.groupId).toBe("grp_health");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("app-created tasks (no flag) are never auto-filed", async () => {
    const { POST } = await import("./route");
    await POST(post({ title: "Plain" }) as never);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("someone else's group id is dropped, then AI files it", async () => {
    groupFindFirst.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(post({ title: "X", groupId: "not_mine", autoGroup: true }) as never);
    expect(taskCreate.mock.calls[0][0].data.groupId).toBeNull();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
