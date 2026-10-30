/**
 * Road 3 (captured email) proof of ownership — 2026-10-28 review, finding 5.
 *
 * POST /api/creators/capture-email is unauthenticated, so the address it
 * receives proves nothing: anyone could pre-register a stranger under their
 * code and collect commission when that stranger signs up on their own. A
 * device-held token can't fix it either: Road 3 exists for the cross-device
 * case (landing on a laptop, signup in the phone app), where no browser
 * cookie or install id is shared between capture and signup.
 *
 * So the capture only counts once the address's owner opens the email we
 * send it. Every store link in that email goes through
 * goripple.io/c/get?t=<token>; tapping a store button there (a form POST, so
 * mail-scanner link prefetching can't do it) marks the capture verified and
 * redirects to the store. Signup then matches only VERIFIED captures — the
 * person who proved they read that inbox is the person who signs up with it.
 *
 * Token: base64url(clickId.email.expiresAtMs).base64url(hmac), keyed off
 * NEXTAUTH_SECRET with a purpose prefix (same pattern as lib/free-month).
 * PURE apart from the env read; no DB access here.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { EMAIL_MATCH_DAYS } from "./config";

const TTL_MS = EMAIL_MATCH_DAYS * 24 * 60 * 60 * 1000;

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
function sig(payload: string): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET unset");
  return createHmac("sha256", `creator-email-capture:${secret}`).update(payload).digest();
}

export interface CaptureClaim {
  clickId: string;
  email: string;
}

export function signCaptureToken(claim: CaptureClaim, now: number = Date.now()): string {
  // clickId is a UUID and email has no "\n", so "\n" is a safe separator.
  const payload = b64(`${claim.clickId}\n${claim.email.toLowerCase()}\n${now + TTL_MS}`);
  return `${payload}.${b64(sig(payload))}`;
}

/** The claim, or null when the token is malformed, forged or expired. */
export function verifyCaptureToken(token: string | null | undefined, now: number = Date.now()): CaptureClaim | null {
  if (!token || token.length > 2048) return null;
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra !== undefined) return null;
  let expected: Buffer;
  try {
    expected = sig(payload);
  } catch {
    return null;
  }
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [clickId, email, exp] = Buffer.from(payload, "base64url").toString().split("\n");
  if (!clickId || !email || !exp || !(now <= Number(exp))) return null;
  return { clickId, email };
}

export type CaptureStore = "ios" | "android";

/** The emailed link: a landing page whose buttons verify, then go to the store. */
export function captureLinkUrl(origin: string, token: string, store: CaptureStore): string {
  return `${origin}/c/get?t=${encodeURIComponent(token)}&s=${store}`;
}
