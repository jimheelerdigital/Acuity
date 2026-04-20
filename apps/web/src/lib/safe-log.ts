import "server-only";

import { createHash } from "node:crypto";

/**
 * Structured server-side logger that redacts known-sensitive fields
 * before emitting. Intended for every log line that might touch
 * user-identifiable data. SECURITY_AUDIT.md §S7.
 *
 * Redaction policy (hard-coded — do NOT expose a runtime override):
 *   - `email`                           → sha256(email).slice(0, 8)
 *   - `name`, `transcript`, `audioPath`, `audioUrl`, `phoneNumber`
 *                                       → "<redacted>"
 *   - Nested keys are traversed recursively for plain objects and
 *     arrays. Other values pass through.
 *   - Symbols, functions, class instances (anything not plain object
 *     or array) pass through untouched.
 *
 * Usage:
 *   safeLog.info("waitlist.signup", { email: "a@b.com", source: "organic" });
 *   // → [waitlist.signup] { email: "a1b2c3d4", source: "organic" }
 *
 *   safeLog.error("pipeline.whisper.failed", err, { entryId });
 *   // → [pipeline.whisper.failed] Error: ... stack + { entryId }
 */

const FULL_REDACT_KEYS = new Set([
  "name",
  "transcript",
  "audiopath",
  "audiourl",
  "phonenumber",
]);
const EMAIL_KEYS = new Set(["email", "emailaddress"]);

function hashEmail(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object" && value.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lower = k.toLowerCase();
      if (EMAIL_KEYS.has(lower) && typeof v === "string") {
        out[k] = hashEmail(v);
      } else if (FULL_REDACT_KEYS.has(lower)) {
        out[k] = "<redacted>";
      } else {
        out[k] = sanitize(v);
      }
    }
    return out;
  }
  return value;
}

/** Exposed for unit tests only. */
export const __sanitize_for_tests = sanitize;

export const safeLog = {
  info(event: string, data: Record<string, unknown> = {}): void {
    // eslint-disable-next-line no-console
    console.log(`[${event}]`, sanitize(data));
  },
  warn(event: string, data: Record<string, unknown> = {}): void {
    // eslint-disable-next-line no-console
    console.warn(`[${event}]`, sanitize(data));
  },
  error(
    event: string,
    err: unknown,
    context: Record<string, unknown> = {}
  ): void {
    // Coerce to a structured error object — no raw payload dumps.
    const errObj =
      err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : { message: String(err) };
    // eslint-disable-next-line no-console
    console.error(`[${event}]`, { err: errObj, ctx: sanitize(context) });
  },
};
