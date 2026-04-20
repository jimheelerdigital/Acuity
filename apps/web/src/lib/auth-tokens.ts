import "server-only";

import crypto from "node:crypto";

/**
 * Random URL-safe token generator for email verification + password
 * reset flows. 32 bytes = 256 bits of entropy, encoded base64url so
 * the value survives round-tripping through a query string without
 * needing encodeURIComponent on the emitter side.
 */
export function randomToken(bytes = 32): string {
  return crypto
    .randomBytes(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Constant-time comparison to avoid leaking token length / prefix
 * match timing. Both args are assumed utf-8 strings.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}
