/**
 * Try-session claim — concurrency (2026-10-15).
 *
 * 1.9.3 fires two claims at the same instant after sign-up (auth-context's
 * recovery retry + the account set-up). The old route checked `claimed`
 * and only set it at the very end, so both requests created an Entry +
 * Tasks: every new account got its first debrief twice.
 *
 * In-memory Prisma stand-in with real conditional-update semantics; the
 * awaits between steps let the two requests interleave like they do in
 * production. We assert the resulting ROWS.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Session = { id: string; sessionToken: string; claimed: boolean; claimedByUserId: string | null; expiresAt: Date; audioPath: string | null; transcript: string; extractionData: unknown };

const h = vi.hoisted(() => {

const db = { sessions: [] as Session[], entries: [] as { id: string; userId: string }[], tasks: [] as { entryId: string }[] };
const tick = () => new Promise((r) => setTimeout(r, 0));
let failEntryCreate = false;
let currentUser = "user_1";

const prismaMock = {
  trySession: {
    findUnique: async ({ where }: { where: { sessionToken?: string; id?: string } }) => {
      await tick();
      const s = db.sessions.find((x) => (where.id ? x.id === where.id : x.sessionToken === where.sessionToken));
      return s ? { ...s } : null;
    },
    updateMany: async ({ where, data }: { where: Partial<Session>; data: Partial<Session> }) => {
      await tick();
      let count = 0;
      for (const s of db.sessions) {
        const match = Object.entries(where).every(([k, v]) => (s as Record<string, unknown>)[k] === v);
        if (match) {
          Object.assign(s, data);
          count++;
        }
      }
      return { count };
    },
  },
  entry: {
    create: async ({ data }: { data: { userId: string } }) => {
      await tick();
      if (failEntryCreate) throw new Error("db down");
      const e = { id: `entry_${db.entries.length + 1}`, userId: data.userId };
      db.entries.push(e);
      return e;
    },
    update: async () => ({}),
  },
  task: {
    createMany: async ({ data }: { data: { entryId: string }[] }) => {
      await tick();
      db.tasks.push(...data);
      return { count: data.length };
    },
  },
  goal: { findFirst: async () => null, create: async () => ({}) },
  user: { update: async () => ({}) },
};

  // lib/prisma.ts reuses globalThis.prisma when set. Vitest occasionally
  // gives one of two *concurrent* dynamic imports the real module instead
  // of the mock; pointing the global at the mock makes both resolve here.
  (globalThis as unknown as { prisma: unknown }).prisma = prismaMock;
  return { db, prismaMock, setFail: (v: boolean) => { failEntryCreate = v; }, setUser: (u: string) => { currentUser = u; }, user: () => currentUser };
});
const { db, prismaMock } = h;

vi.mock("@/lib/prisma", () => ({ prisma: h.prismaMock }));
vi.mock("@/lib/mobile-auth", () => ({ getAnySessionUserId: async () => h.user() }));
vi.mock("@/lib/supabase.server", () => ({
  supabase: { storage: { from: () => ({ download: async () => ({ data: null, error: null }), upload: async () => ({ error: null }), remove: async () => ({}) }) } },
}));

import { POST } from "./route";

const call = () =>
  POST({
    cookies: { get: () => undefined },
    json: async () => ({ sessionToken: "tok" }),
  } as unknown as Parameters<typeof POST>[0]);

// Vitest can hand the very first, concurrent dynamic import of a mocked
// module the real one; warm the route's lazy imports once before testing.
beforeAll(async () => {
  await POST({ cookies: { get: () => undefined }, json: async () => ({ sessionToken: "warmup" }) } as unknown as Parameters<typeof POST>[0]).catch(() => null);
});

beforeEach(() => {
  h.setFail(false);
  h.setUser("user_1");
  db.entries.length = 0;
  db.tasks.length = 0;
  db.sessions.length = 0;
  db.sessions.push(
    {
      id: "s1",
      sessionToken: "tok",
      claimed: false,
      claimedByUserId: null,
      expiresAt: new Date(Date.now() + 3600_000),
      audioPath: null,
      transcript: "I need to go to the grocery store.",
      extractionData: { summary: "x", tasks: [{ title: "Grocery store" }, { title: "Call mom" }], goals: [] },
    },
  );
});

describe("POST /api/try-recording/claim", () => {
  it("two simultaneous claims create ONE entry and one set of tasks", async () => {
    const [a, b] = await Promise.all([call(), call()]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(db.entries).toHaveLength(1);
    expect(db.tasks).toHaveLength(2);
    expect(db.sessions[0]).toMatchObject({ claimed: true, claimedByUserId: "user_1" });
  });

  it("a different account cannot claim someone else's session", async () => {
    await call();
    h.setUser("user_2");
    const r = await call();
    expect(r.status).toBe(409);
    expect(db.entries).toHaveLength(1);
  });

  it("a failure after taking the session releases it, so a retry still works", async () => {
    h.setFail(true);
    const r1 = await call();
    expect(r1.status).toBe(500);
    expect(db.sessions[0]).toMatchObject({ claimed: false, claimedByUserId: null });
    h.setFail(false);
    const r2 = await call();
    expect(r2.status).toBe(200);
    expect(db.entries).toHaveLength(1);
  });
});
