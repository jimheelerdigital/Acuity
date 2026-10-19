/**
 * Feedback intake (2026-10-18): the Feedback row is the record of truth,
 * Slack is the alert. We assert the ROWS and the response in every
 * combination of "store worked / failed" x "Slack ok / failed / unset".
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown> & { id: string };

const h = vi.hoisted(() => {
  const db = { feedback: [] as Row[] };
  let failCreate = false;
  const prismaMock = {
    user: {
      findUnique: async () => ({
        id: "user_1",
        email: "u@example.com",
        name: "U",
        subscriptionStatus: "PRO",
        trialEndsAt: null,
        totalRecordings: 3,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      }),
    },
    feedback: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (failCreate) throw new Error('relation "Feedback" does not exist');
        const row = { id: `fb_${db.feedback.length + 1}`, slackDelivered: false, ...data };
        db.feedback.push(row);
        return { id: row.id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = db.feedback.find((r) => r.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      },
    },
  };
  (globalThis as unknown as { prisma: unknown }).prisma = prismaMock;
  return { db, prismaMock, setFail: (v: boolean) => { failCreate = v; } };
});

vi.mock("@/lib/prisma", () => ({ prisma: h.prismaMock }));
vi.mock("@/lib/mobile-auth", () => ({ getAnySessionUserId: async () => "user_1" }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ success: true }),
  limiters: { feedbackSubmit: {} },
  rateLimitedResponse: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/safe-log", () => ({ safeLog: { info: () => {}, warn: () => {}, error: () => {} } }));

import { POST } from "./route";

const call = (body: Record<string, unknown>) =>
  POST({
    headers: new Headers(),
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0]);

const valid = { content: "The upload failed twice", type: "bug", appVersion: "1.9.4", osName: "iOS", osVersion: "26.6" };

let fetchMock: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  process.env.SLACK_FEEDBACK_WEBHOOK_URL = "https://hooks.example/x";
  vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
  await call(valid).catch(() => null); // warm the route's lazy imports
});

beforeEach(() => {
  h.db.feedback.length = 0;
  h.setFail(false);
  process.env.SLACK_FEEDBACK_WEBHOOK_URL = "https://hooks.example/x";
  fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("POST /api/feedback/submit", () => {
  it("stores the row, alerts Slack, and marks it delivered", async () => {
    const res = await call(valid);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(h.db.feedback).toHaveLength(1);
    expect(h.db.feedback[0]).toMatchObject({
      userId: "user_1",
      source: "in_app",
      type: "bug",
      content: "The upload failed twice",
      appVersion: "1.9.4",
      osName: "iOS",
      osVersion: "26.6",
      subscriptionStatus: "PRO",
      slackDelivered: true,
    });
    expect(h.db.feedback[0]).not.toHaveProperty("networkIp");
  });

  it("keeps the feedback and returns ok when Slack fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response("invalid_payload", { status: 500 }));
    const res = await call(valid);
    expect(res.status).toBe(200);
    expect(h.db.feedback[0]).toMatchObject({ slackDelivered: false });
  });

  it("keeps the feedback and returns ok when the webhook is unset", async () => {
    delete process.env.SLACK_FEEDBACK_WEBHOOK_URL;
    const res = await call(valid);
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.db.feedback).toHaveLength(1);
  });

  it("still alerts Slack when the table write fails (schema not pushed yet)", async () => {
    h.setFail(true);
    const res = await call(valid);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(h.db.feedback).toHaveLength(0);
  });

  it("errors only when nothing was stored and Slack failed", async () => {
    h.setFail(true);
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    expect((await call(valid)).status).toBe(502);
  });

  it("errors only when nothing was stored and the webhook is unset", async () => {
    h.setFail(true);
    delete process.env.SLACK_FEEDBACK_WEBHOOK_URL;
    expect((await call(valid)).status).toBe(503);
  });

  it("records roadmap ideas with source=roadmap and rejects unknown sources", async () => {
    await call({ ...valid, type: "feature", source: "roadmap" });
    await call({ ...valid, source: "admin" });
    expect(h.db.feedback.map((r) => r.source)).toEqual(["roadmap", "in_app"]);
  });

  it("rejects invalid bodies before touching the database", async () => {
    expect((await call({ content: "", type: "bug" })).status).toBe(400);
    expect((await call({ content: "x", type: "rant" })).status).toBe(400);
    expect(h.db.feedback).toHaveLength(0);
  });
});
