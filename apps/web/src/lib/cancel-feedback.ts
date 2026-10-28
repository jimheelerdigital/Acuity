/**
 * "Why wasn't Ripple for you?" (2026-10-28, per Keenan: lots of trials are
 * cancelled the same day they start, "so somethings clearly wrong").
 *
 * The trial-cancelled email's answers are one-tap links to /why, which records
 * the reason instantly (no reply email to write: only 2 of 17 answered the
 * mailto version). /why then offers an optional "tell us more" box. Answers are
 * OnboardingEvents (`cancel_reason`, `cancel_reason_text`) and show up in the
 * founders' nightly summary.
 *
 * Link token: base64url(userId).base64url(hmac) with NEXTAUTH_SECRET. No
 * expiry: it only lets someone record a cancel reason for that account.
 */
import { createHmac, timingSafeEqual } from "crypto";

export const CANCEL_REASONS = [
  { id: "no-app", label: "I couldn't get into the app" },
  { id: "not-expected", label: "It wasn't what I expected" },
  { id: "price", label: "It's too expensive" },
  { id: "no-time", label: "I didn't have time to try it" },
  { id: "looking", label: "I was just looking around" },
  { id: "broken", label: "Something didn't work" },
  { id: "other", label: "Something else" },
] as const;
export type CancelReasonId = (typeof CANCEL_REASONS)[number]["id"];

export const reasonLabel = (id: string) => CANCEL_REASONS.find((r) => r.id === id)?.label ?? id;

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
function mac(payload: string): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET unset");
  return createHmac("sha256", `why:${secret}`).update(payload).digest();
}

export function signWhyToken(userId: string): string {
  const p = b64(userId);
  return `${p}.${b64(mac(p))}`;
}

export function verifyWhyToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const [p, s] = token.split(".");
  if (!p || !s) return null;
  try {
    const want = mac(p);
    const got = Buffer.from(s, "base64url");
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    return Buffer.from(p, "base64url").toString("utf8");
  } catch {
    return null;
  }
}
