import "server-only";

/**
 * Passwordless email sign-in with a 6-digit code (app 1.9.1).
 *
 * The app asks for a code (POST /api/auth/mobile-email-code/request), the
 * user types it in (…/verify), and verify signs them in — creating the
 * account on first use. No passwords, no links to tap (a code works on any
 * device and survives email apps that pre-open links).
 *
 * Security:
 *   - 6 random digits (crypto.randomInt). Only HMAC-SHA256(secret, email:code)
 *     is stored, so a database read never yields a usable code.
 *   - 10-minute life, single use, max 5 wrong tries per code; requesting a
 *     new code retires older ones. Routes add per-email and per-IP limits.
 *   - App Review: when APP_REVIEW_EMAILS and APP_REVIEW_CODE are set (server
 *     env only, never in the repo), those addresses accept that fixed code
 *     and no email is sent to them.
 */

import { createHmac, randomInt, timingSafeEqual } from "crypto";

import { prisma } from "@/lib/prisma";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.toLowerCase().trim();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET unset — cannot hash sign-in codes");
  return s;
}

export function hashCode(email: string, code: string, key: string = secret()): string {
  return createHmac("sha256", key).update(`${email}:${code}`).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** App Review fixed-code accounts (server env). */
export function appReviewCodeFor(
  email: string,
  env: Record<string, string | undefined> = process.env
): string | null {
  const code = env.APP_REVIEW_CODE?.trim();
  const list = (env.APP_REVIEW_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!code || !/^\d{6}$/.test(code) || !list.includes(email)) return null;
  return code;
}

/** Create a new code for `email`, retiring any outstanding ones. */
export async function issueCode(email: string): Promise<string> {
  const code = generateCode();
  const now = new Date();
  await prisma.$transaction([
    prisma.emailSignInCode.updateMany({
      where: { email, consumedAt: null },
      data: { consumedAt: now },
    }),
    prisma.emailSignInCode.create({
      data: { email, codeHash: hashCode(email, code), expiresAt: new Date(now.getTime() + CODE_TTL_MS) },
    }),
  ]);
  return code;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; error: "InvalidCode" | "ExpiredCode" | "TooManyAttempts" };

/** Check a code. Consumes it on success; counts a wrong try otherwise. */
export async function checkCode(email: string, code: string): Promise<VerifyResult> {
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "InvalidCode" };

  const review = appReviewCodeFor(email);
  if (review && sameHash(code, review)) return { ok: true };

  const row = await prisma.emailSignInCode.findFirst({
    where: { email, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { ok: false, error: "InvalidCode" };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, error: "ExpiredCode" };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: "TooManyAttempts" };

  if (!sameHash(hashCode(email, code), row.codeHash)) {
    // Atomic: the attempts cap lives in the WHERE clause, so N parallel
    // wrong guesses can never count as one (2026-10-18). count === 0 means
    // the cap was already reached by a racing request.
    const counted = await prisma.emailSignInCode.updateMany({
      where: { id: row.id, attempts: { lt: MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    const exhausted = counted.count === 0 || row.attempts + 1 >= MAX_ATTEMPTS;
    return { ok: false, error: exhausted ? "TooManyAttempts" : "InvalidCode" };
  }

  // Single use, race-safe.
  const claimed = await prisma.emailSignInCode.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  return claimed.count === 1 ? { ok: true } : { ok: false, error: "InvalidCode" };
}
