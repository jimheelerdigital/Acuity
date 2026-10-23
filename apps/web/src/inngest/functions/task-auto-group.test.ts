import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 1.9.6 pre-build verification (2026-10-23): the task-auto-group Inngest
 * function, run with a fake `step` and mocked Prisma + classifier.
 */

const taskFindFirst = vi.fn();
const groupFindMany = vi.fn();
const taskUpdateMany = vi.fn();
const classify = vi.fn();
const resolveGroup = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findFirst: (...a: unknown[]) => taskFindFirst(...a),
      updateMany: (...a: unknown[]) => taskUpdateMany(...a),
    },
    taskGroup: { findMany: (...a: unknown[]) => groupFindMany(...a) },
  },
}));
vi.mock("@/lib/task-group-classify", () => ({ classifyTasks: (...a: unknown[]) => classify(...a) }));
vi.mock("@/lib/task-groups", () => ({ resolveGroupName: (...a: unknown[]) => resolveGroup(...a) }));
vi.mock("@/inngest/client", () => ({
  inngest: { createFunction: (_cfg: unknown, handler: unknown) => ({ handler }) },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/safe-log", () => ({ safeLog: { warn: vi.fn(), info: vi.fn() } }));

const step = { run: async (_id: string, fn: () => unknown) => fn() };
const run = async () => {
  const mod = await import("./task-auto-group");
  const fn = mod.taskAutoGroupFn as unknown as { handler: (ctx: unknown) => Promise<unknown> };
  return fn.handler({ event: { data: { taskId: "t1", userId: "u1" } }, step });
};

beforeEach(() => {
  vi.clearAllMocks();
  groupFindMany.mockResolvedValue([{ name: "Work" }, { name: "Health" }, { name: "Other" }]);
  taskUpdateMany.mockResolvedValue({ count: 1 });
});

describe("task-auto-group", () => {
  it("files an ungrouped task into the AI's pick, only if still ungrouped", async () => {
    taskFindFirst.mockResolvedValue({ id: "t1", title: "Book physio", text: null, description: null });
    classify.mockResolvedValue({ t1: "Health" });
    resolveGroup.mockResolvedValue("grp_health");
    expect(await run()).toEqual({ assigned: "Health" });
    expect(classify.mock.calls[0][1]).toEqual(["Work", "Health", "Other"]);
    expect(taskUpdateMany).toHaveBeenCalledWith({
      where: { id: "t1", userId: "u1", groupId: null },
      data: { groupId: "grp_health" },
    });
  });

  it("does nothing when the person already grouped it", async () => {
    taskFindFirst.mockResolvedValue(null);
    expect(await run()).toEqual({ skipped: "grouped-or-gone" });
    expect(classify).not.toHaveBeenCalled();
  });

  it("does nothing when the AI returns nothing", async () => {
    taskFindFirst.mockResolvedValue({ id: "t1", title: "?", text: null, description: null });
    classify.mockResolvedValue({});
    expect(await run()).toEqual({ skipped: "no-classification" });
    expect(taskUpdateMany).not.toHaveBeenCalled();
  });
});
