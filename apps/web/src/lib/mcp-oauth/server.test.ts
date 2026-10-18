import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── In-memory Prisma stand-in (only what lib/mcp-oauth + mcp-token use) ──
type Row = Record<string, any>;
const db = { clients: [] as Row[], codes: [] as Row[], conns: [] as Row[], tokens: [] as Row[] };
let seq = 0;
const id = () => `id${++seq}`;
const match = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("lt" in v) return row[k] instanceof Date && row[k] < v.lt;
      if ("gt" in v) return row[k] instanceof Date && row[k] > v.gt;
      if ("not" in v) return row[k] !== v.not;
    }
    return (row[k] ?? null) === v;
  });

vi.mock("@/lib/safe-log", () => ({ safeLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    oAuthClient: {
      findUnique: async ({ where }: any) => db.clients.find((c) => c.clientId === where.clientId) ?? null,
      create: async ({ data }: any) => (db.clients.push({ id: id(), updatedAt: new Date(), createdAt: new Date(), ...data }), data),
      upsert: async () => ({}),
    },
    oAuthAuthCode: {
      create: async ({ data }: any) => (db.codes.push({ id: id(), usedAt: null, ...data }), data),
      findUnique: async ({ where }: any) => db.codes.find((c) => c.codeHash === where.codeHash) ?? null,
      updateMany: async ({ where, data }: any) => {
        const rows = db.codes.filter((c) => match(c, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
    },
    mcpConnection: {
      create: async ({ data }: any) => {
        const row = { id: id(), revokedAt: null, previousRefreshTokenHash: null, createdAt: new Date(), ...data };
        db.conns.push(row);
        return row;
      },
      findUnique: async ({ where }: any) => {
        const [k, v] = Object.entries(where)[0];
        return db.conns.find((c) => c[k] === v) ?? null;
      },
      updateMany: async ({ where, data }: any) => {
        const rows = db.conns.filter((c) => match(c, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
    },
    mcpAccessToken: {
      create: async ({ data }: any) => {
        const row = { id: id(), revokedAt: null, lastUsedAt: null, ...data };
        db.tokens.push(row);
        return { id: row.id };
      },
      findUnique: async ({ where }: any) => {
        const t = db.tokens.find((x) => x.tokenHash === where.tokenHash);
        if (!t) return null;
        const conn = t.connectionId ? db.conns.find((c) => c.id === t.connectionId) : null;
        return { ...t, connection: conn ? { revokedAt: conn.revokedAt } : null };
      },
      update: async () => ({}),
      updateMany: async ({ where, data }: any) => {
        const rows = db.tokens.filter((t) => match(t, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
      deleteMany: async ({ where }: any) => {
        const before = db.tokens.length;
        db.tokens = db.tokens.filter((t) => !match(t, where));
        return { count: before - db.tokens.length };
      },
    },
  },
}));

import { verifyMcpToken } from "@/lib/mcp-token";
import { MCP_SCOPE } from "./core";
import {
  checkClientAndRedirect,
  createAuthCode,
  exchangeAuthCode,
  refreshAccessToken,
  registerDcrClient,
  revokeConnection,
} from "./server";

const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const verifier = "v".repeat(60);
const challenge = createHash("sha256").update(verifier).digest("base64url");

async function register() {
  const r = await registerDcrClient({ redirect_uris: [REDIRECT], client_name: "Claude", token_endpoint_auth_method: "none" });
  if (!r.ok) throw new Error("register failed");
  return r.client.clientId;
}

async function codeFor(clientId: string) {
  return createAuthCode("user1", {
    clientId,
    redirectUri: REDIRECT,
    codeChallenge: challenge,
    state: "s",
    scope: MCP_SCOPE,
    resource: "https://goripple.io/api/mcp",
  });
}

beforeEach(() => {
  db.clients = [];
  db.codes = [];
  db.conns = [];
  db.tokens = [];
  process.env.NEXTAUTH_URL = "https://goripple.io";
});

describe("dynamic client registration", () => {
  it("registers a public client and checks its redirect", async () => {
    const clientId = await register();
    expect(clientId).toMatch(/^rpl_client_/);
    expect(await checkClientAndRedirect(clientId, REDIRECT)).not.toBeNull();
    expect(await checkClientAndRedirect(clientId, "https://evil.com/cb")).toBeNull();
  });
  it("rejects confidential clients and bad redirects", async () => {
    expect((await registerDcrClient({ redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_basic" })).ok).toBe(false);
    expect((await registerDcrClient({ redirect_uris: ["http://evil.com/cb"] })).ok).toBe(false);
    expect((await registerDcrClient({})).ok).toBe(false);
  });
});

describe("code → tokens → refresh → revoke", () => {
  it("issues a working access token, single-use code, PKCE enforced", async () => {
    const clientId = await register();
    const code = await codeFor(clientId);

    const badPkce = await exchangeAuthCode({ code, clientId, redirectUri: REDIRECT, codeVerifier: "w".repeat(60), resource: null });
    expect(badPkce.ok).toBe(false);

    const ok = await exchangeAuthCode({ code, clientId, redirectUri: REDIRECT, codeVerifier: verifier, resource: "https://goripple.io/api/mcp" });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.body.token_type).toBe("Bearer");
    expect(ok.body.expires_in).toBe(3600);
    expect((await verifyMcpToken(ok.body.access_token))?.userId).toBe("user1");

    const reuse = await exchangeAuthCode({ code, clientId, redirectUri: REDIRECT, codeVerifier: verifier, resource: null });
    expect(reuse.ok).toBe(false);
  });

  it("rejects a code presented by another client or redirect", async () => {
    const clientId = await register();
    const code = await codeFor(clientId);
    expect((await exchangeAuthCode({ code, clientId: "other", redirectUri: REDIRECT, codeVerifier: verifier, resource: null })).ok).toBe(false);
  });

  it("rotates refresh tokens and rejects the old one", async () => {
    const clientId = await register();
    const first = await exchangeAuthCode({ code: await codeFor(clientId), clientId, redirectUri: REDIRECT, codeVerifier: verifier, resource: null });
    if (!first.ok) throw new Error("exchange failed");
    const second = await refreshAccessToken({ refreshToken: first.body.refresh_token, clientId });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.body.refresh_token).not.toBe(first.body.refresh_token);
    expect((await verifyMcpToken(second.body.access_token))?.userId).toBe("user1");
    const replay = await refreshAccessToken({ refreshToken: first.body.refresh_token, clientId });
    expect(replay.ok).toBe(false);
  });

  it("a replayed refresh token revokes the whole connection (2026-10-18): the rotated token and the live access token die too", async () => {
    const clientId = await register();
    const first = await exchangeAuthCode({ code: await codeFor(clientId), clientId, redirectUri: REDIRECT, codeVerifier: verifier, resource: null });
    if (!first.ok) throw new Error("exchange failed");
    const second = await refreshAccessToken({ refreshToken: first.body.refresh_token, clientId });
    if (!second.ok) throw new Error("refresh failed");
    expect((await verifyMcpToken(second.body.access_token))?.userId).toBe("user1"); // precondition

    // Someone presents the OLD token: we can't tell thief from client, so cut both off.
    expect((await refreshAccessToken({ refreshToken: first.body.refresh_token, clientId })).ok).toBe(false);
    expect(db.conns[0].revokedAt).toBeInstanceOf(Date);
    expect((await refreshAccessToken({ refreshToken: second.body.refresh_token, clientId })).ok).toBe(false);
    expect(await verifyMcpToken(second.body.access_token)).toBeNull();
  });

  it("resolved clients carry kind + createdAt for the consent page", async () => {
    const clientId = await register();
    const c = await checkClientAndRedirect(clientId, REDIRECT);
    expect(c?.kind).toBe("dcr");
    expect(c?.createdAt).toBeInstanceOf(Date);
  });

  it("disconnect kills access and refresh", async () => {
    const clientId = await register();
    const t = await exchangeAuthCode({ code: await codeFor(clientId), clientId, redirectUri: REDIRECT, codeVerifier: verifier, resource: null });
    if (!t.ok) throw new Error("exchange failed");
    const connId = db.conns[0].id;
    expect(await revokeConnection("someone-else", connId)).toBe(false);
    expect(await revokeConnection("user1", connId)).toBe(true);
    expect(await verifyMcpToken(t.body.access_token)).toBeNull();
    expect((await refreshAccessToken({ refreshToken: t.body.refresh_token, clientId })).ok).toBe(false);
  });
});
