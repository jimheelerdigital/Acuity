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

export type UnsubscribeKind = "weekly" | "monthly" | "onboarding" | "waitlist";

interface Payload {
  u: string; // userId
  k: UnsubscribeKind;
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
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = toB64Url(Buffer.from(payloadJson));
  const mac = createHmac("sha256", secret()).update(payloadB64).digest();
  return `${payloadB64}.${toB64Url(mac)}`;
}

export function verifyUnsubscribeToken(
  token: string
): { userId: string; kind: UnsubscribeKind } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, macB64] = parts;

  const expected = createHmac("sha256", secret()).update(payloadB64).digest();
  const provided = fromB64Url(macB64);
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  let payload: Payload;
  try {
    payload = JSON.parse(fromB64Url(payloadB64).toString("utf8")) as Payload;
  } catch {
    return null;
  }
  if (typeof payload.u !== "string" || typeof payload.e !== "number") return null;
  if (
    payload.k !== "weekly" &&
    payload.k !== "monthly" &&
    payload.k !== "onboarding" &&
    payload.k !== "waitlist"
  ) {
    return null;
  }
  if (Date.now() > payload.e) return null;

  return { userId: payload.u, kind: payload.k };
}
