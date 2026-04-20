import "server-only";

import { type JWT, decode } from "next-auth/jwt";

/**
 * Mobile session helper — extracts + verifies a NextAuth JWT from the
 * `Authorization: Bearer <token>` header. The mobile app has no
 * NextAuth cookies (different origin, no shared storage with the web
 * session), so it authenticates via a long-lived bearer JWT issued by
 * /api/auth/mobile-callback.
 *
 * The JWT itself is signed + encrypted with the same NEXTAUTH_SECRET
 * that the web-side uses. Same payload shape (`{ id, email, sub, ... }`).
 * Calling `decode()` with the shared secret validates the signature
 * and returns the token contents, or null on invalid/expired.
 *
 * Pairs with `getAnySessionUserId()` below — a unified "whose session
 * is this?" lookup that tries the web cookie first, then falls back
 * to the mobile bearer header. Most API routes should use
 * getAnySessionUserId so they work from both surfaces without
 * per-route branching.
 */

async function getMobileSessionFromBearer(
  req: Request
): Promise<JWT | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) return null;

  const raw = authHeader.slice(7).trim();
  if (!raw) return null;

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error(
      "[mobile-auth] NEXTAUTH_SECRET unset — cannot decode bearer tokens"
    );
    return null;
  }

  try {
    const token = await decode({ token: raw, secret });
    return token;
  } catch {
    return null;
  }
}

/**
 * Returns the signed-in user's id, from either the NextAuth cookie
 * (web) or the mobile Bearer token. Null if neither is valid.
 *
 * This is what API routes should call instead of getServerSession
 * directly when they want to serve both surfaces. The shape is
 * narrowed to just the id because that's the only field all the
 * per-user routes need; if an API route needs more (email, name),
 * it should re-fetch from prisma using the id.
 */
export async function getAnySessionUserId(
  req: Request
): Promise<string | null> {
  // Try mobile bearer first — it's a single header read, no cookie
  // parsing, no adapter DB hit. If present, it's the answer.
  const mobile = await getMobileSessionFromBearer(req);
  if (mobile?.id && typeof mobile.id === "string") return mobile.id;

  // Fall back to NextAuth cookie session. Import lazily so this
  // module stays importable from edge / middleware contexts that
  // don't want to pull in the whole NextAuth runtime.
  try {
    const { getServerSession } = await import("next-auth");
    const { getAuthOptions } = await import("@/lib/auth");
    const session = await getServerSession(getAuthOptions());
    if (session?.user?.id) return session.user.id;
  } catch {
    // If getServerSession can't run in the current context (edge
    // middleware etc.), we only support the bearer path there.
  }

  return null;
}
