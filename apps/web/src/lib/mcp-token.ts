import "server-only";

import { createHash, randomBytes } from "crypto";

import { prisma } from "@/lib/prisma";

/**
 * Per-user MCP access token lifecycle (Ripple 1.8, "bring your own AI").
 *
 * A user connects an external MCP client (Claude Desktop, Cursor, ChatGPT,
 * …) to their OWN journal by pasting one of these tokens as a bearer
 * credential. The token maps 1:1 to a McpAccessToken row; verification
 * resolves it to a userId that the MCP route then scopes every query to.
 *
 * SECURITY MODEL
 *   - The plaintext is 256 bits of CSPRNG entropy (randomBytes(32)). Because
 *     there is nothing low-entropy to brute-force, a fast hash (SHA-256) is
 *     the correct choice — this is the standard API-key pattern, NOT the
 *     password pattern (no bcrypt/argon needed).
 *   - Only the SHA-256 hash is persisted. The plaintext is returned to the
 *     caller of `mintMcpToken` exactly once and never stored, logged, or
 *     returned again. A database read therefore never yields a usable token.
 *   - Verify is a single indexed lookup by `tokenHash` (@unique). Revoked and
 *     expired tokens fail closed.
 *   - Pro-gating is NOT done here — this module is auth (who), not
 *     entitlement (may they). The MCP route re-checks Pro on every request so
 *     a lapsed subscription stops working without needing revocation.
 */

/** All tokens start with this so `verifyMcpToken` can reject non-tokens cheaply. */
const TOKEN_PREFIX = "rpl_mcp_";

/** Chars of the random suffix kept in the non-secret display prefix. */
const PREFIX_DISPLAY_LEN = 4;

/** Coarse throttle so a chatty client doesn't write lastUsedAt on every call. */
const LAST_USED_THROTTLE_MS = 60_000;

export interface MintedToken {
  /** The full plaintext token. Show ONCE to the user, then discard. */
  plaintext: string;
  /** Non-secret display prefix (also persisted) for the token list UI. */
  prefix: string;
  /** Row id, for immediate revoke wiring in the UI. */
  id: string;
}

function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Mint a new token for `userId`. Returns the plaintext exactly once — the
 * caller is responsible for surfacing it to the user and then forgetting it.
 * Callers MUST have already verified the user is Pro-entitled.
 */
export async function mintMcpToken(
  userId: string,
  name?: string | null
): Promise<MintedToken> {
  const secret = randomBytes(32).toString("base64url");
  const plaintext = `${TOKEN_PREFIX}${secret}`;
  const prefix = `${TOKEN_PREFIX}${secret.slice(0, PREFIX_DISPLAY_LEN)}`;
  const tokenHash = hashToken(plaintext);

  const row = await prisma.mcpAccessToken.create({
    data: {
      userId,
      tokenHash,
      prefix,
      name: name?.trim() ? name.trim().slice(0, 80) : null,
    },
    select: { id: true },
  });

  return { plaintext, prefix, id: row.id };
}

export interface VerifiedMcpToken {
  userId: string;
  tokenId: string;
}

/**
 * Resolve a presented bearer token to its owner, or null if it is not a
 * valid, active token. Rejects unknown, revoked, and expired tokens. Bumps
 * `lastUsedAt` best-effort (throttled, never blocks or fails the request).
 */
export async function verifyMcpToken(
  plaintext: string | null | undefined
): Promise<VerifiedMcpToken | null> {
  if (!plaintext || !plaintext.startsWith(TOKEN_PREFIX)) return null;

  const tokenHash = hashToken(plaintext);
  const row = await prisma.mcpAccessToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      revokedAt: true,
      expiresAt: true,
      lastUsedAt: true,
    },
  });

  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;

  const now = Date.now();
  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
    // Fire-and-forget; a failed telemetry write must never fail an MCP call.
    void prisma.mcpAccessToken
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
  }

  return { userId: row.userId, tokenId: row.id };
}

export interface McpTokenSummary {
  id: string;
  prefix: string;
  name: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
}

/** All of a user's tokens, newest first. Never includes the hash or plaintext. */
export async function listMcpTokens(userId: string): Promise<McpTokenSummary[]> {
  return prisma.mcpAccessToken.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      prefix: true,
      name: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
      expiresAt: true,
    },
  });
}

/**
 * Revoke one of the user's own tokens. Scoped by `userId` so a user can only
 * ever revoke their own. Idempotent: returns false if nothing was revoked
 * (wrong owner, unknown id, or already revoked).
 */
export async function revokeMcpToken(
  userId: string,
  tokenId: string
): Promise<boolean> {
  const res = await prisma.mcpAccessToken.updateMany({
    where: { id: tokenId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return res.count > 0;
}
