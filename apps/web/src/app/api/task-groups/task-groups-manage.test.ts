import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 1.9.6 pre-build verification (2026-10-23): the existing task-groups API,
 * called exactly the way the new Manage groups screen calls it
 * (apps/mobile/app/task-groups.tsx). Notably the app's api.del sends a JSON
 * body WITHOUT a content-type header.
 */

const m = {
  groupFindFirst: vi.fn(),
  groupCount: vi.fn(),
  groupDelete: vi.fn(),
  groupCreate: vi.fn(),
  groupUpdate: vi.fn(),
  groupAggregate: vi.fn(),
  taskUpdateMany: vi.fn(),
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    taskGroup: {
      findFirst: (...a: unknown[]) => m.groupFindFirst(...a),
      count: (...a: unknown[]) => m.groupCount(...a),
      delete: (...a: unknown[]) => m.groupDelete(...a),
      create: (...a: unknown[]) => m.groupCreate(...a),
      update: (...a: unknown[]) => m.groupUpdate(...a),
      aggregate: (...a: unknown[]) => m.groupAggregate(...a),
    },
    task: { updateMany: (...a: unknown[]) => m.taskUpdateMany(...a) },
  },
}));
vi.mock("@/lib/mobile-auth", () => ({ getAnySessionUserId: async () => "user_1" }));
vi.mock("@/lib/rate-limit", () => ({ enforceUserRateLimit: async () => null }));
vi.mock("@/lib/task-groups", () => ({ ensureDefaultTaskGroups: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("Manage groups → task-groups API", () => {
  it("delete moves the group's tasks to Other, body sent without content-type", async () => {
    m.groupFindFirst.mockResolvedValueOnce({ id: "grp_kids" }).mockResolvedValueOnce({ id: "grp_other" });
    m.groupCount.mockResolvedValue(5);
    const { DELETE } = await import("./[id]/route");
    const res = await DELETE(
      new Request("http://localhost/api/task-groups/grp_kids", {
        method: "DELETE",
        body: JSON.stringify({ moveTasksTo: "grp_other" }),
      }) as never,
      { params: { id: "grp_kids" } }
    );
    expect(res.status).toBe(200);
    expect(m.taskUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user_1", groupId: "grp_kids" },
      data: { groupId: "grp_other" },
    });
    expect(m.groupDelete).toHaveBeenCalledWith({ where: { id: "grp_kids" } });
  });

  it("won't delete the last group", async () => {
    m.groupFindFirst.mockResolvedValue({ id: "g" });
    m.groupCount.mockResolvedValue(1);
    const { DELETE } = await import("./[id]/route");
    const res = await DELETE(new Request("http://localhost/x", { method: "DELETE", body: "{}" }) as never, { params: { id: "g" } });
    expect(res.status).toBe(409);
  });

  it("create takes name + icon + palette color and appends at the end", async () => {
    m.groupFindFirst.mockResolvedValue(null);
    m.groupAggregate.mockResolvedValue({ _max: { order: 4 } });
    m.groupCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "new", ...data }));
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/task-groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Kids", icon: "people", color: "#10B981" }),
      }) as never
    );
    expect(res.status).toBe(201);
    expect(m.groupCreate.mock.calls[0][0].data).toMatchObject({ name: "Kids", icon: "people", order: 5 });
  });

  it("rename to an existing name is refused (case-insensitive)", async () => {
    m.groupFindFirst.mockResolvedValueOnce({ id: "g1", name: "Work" }).mockResolvedValueOnce({ id: "g2" });
    const { PATCH } = await import("./[id]/route");
    const res = await PATCH(
      new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify({ name: "health" }) }) as never,
      { params: { id: "g1" } }
    );
    expect(res.status).toBe(409);
  });

  it("reorder writes the new order", async () => {
    m.groupFindFirst.mockResolvedValue({ id: "g1", name: "Work" });
    m.groupUpdate.mockResolvedValue({ id: "g1", order: 2 });
    const { PATCH } = await import("./[id]/route");
    const res = await PATCH(
      new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify({ order: 2 }) }) as never,
      { params: { id: "g1" } }
    );
    expect(res.status).toBe(200);
    expect(m.groupUpdate.mock.calls[0][0].data).toEqual({ order: 2 });
  });
});
