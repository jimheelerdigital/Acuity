import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Checkout handoff pass (2026-09-30, per Keenan: "add the button in the
 * paywall … and make sure it links properly").
 *
 * Inside the Instagram/Facebook in-app browser Apple Pay and Google Pay
 * usually don't appear, so the paywall offers "Pay with Apple Pay in Safari".
 * That opens Stripe's hosted checkout in the real browser, which has no
 * session cookie for our site. The success/cancel URLs carry this short-lived
 * signed pass, and /api/onboarding/handoff exchanges it for a normal web
 * session so the buyer lands signed in on the password + download steps.
 *
 * Format: base64url(userId.expiresAtMs).base64url(hmac-sha256). Signed with
 * NEXTAUTH_SECRET; valid 2 hours; only ever issued to the signed-in buyer.
 */
const TTL_MS = 2 * 60 * 60 * 1000;

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const sig = (payload: string) => {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET unset");
  return createHmac("sha256", `checkout-handoff:${secret}`).update(payload).digest();
};

export function signHandoff(userId: string): string {
  const payload = b64(`${userId}.${Date.now() + TTL_MS}`);
  return `${payload}.${b64(sig(payload))}`;
}

/** The user id, or null when the pass is malformed, forged or expired. */
export function verifyHandoff(token: string | null | undefined): string | null {
  if (!token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = sig(payload);
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [userId, exp] = Buffer.from(payload, "base64url").toString().split(".");
  if (!userId || !exp || Date.now() > Number(exp)) return null;
  return userId;
}
