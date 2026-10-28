import { beforeEach, describe, expect, it, vi } from "vitest";

/** POST /sync-result routes deletion ops to the queue, not to Task rows. */

const applyDeletion = vi.fn();
const taskFindFirst = vi.fn();
const applySync = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { task: { findFirst: (...a: unknown[]) => taskFindFirst(...a) } } }));
vi.mock("@/lib/mobile-auth", () => ({ getAnySessionUserId: async () => "user_1" }));
vi.mock("@/lib/paywall", () => ({ requireEntitlement: async () => ({ ok: true }) }));
vi.mock("@/lib/safe-log", () => ({ safeLog: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/calendar-sync", () => ({ applySyncResult: (...a: unknown[]) => applySync(...a) }));
vi.mock("@/lib/calendar-deletion", async (orig) => ({
  ...(await orig<typeof import("@/lib/calendar-deletion")>()),
  applyDeletionResult: (...a: unknown[]) => applyDeletion(...a),
}));

const post = (body: unknown) =>
  new Request("http://localhost/api/integrations/calendar/sync-result", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  applyDeletion.mockResolvedValue(true);
});

describe("POST /sync-result for deletions", () => {
  it("applies a successful delete to the queue row for this user", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ taskId: "calendar-deletion:del_1", ok: true, providerEventId: "evt_9" }) as never);
    expect(res.status).toBe(200);
    expect(applyDeletion).toHaveBeenCalledWith(expect.anything(), "user_1", "del_1", { ok: true });
    expect(taskFindFirst).not.toHaveBeenCalled();
    expect(applySync).not.toHaveBeenCalled();
  });

  it("passes failures through with their retryable flag", async () => {
    const { POST } = await import("./route");
    await POST(post({ taskId: "calendar-deletion:del_1", ok: false, retryable: true, reason: "busy" }) as never);
    expect(applyDeletion.mock.calls[0][3]).toEqual({ ok: false, retryable: true, reason: "busy" });
  });
});
