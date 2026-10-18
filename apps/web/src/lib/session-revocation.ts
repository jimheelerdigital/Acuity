import type { PrismaClient } from "@prisma/client";

/**
 * Session revocation (2026-10-18, signup account-takeover fix).
 *
 * Web sessions and mobile bearers are stateless NextAuth JWTs, so the only
 * way to end them early is a per-user watermark: User.sessionsInvalidBefore.
 * A token whose `iat` is older than the watermark is dead. Checked in
 *   - lib/mobile-auth.ts getAnySessionUserId (bearer path)
 *   - lib/auth.ts jwt callback (cookie path)
 * through isTokenRevoked(), which caches the watermark per instance for
 * CACHE_TTL_MS so the check is one indexed read per user per minute, not
 * per request. Worst case an attacker keeps a revoked session for one
 * cache window on one warm instance.
 *
 * revokeAllSessions() also deletes adapter Session rows (unused with the
 * jwt strategy, but cheap) and revokes every MCP connection + access token,
 * because an attacker who got in could have minted a 90-day journal-read
 * grant for a Claude client.
 */

export const CACHE_TTL_MS = 60_000;

type Entry = { invalidBefore: number | null; at: number };
const cache = new Map<string, Entry>();

export function _resetRevocationCacheForTests(): void {
  cache.clear();
}

async function watermarkFor(
  prisma: Pick<PrismaClient, "user">,
  userId: string
): Promise<number | null> {
  const hit = cache.get(userId);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.invalidBefore;
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessionsInvalidBefore: true },
  });
  const invalidBefore = row?.sessionsInvalidBefore
    ? row.sessionsInvalidBefore.getTime()
    : null;
  cache.set(userId, { invalidBefore, at: now });
  return invalidBefore;
}

/**
 * True when a token issued at `iatSeconds` (JWT `iat`) predates the user's
 * revocation watermark. Tokens without `iat` are treated as issued now
 * (NextAuth always sets it; this keeps a malformed token from being
 * immortal only in the sense that it still can't outlive a revocation made
 * after it is first seen).
 */
export async function isTokenRevoked(
  prisma: Pick<PrismaClient, "user">,
  userId: string,
  iatSeconds: number | undefined
): Promise<boolean> {
  const invalidBefore = await watermarkFor(prisma, userId);
  if (invalidBefore == null) return false;
  const issuedMs = typeof iatSeconds === "number" ? iatSeconds * 1000 : Date.now();
  // 1s grace: the JWT `iat` is whole seconds; a token minted in the same
  // second as the revocation (e.g. the very sign-in that triggered it)
  // must survive.
  return issuedMs + 1000 < invalidBefore;
}

/**
 * End every session and connector grant the account has. Returns the
 * watermark used so callers can log it.
 */
export async function revokeAllSessions(
  prisma: PrismaClient,
  userId: string,
  reason: string
): Promise<Date> {
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { sessionsInvalidBefore: now } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.mcpConnection.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.mcpAccessToken.deleteMany({ where: { userId } }),
  ]);
  cache.set(userId, { invalidBefore: now.getTime(), at: Date.now() });
  try {
    const { safeLog } = await import("@/lib/safe-log");
    safeLog.warn("auth.sessions-revoked", { userId, reason });
  } catch {
    // logging only
  }
  return now;
}
