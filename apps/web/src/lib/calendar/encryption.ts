/**
 * AES-256-GCM encryption for stored OAuth refresh tokens.
 *
 * Why this exists: Google's calendar.readonly refresh token is a
 * long-lived bearer credential. Anyone with read access to the
 * User table could replay it against the Google Calendar API. We
 * store the ciphertext + nonce + auth tag concatenated as a single
 * base64 string, with the encryption key derived from NEXTAUTH_SECRET
 * (already required env, already 32-byte-grade entropy).
 *
 * Format on disk:
 *   base64( nonce(12) || ciphertext || authTag(16) )
 *
 * Why GCM, not CBC: GCM is authenticated; a flipped bit fails the
 * authTag check on decrypt. CBC would silently produce garbled
 * plaintext that the rest of the app might then send to Google.
 *
 * Why derive the key (not use NEXTAUTH_SECRET directly): NEXTAUTH_
 * SECRET may be longer or shorter than 32 bytes depending on how
 * Jim generated it. SHA-256 normalizes to exactly 32 bytes so the
 * cipher contract holds regardless of secret length.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm" as const;
const NONCE_BYTES = 12; // standard for GCM
const AUTH_TAG_BYTES = 16;

function derivedKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    // We refuse to encrypt/decrypt without a stable secret. The
    // calling endpoint should 500 — silent failure here would
    // either lose the token or persist plaintext.
    throw new Error("NEXTAUTH_SECRET missing — refusing to handle calendar token");
  }
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a plaintext token. Returns the base64-encoded blob to
 * store in User.googleCalendarRefreshToken.
 */
export function encryptToken(plaintext: string): string {
  if (!plaintext) throw new Error("encryptToken: empty input");
  const key = derivedKey();
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([nonce, ciphertext, authTag]).toString("base64");
}

/**
 * Decrypt a stored blob back to plaintext. Returns null on any
 * failure (corrupt blob, wrong key after a secret rotation, etc.)
 * — callers should treat null as "token unusable, prompt reconnect".
 */
export function decryptToken(blob: string): string | null {
  try {
    if (!blob) return null;
    const buf = Buffer.from(blob, "base64");
    if (buf.length < NONCE_BYTES + AUTH_TAG_BYTES + 1) return null;
    const key = derivedKey();
    const nonce = buf.subarray(0, NONCE_BYTES);
    const authTag = buf.subarray(buf.length - AUTH_TAG_BYTES);
    const ciphertext = buf.subarray(NONCE_BYTES, buf.length - AUTH_TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, key, nonce);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    // GCM auth-tag mismatch, malformed base64, secret rotated, etc.
    // The user will see "Calendar disconnected" and can re-connect.
    return null;
  }
}
