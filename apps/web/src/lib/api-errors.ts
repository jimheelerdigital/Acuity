import "server-only";

import { NextResponse } from "next/server";

/**
 * Sanitized error responses for API routes. SECURITY_AUDIT.md §8.3.
 *
 * In development, surface the raw error message so we can debug. In
 * production, strip internal details — stack traces, vendor-specific
 * error shapes (Prisma error codes, Stripe API error descriptions,
 * Anthropic / OpenAI SDK messages) — and return a generic string
 * keyed to the HTTP status.
 *
 * Never swallow the error server-side — always `console.error`
 * (or `safeLog.error` for PII-adjacent paths) before returning to
 * the client. The sanitization is about what the HTTP *response*
 * says, not what we log.
 *
 * Usage:
 *   try {
 *     ...
 *   } catch (err) {
 *     console.error("[record] Pipeline failed:", err);
 *     return toClientError(err, 502);
 *   }
 */

const IN_PRODUCTION = process.env.NODE_ENV === "production";

const GENERIC_COPY: Record<number, string> = {
  400: "Invalid request.",
  401: "Unauthorized.",
  402: "Subscription required.",
  403: "Forbidden.",
  404: "Not found.",
  409: "Conflict.",
  413: "Payload too large.",
  415: "Unsupported media type.",
  422: "Unprocessable entity.",
  429: "Rate limited.",
  500: "Something went wrong. Please try again.",
  502: "Upstream service unavailable.",
  503: "Service temporarily unavailable.",
};

export interface ToClientErrorOptions {
  /** Extra body fields to include (e.g. `{ entryId }` on pipeline failures). */
  extra?: Record<string, unknown>;
  /**
   * Override: always return this exact message to the client,
   * regardless of production vs dev. Use for user-facing domain
   * errors like "Need at least 3 entries" that are safe to expose
   * verbatim and more useful than a generic string.
   */
  publicMessage?: string;
}

export function toClientError(
  err: unknown,
  status: number,
  options: ToClientErrorOptions = {}
): NextResponse {
  let body: Record<string, unknown>;

  if (options.publicMessage) {
    body = { error: options.publicMessage, ...(options.extra ?? {}) };
  } else if (IN_PRODUCTION) {
    body = {
      error: GENERIC_COPY[status] ?? "Request failed.",
      ...(options.extra ?? {}),
    };
  } else {
    const raw = err instanceof Error ? err.message : String(err);
    body = { error: raw, ...(options.extra ?? {}) };
  }

  return NextResponse.json(body, { status });
}
