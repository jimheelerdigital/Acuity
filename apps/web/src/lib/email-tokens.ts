/**
 * Signed tokens for email-footer unsubscribe links.
 *
 * Format: base64url(payload).base64url(hmac)
 *   payload = JSON { u: userId, k: "weekly" | "monthly", e: expiresAt }
 *   hmac    = HMAC-SHA256(payload, NEXTAUTH_SECRET)
 *
 * Tokens expire after 180 days. Longer than the 30-day share window
 * because unsubscribe links sit in inboxes for months; honoring them
 * late is better than breaking them.
 */

import { createHmac, timingSafeEqual } from "crypto";

const DEFAULT_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export type UnsubscribeKind =
  | "weekly"
  | "monthly"
  | "onboarding"
  | "waitlist"
  | "engagement_notifications";

interface Payload {
  u: string; // userId
  k: UnsubscribeKind;
  e: number; // expiresAt unix ms
}

interface CategoryOptOutPayload {
  u: string; // userId
  c: string; // notification category key
  e: number; // expiresAt unix ms
}

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) {
    throw new Error("NEXTAUTH_SECRET missing — cannot sign email tokens");
  }
  return s;
}

function toB64Url(buf: Buffer): string {
  return buf.toString("base64url");
}

function fromB64Url(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

/**
 * Sign an arbitrary JSON-serializable payload into a
 * `base64url(payload).base64url(hmac)` token. Shared by every signed
 * email token below so the crypto lives in exactly one place.
 */
function sign(payload: unknown): string {
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = toB64Url(Buffer.from(payloadJson));
  const mac = createHmac("sha256", secret()).update(payloadB64).digest();
  return `${payloadB64}.${toB64Url(mac)}`;
}

/**
 * Verify a token produced by `sign` and return its decoded payload, or
 * null if the format/signature is bad. Caller validates payload shape
 * and TTL.
 */
function verify<T>(token: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, macB64] = parts;

  const expected = createHmac("sha256", secret()).update(payloadB64).digest();
  const provided = fromB64Url(macB64);
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  try {
    return JSON.parse(fromB64Url(payloadB64).toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function signUnsubscribeToken(
  userId: string,
  kind: UnsubscribeKind,
  ttlMs: number = DEFAULT_TTL_MS
): string {
  const payload: Payload = {
    u: userId,
    k: kind,
    e: Date.now() + ttlMs,
  };
  return sign(payload);
}

export function verifyUnsubscribeToken(
  token: string
): { userId: string; kind: UnsubscribeKind } | null {
  const payload = verify<Payload>(token);
  if (!payload) return null;
  if (typeof payload.u !== "string" || typeof payload.e !== "number") return null;
  if (
    payload.k !== "weekly" &&
    payload.k !== "monthly" &&
    payload.k !== "onboarding" &&
    payload.k !== "waitlist" &&
    payload.k !== "engagement_notifications"
  ) {
    return null;
  }
  if (Date.now() > payload.e) return null;

  return { userId: payload.u, kind: payload.k };
}

/**
 * Per-category opt-out token. Lets a smart-notification email carry a
 * one-click "stop sending me THIS category" link without touching the
 * user's other enabled categories. Same HMAC/base64url/TTL approach as
 * the unsubscribe token.
 */
export function signCategoryOptOutToken(
  userId: string,
  category: string,
  ttlMs: number = DEFAULT_TTL_MS
): string {
  const payload: CategoryOptOutPayload = {
    u: userId,
    c: category,
    e: Date.now() + ttlMs,
  };
  return sign(payload);
}

export function verifyCategoryOptOutToken(
  token: string
): { userId: string; category: string } | null {
  const payload = verify<CategoryOptOutPayload>(token);
  if (!payload) return null;
  if (
    typeof payload.u !== "string" ||
    typeof payload.c !== "string" ||
    typeof payload.e !== "number"
  ) {
    return null;
  }
  if (Date.now() > payload.e) return null;

  return { userId: payload.u, category: payload.c };
}
