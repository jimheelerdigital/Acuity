import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Signup account-takeover regression (2026-10-18 audit, R-1).
 *
 * Before: POST /api/auth/signup and /api/auth/mobile-signup wrote the
 * caller's password onto ANY existing user that had no passwordHash
 * (Google / Apple / email-code accounts). Knowing an email was enough to
 * sign in as that person. After: an existing account of any kind is a
 * 409 and nothing is written.
 */

const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const userCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      update: (...a: unknown[]) => userUpdate(...a),
      create: (...a: unknown[]) => userCreate(...a),
    },
    verificationToken: { create: vi.fn().mockResolvedValue({}) },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ success: true }),
  identifierFromRequest: () => "ip",
  limiters: { authByEmail: {}, signupByIp: {}, auth: {} },
  rateLimitedResponse: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/passwords", () => ({
  hashPassword: async () => "HASH",
  validatePassword: () => ({ ok: true }),
}));
vi.mock("@/lib/meta-capi", () => ({
  sendConversionEvent: async () => {},
  generateEventId: () => "evt",
  getClientIp: () => "1.1.1.1",
  extractFbCookies: () => ({}),
}));
vi.mock("@/lib/bootstrap-user", () => ({
  trialDaysForEmail: async () => 14,
  bootstrapNewUser: async () => {},
}));
vi.mock("@/lib/resend", () => ({ sendEmailOrThrow: async () => {} }));
vi.mock("@/lib/email-tokens", () => ({ signUnsubscribeToken: () => "t" }));
vi.mock("@/lib/auth-tokens", () => ({ randomToken: () => "tok" }));
vi.mock("@/emails/welcome-verify", () => ({
  welcomeVerifyEmail: () => ({ subject: "s", html: "<p/>" }),
}));
vi.mock("@/lib/internal-traffic", () => ({ hasInternalCookie: () => false }));
vi.mock("@/lib/safe-log", () => ({ safeLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

function post(path: string, body: unknown) {
  const { NextRequest } = require("next/server");
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const GOOGLE_ONLY = { id: "victim", passwordHash: null, emailVerified: new Date("2026-01-01") };
const CODE_ONLY = { id: "victim2", passwordHash: null, emailVerified: new Date("2026-10-14") };

beforeEach(() => {
  vi.clearAllMocks();
  userCreate.mockResolvedValue({ id: "new" });
});

describe("POST /api/auth/signup (web)", () => {
  it("existing Google-only account → 409, no password written", async () => {
    userFindUnique.mockResolvedValue(GOOGLE_ONLY);
    const { POST } = await import("./route");
    const res = await POST(post("/api/auth/signup", { email: "victim@example.com", password: "correct horse battery" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "AlreadyRegistered", next: "signin" });
    expect(userUpdate).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("existing email-code account → same 409 (no enumeration of method)", async () => {
    userFindUnique.mockResolvedValue(CODE_ONLY);
    const { POST } = await import("./route");
    const res = await POST(post("/api/auth/signup", { email: "v2@example.com", password: "correct horse battery" }));
    expect(res.status).toBe(409);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("existing password account → same 409", async () => {
    userFindUnique.mockResolvedValue({ id: "x", passwordHash: "h", emailVerified: null });
    const { POST } = await import("./route");
    const res = await POST(post("/api/auth/signup", { email: "x@example.com", password: "correct horse battery" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "AlreadyRegistered", next: "signin" });
  });

  it("brand-new email → created WITHOUT emailVerified", async () => {
    userFindUnique.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(post("/api/auth/signup", { email: "new@example.com", password: "correct horse battery" }));
    expect(res.status).toBe(200);
    expect(userCreate).toHaveBeenCalledTimes(1);
    const data = userCreate.mock.calls[0][0].data;
    expect(data.passwordHash).toBe("HASH");
    expect(data.emailVerified).toBeUndefined();
  });
});

describe("POST /api/auth/mobile-signup", () => {
  it("existing Google-only account → 409 routing to the email code", async () => {
    userFindUnique.mockResolvedValue(GOOGLE_ONLY);
    const { POST } = await import("../mobile-signup/route");
    const res = await POST(post("/api/auth/mobile-signup", { email: "victim@example.com", password: "correct horse battery" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "AlreadyRegistered", next: "email-code" });
    expect(userUpdate).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("brand-new email → created WITHOUT emailVerified", async () => {
    userFindUnique.mockResolvedValue(null);
    const { POST } = await import("../mobile-signup/route");
    const res = await POST(post("/api/auth/mobile-signup", { email: "new@example.com", password: "correct horse battery" }));
    expect(res.status).toBe(200);
    expect(userCreate.mock.calls[0][0].data.emailVerified).toBeUndefined();
  });
});
