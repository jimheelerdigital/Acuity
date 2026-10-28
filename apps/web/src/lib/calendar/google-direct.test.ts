import { describe, expect, it, vi } from "vitest";

import { decryptToken, encryptToken } from "./encryption";
import {
  buildGoogleDirectAuthUrl,
  dropGoogleConnection,
  exchangeGoogleDirectCode,
  getGoogleAccessToken,
  GOOGLE_EVENTS_SCOPE,
  GoogleAuthRevokedError,
  googleConnectionStatus,
  markGoogleDisconnected,
  signGoogleDirectState,
  verifyGoogleDirectState,
} from "./google-direct";
import { signState, verifyState } from "./oauth";

process.env.NEXTAUTH_SECRET = "test-only-nextauth-secret";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.NEXTAUTH_URL = "https://goripple.io";

function jsonFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; body: string }> = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    return new Response(JSON.stringify(next.body), { status: next.status });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const idToken = (claims: Record<string, unknown>) =>
  `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

describe("state", () => {
  it("round-trips the user and return target", () => {
    expect(verifyGoogleDirectState(signGoogleDirectState("u1", "app"))).toEqual({ userId: "u1", ret: "app" });
    expect(verifyGoogleDirectState(signGoogleDirectState("u1", "web"))).toEqual({ userId: "u1", ret: "web" });
  });

  it("rejects tampering and states from the read-only calendar flow (and vice versa)", () => {
    const s = signGoogleDirectState("u1", "web");
    const [body] = s.split(".");
    expect(verifyGoogleDirectState(`${body}.AAAA`)).toBeNull();
    expect(verifyGoogleDirectState(signState("u1"))).toBeNull();
    expect(verifyState(s)).toBeNull();
    expect(verifyState(signState("u1"))).toBe("u1");
  });
});

describe("consent URL", () => {
  it("asks only for calendar.events (+ identity), offline, with forced consent", () => {
    const url = new URL(buildGoogleDirectAuthUrl("st"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toBe(`openid email ${GOOGLE_EVENTS_SCOPE}`);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("include_granted_scopes")).toBeNull();
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://goripple.io/api/integrations/calendar/google/callback"
    );
    expect(url.searchParams.get("state")).toBe("st");
  });
});

describe("exchangeGoogleDirectCode", () => {
  it("returns tokens, granted scopes and the account from the id_token", async () => {
    const f = jsonFetch([
      {
        status: 200,
        body: {
          access_token: "at",
          refresh_token: "rt",
          expires_in: 3600,
          scope: `openid ${GOOGLE_EVENTS_SCOPE} https://www.googleapis.com/auth/userinfo.email`,
          id_token: idToken({ sub: "g-123", email: "a@example.com" }),
        },
      },
    ]);
    const now = new Date("2026-10-28T12:00:00Z");
    const t = await exchangeGoogleDirectCode("code-1", f.impl, now);
    expect(t).toMatchObject({ accessToken: "at", refreshToken: "rt", sub: "g-123", email: "a@example.com" });
    expect(t.grantedScopes).toContain(GOOGLE_EVENTS_SCOPE);
    expect(t.expiresAt).toEqual(new Date("2026-10-28T13:00:00Z"));
    const sent = new URLSearchParams(f.calls[0].body);
    expect(sent.get("grant_type")).toBe("authorization_code");
    expect(sent.get("code")).toBe("code-1");
  });

  it("throws on a failed exchange", async () => {
    const f = jsonFetch([{ status: 400, body: { error: "invalid_grant" } }]);
    await expect(exchangeGoogleDirectCode("bad", f.impl)).rejects.toThrow(/invalid_grant/);
  });
});

describe("getGoogleAccessToken", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  function db(row: Record<string, unknown> | null) {
    return {
      calendarConnection: {
        findUnique: vi.fn(async () => row),
        update: vi.fn(async () => ({})),
      },
    };
  }

  it("uses the cached access token while it's valid", async () => {
    const d = db({
      id: "c1",
      accessToken: encryptToken("cached"),
      refreshToken: encryptToken("rt"),
      tokenExpiresAt: new Date(now.getTime() + 10 * 60_000),
    });
    const f = jsonFetch([]);
    expect(await getGoogleAccessToken(d as never, "u1", { fetchImpl: f.impl, now })).toBe("cached");
    expect(f.calls).toHaveLength(0);
  });

  it("refreshes an expiring token and stores the new one encrypted", async () => {
    const d = db({
      id: "c1",
      accessToken: encryptToken("old"),
      refreshToken: encryptToken("rt"),
      tokenExpiresAt: new Date(now.getTime() + 30_000),
    });
    const f = jsonFetch([{ status: 200, body: { access_token: "new", expires_in: 3599 } }]);
    expect(await getGoogleAccessToken(d as never, "u1", { fetchImpl: f.impl, now })).toBe("new");
    const sent = new URLSearchParams(f.calls[0].body);
    expect(sent.get("grant_type")).toBe("refresh_token");
    expect(sent.get("refresh_token")).toBe("rt");
    const data = d.calendarConnection.update.mock.calls[0][0].data;
    expect(data.accessToken).not.toBe("new");
    expect(decryptToken(data.accessToken)).toBe("new");
    expect(data.tokenExpiresAt).toEqual(new Date(now.getTime() + 3599_000));
    expect(data.refreshToken).toBeUndefined();
  });

  it("forceRefresh skips the cache", async () => {
    const d = db({
      id: "c1",
      accessToken: encryptToken("cached"),
      refreshToken: encryptToken("rt"),
      tokenExpiresAt: new Date(now.getTime() + 10 * 60_000),
    });
    const f = jsonFetch([{ status: 200, body: { access_token: "forced", expires_in: 3600 } }]);
    expect(await getGoogleAccessToken(d as never, "u1", { fetchImpl: f.impl, now, forceRefresh: true })).toBe("forced");
  });

  it("revoked grant / missing token → GoogleAuthRevokedError; Google outage → plain error", async () => {
    const base = { id: "c1", accessToken: null, refreshToken: encryptToken("rt"), tokenExpiresAt: null };
    await expect(
      getGoogleAccessToken(db(base) as never, "u1", {
        fetchImpl: jsonFetch([{ status: 400, body: { error: "invalid_grant" } }]).impl,
        now,
      })
    ).rejects.toBeInstanceOf(GoogleAuthRevokedError);
    await expect(getGoogleAccessToken(db(null) as never, "u1", { now })).rejects.toBeInstanceOf(GoogleAuthRevokedError);
    await expect(
      getGoogleAccessToken(db({ ...base, refreshToken: "not-ciphertext" }) as never, "u1", { now })
    ).rejects.toBeInstanceOf(GoogleAuthRevokedError);
    const outage = getGoogleAccessToken(db(base) as never, "u1", {
      fetchImpl: jsonFetch([{ status: 503, body: {} }]).impl,
      now,
    });
    await expect(outage).rejects.toThrow(/token refresh failed/);
    await expect(outage).rejects.not.toBeInstanceOf(GoogleAuthRevokedError);
  });
});

describe("connection lifecycle", () => {
  function db(provider: string | null) {
    return {
      user: {
        findUnique: vi.fn(async () => ({ calendarConnectedProvider: provider })),
        update: vi.fn(async () => ({})),
      },
      task: { updateMany: vi.fn(async () => ({ count: 2 })) },
      calendarDeletion: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      calendarConnection: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        findUnique: vi.fn(async () => ({ id: "c1", refreshToken: encryptToken("rt"), accountEmail: "a@example.com" })),
        deleteMany: vi.fn(async () => ({ count: 1 })),
      },
    };
  }

  it("markGoogleDisconnected keeps the row for 'Reconnect' and releases the queue only if Google is connected", async () => {
    const g = db("google");
    await markGoogleDisconnected(g as never, "u1", "invalid_grant");
    expect(g.calendarConnection.updateMany.mock.calls[0][0].data).toMatchObject({
      accessToken: null,
      refreshToken: null,
      lastError: "revoked:invalid_grant",
    });
    expect(g.user.update).toHaveBeenCalled();
    expect(g.task.updateMany).toHaveBeenCalled();

    const phone = db("ios_eventkit");
    await markGoogleDisconnected(phone as never, "u1", "invalid_grant");
    expect(phone.user.update).not.toHaveBeenCalled();
    expect(phone.task.updateMany).not.toHaveBeenCalled();
  });

  it("dropGoogleConnection revokes at Google and deletes the tokens", async () => {
    const d = db("google");
    const f = jsonFetch([{ status: 200, body: {} }]);
    expect(await dropGoogleConnection(d as never, "u1", f.impl)).toBe(true);
    expect(f.calls[0].url).toBe("https://oauth2.googleapis.com/revoke");
    expect(new URLSearchParams(f.calls[0].body).get("token")).toBe("rt");
    expect(d.calendarConnection.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1", provider: "google" } });
  });

  it("googleConnectionStatus reports needs_reconnect once tokens are wiped", async () => {
    const d = db("google");
    expect(await googleConnectionStatus(d as never, "u1")).toEqual({ email: "a@example.com", status: "connected" });
    d.calendarConnection.findUnique.mockResolvedValueOnce({ id: "c1", refreshToken: null, accountEmail: "a@example.com" } as never);
    expect(await googleConnectionStatus(d as never, "u1")).toEqual({ email: "a@example.com", status: "needs_reconnect" });
  });
});
