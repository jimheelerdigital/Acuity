import "server-only";

import { createHmac } from "node:crypto";

/**
 * One-way hashing for `DeletedUser.email`.
 *
 * ── Why HMAC and not a bare SHA-256 ──────────────────────────────────
 * An email address is LOW-ENTROPY. A plain `sha256(email)` is trivially
 * reversible by enumeration: an attacker with the table hashes a breach
 * corpus or a common-address list and matches offline. That would make the
 * "hashed" tombstones no more private than the plaintext they replaced.
 *
 * HMAC with a server-held secret (a "pepper") removes that: without the key,
 * candidate hashes cannot be computed, so the digests are not enumerable.
 * The key never leaves the server and is never stored beside the digests.
 *
 * ── ⚠️ THE KEY MUST NEVER ROTATE ─────────────────────────────────────
 * These digests are the only copy — the plaintext is destroyed by design.
 * Rotating DELETED_USER_EMAIL_HMAC_KEY silently breaks the trial-farming
 * guard: `trialDaysForEmail` hashes the incoming address with the CURRENT
 * key, gets a digest that matches nothing written under the old key, finds
 * no tombstone, and hands out a full trial to every returning deleted
 * account. Nothing errors. Nothing logs. The protection just stops working.
 *
 * If the key must ever change, every existing digest has to be re-derived
 * first — which is impossible once the plaintext is gone. So: set it once,
 * back it up, and treat it as permanent.
 *
 * ── Why deterministic hashing is acceptable here ─────────────────────
 * A per-row salt would be stronger, but the tombstone's whole purpose is
 * EQUALITY LOOKUP by email at signup. A random salt makes lookup impossible
 * without scanning and re-hashing every row. Deterministic HMAC keeps the
 * O(1) indexed lookup while still being non-reversible without the key.
 */

const KEY_ENV = "DELETED_USER_EMAIL_HMAC_KEY";

export class MissingHmacKeyError extends Error {
  constructor() {
    super(
      `${KEY_ENV} is not set. DeletedUser tombstones cannot be written or ` +
        `looked up without it. Set it in Vercel (and .env.local for scripts) ` +
        `before deploying. It must never change once set.`
    );
    this.name = "MissingHmacKeyError";
  }
}

function readKey(): string {
  const key = process.env[KEY_ENV];
  if (typeof key !== "string" || key.trim().length === 0) {
    throw new MissingHmacKeyError();
  }
  return key;
}

/** Is the key configured? Lets callers degrade deliberately rather than crash. */
export function hasDeletedUserHmacKey(): boolean {
  const key = process.env[KEY_ENV];
  return typeof key === "string" && key.trim().length > 0;
}

/**
 * HMAC-SHA256 an already-canonicalized email into a hex digest.
 *
 * Callers MUST canonicalize first (`canonicalizeEmail`). This function does
 * not canonicalize, on purpose: `trialDaysForEmail` has to hash BOTH the
 * canonical and the literal lowercased form to keep catching legacy
 * tombstones, so silently canonicalizing here would collapse those two
 * candidates into one and break that path.
 *
 * Lowercased before hashing as a last-ditch guard — an uppercase variant
 * would otherwise produce a different digest for the same address.
 */
export function hashDeletedUserEmail(canonicalOrLiteralEmail: string): string {
  const normalized = canonicalOrLiteralEmail.trim().toLowerCase();
  return createHmac("sha256", readKey()).update(normalized).digest("hex");
}

/**
 * Hash every candidate form for a lookup, de-duplicated.
 *
 * Mirrors the pre-hash behaviour of `trialDaysForEmail`, which searched both
 * the canonical and the literal lowercased address so tombstones written
 * before canonicalization existed still matched. Hashing each candidate
 * preserves that exactly — same two probes, same semantics, just over
 * digests instead of plaintext.
 */
export function hashEmailCandidates(candidates: string[]): string[] {
  const out = new Set<string>();
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) {
      out.add(hashDeletedUserEmail(c));
    }
  }
  return [...out];
}

/**
 * Is this value already a digest from this function?
 *
 * Used by the backfill so a re-run is idempotent and cannot double-hash a
 * row it already converted. 64 lowercase hex chars — an email can never
 * match, since it must contain "@".
 */
export function looksHashed(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
