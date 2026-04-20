import "server-only";

import bcrypt from "bcryptjs";

/**
 * Password policy — enforced on signup, password reset, and any future
 * self-service change flow. 12 chars is the NIST SP 800-63B minimum for
 * memorized secrets when no 2FA is in play; we don't enforce complexity
 * classes because the research is clear they don't add entropy in the
 * real world.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordValidationError =
  | "too_short"
  | "too_long"
  | "empty";

export function validatePassword(
  password: unknown
): { ok: true } | { ok: false; error: PasswordValidationError; message: string } {
  if (typeof password !== "string" || password.length === 0) {
    return { ok: false, error: "empty", message: "Password is required." };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: "too_short",
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return {
      ok: false,
      error: "too_long",
      message: `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true };
}

/** bcrypt with cost=12 — ~250ms on Vercel's serverless runtime. */
const BCRYPT_COST = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
