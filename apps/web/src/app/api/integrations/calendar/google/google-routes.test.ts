import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Google Calendar direct sign-in routes (2026-10-28) against a mocked
 * Prisma and a mocked Google token endpoint.
 */

process.env.NEXTAUTH_SECRET = "test-only-nextauth-secret";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.NEXTAUTH_URL = "https://goripple.io";

const db = {
  connUpsert: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  taskUpdateMany: vi.fn(),
  deletionDeleteMany: vi.fn(),
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    calendarConnection: { upsert: (...a: unknown[]) => db.connUpsert(...a) },
    user: {
      findUnique: (...a: unknown[]) => db.userFindUnique(...a),
      update: (...a: unknown[]) => db.userUpdate(...a),
    },
    task: { updateMany: (...a: unknown[]) => db.taskUpdateMany(...a) },
    calendarDeletion: { deleteMany: (...a: unknown[]) => db.deletionDeleteMany(...a) },
  },
}));
const flag = vi.fn();
vi.mock("@/lib/feature-flags", () => ({ isEnabled: (...a: unknown[]) => flag(...a) }));
const drain = vi.fn();
vi.mock("@/lib/calendar/server-drain-request", () => ({
  requestServerCalendarDrain: (...a: unknown[]) => drain(...a),
}));
vi.mock("@/lib/mobile-auth", () => ({ getAnySessionUserId: async () => "user_1" }));
vi.mock("@/lib/paywall", () => ({ requireEntitlement: async () => ({ ok: true }) }));
vi.mock("@/lib/safe-log", () => ({ safeLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { decryptToken } from "@/lib/calendar/encryption";
import { GOOGLE_EVENTS_SCOPE, signGoogleDirectState } from "@/lib/calendar/google-direct";

const idToken = (claims: Record<string, unknown>) =>
  `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

function mockTokenEndpoint(body: Record<string, unknown>, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status }))
  );
}

const callback = async (qs: string) => {
  const { GET } = await import("./callback/route");
  const { NextRequest } = await import("next/server");
  return GET(new NextRequest(`https://goripple.io/api/integrations/calendar/google/callback?${qs}`));
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  flag.mockResolvedValue(true);
  db.userFindUnique.mockResolvedValue({ calendarConnectedProvider: "ios_eventkit" });
  db.taskUpdateMany.mockResolvedValue({ count: 4 });
});

describe("GET /google/start", () => {
  it("returns the consent URL as JSON for the app", async () => {
    const { GET } = await import("./start/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest("https://goripple.io/api/integrations/calendar/google/start?format=json&return=app"));
    expect(res.status).toBe(200);
    const { url } = await res.json();
    expect(new URL(url).searchParams.get("scope")).toContain(GOOGLE_EVENTS_SCOPE);
  });

  it("404s (JSON) / redirects with gcal=unavailable (web) when the flag is off", async () => {
    flag.mockResolvedValue(false);
    const { GET } = await import("./start/route");
    const { NextRequest } = await import("next/server");
    const json = await GET(new NextRequest("https://goripple.io/x?format=json"));
    expect(json.status).toBe(404);
    const web = await GET(new NextRequest("https://goripple.io/x"));
    expect(web.status).toBe(302);
    expect(web.headers.get("location")).toContain("gcal=unavailable");
  });
});

describe("GET /google/callback", () => {
  const good = {
    access_token: "at",
    refresh_token: "rt",
    expires_in: 3600,
    scope: `openid email ${GOOGLE_EVENTS_SCOPE}`,
    id_token: idToken({ sub: "g-1", email: "a@example.com" }),
  };

  it("stores encrypted tokens, switches the person to Google, queues tasks and requests a drain", async () => {
    mockTokenEndpoint(good);
    const state = signGoogleDirectState("user_1", "app");
    const res = await callback(`code=c1&state=${encodeURIComponent(state)}`);
    expect(res.headers.get("location")).toBe("acuity://integrations?gcal=connected");

    const upsert = db.connUpsert.mock.calls[0][0];
    expect(upsert.where).toEqual({ userId_provider: { userId: "user_1", provider: "google" } });
    expect(upsert.create).toMatchObject({ provider: "google", providerAccountId: "g-1", accountEmail: "a@example.com" });
    expect(upsert.create.refreshToken).not.toBe("rt");
    expect(decryptToken(upsert.create.refreshToken)).toBe("rt");

    expect(db.userUpdate.mock.calls[0][0].data).toMatchObject({
      calendarConnectedProvider: "google",
      targetCalendarId: "primary",
      autoSendTasks: true,
    });
    // Phone-calendar deletions are meaningless to Google.
    expect(db.deletionDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_1" } });
    expect(db.taskUpdateMany.mock.calls[0][0].data).toMatchObject({ calendarSyncStatus: "PENDING" });
    expect(drain).toHaveBeenCalledWith("user_1");
  });

  it("rejects a bad state without touching anything", async () => {
    const res = await callback("code=c1&state=forged.sig");
    expect(res.headers.get("location")).toContain("/account?gcal=error");
    expect(db.connUpsert).not.toHaveBeenCalled();
  });

  it("calendar access unticked → gcal=scope, nothing stored", async () => {
    mockTokenEndpoint({ ...good, scope: "openid email" });
    const res = await callback(`code=c1&state=${encodeURIComponent(signGoogleDirectState("user_1", "web"))}`);
    expect(res.headers.get("location")).toContain("gcal=scope");
    expect(db.connUpsert).not.toHaveBeenCalled();
  });

  it("a Google account already linked to another Ripple account → gcal=in_use", async () => {
    mockTokenEndpoint(good);
    db.connUpsert.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" })
    );
    const res = await callback(`code=c1&state=${encodeURIComponent(signGoogleDirectState("user_1", "web"))}`);
    expect(res.headers.get("location")).toContain("gcal=in_use");
    expect(db.userUpdate).not.toHaveBeenCalled();
  });

  it("user declined on Google → gcal=denied", async () => {
    const res = await callback(`error=access_denied&state=${encodeURIComponent(signGoogleDirectState("user_1", "web"))}`);
    expect(res.headers.get("location")).toContain("gcal=denied");
  });
});
