/**
 * Unit tests for the rate-limit helper. We can't mock `@upstash/redis`
 * + `@upstash/ratelimit` cleanly post-import (the client is built at
 * module load), so this file tests:
 *
 *   1. The logic that lives in OUR module — `checkRateLimit()` with a
 *      hand-rolled fake `Ratelimit` and a null limiter (the fail-open
 *      path when Upstash env vars are unset).
 *   2. The `identifierFromRequest()` helper — XFF parsing, fallback.
 *   3. The `rateLimitedResponse()` builder — status, headers, body shape.
 *
 * Coverage of the real Upstash roundtrip lives in the integration-test
 * layer (not yet built — see PROGRESS.md). The fake-limiter tests here
 * are sufficient to prove our wrapping logic is correct.
 */

import { describe, expect, it, vi, afterEach } from "vitest";

import {
  checkRateLimit,
  identifierFromRequest,
  rateLimitedResponse,
  isRateLimitConfigured,
} from "./rate-limit";

type Ratelimit = Parameters<typeof checkRateLimit>[0];

afterEach(() => {
  vi.restoreAllMocks();
});

function fakeLimiter(opts: {
  allowFirstN: number;
  limit: number;
  windowMs?: number;
}): Ratelimit {
  let count = 0;
  return {
    limit: async () => {
      count++;
      const success = count <= opts.allowFirstN;
      return {
        success,
        limit: opts.limit,
        remaining: success ? opts.limit - count : 0,
        reset: Date.now() + (opts.windowMs ?? 60_000),
      };
    },
  } as unknown as Ratelimit;
}

describe("checkRateLimit — wrapping logic", () => {
  it("returns success=true with allowed remaining on a permitted call", async () => {
    const limiter = fakeLimiter({ allowFirstN: 10, limit: 10 });
    const result = await checkRateLimit(limiter, "user:x");
    expect(result.success).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it("returns success=false with retryAfterSeconds >= 1 on a blocked call", async () => {
    const limiter = fakeLimiter({
      allowFirstN: 0,
      limit: 10,
      windowMs: 30_000,
    });
    const result = await checkRateLimit(limiter, "user:x");
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("clamps retryAfterSeconds to 1 even when reset is in the past", async () => {
    const limiter = {
      limit: async () => ({
        success: false,
        limit: 10,
        remaining: 0,
        reset: Date.now() - 10_000, // already elapsed
      }),
    } as unknown as Ratelimit;
    const result = await checkRateLimit(limiter, "user:x");
    expect(result.success).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("exercises the limit → block transition across N+1 calls", async () => {
    const limiter = fakeLimiter({ allowFirstN: 3, limit: 3 });
    const results = await Promise.all(
      [0, 1, 2, 3].map(() => checkRateLimit(limiter, "user:x"))
    );
    expect(results.map((r) => r.success)).toEqual([true, true, true, false]);
  });
});

describe("checkRateLimit — null-limiter fail-open", () => {
  it("returns success=true with huge remaining when limiter is null (graceful fallback)", async () => {
    // Silence the one-time warning so test output stays clean.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await checkRateLimit(null, "user:x");
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(Number.MAX_SAFE_INTEGER);
    expect(result.retryAfterSeconds).toBe(0);
    // Warning emitted at least once. Deliberately not asserting
    // "exactly once" because the module-scoped flag persists across
    // tests in the same Vitest run.
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe("identifierFromRequest", () => {
  function req(headers: Record<string, string>): Request {
    return new Request("http://x.test/", { headers });
  }

  it("prefers x-forwarded-for first value", () => {
    const id = identifierFromRequest(
      req({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }),
      "scope"
    );
    expect(id).toBe("ip:scope:1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const id = identifierFromRequest(
      req({ "x-real-ip": "9.9.9.9" }),
      "scope"
    );
    expect(id).toBe("ip:scope:9.9.9.9");
  });

  it('falls back to "unknown" when neither header is set', () => {
    const id = identifierFromRequest(req({}), "scope");
    expect(id).toBe("ip:scope:unknown");
  });

  it("includes the scope to avoid cross-endpoint bucket collisions", () => {
    const a = identifierFromRequest(
      req({ "x-forwarded-for": "1.1.1.1" }),
      "waitlist"
    );
    const b = identifierFromRequest(
      req({ "x-forwarded-for": "1.1.1.1" }),
      "auth"
    );
    expect(a).not.toBe(b);
  });
});

describe("rateLimitedResponse", () => {
  it("returns a 429 with retry headers and JSON body", async () => {
    const check = {
      success: false,
      remaining: 0,
      reset: Date.now() + 30_000,
      retryAfterSeconds: 30,
    };
    const res = rateLimitedResponse(check);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(res.headers.get("X-RateLimit-Reset")).toBe(String(check.reset));
    const body = await res.json();
    expect(body).toEqual({ error: "Rate limited", retryAfter: 30 });
  });
});

describe("isRateLimitConfigured", () => {
  it("returns false in tests (Upstash env vars unset)", () => {
    // Upstash env vars are not set in the test environment, so the
    // Redis singleton is null → isRateLimitConfigured returns false.
    expect(isRateLimitConfigured()).toBe(false);
  });
});
