import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The MCP OAuth endpoints had no rate limits (audit 2026-10-17 §6.2).
 * Pin that each one consults its limiter BEFORE doing any work and answers
 * 429 with Retry-After when it says no.
 */

const checkRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
  identifierFromRequest: (_req: Request, scope: string) => `ip:${scope}:1.2.3.4`,
  limiters: { oauthRegisterByIp: "L-register", oauthTokenByIp: "L-token", mcpByIp: "L-mcp", mcpSearchByUser: "L-search" },
}));
vi.mock("@/lib/safe-log", () => ({ safeLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const registerDcrClient = vi.fn();
const exchangeAuthCode = vi.fn();
const refreshAccessToken = vi.fn();
vi.mock("@/lib/mcp-oauth/server", () => ({
  registerDcrClient: (...a: unknown[]) => registerDcrClient(...a),
  exchangeAuthCode: (...a: unknown[]) => exchangeAuthCode(...a),
  refreshAccessToken: (...a: unknown[]) => refreshAccessToken(...a),
}));

import { POST as register } from "./register/route";
import { POST as token } from "./token/route";

const blocked = { success: false, remaining: 0, reset: Date.now() + 30_000, retryAfterSeconds: 30 };
const allowed = { success: true, remaining: 4, reset: 0, retryAfterSeconds: 0 };

function req(url: string, body: string, type = "application/json") {
  return new Request(url, { method: "POST", headers: { "content-type": type }, body }) as never;
}

beforeEach(() => {
  checkRateLimit.mockReset();
  registerDcrClient.mockReset();
  exchangeAuthCode.mockReset();
  refreshAccessToken.mockReset();
});

describe("POST /api/oauth/register", () => {
  it("429 + Retry-After when the IP limiter says no; registration never runs", async () => {
    checkRateLimit.mockResolvedValue(blocked);
    const res = await register(req("https://goripple.io/api/oauth/register", JSON.stringify({ redirect_uris: ["https://claude.ai/cb"] })));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(checkRateLimit).toHaveBeenCalledWith("L-register", "ip:oauth-register:1.2.3.4");
    expect(registerDcrClient).not.toHaveBeenCalled();
  });

  it("passes through when allowed", async () => {
    checkRateLimit.mockResolvedValue(allowed);
    registerDcrClient.mockResolvedValue({ ok: true, client: { clientId: "rpl_client_x", clientName: "Claude", redirectUris: ["https://claude.ai/cb"] }, issuedAt: 1 });
    const res = await register(req("https://goripple.io/api/oauth/register", JSON.stringify({ redirect_uris: ["https://claude.ai/cb"] })));
    expect(res.status).toBe(201);
    expect(registerDcrClient).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/oauth/token", () => {
  it("429 + Retry-After when the IP limiter says no; no grant is attempted", async () => {
    checkRateLimit.mockResolvedValue(blocked);
    const res = await token(req("https://goripple.io/api/oauth/token", "grant_type=refresh_token&refresh_token=rpl_rt_x", "application/x-www-form-urlencoded"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(checkRateLimit).toHaveBeenCalledWith("L-token", "ip:oauth-token:1.2.3.4");
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(exchangeAuthCode).not.toHaveBeenCalled();
  });

  it("passes through when allowed", async () => {
    checkRateLimit.mockResolvedValue(allowed);
    refreshAccessToken.mockResolvedValue({ ok: true, body: { access_token: "a", token_type: "Bearer", expires_in: 3600, refresh_token: "r", scope: "journal:read" } });
    const res = await token(req("https://goripple.io/api/oauth/token", "grant_type=refresh_token&refresh_token=rpl_rt_x&client_id=c", "application/x-www-form-urlencoded"));
    expect(res.status).toBe(200);
    expect(refreshAccessToken).toHaveBeenCalledWith({ refreshToken: "rpl_rt_x", clientId: "c" });
  });
});
