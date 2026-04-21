import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiting for the API surface. SECURITY_AUDIT.md §S5.
 *
 * Backed by Upstash Redis when configured; falls back to a logging
 * no-op (allow-all) when UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 * are not set. Fail-open is deliberate — a misconfigured rate limiter
 * should not lock real users out of the product, and the gap is visible
 * via the one-time warning. S5 is "ship rate limiting before public
 * beta"; we explicitly accept that the limiters are inert until Jim
 * provisions Upstash via the Vercel marketplace.
 *
 * Each limiter is identified by a short prefix so Upstash's dashboard
 * can distinguish "record rate-limit" from "waitlist rate-limit" keys.
 *
 * Usage:
 *   const { success, remaining, reset, retryAfterSeconds } =
 *     await checkRateLimit(limiters.expensiveAi, userId);
 *   if (!success) return rateLimited({ remaining, reset, retryAfterSeconds });
 */

export type RateLimitCheck = {
  success: boolean;
  /** Requests still available in the current window (0 when blocked). */
  remaining: number;
  /** Wall-clock timestamp when the window resets (ms since epoch). */
  reset: number;
  /**
   * Seconds until the earliest request would succeed. Always ≥ 1 on a
   * block; ≥ 0 on success (caller usually ignores when success=true).
   */
  retryAfterSeconds: number;
};

const redis = (() => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

let configWarningEmitted = false;
function warnOnce(): void {
  if (configWarningEmitted) return;
  configWarningEmitted = true;
  console.warn(
    "[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — fail-open (all requests allowed). See SECURITY_AUDIT.md §S5."
  );
}

function buildLimiter(
  prefix: string,
  limit: number,
  window: Parameters<typeof Ratelimit.slidingWindow>[1]
): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    prefix: `acuity:rl:${prefix}`,
    analytics: true,
  });
}

/**
 * Configured limiters per endpoint category. Budgets per
 * SECURITY_AUDIT.md §S5 + Jim's 2026-04-20 task spec.
 */
export const limiters = {
  /** Record, weekly, lifemap/refresh — Claude/Whisper-token-burning ops. */
  expensiveAi: buildLimiter("expensive-ai", 10, "1 h"),
  /**
   * Cost-cap ceiling on /api/record specifically. Stacks on top of
   * the 10/hr expensiveAi limiter. Without this, a malicious/runaway
   * client can still hit 240 records/day at 10/hr rolling — at ~$0.12
   * of Whisper + Claude per entry that's $29/day/user of spend a
   * single compromised account can burn. 30/day is generous enough
   * for any real daily-debrief use (avg user will hit < 2), tight
   * enough to bound a cost-bomb blast radius at ~$3.60/day. Key is
   * `user:<userId>` so the cap follows the user across IPs.
   */
  recordDaily: buildLimiter("record-daily", 30, "1 d"),
  /**
   * Monthly ceiling. 300/month at ~$0.12 each = $36/user worst case,
   * 3x the monthly subscription. A committed daily user records
   * ~30/month; this is 10x their normal usage, firm enough to catch
   * runaway automation before month-end billing surprises.
   */
  recordMonthly: buildLimiter("record-monthly", 300, "30 d"),
  /** NextAuth signin (both email + Google) — brute-force target. IP-scoped. */
  auth: buildLimiter("auth", 5, "15 m"),
  /**
   * Credentials signin + signup + forgot-password — scoped by email so
   * an attacker rotating IPs can't brute-force one account. 5 per hour
   * is tight enough to stop online guessing, loose enough that a user
   * mistyping their password doesn't permanently lock out. Per Jim's
   * 2026-04-20 task spec.
   */
  authByEmail: buildLimiter("auth-by-email", 5, "1 h"),
  /** Public waitlist signups — spam + email-bomb target. */
  waitlist: buildLimiter("waitlist", 3, "1 h"),
  /** Account deletion — high-impact abuse target. */
  accountDelete: buildLimiter("account-delete", 3, "1 d"),
  /** Signed-URL issuance for audio playback — S4 stopgap replacement. */
  audioPlayback: buildLimiter("audio-playback", 60, "1 m"),
  /**
   * Generic per-user write cap for low-cost mutations (goal/task edits,
   * onboarding progress writes, insight dismissals, etc). 30 writes
   * per minute is well above any realistic human-driven rate and
   * short enough that an abusive client's window resets quickly.
   * Keyed `user:<userId>` so throttling follows the account.
   */
  userWrite: buildLimiter("user-write", 30, "1 m"),
  /**
   * Per-user cap on goal-tree reparent operations. Reparent walks the
   * subtree + rewrites paths; it's the single most-expensive write on
   * the Goals API. 20/min is a lot of reparents; anything above is
   * almost certainly automated.
   */
  goalReparent: buildLimiter("goal-reparent", 20, "1 m"),
  /**
   * Data-export creation. Each export materializes audio + JSON for
   * every row in the user's tree — expensive. Spec calls for 1/7d.
   * Enforced both here (defensive) and in the route handler (primary).
   */
  dataExport: buildLimiter("data-export", 1, "7 d"),
  /**
   * Share-link generation on weekly reports. Not expensive but an
   * abuse target (link spam). 10/hr per user is fine.
   */
  shareLink: buildLimiter("share-link", 10, "1 h"),
  /**
   * Ask-Your-Past-Self. 10/day per user caps Claude Opus + OpenAI
   * embedding spend worst-case at ~$0.60/user/day. Key: user:<userId>.
   */
  askPast: buildLimiter("ask-past", 10, "1 d"),
} as const;

export type LimiterName = keyof typeof limiters;

/**
 * Consume one request against a limiter. The `identifier` should be
 * `user:<userId>` for authenticated endpoints and `ip:<ip>` for
 * pre-auth endpoints (see `identifierFromRequest`).
 */
export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string
): Promise<RateLimitCheck> {
  if (!limiter) {
    warnOnce();
    return {
      success: true,
      remaining: Number.MAX_SAFE_INTEGER,
      reset: 0,
      retryAfterSeconds: 0,
    };
  }
  const { success, remaining, reset } = await limiter.limit(identifier);
  const retryAfterSeconds = success
    ? 0
    : Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return { success, remaining, reset, retryAfterSeconds };
}

/**
 * Extract a stable identifier from a request for IP-based limiters.
 * Prefer the Vercel `x-forwarded-for` / `x-real-ip` headers; fall back
 * to a fixed string so unrecognised environments collapse to a shared
 * bucket (worst case: over-limiting ourselves, which is safer than
 * per-request buckets that don't rate-limit at all).
 */
export function identifierFromRequest(req: Request, scope: string): string {
  const xff = req.headers.get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return `ip:${scope}:${ip}`;
}

/**
 * 429 response builder. Call sites use:
 *   if (!check.success) return rateLimitedResponse(check);
 */
export function rateLimitedResponse(check: RateLimitCheck): Response {
  return new Response(
    JSON.stringify({
      error: "Rate limited",
      retryAfter: check.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(check.retryAfterSeconds),
        "X-RateLimit-Remaining": String(check.remaining),
        "X-RateLimit-Reset": String(check.reset),
      },
    }
  );
}

/**
 * True if Upstash is configured. Used by tests + diagnostics.
 */
export function isRateLimitConfigured(): boolean {
  return redis !== null;
}

/**
 * Convenience helper for per-user write throttling. Returns a
 * Response (429) when the limiter rejects, otherwise null. Callers:
 *
 *   const limited = await enforceUserRateLimit("userWrite", userId);
 *   if (limited) return limited;
 *
 * Silently no-ops when Upstash isn't configured (fail-open) so dev
 * and local Postgres-only runs still work.
 */
export async function enforceUserRateLimit(
  name: LimiterName,
  userId: string
): Promise<Response | null> {
  const limiter = limiters[name];
  if (!limiter) return null;
  const check = await checkRateLimit(limiter, `user:${userId}`);
  if (!check.success) return rateLimitedResponse(check);
  return null;
}
